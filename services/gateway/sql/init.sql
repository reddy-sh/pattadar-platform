-- pattadar gateway — hub DB bootstrap.
--
-- Executed at every startup under pg_advisory_lock (see app/db.py). Every
-- statement is IF NOT EXISTS / ON CONFLICT DO NOTHING so it is a no-op
-- against a database that already has the tables (e.g. rhub's local hub DB).
--
-- DDL ported from rhub api/providers/postgres/schema.sql (storage_*) and
-- api/providers/postgres/migrations/20260419_platform_models*.sql (model
-- catalog, pricing columns folded into the CREATE). FKs to tables not
-- ported (none applied — storage/model FKs are all within this set).

-- ---------------------------------------------------------------------------
-- Document Storage — per-user folder explorer (Box/Dropbox-style)
-- Metadata only; file bytes live in S3 keyed {owner_id}/{node_id}/{version_id}.
-- Adjacency-list tree: folders and files are both rows in storage_nodes.
-- ---------------------------------------------------------------------------

-- One row per folder or file. A user's root is implicit (parent_id IS NULL).
CREATE TABLE IF NOT EXISTS storage_nodes (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id           TEXT NOT NULL,
    org_id             TEXT NOT NULL DEFAULT 'pattadar',  -- org the file belongs to (slug)
    workspace_id       TEXT NOT NULL DEFAULT 'pattadar',  -- workspace it was created in
    app_id             TEXT,                 -- owning app slug; NULL for personal uploads
    parent_id          UUID REFERENCES storage_nodes(id) ON DELETE CASCADE,
    kind               TEXT NOT NULL CHECK (kind IN ('folder','file')),
    name               TEXT NOT NULL,
    size_bytes         BIGINT,               -- file-only; current version size (denormalized)
    mime_type          TEXT,                 -- file-only; current version mime
    current_version_id UUID,                 -- -> storage_versions.id (no FK: insert-order)
    starred            BOOLEAN NOT NULL DEFAULT FALSE,
    trashed_at         TIMESTAMPTZ,          -- non-NULL => in Trash
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by         TEXT,
    updated_by         TEXT
);

-- Names are unique within a folder, per owner, ignoring trashed items.
-- NULLS NOT DISTINCT so root-level items (parent_id IS NULL) also collide (PG15+).
CREATE UNIQUE INDEX IF NOT EXISTS storage_nodes_unique_name
    ON storage_nodes (owner_id, parent_id, lower(name)) NULLS NOT DISTINCT
    WHERE trashed_at IS NULL;
CREATE INDEX IF NOT EXISTS storage_nodes_owner_parent
    ON storage_nodes (owner_id, parent_id) WHERE trashed_at IS NULL;
CREATE INDEX IF NOT EXISTS storage_nodes_owner_starred
    ON storage_nodes (owner_id) WHERE starred AND trashed_at IS NULL;
CREATE INDEX IF NOT EXISTS storage_nodes_owner_org
    ON storage_nodes (owner_id, org_id) WHERE trashed_at IS NULL;
CREATE INDEX IF NOT EXISTS storage_nodes_ws_app
    ON storage_nodes (workspace_id, app_id) WHERE app_id IS NOT NULL AND trashed_at IS NULL;

-- One row per uploaded version of a file node. Newest = node.current_version_id.
CREATE TABLE IF NOT EXISTS storage_versions (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id      UUID NOT NULL REFERENCES storage_nodes(id) ON DELETE CASCADE,
    owner_id     TEXT NOT NULL,
    object_key   TEXT NOT NULL,             -- S3 key: {owner_id}/{node_id}/{version_id}
    size_bytes   BIGINT NOT NULL,
    mime_type    TEXT,
    etag         TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by   TEXT
);
CREATE INDEX IF NOT EXISTS storage_versions_node ON storage_versions (node_id);

-- Sharing. A share targets a node; either a link token OR a specific grantee.
-- (v1 exposes no share-mutation routes; the table exists for read-side parity.)
CREATE TABLE IF NOT EXISTS storage_shares (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id      UUID NOT NULL REFERENCES storage_nodes(id) ON DELETE CASCADE,
    owner_id     TEXT NOT NULL,             -- who created/owns the share
    grantee_id   TEXT,                      -- share-with-user (NULL for link shares)
    token        TEXT UNIQUE,               -- link shares (NULL for user shares)
    permission   TEXT NOT NULL DEFAULT 'view' CHECK (permission IN ('view','edit')),
    expires_at   TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by   TEXT
);
CREATE INDEX IF NOT EXISTS storage_shares_node ON storage_shares (node_id);
CREATE INDEX IF NOT EXISTS storage_shares_grantee ON storage_shares (grantee_id);

-- Tags: colored, reusable labels a user creates and assigns to nodes.
CREATE TABLE IF NOT EXISTS storage_tags (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id   TEXT NOT NULL,
    name       TEXT NOT NULL,
    color      TEXT NOT NULL DEFAULT 'blue',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS storage_tags_owner_name ON storage_tags (owner_id, lower(name));

CREATE TABLE IF NOT EXISTS storage_node_tags (
    node_id  UUID NOT NULL REFERENCES storage_nodes(id) ON DELETE CASCADE,
    tag_id   UUID NOT NULL REFERENCES storage_tags(id) ON DELETE CASCADE,
    owner_id TEXT NOT NULL,
    PRIMARY KEY (node_id, tag_id)
);
CREATE INDEX IF NOT EXISTS storage_node_tags_node ON storage_node_tags (node_id);
CREATE INDEX IF NOT EXISTS storage_node_tags_tag ON storage_node_tags (tag_id);

-- ---------------------------------------------------------------------------
-- Platform model catalog (Govern → Models). Provider-agnostic; newly
-- discovered models default to disabled — admin opts in.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS model_providers (
  id              text PRIMARY KEY,                            -- 'anthropic'
  display_name    text NOT NULL,                               -- 'Anthropic'
  list_endpoint   text NOT NULL,                               -- API URL
  auth_secret     text NOT NULL,                               -- env var name holding the key
  enabled         boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform_models (
  id              text PRIMARY KEY,                            -- 'anthropic:claude-opus-4-7'
  provider_id     text NOT NULL REFERENCES model_providers(id) ON DELETE RESTRICT,
  model_id        text NOT NULL,                               -- provider's id
  display_name    text NOT NULL,
  family          text,                                        -- e.g. 'opus'
  tier            text,                                        -- 'Fast' | 'Balanced' | 'Advanced' | NULL
  enabled         boolean NOT NULL DEFAULT false,              -- admin must opt in
  use_cases       jsonb NOT NULL DEFAULT '[]'::jsonb,          -- ['assistant','codegen',...]
  notes           text,
  released_at     timestamptz,
  discovered_at   timestamptz NOT NULL DEFAULT now(),
  enabled_at      timestamptz,
  enabled_by      text,
  -- 'active' | 'removed' (provider stopped returning it on a sync)
  provider_status text NOT NULL DEFAULT 'active',
  input_cost_per_mtok   numeric(10,4),  -- USD per million input tokens
  output_cost_per_mtok  numeric(10,4),  -- USD per million output tokens
  context_window        integer,        -- max input tokens
  max_output_tokens     integer,        -- max output tokens
  UNIQUE(provider_id, model_id)
);

CREATE INDEX IF NOT EXISTS idx_platform_models_provider     ON platform_models(provider_id);
CREATE INDEX IF NOT EXISTS idx_platform_models_enabled      ON platform_models(enabled) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_platform_models_use_cases    ON platform_models USING gin (use_cases);
CREATE INDEX IF NOT EXISTS idx_platform_models_released     ON platform_models(released_at DESC);

CREATE TABLE IF NOT EXISTS platform_model_audit (
  id            bigserial PRIMARY KEY,
  model_id      text NOT NULL,                                 -- not FK: keep audit even after model removed
  action        text NOT NULL,
  before        jsonb,
  after         jsonb,
  actor         text,
  at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_model_audit_model ON platform_model_audit(model_id, at DESC);

-- Seed the Anthropic provider so /admin/models/sync works day one.
INSERT INTO model_providers (id, display_name, list_endpoint, auth_secret)
VALUES
  ('anthropic', 'Anthropic',
   'https://api.anthropic.com/v1/models',
   'ANTHROPIC_API_KEY')
ON CONFLICT (id) DO NOTHING;
