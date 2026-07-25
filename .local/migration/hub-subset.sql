--
-- PostgreSQL database dump
--

-- Dumped from database version 17.4 (Homebrew)
-- Dumped by pg_dump version 17.4 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: platform_model_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_model_audit (
    id bigint NOT NULL,
    model_id text NOT NULL,
    action text NOT NULL,
    before jsonb,
    after jsonb,
    actor text,
    at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: platform_model_audit_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.platform_model_audit_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: platform_model_audit_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.platform_model_audit_id_seq OWNED BY public.platform_model_audit.id;


--
-- Name: platform_models; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_models (
    id text NOT NULL,
    provider_id text NOT NULL,
    model_id text NOT NULL,
    display_name text NOT NULL,
    family text,
    tier text,
    enabled boolean DEFAULT false NOT NULL,
    use_cases jsonb DEFAULT '[]'::jsonb NOT NULL,
    notes text,
    released_at timestamp with time zone,
    discovered_at timestamp with time zone DEFAULT now() NOT NULL,
    enabled_at timestamp with time zone,
    enabled_by text,
    provider_status text DEFAULT 'active'::text NOT NULL,
    input_cost_per_mtok numeric(10,4),
    output_cost_per_mtok numeric(10,4),
    context_window integer,
    max_output_tokens integer
);


--
-- Name: storage_node_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.storage_node_tags (
    node_id uuid NOT NULL,
    tag_id uuid NOT NULL,
    owner_id text NOT NULL
);


--
-- Name: storage_nodes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.storage_nodes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id text NOT NULL,
    parent_id uuid,
    kind text NOT NULL,
    name text NOT NULL,
    size_bytes bigint,
    mime_type text,
    current_version_id uuid,
    starred boolean DEFAULT false NOT NULL,
    trashed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by text,
    updated_by text,
    org_id text DEFAULT 'rfactory'::text NOT NULL,
    workspace_id text DEFAULT 'rfactory'::text NOT NULL,
    app_id text,
    CONSTRAINT storage_nodes_kind_check CHECK ((kind = ANY (ARRAY['folder'::text, 'file'::text])))
);


--
-- Name: COLUMN storage_nodes.org_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.storage_nodes.org_id IS 'Organization the file belongs to (org slug). Filters/aggregates My Drive by org.';


--
-- Name: COLUMN storage_nodes.workspace_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.storage_nodes.workspace_id IS 'Workspace (tenant) the file was created in. Resolved from the request at upload.';


--
-- Name: COLUMN storage_nodes.app_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.storage_nodes.app_id IS 'App that owns the file (app slug), NULL for personal My Drive uploads.';


--
-- Name: storage_shares; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.storage_shares (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    node_id uuid NOT NULL,
    owner_id text NOT NULL,
    grantee_id text,
    token text,
    permission text DEFAULT 'view'::text NOT NULL,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by text,
    CONSTRAINT storage_shares_permission_check CHECK ((permission = ANY (ARRAY['view'::text, 'edit'::text])))
);


--
-- Name: storage_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.storage_tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id text NOT NULL,
    name text NOT NULL,
    color text DEFAULT 'blue'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: storage_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.storage_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    node_id uuid NOT NULL,
    owner_id text NOT NULL,
    object_key text NOT NULL,
    size_bytes bigint NOT NULL,
    mime_type text,
    etag text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by text
);


--
-- Name: platform_model_audit id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_model_audit ALTER COLUMN id SET DEFAULT nextval('public.platform_model_audit_id_seq'::regclass);


--
-- Data for Name: platform_model_audit; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.platform_model_audit (id, model_id, action, before, after, actor, at) FROM stdin;
1	anthropic:claude-haiku-4-5-20251001	enabled	\N	{"seed": true}	system:migration	2026-04-19 14:59:10.352334-07
2	anthropic:claude-sonnet-4-6	enabled	\N	{"seed": true}	system:migration	2026-04-19 14:59:10.352334-07
3	anthropic:claude-opus-4-7	enabled	\N	{"seed": true}	system:migration	2026-04-19 14:59:10.352334-07
4	anthropic:claude-opus-4-6	discovered	\N	{"family": "opus", "released_at": "2026-02-04T00:00:00+00:00", "display_name": "Claude Opus 4.6", "context_window": 200000, "max_output_tokens": 32000, "input_cost_per_mtok": 15.0, "output_cost_per_mtok": 75.0}	service:internal	2026-04-19 15:25:10.209898-07
5	anthropic:claude-opus-4-5-20251101	discovered	\N	{"family": "opus", "released_at": "2025-11-24T00:00:00+00:00", "display_name": "Claude Opus 4.5", "context_window": 200000, "max_output_tokens": 32000, "input_cost_per_mtok": 15.0, "output_cost_per_mtok": 75.0}	service:internal	2026-04-19 15:25:10.209898-07
6	anthropic:claude-sonnet-4-5-20250929	discovered	\N	{"family": "sonnet", "released_at": "2025-09-29T00:00:00+00:00", "display_name": "Claude Sonnet 4.5", "context_window": 200000, "max_output_tokens": 64000, "input_cost_per_mtok": 3.0, "output_cost_per_mtok": 15.0}	service:internal	2026-04-19 15:25:10.209898-07
7	anthropic:claude-opus-4-1-20250805	discovered	\N	{"family": "opus", "released_at": "2025-08-05T00:00:00+00:00", "display_name": "Claude Opus 4.1", "context_window": 200000, "max_output_tokens": 32000, "input_cost_per_mtok": 15.0, "output_cost_per_mtok": 75.0}	service:internal	2026-04-19 15:25:10.209898-07
8	anthropic:claude-opus-4-20250514	discovered	\N	{"family": "opus", "released_at": "2025-05-22T00:00:00+00:00", "display_name": "Claude Opus 4", "context_window": 200000, "max_output_tokens": 32000, "input_cost_per_mtok": 15.0, "output_cost_per_mtok": 75.0}	service:internal	2026-04-19 15:25:10.209898-07
9	anthropic:claude-sonnet-4-20250514	discovered	\N	{"family": "sonnet", "released_at": "2025-05-22T00:00:00+00:00", "display_name": "Claude Sonnet 4", "context_window": 200000, "max_output_tokens": 64000, "input_cost_per_mtok": 3.0, "output_cost_per_mtok": 15.0}	service:internal	2026-04-19 15:25:10.209898-07
10	anthropic:claude-3-haiku-20240307	discovered	\N	{"family": "haiku", "released_at": "2024-03-07T00:00:00+00:00", "display_name": "Claude Haiku 3", "context_window": 200000, "max_output_tokens": 4096, "input_cost_per_mtok": 0.25, "output_cost_per_mtok": 1.25}	service:internal	2026-04-19 15:25:10.209898-07
11	anthropic:claude-opus-4-6	tier_changed	{"tier": null}	{"tier": "Advanced"}	sankara.telukutla	2026-04-19 15:31:38.215058-07
12	anthropic:claude-opus-4-5-20251101	tier_changed	{"tier": null}	{"tier": "Balanced"}	sankara.telukutla	2026-04-19 15:31:47.229703-07
13	anthropic:claude-sonnet-4-5-20250929	tier_changed	{"tier": null}	{"tier": "Balanced"}	sankara.telukutla	2026-04-19 15:31:55.508182-07
14	anthropic:claude-opus-4-1-20250805	tier_changed	{"tier": null}	{"tier": "Fast"}	sankara.telukutla	2026-04-19 15:32:01.966477-07
15	anthropic:claude-sonnet-4-20250514	tier_changed	{"tier": null}	{"tier": "Fast"}	sankara.telukutla	2026-04-19 15:32:13.276618-07
16	anthropic:claude-opus-4-20250514	tier_changed	{"tier": null}	{"tier": "Fast"}	sankara.telukutla	2026-04-19 15:32:18.845164-07
17	anthropic:claude-3-haiku-20240307	tier_changed	{"tier": null}	{"tier": "Fast"}	sankara.telukutla	2026-04-19 15:32:24.850693-07
18	anthropic:claude-opus-4-6	enabled	{"enabled": false}	{"enabled": true}	sankara.telukutla	2026-04-19 15:32:53.155408-07
19	anthropic:claude-opus-4-5-20251101	enabled	{"enabled": false}	{"enabled": true}	sankara.telukutla	2026-04-19 15:39:19.822392-07
20	anthropic:claude-sonnet-4-5-20250929	enabled	{"enabled": false}	{"enabled": true}	sankara.telukutla	2026-04-19 15:39:44.198762-07
21	anthropic:claude-opus-4-1-20250805	enabled	{"enabled": false}	{"enabled": true}	sankara.telukutla	2026-04-19 15:39:54.495358-07
22	anthropic:claude-3-haiku-20240307	removed_by_provider	\N	\N	sankara.telukutla	2026-04-27 11:32:20.850997-07
23	anthropic:claude-opus-4-7	disabled	{"enabled": true}	{"enabled": false}	sankara.telukutla	2026-05-02 10:36:33.571316-07
24	anthropic:claude-3-haiku-20240307	enabled	{"enabled": false}	{"enabled": true}	sankara.telukutla	2026-05-18 22:00:13.592336-07
25	anthropic:claude-opus-4-7	enabled	{"enabled": false}	{"enabled": true}	sankara.telukutla	2026-05-20 22:21:14.814261-07
26	anthropic:claude-opus-4-8	discovered	\N	{"family": "opus", "released_at": "2026-05-28T00:00:00+00:00", "display_name": "Claude Opus 4.8", "context_window": 200000, "max_output_tokens": 32000, "input_cost_per_mtok": 15.0, "output_cost_per_mtok": 75.0}	sankara.telukutla	2026-06-01 19:51:54.258765-07
27	anthropic:claude-opus-4-8	enabled	{"enabled": false}	{"enabled": true}	sankara.telukutla	2026-06-01 19:57:18.322847-07
28	anthropic:claude-3-haiku-20240307	disabled	{"enabled": true}	{"enabled": false}	sankara.telukutla	2026-06-01 23:17:16.967062-07
29	anthropic:claude-3-haiku-20240307	tier_changed	{"tier": "Fast"}	{"tier": null}	sankara.telukutla	2026-06-01 23:17:16.967062-07
30	anthropic:claude-3-haiku-20240307	deleted	{"display_name": "Claude Opus 4.8", "provider_status": "removed"}	\N	sankara.telukutla	2026-06-01 23:17:20.614784-07
31	anthropic:claude-opus-4-8	tier_changed	{"tier": null}	{"tier": "Advanced"}	sankara.telukutla	2026-06-01 23:17:37.155603-07
32	anthropic:claude-opus-4-8	use_cases_changed	{"use_cases": []}	{"use_cases": ["assistant", "orchestrator", "codegen", "evaluator"]}	sankara.telukutla	2026-06-01 23:17:46.477791-07
33	anthropic:claude-sonnet-5	discovered	\N	{"family": "sonnet", "released_at": "2026-06-29T00:00:00+00:00", "display_name": "Claude Sonnet 5", "context_window": 200000, "max_output_tokens": 64000, "input_cost_per_mtok": 3.0, "output_cost_per_mtok": 15.0}	sankara.telukutla	2026-07-08 21:27:33.090785-07
34	anthropic:claude-fable-5	discovered	\N	{"family": "fable", "released_at": "2026-06-07T00:00:00+00:00", "display_name": "Claude Fable 5", "context_window": null, "max_output_tokens": null, "input_cost_per_mtok": null, "output_cost_per_mtok": null}	sankara.telukutla	2026-07-08 21:27:33.090785-07
35	anthropic:claude-opus-4-20250514	removed_by_provider	\N	\N	sankara.telukutla	2026-07-08 21:27:33.090785-07
36	anthropic:claude-sonnet-4-20250514	removed_by_provider	\N	\N	sankara.telukutla	2026-07-08 21:27:33.090785-07
37	anthropic:claude-opus-4-20250514	deleted	{"display_name": "Claude Opus 4", "provider_status": "removed"}	\N	sankara.telukutla	2026-07-08 21:28:11.034892-07
38	anthropic:claude-sonnet-4-20250514	deleted	{"display_name": "Claude Sonnet 4", "provider_status": "removed"}	\N	sankara.telukutla	2026-07-08 21:28:11.034892-07
\.


--
-- Data for Name: platform_models; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.platform_models (id, provider_id, model_id, display_name, family, tier, enabled, use_cases, notes, released_at, discovered_at, enabled_at, enabled_by, provider_status, input_cost_per_mtok, output_cost_per_mtok, context_window, max_output_tokens) FROM stdin;
anthropic:claude-sonnet-4-6	anthropic	claude-sonnet-4-6	Claude Sonnet 4.6	sonnet	Balanced	t	["assistant"]	\N	2026-02-16 16:00:00-08	2026-04-19 14:59:10.352334-07	2026-04-19 14:59:10.352334-07	system:migration	active	3.0000	15.0000	200000	64000
anthropic:claude-haiku-4-5-20251001	anthropic	claude-haiku-4-5-20251001	Claude Haiku 4.5	haiku	Fast	t	["assistant"]	\N	2025-10-14 17:00:00-07	2026-04-19 14:59:10.352334-07	2026-04-19 14:59:10.352334-07	system:migration	active	1.0000	5.0000	200000	8000
anthropic:claude-opus-4-6	anthropic	claude-opus-4-6	Claude Opus 4.6	opus	Advanced	t	[]		2026-02-03 16:00:00-08	2026-04-19 15:25:10.209898-07	2026-04-19 15:32:53.155408-07	sankara.telukutla	active	15.0000	75.0000	200000	32000
anthropic:claude-opus-4-5-20251101	anthropic	claude-opus-4-5-20251101	Claude Opus 4.5	opus	Balanced	t	[]		2025-11-23 16:00:00-08	2026-04-19 15:25:10.209898-07	2026-04-19 15:39:19.822392-07	sankara.telukutla	active	15.0000	75.0000	200000	32000
anthropic:claude-sonnet-4-5-20250929	anthropic	claude-sonnet-4-5-20250929	Claude Sonnet 4.5	sonnet	Balanced	t	[]		2025-09-28 17:00:00-07	2026-04-19 15:25:10.209898-07	2026-04-19 15:39:44.198762-07	sankara.telukutla	active	3.0000	15.0000	200000	64000
anthropic:claude-opus-4-1-20250805	anthropic	claude-opus-4-1-20250805	Claude Opus 4.1	opus	Fast	t	[]		2025-08-04 17:00:00-07	2026-04-19 15:25:10.209898-07	2026-04-19 15:39:54.495358-07	sankara.telukutla	active	15.0000	75.0000	200000	32000
anthropic:claude-opus-4-7	anthropic	claude-opus-4-7	Claude Opus 4.7	opus	Advanced	t	["assistant"]		2026-04-13 17:00:00-07	2026-04-19 14:59:10.352334-07	2026-05-20 22:21:14.814261-07	sankara.telukutla	active	15.0000	75.0000	200000	32000
anthropic:claude-opus-4-8	anthropic	claude-opus-4-8	Claude Opus 4.8	opus	Advanced	t	["assistant", "orchestrator", "codegen", "evaluator"]		2026-05-27 17:00:00-07	2026-06-01 19:51:54.258765-07	2026-06-01 19:57:18.322847-07	sankara.telukutla	active	15.0000	75.0000	200000	32000
anthropic:claude-sonnet-5	anthropic	claude-sonnet-5	Claude Sonnet 5	sonnet	\N	f	[]	\N	2026-06-28 17:00:00-07	2026-07-08 21:27:33.090785-07	\N	\N	active	3.0000	15.0000	200000	64000
anthropic:claude-fable-5	anthropic	claude-fable-5	Claude Fable 5	fable	\N	f	[]	\N	2026-06-06 17:00:00-07	2026-07-08 21:27:33.090785-07	\N	\N	active	\N	\N	\N	\N
\.


--
-- Data for Name: storage_node_tags; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.storage_node_tags (node_id, tag_id, owner_id) FROM stdin;
053c21ef-3bce-4f36-ad22-87ff39bcc664	477a0042-badb-4f5d-bf2c-155cf30171cf	sankara.telukutla
\.


--
-- Data for Name: storage_nodes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.storage_nodes (id, owner_id, parent_id, kind, name, size_bytes, mime_type, current_version_id, starred, trashed_at, created_at, updated_at, created_by, updated_by, org_id, workspace_id, app_id) FROM stdin;
a69b1730-3e07-4b2c-8db9-8174e64f76f5	sankara.telukutla	1d6e1eff-8f24-48c4-b71a-5fe1e87c4c47	folder	rfactory	\N	\N	\N	f	\N	2026-07-10 02:56:58.245554-07	2026-07-10 02:56:58.245554-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	\N
2ef33bb8-9f42-40f8-94cf-930efef3e108	sankara.telukutla	\N	file	CanalProject Request.pdf	973157	application/pdf	37ef9df7-5009-48d8-8d52-8def47fab20f	f	\N	2026-07-09 20:12:58.032115-07	2026-07-09 20:12:58.032115-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	\N
a7ce0ed2-e250-4d7c-803b-22996f95773b	sankara.telukutla	\N	file	Family_Land_Acquisition_CFO_Report.xlsx	26459	application/vnd.openxmlformats-officedocument.spreadsheetml.sheet	f4e556a5-6f61-4f6d-bdc8-804076547658	f	\N	2026-07-09 20:12:58.057341-07	2026-07-09 20:12:58.057341-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	\N
2974cdda-1a90-4602-b5f5-10905cb84a3c	sankara.telukutla	\N	file	gift_deed-0d6280.pdf	13100510	application/pdf	a18b1f7a-61b1-4491-a980-1922c19a9952	f	\N	2026-07-11 22:33:38.195892-07	2026-07-11 22:33:38.195892-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	pattadar
6c8a5165-1cb3-426f-8652-515b9b266222	sankara.telukutla	27f59b4b-4f6f-4f80-b9e8-f369ccdbb5f2	folder	Parcel AP-KATRAGUNTA-119/5-758N	\N	\N	\N	f	\N	2026-07-13 21:54:46.251926-07	2026-07-15 22:47:14.573239-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	pattadar
3d286d8d-5fbd-4858-b3b6-22524d889bd1	sankara.telukutla	\N	file	sdflk.jpg	447284	image/jpeg	ffee6e86-a67c-447b-93e3-3cce08c15dd9	f	\N	2026-07-12 03:26:29.618915-07	2026-07-12 03:26:29.618915-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	pattadar
de9c33b0-771c-4de0-8208-6b3202557722	sankara.telukutla	\N	file	ChakramPalliBhu Bharati - Telangana.pdf	435931	application/pdf	1e2a58ff-d826-46dc-961d-b384a53acd3d	f	\N	2026-07-12 03:42:32.342429-07	2026-07-12 03:42:32.342429-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	pattadar
dee3f8c8-c065-4300-b421-8d6568523b2d	sankara.telukutla	a69b1730-3e07-4b2c-8db9-8174e64f76f5	file	IMG_5983.HEIC	1169531	image/heic	1e49e092-8706-4ea8-8b04-e45f9052f5bc	f	\N	2026-07-15 19:44:42.945363-07	2026-07-15 19:44:42.945363-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	rfactory
e0674a01-f957-4f76-a9c2-e1ad3258349c	sankara.telukutla	\N	file	Meebhoomi _ Template.pdf	925631	application/pdf	8c73c867-bacd-4d40-9495-aaf3833fd648	f	\N	2026-07-10 20:54:38.570449-07	2026-07-11 01:21:36.214669-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	pattadar
bfe8fdd8-4464-43fe-bcae-2d9b50ed2b4c	sankara.telukutla	\N	file	WhatsApp Image 2026-02-09 at 08.45.15.jpeg	101113	image/jpeg	e2d0be45-e825-41a6-86fe-48c2d700d0b5	f	\N	2026-07-09 20:12:58.079846-07	2026-07-09 20:12:58.079846-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	\N
b8b710df-33be-4a64-87d2-9ea24d42b737	sankara.telukutla	\N	file	Mangalakuna Applicationspdf.pdf	968205	application/pdf	1a19cafe-0782-4a6e-8a15-53a793d6ba99	f	\N	2026-07-09 20:12:58.112621-07	2026-07-09 20:12:58.112621-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	\N
b5f86479-e911-4949-854e-9da8ce7da157	sankara.telukutla	\N	file	govtap_messages_timeseries - Google Sheets.pdf	102808	application/pdf	f64520f7-1c29-487f-be2f-259b5aad12d6	f	\N	2026-07-09 20:12:58.13271-07	2026-07-09 20:12:58.13271-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	\N
673ac97d-504b-4e12-b69a-f6ac3972db0f	sankara.telukutla	\N	file	swetha.jpg	232093	image/jpeg	c4f728a9-3747-4095-aa00-76105e9a26c2	f	\N	2026-07-11 18:49:41.596977-07	2026-07-25 11:21:35.543884-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	pattadar
fe7d6ee0-3285-45a5-ae18-d2eff87ac413	sankara.telukutla	\N	file	IMG_5711.jpg	2980439	image/jpeg	3b06588f-7aee-4815-89f0-b4fb1331ff85	f	2026-07-09 20:13:47.46872-07	2026-07-09 05:48:08.5309-07	2026-07-09 05:48:08.5309-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	\N
053c21ef-3bce-4f36-ad22-87ff39bcc664	sankara.telukutla	\N	folder	Test folder	\N	\N	\N	f	\N	2026-07-09 16:21:15.415611-07	2026-07-09 20:23:00.037306-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	\N
b72e33c2-c22d-4cb1-b6e6-0fcaecb7a164	sankara.telukutla	\N	file	Applications.pdf	1006348	application/pdf	65cff824-10c4-43d2-82a7-206fc5d72d70	f	\N	2026-07-09 20:12:58.166103-07	2026-07-09 20:58:43.795263-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	\N
736f8804-bf2f-4c59-8e59-a2e3a0bfab84	sankara.telukutla	\N	file	Key Performance Indicators.pdf	496511	application/pdf	c192cbd9-3f80-4b8d-8745-7c5b4899a2b2	f	\N	2026-07-09 20:59:32.948866-07	2026-07-09 20:59:32.948866-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	\N
75deb2ff-eb4b-45ce-a550-1d99469395ca	sankara.telukutla	\N	file	MSMEKALUJUVVALAPADU.pdf	1693910	application/pdf	48b61fcf-1378-4d55-89e1-d44c05355cdc	f	\N	2026-07-09 20:59:33.033169-07	2026-07-09 20:59:33.033169-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	\N
55415c45-c84a-41dd-bf4a-1fdc79dd31c8	sankara.telukutla	\N	file	Razorpay Rize Pricing & Refund TnC.pdf	115770	application/pdf	75bfae8d-1dfb-465e-a3ae-72b30152893f	f	\N	2026-07-09 05:48:58.712052-07	2026-07-09 05:48:58.712052-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	\N
31268ded-75d2-4437-9ec2-58b73f3d1807	sankara.telukutla	053c21ef-3bce-4f36-ad22-87ff39bcc664	file	IMG_5718.HEIC	1340718	image/heic	e749b0cf-38ec-4885-8b6f-b006dd895941	f	\N	2026-07-09 16:21:22.550299-07	2026-07-09 16:21:22.550299-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	\N
8f1a327d-bfcf-47df-a945-525387964cb6	sankara.telukutla	e210c089-9a56-4d06-a017-09e807daaa17	file	sankaramangalakunta.jpg	278050	image/jpeg	661f6bc7-39a6-40d9-a096-7582ad451683	f	2026-07-15 19:56:44.251657-07	2026-07-11 22:38:06.760208-07	2026-07-13 21:14:24.97774-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	pattadar
9aed1df7-2f0f-4038-ae1d-45c39a91466d	sankara.telukutla	6c8a5165-1cb3-426f-8652-515b9b266222	file	rajasekhar-reddy-allipuram.jpg	4945	image/jpeg	bdc5dec7-a5b1-437d-b964-ad85b08be855	f	\N	2026-07-13 21:54:46.165519-07	2026-07-13 21:54:46.26237-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	pattadar
aa84b24e-2aad-45e3-acd3-8474d529c1b0	sankara.telukutla	d394df11-ed1b-4d8b-a450-214d12ec1a2d	file	IMG_5971.jpg	2090102	image/jpeg	24c5bad8-011c-4dce-8a47-69d000aacb99	f	\N	2026-07-15 01:34:09.464338-07	2026-07-15 01:34:09.58524-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	pattadar
79d55109-7138-47af-a366-2f4697ed123c	sankara.telukutla	\N	file	IMG_5971.jpg	2090102	image/jpeg	cdf98756-e3b3-4422-803d-666491f8e7a7	f	\N	2026-07-15 01:35:02.998961-07	2026-07-15 01:35:02.998961-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	pattadar
27f59b4b-4f6f-4f80-b9e8-f369ccdbb5f2	sankara.telukutla	8f97cd57-26f2-4792-900a-8ec437f684ed	folder	Passbook AP-KATRAGUNTA-593-EBZF	\N	\N	\N	f	\N	2026-07-15 22:47:14.571575-07	2026-07-15 22:47:14.571575-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	pattadar
fa6cccdf-3367-413e-a097-cca91a106943	sankara.telukutla	8f97cd57-26f2-4792-900a-8ec437f684ed	folder	Passbook AP-KATRAGUNTLA-1422-KQHP	\N	\N	\N	f	\N	2026-07-15 22:47:14.576216-07	2026-07-15 22:47:14.576216-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	pattadar
b5ee966f-87cf-482b-836d-451cb6a09b7f	sankara.telukutla	fa6cccdf-3367-413e-a097-cca91a106943	folder	Parcel AP-KATRAGUNTLA-120/2-R8T7	\N	\N	\N	f	\N	2026-07-13 01:32:27.429443-07	2026-07-15 22:47:14.577161-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	pattadar
78eab4ad-cede-409a-befc-0b882045aa70	sankara.telukutla	8f97cd57-26f2-4792-900a-8ec437f684ed	folder	Passbook AP-MANGALAKUNTA-567-2XTA	\N	\N	\N	f	\N	2026-07-15 22:47:14.578543-07	2026-07-15 22:47:14.578543-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	pattadar
d305c171-7bb9-4618-8133-99c2b58861f6	sankara.telukutla	8f97cd57-26f2-4792-900a-8ec437f684ed	folder	Passbook AP-MANGALAKUNTA-5001-CQ1N	\N	\N	\N	f	\N	2026-07-15 22:47:14.580738-07	2026-07-15 22:47:14.580738-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	pattadar
74970757-9790-4495-b7da-0d364c9ad212	sankara.telukutla	\N	file	me.jpeg	5782	image/jpeg	76fef2e3-e929-43c1-b815-6b8a57817e9b	f	\N	2026-07-16 11:47:04.528604-07	2026-07-19 08:13:47.627014-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	pattadar
cfadd7db-70be-4b54-a52a-01b72b9f3aaa	sankara.telukutla	\N	file	ch2Bhu Bharati - Telangana.pdf	435719	application/pdf	b64c1888-8afc-4f1a-83c6-6f2de112fa78	f	\N	2026-07-19 09:44:58.954246-07	2026-07-19 09:44:58.954246-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	pattadar
47cb7770-9e6d-44be-ba87-7c1e4fdc2856	sankara.telukutla	1a245fe4-6182-458b-90ff-18059998fe01	folder	Parcel TS-CHAKRAMPALLE-37/12-T745	\N	\N	\N	f	\N	2026-07-22 06:39:10.267706-07	2026-07-22 06:39:10.267706-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	pattadar
445df411-306f-4234-adf3-174f741cf511	sankara.telukutla	8f97cd57-26f2-4792-900a-8ec437f684ed	folder	Beneficiary Aadhaar	\N	\N	\N	f	\N	2026-07-22 08:32:07.71749-07	2026-07-22 08:32:07.71749-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	pattadar
eaaf57ef-f5be-4bbf-81a9-4b8fb11c703f	sankara.telukutla	\N	file	swetha phtos.jpg	255595	image/jpeg	bf8b0c32-3734-4b1d-8db4-fde00c801ff7	f	\N	2026-07-23 01:57:33.615299-07	2026-07-23 01:57:33.615299-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	pattadar
dd35155f-8aa3-4f5a-bdec-9bf1218b4c58	sankara.telukutla	\N	file	chakrampalli.jpg	358800	image/jpeg	9d3ed31d-110c-4cff-8c6b-ce13e3e8147c	f	2026-07-25 08:35:51.957819-07	2026-07-19 10:03:49.478966-07	2026-07-25 08:03:07.520477-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	pattadar
b3638e06-f7f1-4f9a-bc91-1ac05fd853cc	sankara.telukutla	\N	file	TBHYDXXXXXXX1384WL.pdf	51178	application/pdf	a611548d-64fe-4b1a-877e-e5d945fa207e	f	\N	2026-07-09 17:30:36.653705-07	2026-07-09 17:30:36.653705-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	\N
9d247862-d820-44f1-b898-23c77074c278	sankara.telukutla	\N	file	Pattadar_SRS.pdf	150641	application/pdf	8afee532-35c0-498a-9be9-68fbbaf40ae7	f	\N	2026-07-11 22:34:43.660694-07	2026-07-12 03:27:45.299312-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	pattadar
1d6e1eff-8f24-48c4-b71a-5fe1e87c4c47	sankara.telukutla	\N	folder	Assistant	\N	\N	\N	f	\N	2026-07-10 02:56:58.228257-07	2026-07-10 02:56:58.228257-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	\N
36d16bad-3466-4692-b1c5-4c4e6fc3ef1f	sankara.telukutla	\N	file	Bhu Bharati - Telangana.pdf	431264	application/pdf	cb96e527-6b86-4c4b-b0a8-bd85741f24de	f	\N	2026-07-12 03:40:41.239063-07	2026-07-12 03:40:41.239063-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	pattadar
695801f2-b8b3-48a8-aa9c-aa806592e3d2	sankara.telukutla	\N	file	sankaramangalakunta.jpg	278050	image/jpeg	a92e4a5f-3d71-4be0-b0cd-61427965ad2b	f	2026-07-25 08:35:54.925381-07	2026-07-16 11:47:15.761647-07	2026-07-25 08:02:49.39655-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	pattadar
097f55c2-0122-45f6-b037-91d934a8b458	sankara.telukutla	78eab4ad-cede-409a-befc-0b882045aa70	folder	Parcel AP-MANGALAKUNTA-1-M4K6	\N	\N	\N	f	\N	2026-07-14 06:16:40.135406-07	2026-07-15 22:47:14.579277-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	pattadar
5b7109df-0042-457f-af88-0c331993f260	sankara.telukutla	a69b1730-3e07-4b2c-8db9-8174e64f76f5	file	Pattadar_SRS.docx	26749	application/vnd.openxmlformats-officedocument.wordprocessingml.document	03ac4185-30be-4a48-95f7-53ab52cc57b4	f	\N	2026-07-10 02:56:58.268801-07	2026-07-10 11:45:00.016392-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	rfactory
e210c089-9a56-4d06-a017-09e807daaa17	sankara.telukutla	d305c171-7bb9-4618-8133-99c2b58861f6	folder	Parcel AP-MANGALAKUNTA-1/D-C9GD	\N	\N	\N	f	\N	2026-07-13 21:14:24.967576-07	2026-07-15 22:47:14.581506-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	pattadar
0b185fd7-511d-4f74-b67a-5d8275801b3c	sankara.telukutla	\N	file	1bScreesnhot.jpg	822075	image/jpeg	c546a1ff-a17b-43fd-a023-70cfab5eb091	f	\N	2026-07-10 22:33:00.010761-07	2026-07-10 22:33:00.010761-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	pattadar
d394df11-ed1b-4d8b-a450-214d12ec1a2d	sankara.telukutla	27f59b4b-4f6f-4f80-b9e8-f369ccdbb5f2	folder	Parcel AP-KATRAGUNTA-127/2-0WCZ	\N	\N	\N	f	\N	2026-07-15 01:34:09.572563-07	2026-07-15 22:47:14.582343-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	pattadar
3cd909c9-68a8-4c12-a60e-8de92891a516	sankara.telukutla	5f884edf-1fd5-4011-97c6-e5e91dec3bda	file	PHOTO-2026-07-22-20-39-04 3.jpg	227481	image/jpeg	4a0aa164-95bd-4328-a5af-42aa88f03dfa	f	\N	2026-07-23 02:37:58.420615-07	2026-07-23 02:37:58.420615-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	\N
d8619f43-1c7b-45ef-a018-20e899e4a6b9	sankara.telukutla	\N	file	Site At Nallapadu School 418.pdf	13100510	application/pdf	18493706-7b71-4d52-acc5-e6add4d7602d	f	\N	2026-07-09 17:42:48.814095-07	2026-07-25 06:22:44.784548-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	\N
909e12e9-173c-4159-88a5-a69b2993728a	sankara.telukutla	b5ee966f-87cf-482b-836d-451cb6a09b7f	file	Site at Nallapadu Station.pdf	14007415	application/pdf	afafcc32-62a1-4223-b038-9250670df2e5	f	\N	2026-07-09 17:42:48.964609-07	2026-07-13 01:32:27.446842-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	\N
c1997925-d9b5-430c-ad2e-c06b1ef8f742	sankara.telukutla	\N	file	Aadhaar.pdf	273266	application/pdf	6d67f7e1-094b-4466-a08c-7fa4cdd90e9b	f	\N	2026-07-22 07:46:34.775385-07	2026-07-22 08:22:32.647748-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	pattadar
bc08cce8-2038-44fa-a0c4-792b3c3b8935	sankara.telukutla	445df411-306f-4234-adf3-174f741cf511	file	Aadhaar-beneficiary.jpg	255595	image/jpeg	5bce2fe9-d259-4d0e-9480-5e18e74611bb	f	\N	2026-07-22 08:32:07.768951-07	2026-07-22 08:32:07.768951-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	pattadar
524b6097-fa3c-43ab-93cc-015c592c26ba	sankara.telukutla	\N	file	slfkj.jpg	115716	image/jpeg	fd607757-11b6-45fe-9ed3-d2e441521fee	f	\N	2026-07-16 09:13:48.383571-07	2026-07-16 09:13:48.383571-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	pattadar
b90d9cb7-52f4-486d-b43d-5632573225ff	sankara.telukutla	097f55c2-0122-45f6-b037-91d934a8b458	file	nanna.jpg	772917	image/jpeg	0a1a95a2-9171-45c1-b3a9-1cf44b896a35	f	\N	2026-07-11 19:29:38.312739-07	2026-07-14 06:16:40.145977-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	pattadar
e418ec24-c1e8-4553-b7cb-f28cf42b4714	sankara.telukutla	445df411-306f-4234-adf3-174f741cf511	file	Aadhaar-549986058203.pdf	273266	application/pdf	f7098385-50a5-4ea7-92c0-e927061cb36c	f	\N	2026-07-22 08:32:17.645992-07	2026-07-22 08:32:17.645992-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	pattadar
effac209-583b-4a82-80f0-1e51e38ccb45	sankara.telukutla	\N	file	amma.jpg	677407	image/jpeg	3c0a9d0c-dfff-4e84-aece-5326cf4ea177	f	2026-07-25 01:31:34.794244-07	2026-07-11 12:32:40.110241-07	2026-07-25 01:02:04.240198-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	pattadar
5f884edf-1fd5-4011-97c6-e5e91dec3bda	sankara.telukutla	\N	folder	Potalapadu	\N	\N	\N	f	\N	2026-07-23 02:37:50.884323-07	2026-07-23 02:37:50.884323-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	\N
d0899fbd-65e4-4ed5-8fe1-1a143f715acd	sankara.telukutla	a69b1730-3e07-4b2c-8db9-8174e64f76f5	file	Gmail - Buy together.pdf	148358	application/pdf	32d1bf64-4cc3-4cda-89e8-d83379059101	f	\N	2026-07-15 19:43:57.660304-07	2026-07-15 19:44:48.014899-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	rfactory
8f97cd57-26f2-4792-900a-8ec437f684ed	sankara.telukutla	\N	folder	Pattadar	\N	\N	\N	f	\N	2026-07-15 20:03:07.463415-07	2026-07-15 20:03:07.463415-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	pattadar
aa789b7e-9d36-4e7c-839b-66b6bf5e6d9e	sankara.telukutla	\N	file	katragunta sankara.jpg	487103	image/jpeg	8d06bb01-7a40-4603-814e-93f48a5b34b1	f	\N	2026-07-11 22:40:07.171615-07	2026-07-25 08:58:09.159967-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	pattadar
3e8cda7a-3e9f-421d-bc5c-f5caa8b99bbc	sankara.telukutla	5f884edf-1fd5-4011-97c6-e5e91dec3bda	file	PHOTO-2026-07-22-20-39-06 2.jpg	90672	image/jpeg	0a1c2ac4-d769-47a0-844e-da561e29275d	f	\N	2026-07-23 02:37:58.282466-07	2026-07-23 02:37:58.282466-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	\N
1a245fe4-6182-458b-90ff-18059998fe01	sankara.telukutla	8f97cd57-26f2-4792-900a-8ec437f684ed	folder	Passbook TS-CHAKRAMPALLE-60602-AC7D	\N	\N	\N	f	\N	2026-07-22 06:39:10.179105-07	2026-07-22 06:39:10.179105-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	pattadar
c78e1df7-d173-4cae-ba45-de50bdb96b9f	sankara.telukutla	47cb7770-9e6d-44be-ba87-7c1e4fdc2856	file	Site at AnkireddyPalem 210 north face.pdf	11517285	application/pdf	672636d8-7ae3-45a4-ac1e-1aac9cf316cd	f	\N	2026-07-09 17:42:49.088584-07	2026-07-22 06:39:10.280346-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	\N
618a7b9f-c47d-43e7-8911-e66fd6facb30	sankara.telukutla	5f884edf-1fd5-4011-97c6-e5e91dec3bda	file	PHOTO-2026-07-22-20-39-06.jpg	171012	image/jpeg	cd1da4f4-693c-4b79-93fd-68f3c434c3c9	f	\N	2026-07-23 02:37:58.307103-07	2026-07-23 02:37:58.307103-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	\N
bc4aa857-eca4-4f7d-8b8a-9e52b1adcab3	sankara.telukutla	5f884edf-1fd5-4011-97c6-e5e91dec3bda	file	PHOTO-2026-07-22-20-39-05 4.jpg	225878	image/jpeg	0e40de7e-a923-44f6-8aa0-860d34e10b10	f	\N	2026-07-23 02:37:58.329795-07	2026-07-23 02:37:58.329795-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	\N
0b2cc39e-a0d3-49cf-9f95-a95e007dc676	sankara.telukutla	5f884edf-1fd5-4011-97c6-e5e91dec3bda	file	PHOTO-2026-07-22-20-39-05 3.jpg	245040	image/jpeg	976b29f2-6ede-4102-a732-627e41d86ccd	f	\N	2026-07-23 02:37:58.354468-07	2026-07-23 02:37:58.354468-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	\N
9892e9f2-a1ce-4e6c-a2fe-dd008bd92a83	sankara.telukutla	5f884edf-1fd5-4011-97c6-e5e91dec3bda	file	PHOTO-2026-07-22-20-39-05 2.jpg	177718	image/jpeg	24de05d9-6d16-4935-8d62-82712e70e711	f	\N	2026-07-23 02:37:58.376924-07	2026-07-23 02:37:58.376924-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	\N
a16acbbe-29a1-45d9-b5b3-3397120d2a9b	sankara.telukutla	5f884edf-1fd5-4011-97c6-e5e91dec3bda	file	PHOTO-2026-07-22-20-39-05.jpg	220064	image/jpeg	4902b3d6-eb62-4994-aab5-70cd083176cc	f	\N	2026-07-23 02:37:58.39747-07	2026-07-23 02:37:58.39747-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	\N
f2f07f9f-d342-47ce-9bca-6924e6cfc3a9	sankara.telukutla	5f884edf-1fd5-4011-97c6-e5e91dec3bda	file	PHOTO-2026-07-22-20-39-04 2.jpg	243506	image/jpeg	4bb81261-2d20-43b4-a094-e924c07c3e09	f	\N	2026-07-23 02:37:58.443658-07	2026-07-23 02:37:58.443658-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	\N
56527c17-214d-400e-a490-815fcdc49d67	sankara.telukutla	5f884edf-1fd5-4011-97c6-e5e91dec3bda	file	PHOTO-2026-07-22-20-39-04.jpg	257908	image/jpeg	164cc65b-0b3b-4533-90e4-16b429764a08	f	\N	2026-07-23 02:37:58.466766-07	2026-07-23 02:37:58.466766-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	\N
1df55d18-b5b7-4c39-be85-7b6384eabbd6	sankara.telukutla	5f884edf-1fd5-4011-97c6-e5e91dec3bda	file	PHOTO-2026-07-22-20-39-03 3.jpg	219085	image/jpeg	290a36ad-0126-4224-ae1c-3a2bf455c931	f	\N	2026-07-23 02:37:58.485613-07	2026-07-23 02:37:58.485613-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	\N
4ba07bc9-effb-4cce-a008-07ae4a0abf36	sankara.telukutla	5f884edf-1fd5-4011-97c6-e5e91dec3bda	file	PHOTO-2026-07-22-20-39-03 2.jpg	303119	image/jpeg	cc14030a-231a-4fd9-b7d0-44f8ecb3d164	f	\N	2026-07-23 02:37:58.511477-07	2026-07-23 02:37:58.511477-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	\N
f83ba95a-cd8c-4cc6-8504-b6acc80954a1	sankara.telukutla	5f884edf-1fd5-4011-97c6-e5e91dec3bda	file	PHOTO-2026-07-22-20-39-02 3.jpg	351369	image/jpeg	d17a53a6-d5c1-40cd-8b0f-9bead18f792b	f	\N	2026-07-23 02:37:58.58727-07	2026-07-23 02:37:58.58727-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	\N
182fc84f-e450-41c4-8b4c-36374caef904	sankara.telukutla	5f884edf-1fd5-4011-97c6-e5e91dec3bda	file	PHOTO-2026-07-22-20-39-01.jpg	220511	image/jpeg	27228678-7464-43cb-b664-b5fb64a8edb2	f	\N	2026-07-23 02:37:58.657528-07	2026-07-23 02:37:58.657528-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	\N
fa781cef-2b7c-4862-b6c4-ec157607923b	sankara.telukutla	5f884edf-1fd5-4011-97c6-e5e91dec3bda	file	PHOTO-2026-07-22-20-39-03.jpg	216177	image/jpeg	75af56f6-69a6-4f4a-a59c-fe2b47b4192a	f	\N	2026-07-23 02:37:58.533926-07	2026-07-23 02:37:58.533926-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	\N
11edd37d-da36-4030-be34-e10ce81756f0	sankara.telukutla	5f884edf-1fd5-4011-97c6-e5e91dec3bda	file	PHOTO-2026-07-22-20-39-02 2.jpg	210308	image/jpeg	7866f76d-bdba-4399-8371-ea5f5fb6c4b6	f	\N	2026-07-23 02:37:58.612268-07	2026-07-23 02:37:58.612268-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	\N
4ecf2ca5-393a-4dce-b363-1ffabe46ce4b	sankara.telukutla	5f884edf-1fd5-4011-97c6-e5e91dec3bda	file	PHOTO-2026-07-22-20-39-02 4.jpg	290947	image/jpeg	496ca55d-51fb-4b81-acd8-1de23c95e1c0	f	\N	2026-07-23 02:37:58.559662-07	2026-07-23 02:37:58.559662-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	\N
cdea4b63-d70c-472e-8ad1-91f384bbcb9f	sankara.telukutla	5f884edf-1fd5-4011-97c6-e5e91dec3bda	file	PHOTO-2026-07-22-20-39-02.jpg	294074	image/jpeg	1a9491b9-d40a-429b-91ea-e02adbaaade1	f	\N	2026-07-23 02:37:58.635855-07	2026-07-23 02:37:58.635855-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	\N
9dc5a415-d85f-4606-babb-11c0dfdf6c41	sankara.telukutla	8f97cd57-26f2-4792-900a-8ec437f684ed	folder	Passbook AP-KATRAGUNTA-1422-FYNE	\N	\N	\N	f	\N	2026-07-24 07:48:20.010169-07	2026-07-24 07:48:20.010169-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	pattadar
03b3a34c-d449-492b-8b9f-d4a6752845fe	sankara.telukutla	9dc5a415-d85f-4606-babb-11c0dfdf6c41	folder	Parcel AP-KATRAGUNTA-741/1A-9VXJ	\N	\N	\N	f	\N	2026-07-24 07:48:20.087369-07	2026-07-24 07:48:20.087369-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	pattadar
13d01ca9-648c-4065-9fa6-6fdb9690b82a	sankara.telukutla	03b3a34c-d449-492b-8b9f-d4a6752845fe	file	PHOTO-2025-06-01-18-17-36.jpg	197976	image/jpeg	073eb16e-fa77-453d-a04a-8fde46ec82dc	f	\N	2026-07-24 07:48:19.784036-07	2026-07-24 07:48:20.101546-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	pattadar
6bf7cca0-9880-4464-9426-c064efc81fcf	sankara.telukutla	03b3a34c-d449-492b-8b9f-d4a6752845fe	file	VIDEO-2026-05-28-22-33-42 (1).mp4	13601089	video/mp4	07253931-67aa-426a-b0e8-7e7f8a4bbc6c	f	\N	2026-07-24 07:55:30.530318-07	2026-07-24 07:55:30.638628-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	pattadar
48bf8bcb-267b-4834-a4db-6997826f087c	sankara.telukutla	03b3a34c-d449-492b-8b9f-d4a6752845fe	file	VIDEO-2026-05-28-22-33-42.mp4	13601089	video/mp4	9596a40d-e596-4ee6-a7fc-2a2fff70ef13	f	\N	2026-07-24 07:55:35.12407-07	2026-07-24 07:55:35.232927-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	pattadar
6eda29d7-7450-43c0-9258-c4ef0f8eab47	sankara.telukutla	\N	folder	Pedda Gollapalli	\N	\N	\N	f	\N	2026-07-23 15:19:33.029949-07	2026-07-23 15:19:33.029949-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	\N
13264e0a-80cf-4087-824f-4f00494cb19f	sankara.telukutla	6eda29d7-7450-43c0-9258-c4ef0f8eab47	file	VIDEO-2026-05-28-22-33-42 2.mp4	5467602	video/mp4	4af24e95-bd8b-42b6-bc54-a4caaf8f595d	f	\N	2026-07-23 15:19:38.746677-07	2026-07-23 15:19:38.746677-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	\N
f4a1921e-1228-4232-a123-88a9bb9e140f	sankara.telukutla	6eda29d7-7450-43c0-9258-c4ef0f8eab47	file	VIDEO-2026-05-28-22-33-42.mp4	13601089	video/mp4	d0052a61-3796-4d75-991c-1ff2ca08730e	f	\N	2026-07-23 15:19:38.980665-07	2026-07-23 15:19:38.980665-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	\N
38d040f4-e17e-41da-980c-5674aa4f4bba	sankara.telukutla	6eda29d7-7450-43c0-9258-c4ef0f8eab47	file	Certified Copy-810-1-14037-2025.pdf	1863160	application/pdf	90e91b1e-07e3-4574-8514-4eb130b273bd	f	\N	2026-07-23 15:19:39.092466-07	2026-07-23 15:19:39.092466-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	\N
5e595833-c7a9-407f-b1c9-5dd2a34eda67	sankara.telukutla	6eda29d7-7450-43c0-9258-c4ef0f8eab47	file	Certified Copy-810-1-14041-2025.pdf	1943595	application/pdf	45c8192b-9f21-4ae6-b6c3-a4f717c035cb	f	\N	2026-07-23 15:19:39.134686-07	2026-07-23 15:19:39.134686-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	\N
ffc35543-f3ca-4fd7-a579-97db8c48a60c	sankara.telukutla	6eda29d7-7450-43c0-9258-c4ef0f8eab47	file	Certified Copy-810-1-14039-2025.pdf	1900921	application/pdf	9c66f3c5-2983-4354-8b00-3ac844c1a2f9	f	\N	2026-07-23 15:19:39.173201-07	2026-07-23 15:19:39.173201-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	\N
cc9ac12d-6acd-425b-80dc-6b704f64811a	sankara.telukutla	6eda29d7-7450-43c0-9258-c4ef0f8eab47	file	Certified Copy-810-1-14036-2025.pdf	1969716	application/pdf	924e0458-d84a-4f05-a9f4-a8ce1bc74052	f	\N	2026-07-23 15:19:39.214019-07	2026-07-23 15:19:39.214019-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	\N
50e9f60b-b902-48db-8054-3534eec9073a	sankara.telukutla	6eda29d7-7450-43c0-9258-c4ef0f8eab47	file	Certified Copy-810-1-13626-2025.pdf	5017285	application/pdf	4b7fce99-32d1-46c2-b2fe-4c679b495bd8	f	\N	2026-07-23 15:19:39.28849-07	2026-07-23 15:19:39.28849-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	\N
3a73dbbd-0c84-4a04-8ab9-05c4f90f2386	sankara.telukutla	6eda29d7-7450-43c0-9258-c4ef0f8eab47	file	Certified Copy-810-1-13627-2025.pdf	4965620	application/pdf	2276c6d6-1391-4cbf-b2c6-3cc3691b9b98	f	\N	2026-07-23 15:19:39.353707-07	2026-07-23 15:19:39.353707-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	\N
e1e38eec-7ddf-4c3c-b365-bfcbc24be056	sankara.telukutla	6eda29d7-7450-43c0-9258-c4ef0f8eab47	file	Certified Copy-810-1-13617-2025.pdf	4372863	application/pdf	a01ad9b9-2727-440a-821d-700d1e578b4f	f	\N	2026-07-23 15:19:39.419529-07	2026-07-23 15:19:39.419529-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	\N
09553b23-0d1f-4a62-89ed-02df34c09f28	sankara.telukutla	6eda29d7-7450-43c0-9258-c4ef0f8eab47	file	Certified Copy-810-1-13614-2025.pdf	4172527	application/pdf	d1c405a3-a896-41dc-9ed4-ce41f57750a0	f	\N	2026-07-23 15:19:39.479493-07	2026-07-23 15:19:39.479493-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	\N
66327fc5-a63e-4992-b63f-19957616aed3	sankara.telukutla	6eda29d7-7450-43c0-9258-c4ef0f8eab47	file	5024.pdf	166470	application/pdf	ccab2f91-3b0e-48ff-b649-699ec28d72ea	f	\N	2026-07-23 15:19:39.497733-07	2026-07-23 15:19:39.497733-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	\N
2b1c5526-5ec5-4948-90d4-731b235bd904	sankara.telukutla	03b3a34c-d449-492b-8b9f-d4a6752845fe	file	Certified Copy-810-1-14036-2025.pdf	1969716	application/pdf	79fcec8a-d0d5-4805-a522-bc324db9db75	f	\N	2026-07-24 08:00:26.36461-07	2026-07-24 08:00:26.906182-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	pattadar
bbddd4ad-f099-4d80-8914-387928d1642f	sankara.telukutla	03b3a34c-d449-492b-8b9f-d4a6752845fe	file	PHOTO-2025-06-01-18-17-35.jpg	110754	image/jpeg	ed888e89-d45b-49d5-9115-9cf33acc1247	f	\N	2026-07-24 08:02:22.646548-07	2026-07-24 08:02:22.741423-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	pattadar
1ed48580-0bdb-467e-b531-0b6485fd44d8	sankara.telukutla	03b3a34c-d449-492b-8b9f-d4a6752845fe	file	PHOTO-2025-06-01-18-17-35 2.jpg	171931	image/jpeg	99a06058-d9d7-4a25-815d-d4ba12537f41	f	\N	2026-07-24 08:02:22.78811-07	2026-07-24 08:02:22.934107-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	pattadar
ca247aad-d624-45c2-b529-8256be9bcfcd	sankara.telukutla	\N	file	Site at Ankireddy Palem Janachaitanay 191 - North-West.pdf	14439064	application/pdf	767fc6ef-e2ef-4215-99a4-e3af77bc8350	f	\N	2026-07-09 17:42:48.636005-07	2026-07-25 06:22:44.784469-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	\N
412f3c71-6ee5-42dd-a5ee-c4cc3ef4916f	sankara.telukutla	8f97cd57-26f2-4792-900a-8ec437f684ed	folder	Passbook AP-MANGALAKUNTA-5001-6VRR	\N	\N	\N	f	\N	2026-07-25 07:18:47.039507-07	2026-07-25 07:18:47.039507-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	pattadar
c6c32752-a518-4ebf-9c6a-0826567ce7b7	sankara.telukutla	\N	file	nanna.jpg	772917	image/jpeg	59c6833c-0b82-41b2-8686-bde88dd55257	f	2026-07-25 01:31:34.794181-07	2026-07-15 07:32:02.305648-07	2026-07-25 01:02:04.238182-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	pattadar
5ec7405f-c125-4de5-9d5c-d3839936a449	sankara.telukutla	412f3c71-6ee5-42dd-a5ee-c4cc3ef4916f	folder	Parcel AP-MANGALAKUNTA-1/D-TF69	\N	\N	\N	f	\N	2026-07-25 07:18:47.253288-07	2026-07-25 07:18:47.253288-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	pattadar
00a6349e-dcdf-43cf-9255-e6f250fb23a7	sankara.telukutla	\N	file	Site at Nallapadu Station.pdf	14007415	application/pdf	eb5355dc-7eb1-4f07-bf76-b1ca22d81ac8	f	\N	2026-07-23 13:56:52.15965-07	2026-07-25 06:23:49.173753-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	pattadar
f4aa41eb-80cf-4744-bd8a-68860d7144ec	sankara.telukutla	\N	file	Site at AnkireddyPalem 210 north face.pdf	11517285	application/pdf	477d8a6d-a6cb-40ca-a21a-0c55cd609772	f	\N	2026-07-23 12:27:20.79168-07	2026-07-25 06:24:23.513999-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	pattadar
547fcec7-1638-4e18-8dbf-0f14dff3a32d	sankara.telukutla	412f3c71-6ee5-42dd-a5ee-c4cc3ef4916f	folder	Parcel AP-MANGALAKUNTA-1/C1B-BKNC	\N	\N	\N	f	\N	2026-07-25 07:19:04.560085-07	2026-07-25 07:19:04.560085-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	pattadar
1b9b09dd-1d69-4223-a260-a5bb40e07626	sankara.telukutla	5ec7405f-c125-4de5-9d5c-d3839936a449	file	VIDEO-2026-05-28-22-33-42.mp4	13601089	video/mp4	92590205-511b-43ad-9dd4-43ded2b38c77	f	2026-07-25 08:35:58.053654-07	2026-07-25 07:21:44.89881-07	2026-07-25 07:21:45.005404-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	pattadar
b679e7f5-69e2-4567-bca0-d104f91d39e1	sankara.telukutla	\N	file	PHOTO-2025-06-01-18-17-36.jpg	197976	image/jpeg	1188df5e-ed96-4c3e-b292-f47939a13c00	f	\N	2026-07-24 08:02:22.987171-07	2026-07-25 09:09:12.43816-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	pattadar
21744d10-d99b-46b0-aac1-adec6c6f6912	sankara.telukutla	\N	file	VIDEO-2026-05-28-22-33-42 (1).mp4	13601089	video/mp4	c506a3cc-2a42-41cf-8cf0-c562f139c6ed	f	\N	2026-07-25 08:07:14.88302-07	2026-07-25 08:07:14.88302-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	pattadar
344bd91c-9e19-486e-a9c5-63cee0a1ff84	sankara.telukutla	\N	file	PHOTO-2025-06-01-18-17-35 2.jpg	171931	image/jpeg	ede848f1-a390-40a2-b008-6609a2e14169	f	2026-07-25 08:35:51.957935-07	2026-07-25 08:03:44.110351-07	2026-07-25 08:03:56.247969-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	pattadar
12c5253f-7250-4a20-8521-8a02104bc5b2	sankara.telukutla	\N	file	PHOTO-2025-06-01-18-17-35.jpg	110754	image/jpeg	d377b694-381f-4493-b72a-802131cc5c61	f	2026-07-25 08:35:54.925248-07	2026-07-25 07:25:33.850036-07	2026-07-25 08:03:40.582618-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	pattadar
715a59e0-8d8b-47c0-91e5-783e9693ee17	sankara.telukutla	547fcec7-1638-4e18-8dbf-0f14dff3a32d	file	PHOTO-2025-06-01-18-17-35 2.jpg	171931	image/jpeg	7436bcb5-23b7-40d7-ac84-87fe9e462e3a	f	2026-07-25 08:35:58.053983-07	2026-07-25 07:19:04.404844-07	2026-07-25 07:19:04.569521-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	pattadar
1a452205-a976-4cb9-adb3-beb0cac071ee	sankara.telukutla	5ec7405f-c125-4de5-9d5c-d3839936a449	file	PHOTO-2025-06-01-18-17-35.jpg	110754	image/jpeg	ae88e440-bb08-40ce-9733-9ae422dd9658	f	2026-07-25 08:35:58.054151-07	2026-07-25 07:18:46.929616-07	2026-07-25 07:18:47.264439-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	pattadar
9a4752c8-2faf-4147-b521-cd83b9eeb42b	sankara.telukutla	8f97cd57-26f2-4792-900a-8ec437f684ed	folder	Passbook AP-KATRAGUNTA-1422-XFVF	\N	\N	\N	f	\N	2026-07-25 08:59:10.850744-07	2026-07-25 08:59:10.850744-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	pattadar
177689f6-3c4e-4e51-b234-b3402f1b2b9b	sankara.telukutla	9a4752c8-2faf-4147-b521-cd83b9eeb42b	folder	Parcel AP-KATRAGUNTA-120/2-Q0W1	\N	\N	\N	f	\N	2026-07-25 08:59:10.928026-07	2026-07-25 08:59:10.928026-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	pattadar
1e6f8e07-9b22-443a-9ea8-c661a07de572	sankara.telukutla	177689f6-3c4e-4e51-b234-b3402f1b2b9b	file	VIDEO-2026-05-28-22-33-42 2.mp4	5467602	video/mp4	dd6b484d-99a5-4988-a56a-c548c8e0ee19	f	\N	2026-07-25 08:59:10.737686-07	2026-07-25 08:59:10.938091-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	pattadar
ee0e629c-2c3e-4d1f-82fc-cee8cf36c791	sankara.telukutla	177689f6-3c4e-4e51-b234-b3402f1b2b9b	file	PHOTO-2025-06-01-18-17-35.jpg	110754	image/jpeg	2d2bf6f2-8b79-4e55-8494-6fd87b03218c	f	\N	2026-07-25 08:59:10.9709-07	2026-07-25 08:59:11.100775-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	pattadar
5d361b33-ad2a-471d-b919-70c1dc421271	sankara.telukutla	\N	file	PHOTO-2025-06-01-18-17-35 2.jpg	171931	image/jpeg	c62c45a5-da1d-4f8c-8d9b-9a9fccc4dabc	f	\N	2026-07-25 09:09:18.761457-07	2026-07-25 09:09:18.761457-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	pattadar
166415a9-b1c5-4f97-8d5d-e9ba0c2ad617	sankara.telukutla	\N	file	amma.jpg	677407	image/jpeg	65d01bc0-a06d-452a-be52-95b6240badca	f	\N	2026-07-25 11:19:34.915764-07	2026-07-25 11:19:34.915764-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	pattadar
02672173-ab2c-4954-8499-6e6f75ef86b8	sankara.telukutla	\N	file	nanna.jpg	772917	image/jpeg	e0ffd6d1-46df-4d1d-816e-8f9904c8d5e2	f	\N	2026-07-25 11:20:15.203763-07	2026-07-25 11:20:15.203763-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	pattadar
32209a62-04ad-4ae1-8297-6d191866fc34	sankara.telukutla	\N	file	sankaramangalakunta.jpg	278050	image/jpeg	fabdc33e-a846-420f-8db4-2e759a7905cd	f	\N	2026-07-25 11:21:15.970246-07	2026-07-25 11:21:15.970246-07	sankara.telukutla	sankara.telukutla	rfactory	rfactory	pattadar
\.


--
-- Data for Name: storage_shares; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.storage_shares (id, node_id, owner_id, grantee_id, token, permission, expires_at, created_at, created_by) FROM stdin;
\.


--
-- Data for Name: storage_tags; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.storage_tags (id, owner_id, name, color, created_at) FROM stdin;
5ee3c946-c210-4132-b287-2818e1dcb539	t_1f2b0c6618c7	Important	red	2026-07-09 18:36:07.73684-07
477a0042-badb-4f5d-bf2c-155cf30171cf	sankara.telukutla	Test	red	2026-07-09 19:53:31.555304-07
7c845eb0-cab8-48e2-8ba8-c00973212f19	t_6061f3478a8b	Important	red	2026-07-10 01:48:22.990662-07
\.


--
-- Data for Name: storage_versions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.storage_versions (id, node_id, owner_id, object_key, size_bytes, mime_type, etag, created_at, created_by) FROM stdin;
cd260e4f-d1cc-4486-b8c3-ac3ba4d6a1e7	5b7109df-0042-457f-af88-0c331993f260	sankara.telukutla	sankara.telukutla/5b7109df-0042-457f-af88-0c331993f260/cd260e4f-d1cc-4486-b8c3-ac3ba4d6a1e7	26749	application/vnd.openxmlformats-officedocument.wordprocessingml.document	\N	2026-07-10 02:56:58.270482-07	sankara.telukutla
3f62d8da-66d4-4de5-aabb-f898141df0aa	5b7109df-0042-457f-af88-0c331993f260	sankara.telukutla	sankara.telukutla/5b7109df-0042-457f-af88-0c331993f260/3f62d8da-66d4-4de5-aabb-f898141df0aa	26749	application/vnd.openxmlformats-officedocument.wordprocessingml.document	\N	2026-07-10 02:57:33.695888-07	sankara.telukutla
db4a944c-6fa1-40f5-917f-2f3516368d04	5b7109df-0042-457f-af88-0c331993f260	sankara.telukutla	sankara.telukutla/5b7109df-0042-457f-af88-0c331993f260/db4a944c-6fa1-40f5-917f-2f3516368d04	26749	application/vnd.openxmlformats-officedocument.wordprocessingml.document	\N	2026-07-10 11:33:36.260118-07	sankara.telukutla
766d661e-3b1c-4cb0-80bc-d7389a1cbfb9	5b7109df-0042-457f-af88-0c331993f260	sankara.telukutla	sankara.telukutla/5b7109df-0042-457f-af88-0c331993f260/766d661e-3b1c-4cb0-80bc-d7389a1cbfb9	26749	application/vnd.openxmlformats-officedocument.wordprocessingml.document	\N	2026-07-10 11:34:08.301292-07	sankara.telukutla
03ac4185-30be-4a48-95f7-53ab52cc57b4	5b7109df-0042-457f-af88-0c331993f260	sankara.telukutla	sankara.telukutla/5b7109df-0042-457f-af88-0c331993f260/03ac4185-30be-4a48-95f7-53ab52cc57b4	26749	application/vnd.openxmlformats-officedocument.wordprocessingml.document	\N	2026-07-10 11:45:00.015592-07	sankara.telukutla
589b3ece-13af-41c3-af1c-794c8814ed1b	e0674a01-f957-4f76-a9c2-e1ad3258349c	sankara.telukutla	sankara.telukutla/e0674a01-f957-4f76-a9c2-e1ad3258349c/589b3ece-13af-41c3-af1c-794c8814ed1b	925631	application/pdf	\N	2026-07-10 20:54:38.572647-07	sankara.telukutla
75cb6297-27ec-4fca-9842-9e8330447498	e0674a01-f957-4f76-a9c2-e1ad3258349c	sankara.telukutla	sankara.telukutla/e0674a01-f957-4f76-a9c2-e1ad3258349c/75cb6297-27ec-4fca-9842-9e8330447498	925631	application/pdf	\N	2026-07-10 21:10:46.05384-07	sankara.telukutla
d71a578d-3eeb-4b67-9ccf-18affae40447	e0674a01-f957-4f76-a9c2-e1ad3258349c	sankara.telukutla	sankara.telukutla/e0674a01-f957-4f76-a9c2-e1ad3258349c/d71a578d-3eeb-4b67-9ccf-18affae40447	925631	application/pdf	\N	2026-07-10 21:48:08.98351-07	sankara.telukutla
7daeac32-a414-4461-9399-424c1cf5cbfa	e0674a01-f957-4f76-a9c2-e1ad3258349c	sankara.telukutla	sankara.telukutla/e0674a01-f957-4f76-a9c2-e1ad3258349c/7daeac32-a414-4461-9399-424c1cf5cbfa	925631	application/pdf	\N	2026-07-10 21:54:26.84343-07	sankara.telukutla
1f9d5723-d36d-41f9-94b3-49af535eb6dd	ca247aad-d624-45c2-b529-8256be9bcfcd	sankara.telukutla	sankara.telukutla/ca247aad-d624-45c2-b529-8256be9bcfcd/1f9d5723-d36d-41f9-94b3-49af535eb6dd	14439064	application/pdf	\N	2026-07-10 21:56:06.212447-07	sankara.telukutla
c546a1ff-a17b-43fd-a023-70cfab5eb091	0b185fd7-511d-4f74-b67a-5d8275801b3c	sankara.telukutla	sankara.telukutla/0b185fd7-511d-4f74-b67a-5d8275801b3c/c546a1ff-a17b-43fd-a023-70cfab5eb091	822075	image/jpeg	\N	2026-07-10 22:33:00.023465-07	sankara.telukutla
3b06588f-7aee-4815-89f0-b4fb1331ff85	fe7d6ee0-3285-45a5-ae18-d2eff87ac413	sankara.telukutla	sankara.telukutla/fe7d6ee0-3285-45a5-ae18-d2eff87ac413/3b06588f-7aee-4815-89f0-b4fb1331ff85	2980439	image/jpeg	\N	2026-07-09 05:48:08.53395-07	sankara.telukutla
75bfae8d-1dfb-465e-a3ae-72b30152893f	55415c45-c84a-41dd-bf4a-1fdc79dd31c8	sankara.telukutla	sankara.telukutla/55415c45-c84a-41dd-bf4a-1fdc79dd31c8/75bfae8d-1dfb-465e-a3ae-72b30152893f	115770	application/pdf	\N	2026-07-09 05:48:58.72363-07	sankara.telukutla
e749b0cf-38ec-4885-8b6f-b006dd895941	31268ded-75d2-4437-9ec2-58b73f3d1807	sankara.telukutla	sankara.telukutla/31268ded-75d2-4437-9ec2-58b73f3d1807/e749b0cf-38ec-4885-8b6f-b006dd895941	1340718	image/heic	\N	2026-07-09 16:21:22.552071-07	sankara.telukutla
a611548d-64fe-4b1a-877e-e5d945fa207e	b3638e06-f7f1-4f9a-bc91-1ac05fd853cc	sankara.telukutla	sankara.telukutla/b3638e06-f7f1-4f9a-bc91-1ac05fd853cc/a611548d-64fe-4b1a-877e-e5d945fa207e	51178	application/pdf	\N	2026-07-09 17:30:36.656571-07	sankara.telukutla
186a8952-12da-4b86-a9b0-d1d22f67a44c	ca247aad-d624-45c2-b529-8256be9bcfcd	sankara.telukutla	sankara.telukutla/ca247aad-d624-45c2-b529-8256be9bcfcd/186a8952-12da-4b86-a9b0-d1d22f67a44c	14439064	application/pdf	\N	2026-07-09 17:42:48.638689-07	sankara.telukutla
3bf6e3ff-d3e3-4010-b9a9-3186c1492db8	d8619f43-1c7b-45ef-a018-20e899e4a6b9	sankara.telukutla	sankara.telukutla/d8619f43-1c7b-45ef-a018-20e899e4a6b9/3bf6e3ff-d3e3-4010-b9a9-3186c1492db8	13100510	application/pdf	\N	2026-07-09 17:42:48.81489-07	sankara.telukutla
5ba7f3fa-b0a1-4eab-b196-f812e53d88cc	909e12e9-173c-4159-88a5-a69b2993728a	sankara.telukutla	sankara.telukutla/909e12e9-173c-4159-88a5-a69b2993728a/5ba7f3fa-b0a1-4eab-b196-f812e53d88cc	14007415	application/pdf	\N	2026-07-09 17:42:48.965111-07	sankara.telukutla
c9333845-fbca-4cc7-9805-82ddc55c88c4	c78e1df7-d173-4cae-ba45-de50bdb96b9f	sankara.telukutla	sankara.telukutla/c78e1df7-d173-4cae-ba45-de50bdb96b9f/c9333845-fbca-4cc7-9805-82ddc55c88c4	11517285	application/pdf	\N	2026-07-09 17:42:49.089441-07	sankara.telukutla
37ef9df7-5009-48d8-8d52-8def47fab20f	2ef33bb8-9f42-40f8-94cf-930efef3e108	sankara.telukutla	sankara.telukutla/2ef33bb8-9f42-40f8-94cf-930efef3e108/37ef9df7-5009-48d8-8d52-8def47fab20f	973157	application/pdf	\N	2026-07-09 20:12:58.034495-07	sankara.telukutla
f4e556a5-6f61-4f6d-bdc8-804076547658	a7ce0ed2-e250-4d7c-803b-22996f95773b	sankara.telukutla	sankara.telukutla/a7ce0ed2-e250-4d7c-803b-22996f95773b/f4e556a5-6f61-4f6d-bdc8-804076547658	26459	application/vnd.openxmlformats-officedocument.spreadsheetml.sheet	\N	2026-07-09 20:12:58.059079-07	sankara.telukutla
e2d0be45-e825-41a6-86fe-48c2d700d0b5	bfe8fdd8-4464-43fe-bcae-2d9b50ed2b4c	sankara.telukutla	sankara.telukutla/bfe8fdd8-4464-43fe-bcae-2d9b50ed2b4c/e2d0be45-e825-41a6-86fe-48c2d700d0b5	101113	image/jpeg	\N	2026-07-09 20:12:58.081298-07	sankara.telukutla
1a19cafe-0782-4a6e-8a15-53a793d6ba99	b8b710df-33be-4a64-87d2-9ea24d42b737	sankara.telukutla	sankara.telukutla/b8b710df-33be-4a64-87d2-9ea24d42b737/1a19cafe-0782-4a6e-8a15-53a793d6ba99	968205	application/pdf	\N	2026-07-09 20:12:58.113769-07	sankara.telukutla
f64520f7-1c29-487f-be2f-259b5aad12d6	b5f86479-e911-4949-854e-9da8ce7da157	sankara.telukutla	sankara.telukutla/b5f86479-e911-4949-854e-9da8ce7da157/f64520f7-1c29-487f-be2f-259b5aad12d6	102808	application/pdf	\N	2026-07-09 20:12:58.133357-07	sankara.telukutla
82b3c82c-0529-4c59-ac34-8bb26d964411	b72e33c2-c22d-4cb1-b6e6-0fcaecb7a164	sankara.telukutla	sankara.telukutla/b72e33c2-c22d-4cb1-b6e6-0fcaecb7a164/82b3c82c-0529-4c59-ac34-8bb26d964411	1006348	application/pdf	\N	2026-07-09 20:12:58.166804-07	sankara.telukutla
df01866a-b122-40f4-af8b-bfab49bc56a4	b72e33c2-c22d-4cb1-b6e6-0fcaecb7a164	sankara.telukutla	sankara.telukutla/b72e33c2-c22d-4cb1-b6e6-0fcaecb7a164/df01866a-b122-40f4-af8b-bfab49bc56a4	1006348	application/pdf	\N	2026-07-09 20:58:36.038573-07	sankara.telukutla
65cff824-10c4-43d2-82a7-206fc5d72d70	b72e33c2-c22d-4cb1-b6e6-0fcaecb7a164	sankara.telukutla	sankara.telukutla/b72e33c2-c22d-4cb1-b6e6-0fcaecb7a164/65cff824-10c4-43d2-82a7-206fc5d72d70	1006348	application/pdf	\N	2026-07-09 20:58:43.79313-07	sankara.telukutla
c192cbd9-3f80-4b8d-8745-7c5b4899a2b2	736f8804-bf2f-4c59-8e59-a2e3a0bfab84	sankara.telukutla	sankara.telukutla/736f8804-bf2f-4c59-8e59-a2e3a0bfab84/c192cbd9-3f80-4b8d-8745-7c5b4899a2b2	496511	application/pdf	\N	2026-07-09 20:59:32.950387-07	sankara.telukutla
48b61fcf-1378-4d55-89e1-d44c05355cdc	75deb2ff-eb4b-45ce-a550-1d99469395ca	sankara.telukutla	sankara.telukutla/75deb2ff-eb4b-45ce-a550-1d99469395ca/48b61fcf-1378-4d55-89e1-d44c05355cdc	1693910	application/pdf	\N	2026-07-09 20:59:33.034813-07	sankara.telukutla
201efba1-9ebe-4978-8a14-4fad28c53f03	e0674a01-f957-4f76-a9c2-e1ad3258349c	sankara.telukutla	sankara.telukutla/e0674a01-f957-4f76-a9c2-e1ad3258349c/201efba1-9ebe-4978-8a14-4fad28c53f03	925631	application/pdf	\N	2026-07-10 22:33:24.740248-07	sankara.telukutla
d2eafa80-8160-42a7-9a91-b8a6ae940ed2	e0674a01-f957-4f76-a9c2-e1ad3258349c	sankara.telukutla	sankara.telukutla/e0674a01-f957-4f76-a9c2-e1ad3258349c/d2eafa80-8160-42a7-9a91-b8a6ae940ed2	925631	application/pdf	\N	2026-07-10 22:50:19.219703-07	sankara.telukutla
61c1788a-0000-44a9-9ad2-5900f4289ecf	e0674a01-f957-4f76-a9c2-e1ad3258349c	sankara.telukutla	sankara.telukutla/e0674a01-f957-4f76-a9c2-e1ad3258349c/61c1788a-0000-44a9-9ad2-5900f4289ecf	925631	application/pdf	\N	2026-07-10 22:50:34.303261-07	sankara.telukutla
c9d37163-8f94-4753-8f56-f143f3b1b182	e0674a01-f957-4f76-a9c2-e1ad3258349c	sankara.telukutla	sankara.telukutla/e0674a01-f957-4f76-a9c2-e1ad3258349c/c9d37163-8f94-4753-8f56-f143f3b1b182	925631	application/pdf	\N	2026-07-10 22:51:33.084594-07	sankara.telukutla
1908fa0f-aea3-444a-926e-c614a9f2c69f	e0674a01-f957-4f76-a9c2-e1ad3258349c	sankara.telukutla	sankara.telukutla/e0674a01-f957-4f76-a9c2-e1ad3258349c/1908fa0f-aea3-444a-926e-c614a9f2c69f	925631	application/pdf	\N	2026-07-10 22:37:35.841617-07	sankara.telukutla
1dc40f10-0f5a-4baa-a6f3-df7f8a8fa131	e0674a01-f957-4f76-a9c2-e1ad3258349c	sankara.telukutla	sankara.telukutla/e0674a01-f957-4f76-a9c2-e1ad3258349c/1dc40f10-0f5a-4baa-a6f3-df7f8a8fa131	925631	application/pdf	\N	2026-07-10 22:51:24.25804-07	sankara.telukutla
4dd5f4fc-d396-412c-afef-529802e074be	e0674a01-f957-4f76-a9c2-e1ad3258349c	sankara.telukutla	sankara.telukutla/e0674a01-f957-4f76-a9c2-e1ad3258349c/4dd5f4fc-d396-412c-afef-529802e074be	925631	application/pdf	\N	2026-07-11 00:56:23.115186-07	sankara.telukutla
f698c5d8-7301-4ec6-b42c-b144dda49383	e0674a01-f957-4f76-a9c2-e1ad3258349c	sankara.telukutla	sankara.telukutla/e0674a01-f957-4f76-a9c2-e1ad3258349c/f698c5d8-7301-4ec6-b42c-b144dda49383	925631	application/pdf	\N	2026-07-11 01:11:51.318564-07	sankara.telukutla
8c115e1e-e7bb-46e2-8e0b-616d73f025fa	c78e1df7-d173-4cae-ba45-de50bdb96b9f	sankara.telukutla	sankara.telukutla/c78e1df7-d173-4cae-ba45-de50bdb96b9f/8c115e1e-e7bb-46e2-8e0b-616d73f025fa	11517285	application/pdf	\N	2026-07-11 01:14:29.145738-07	sankara.telukutla
8c73c867-bacd-4d40-9495-aaf3833fd648	e0674a01-f957-4f76-a9c2-e1ad3258349c	sankara.telukutla	sankara.telukutla/e0674a01-f957-4f76-a9c2-e1ad3258349c/8c73c867-bacd-4d40-9495-aaf3833fd648	925631	application/pdf	\N	2026-07-11 01:21:36.213262-07	sankara.telukutla
de86044e-34a6-4660-a61f-e3cbf646c6f9	effac209-583b-4a82-80f0-1e51e38ccb45	sankara.telukutla	sankara.telukutla/effac209-583b-4a82-80f0-1e51e38ccb45/de86044e-34a6-4660-a61f-e3cbf646c6f9	677407	image/jpeg	\N	2026-07-11 12:32:40.11493-07	sankara.telukutla
d6c08d04-54e5-4e35-aeba-5f10107bab97	effac209-583b-4a82-80f0-1e51e38ccb45	sankara.telukutla	sankara.telukutla/effac209-583b-4a82-80f0-1e51e38ccb45/d6c08d04-54e5-4e35-aeba-5f10107bab97	677407	image/jpeg	\N	2026-07-11 12:33:06.114283-07	sankara.telukutla
5399b21a-3d89-4655-b8ff-4e01e52f66b4	effac209-583b-4a82-80f0-1e51e38ccb45	sankara.telukutla	sankara.telukutla/effac209-583b-4a82-80f0-1e51e38ccb45/5399b21a-3d89-4655-b8ff-4e01e52f66b4	677407	image/jpeg	\N	2026-07-11 12:33:19.093901-07	sankara.telukutla
b54907f7-f3e4-45fa-a41c-aee090620b12	effac209-583b-4a82-80f0-1e51e38ccb45	sankara.telukutla	sankara.telukutla/effac209-583b-4a82-80f0-1e51e38ccb45/b54907f7-f3e4-45fa-a41c-aee090620b12	677407	image/jpeg	\N	2026-07-11 18:24:44.816075-07	sankara.telukutla
44a3b1af-578b-4821-b84f-b38c548da4cc	673ac97d-504b-4e12-b69a-f6ac3972db0f	sankara.telukutla	sankara.telukutla/673ac97d-504b-4e12-b69a-f6ac3972db0f/44a3b1af-578b-4821-b84f-b38c548da4cc	232093	image/jpeg	\N	2026-07-11 18:49:41.599462-07	sankara.telukutla
35bff9b3-dc44-4a8c-bdd1-4f860acd477f	d8619f43-1c7b-45ef-a018-20e899e4a6b9	sankara.telukutla	sankara.telukutla/d8619f43-1c7b-45ef-a018-20e899e4a6b9/35bff9b3-dc44-4a8c-bdd1-4f860acd477f	13100510	application/pdf	\N	2026-07-11 18:52:50.485875-07	sankara.telukutla
a394b0a5-38fd-4773-a12f-a01cbe9eafe6	673ac97d-504b-4e12-b69a-f6ac3972db0f	sankara.telukutla	sankara.telukutla/673ac97d-504b-4e12-b69a-f6ac3972db0f/a394b0a5-38fd-4773-a12f-a01cbe9eafe6	232093	image/jpeg	\N	2026-07-11 18:59:31.141376-07	sankara.telukutla
34d74f3b-9247-4ee5-b22e-4bccc3390824	673ac97d-504b-4e12-b69a-f6ac3972db0f	sankara.telukutla	sankara.telukutla/673ac97d-504b-4e12-b69a-f6ac3972db0f/34d74f3b-9247-4ee5-b22e-4bccc3390824	232093	image/jpeg	\N	2026-07-11 19:25:55.936422-07	sankara.telukutla
598c9f3d-46b8-41e1-bc28-7b9063aa4a80	effac209-583b-4a82-80f0-1e51e38ccb45	sankara.telukutla	sankara.telukutla/effac209-583b-4a82-80f0-1e51e38ccb45/598c9f3d-46b8-41e1-bc28-7b9063aa4a80	677407	image/jpeg	\N	2026-07-11 19:26:28.131485-07	sankara.telukutla
190a6d46-62c2-4809-8de3-5c3bd1ef35b4	b90d9cb7-52f4-486d-b43d-5632573225ff	sankara.telukutla	sankara.telukutla/b90d9cb7-52f4-486d-b43d-5632573225ff/190a6d46-62c2-4809-8de3-5c3bd1ef35b4	772917	image/jpeg	\N	2026-07-11 19:29:38.314348-07	sankara.telukutla
069c92b3-b56d-412c-9a4c-44be747b0ee9	b90d9cb7-52f4-486d-b43d-5632573225ff	sankara.telukutla	sankara.telukutla/b90d9cb7-52f4-486d-b43d-5632573225ff/069c92b3-b56d-412c-9a4c-44be747b0ee9	772917	image/jpeg	\N	2026-07-11 19:31:03.305769-07	sankara.telukutla
549b3880-477b-4fa8-b989-0512ab76ab46	b90d9cb7-52f4-486d-b43d-5632573225ff	sankara.telukutla	sankara.telukutla/b90d9cb7-52f4-486d-b43d-5632573225ff/549b3880-477b-4fa8-b989-0512ab76ab46	772917	image/jpeg	\N	2026-07-11 19:32:16.984491-07	sankara.telukutla
a55bd464-e434-49b9-bc51-a31ef39d4116	b90d9cb7-52f4-486d-b43d-5632573225ff	sankara.telukutla	sankara.telukutla/b90d9cb7-52f4-486d-b43d-5632573225ff/a55bd464-e434-49b9-bc51-a31ef39d4116	772917	image/jpeg	\N	2026-07-11 19:57:07.450537-07	sankara.telukutla
595a7d3b-ef19-4680-9163-e6fe8e654fab	673ac97d-504b-4e12-b69a-f6ac3972db0f	sankara.telukutla	sankara.telukutla/673ac97d-504b-4e12-b69a-f6ac3972db0f/595a7d3b-ef19-4680-9163-e6fe8e654fab	232093	image/jpeg	\N	2026-07-11 20:35:32.385971-07	sankara.telukutla
61712f2d-2ad5-44e3-922a-163d546739b1	b90d9cb7-52f4-486d-b43d-5632573225ff	sankara.telukutla	sankara.telukutla/b90d9cb7-52f4-486d-b43d-5632573225ff/61712f2d-2ad5-44e3-922a-163d546739b1	772917	image/jpeg	\N	2026-07-11 22:16:53.717644-07	sankara.telukutla
e408817a-425d-45ac-8f3b-91d117c71ceb	b90d9cb7-52f4-486d-b43d-5632573225ff	sankara.telukutla	sankara.telukutla/b90d9cb7-52f4-486d-b43d-5632573225ff/e408817a-425d-45ac-8f3b-91d117c71ceb	772917	image/jpeg	\N	2026-07-11 22:31:40.254101-07	sankara.telukutla
b0168f0e-6a6a-4732-b805-619f139e9790	673ac97d-504b-4e12-b69a-f6ac3972db0f	sankara.telukutla	sankara.telukutla/673ac97d-504b-4e12-b69a-f6ac3972db0f/b0168f0e-6a6a-4732-b805-619f139e9790	232093	image/jpeg	\N	2026-07-11 22:32:59.997858-07	sankara.telukutla
45c54ab5-141c-420a-9cc9-2189832fa29f	effac209-583b-4a82-80f0-1e51e38ccb45	sankara.telukutla	sankara.telukutla/effac209-583b-4a82-80f0-1e51e38ccb45/45c54ab5-141c-420a-9cc9-2189832fa29f	677407	image/jpeg	\N	2026-07-11 22:33:16.051375-07	sankara.telukutla
a18b1f7a-61b1-4491-a980-1922c19a9952	2974cdda-1a90-4602-b5f5-10905cb84a3c	sankara.telukutla	sankara.telukutla/2974cdda-1a90-4602-b5f5-10905cb84a3c/a18b1f7a-61b1-4491-a980-1922c19a9952	13100510	application/pdf	\N	2026-07-11 22:33:38.198558-07	sankara.telukutla
cd0e7f62-4461-455c-8430-365ac28e6f50	9d247862-d820-44f1-b898-23c77074c278	sankara.telukutla	sankara.telukutla/9d247862-d820-44f1-b898-23c77074c278/cd0e7f62-4461-455c-8430-365ac28e6f50	150641	application/pdf	\N	2026-07-11 22:34:43.662348-07	sankara.telukutla
ee1253b8-c451-4594-abf9-185024535b7c	8f1a327d-bfcf-47df-a945-525387964cb6	sankara.telukutla	sankara.telukutla/8f1a327d-bfcf-47df-a945-525387964cb6/ee1253b8-c451-4594-abf9-185024535b7c	278050	image/jpeg	\N	2026-07-11 22:38:06.762021-07	sankara.telukutla
32ec81a2-6ff6-4d7e-9f1e-a1330d600838	aa789b7e-9d36-4e7c-839b-66b6bf5e6d9e	sankara.telukutla	sankara.telukutla/aa789b7e-9d36-4e7c-839b-66b6bf5e6d9e/32ec81a2-6ff6-4d7e-9f1e-a1330d600838	487103	image/jpeg	\N	2026-07-11 22:40:07.174078-07	sankara.telukutla
b524f490-b160-4acb-9975-6c3d1026e3f8	673ac97d-504b-4e12-b69a-f6ac3972db0f	sankara.telukutla	sankara.telukutla/673ac97d-504b-4e12-b69a-f6ac3972db0f/b524f490-b160-4acb-9975-6c3d1026e3f8	232093	image/jpeg	\N	2026-07-12 00:40:28.519905-07	sankara.telukutla
3c95c5b9-a11d-4fb7-98ad-c9669f03e27c	aa789b7e-9d36-4e7c-839b-66b6bf5e6d9e	sankara.telukutla	sankara.telukutla/aa789b7e-9d36-4e7c-839b-66b6bf5e6d9e/3c95c5b9-a11d-4fb7-98ad-c9669f03e27c	487103	image/jpeg	\N	2026-07-12 03:17:56.528477-07	sankara.telukutla
2437f13f-a574-40f5-9e6e-c0fdc16dcc90	effac209-583b-4a82-80f0-1e51e38ccb45	sankara.telukutla	sankara.telukutla/effac209-583b-4a82-80f0-1e51e38ccb45/2437f13f-a574-40f5-9e6e-c0fdc16dcc90	677407	image/jpeg	\N	2026-07-12 03:19:09.112592-07	sankara.telukutla
0e15918d-268e-4f3e-87b8-972c7df05c3a	b90d9cb7-52f4-486d-b43d-5632573225ff	sankara.telukutla	sankara.telukutla/b90d9cb7-52f4-486d-b43d-5632573225ff/0e15918d-268e-4f3e-87b8-972c7df05c3a	772917	image/jpeg	\N	2026-07-12 03:19:41.866505-07	sankara.telukutla
9c868d3f-e7f9-4d61-b00e-a848d8be4660	8f1a327d-bfcf-47df-a945-525387964cb6	sankara.telukutla	sankara.telukutla/8f1a327d-bfcf-47df-a945-525387964cb6/9c868d3f-e7f9-4d61-b00e-a848d8be4660	278050	image/jpeg	\N	2026-07-12 03:20:22.123168-07	sankara.telukutla
77bc0d42-3e13-48b2-92ad-b1421f187350	673ac97d-504b-4e12-b69a-f6ac3972db0f	sankara.telukutla	sankara.telukutla/673ac97d-504b-4e12-b69a-f6ac3972db0f/77bc0d42-3e13-48b2-92ad-b1421f187350	232093	image/jpeg	\N	2026-07-12 03:20:47.389144-07	sankara.telukutla
ffee6e86-a67c-447b-93e3-3cce08c15dd9	3d286d8d-5fbd-4858-b3b6-22524d889bd1	sankara.telukutla	sankara.telukutla/3d286d8d-5fbd-4858-b3b6-22524d889bd1/ffee6e86-a67c-447b-93e3-3cce08c15dd9	447284	image/jpeg	\N	2026-07-12 03:26:29.621316-07	sankara.telukutla
8afee532-35c0-498a-9be9-68fbbaf40ae7	9d247862-d820-44f1-b898-23c77074c278	sankara.telukutla	sankara.telukutla/9d247862-d820-44f1-b898-23c77074c278/8afee532-35c0-498a-9be9-68fbbaf40ae7	150641	application/pdf	\N	2026-07-12 03:27:45.297304-07	sankara.telukutla
cb96e527-6b86-4c4b-b0a8-bd85741f24de	36d16bad-3466-4692-b1c5-4c4e6fc3ef1f	sankara.telukutla	sankara.telukutla/36d16bad-3466-4692-b1c5-4c4e6fc3ef1f/cb96e527-6b86-4c4b-b0a8-bd85741f24de	431264	application/pdf	\N	2026-07-12 03:40:41.240185-07	sankara.telukutla
4cde32c9-9212-45e7-9276-05de41cad4e8	d8619f43-1c7b-45ef-a018-20e899e4a6b9	sankara.telukutla	sankara.telukutla/d8619f43-1c7b-45ef-a018-20e899e4a6b9/4cde32c9-9212-45e7-9276-05de41cad4e8	13100510	application/pdf	\N	2026-07-12 03:27:58.22054-07	sankara.telukutla
dffafa69-732a-4ab3-a0e0-616a5f628675	909e12e9-173c-4159-88a5-a69b2993728a	sankara.telukutla	sankara.telukutla/909e12e9-173c-4159-88a5-a69b2993728a/dffafa69-732a-4ab3-a0e0-616a5f628675	14007415	application/pdf	\N	2026-07-12 03:33:53.587541-07	sankara.telukutla
1e2a58ff-d826-46dc-961d-b384a53acd3d	de9c33b0-771c-4de0-8208-6b3202557722	sankara.telukutla	sankara.telukutla/de9c33b0-771c-4de0-8208-6b3202557722/1e2a58ff-d826-46dc-961d-b384a53acd3d	435931	application/pdf	\N	2026-07-12 03:42:32.343305-07	sankara.telukutla
494ec8e1-3fc0-44c9-8e79-c4df5724ba8c	ca247aad-d624-45c2-b529-8256be9bcfcd	sankara.telukutla	sankara.telukutla/ca247aad-d624-45c2-b529-8256be9bcfcd/494ec8e1-3fc0-44c9-8e79-c4df5724ba8c	14439064	application/pdf	\N	2026-07-12 11:16:21.990439-07	sankara.telukutla
9c87970b-afa8-4893-8fb1-9b65ba731da4	c78e1df7-d173-4cae-ba45-de50bdb96b9f	sankara.telukutla	sankara.telukutla/c78e1df7-d173-4cae-ba45-de50bdb96b9f/9c87970b-afa8-4893-8fb1-9b65ba731da4	11517285	application/pdf	\N	2026-07-12 11:17:58.390781-07	sankara.telukutla
ce796904-59ce-44d3-9f2f-7d7283539ab0	c78e1df7-d173-4cae-ba45-de50bdb96b9f	sankara.telukutla	sankara.telukutla/c78e1df7-d173-4cae-ba45-de50bdb96b9f/ce796904-59ce-44d3-9f2f-7d7283539ab0	11517285	application/pdf	\N	2026-07-12 12:16:00.531756-07	sankara.telukutla
afafcc32-62a1-4223-b038-9250670df2e5	909e12e9-173c-4159-88a5-a69b2993728a	sankara.telukutla	sankara.telukutla/909e12e9-173c-4159-88a5-a69b2993728a/afafcc32-62a1-4223-b038-9250670df2e5	14007415	application/pdf	\N	2026-07-13 01:31:19.200189-07	sankara.telukutla
84a9b4a5-a8ce-44ac-8e81-2bb34a813f58	c78e1df7-d173-4cae-ba45-de50bdb96b9f	sankara.telukutla	sankara.telukutla/c78e1df7-d173-4cae-ba45-de50bdb96b9f/84a9b4a5-a8ce-44ac-8e81-2bb34a813f58	11517285	application/pdf	\N	2026-07-13 02:00:24.043878-07	sankara.telukutla
661f6bc7-39a6-40d9-a096-7582ad451683	8f1a327d-bfcf-47df-a945-525387964cb6	sankara.telukutla	sankara.telukutla/8f1a327d-bfcf-47df-a945-525387964cb6/661f6bc7-39a6-40d9-a096-7582ad451683	278050	image/jpeg	\N	2026-07-13 21:14:24.788307-07	sankara.telukutla
bdc5dec7-a5b1-437d-b964-ad85b08be855	9aed1df7-2f0f-4038-ae1d-45c39a91466d	sankara.telukutla	sankara.telukutla/9aed1df7-2f0f-4038-ae1d-45c39a91466d/bdc5dec7-a5b1-437d-b964-ad85b08be855	4945	image/jpeg	\N	2026-07-13 21:54:46.167232-07	sankara.telukutla
0a1a95a2-9171-45c1-b3a9-1cf44b896a35	b90d9cb7-52f4-486d-b43d-5632573225ff	sankara.telukutla	sankara.telukutla/b90d9cb7-52f4-486d-b43d-5632573225ff/0a1a95a2-9171-45c1-b3a9-1cf44b896a35	772917	image/jpeg	\N	2026-07-14 06:16:39.953265-07	sankara.telukutla
24c5bad8-011c-4dce-8a47-69d000aacb99	aa84b24e-2aad-45e3-acd3-8474d529c1b0	sankara.telukutla	sankara.telukutla/aa84b24e-2aad-45e3-acd3-8474d529c1b0/24c5bad8-011c-4dce-8a47-69d000aacb99	2090102	image/jpeg	\N	2026-07-15 01:34:09.468929-07	sankara.telukutla
cdf98756-e3b3-4422-803d-666491f8e7a7	79d55109-7138-47af-a366-2f4697ed123c	sankara.telukutla	sankara.telukutla/79d55109-7138-47af-a366-2f4697ed123c/cdf98756-e3b3-4422-803d-666491f8e7a7	2090102	image/jpeg	\N	2026-07-15 01:35:02.999934-07	sankara.telukutla
a44076df-63c7-4671-8871-7b5655cbc4e5	c6c32752-a518-4ebf-9c6a-0826567ce7b7	sankara.telukutla	sankara.telukutla/c6c32752-a518-4ebf-9c6a-0826567ce7b7/a44076df-63c7-4671-8871-7b5655cbc4e5	772917	image/jpeg	\N	2026-07-15 07:32:02.309409-07	sankara.telukutla
fb566421-4692-4c38-a42f-5df49a9cf944	effac209-583b-4a82-80f0-1e51e38ccb45	sankara.telukutla	sankara.telukutla/effac209-583b-4a82-80f0-1e51e38ccb45/fb566421-4692-4c38-a42f-5df49a9cf944	677407	image/jpeg	\N	2026-07-15 19:16:19.01386-07	sankara.telukutla
15b2e60c-4df6-4144-be00-2eaf2576ac91	673ac97d-504b-4e12-b69a-f6ac3972db0f	sankara.telukutla	sankara.telukutla/673ac97d-504b-4e12-b69a-f6ac3972db0f/15b2e60c-4df6-4144-be00-2eaf2576ac91	232093	image/jpeg	\N	2026-07-15 19:16:34.632078-07	sankara.telukutla
27ebca6a-e38a-4831-9a75-4be4836577e9	effac209-583b-4a82-80f0-1e51e38ccb45	sankara.telukutla	sankara.telukutla/effac209-583b-4a82-80f0-1e51e38ccb45/27ebca6a-e38a-4831-9a75-4be4836577e9	677407	image/jpeg	\N	2026-07-15 19:16:42.174034-07	sankara.telukutla
bd7c78da-98d2-419f-8c0a-4d4026f8377f	c6c32752-a518-4ebf-9c6a-0826567ce7b7	sankara.telukutla	sankara.telukutla/c6c32752-a518-4ebf-9c6a-0826567ce7b7/bd7c78da-98d2-419f-8c0a-4d4026f8377f	772917	image/jpeg	\N	2026-07-15 19:17:58.627493-07	sankara.telukutla
2e2d8d50-8559-4e30-8305-0b9352b07fb1	d0899fbd-65e4-4ed5-8fe1-1a143f715acd	sankara.telukutla	sankara.telukutla/d0899fbd-65e4-4ed5-8fe1-1a143f715acd/2e2d8d50-8559-4e30-8305-0b9352b07fb1	148358	application/pdf	\N	2026-07-15 19:43:57.663483-07	sankara.telukutla
1e49e092-8706-4ea8-8b04-e45f9052f5bc	dee3f8c8-c065-4300-b421-8d6568523b2d	sankara.telukutla	sankara.telukutla/dee3f8c8-c065-4300-b421-8d6568523b2d/1e49e092-8706-4ea8-8b04-e45f9052f5bc	1169531	image/heic	\N	2026-07-15 19:44:42.946961-07	sankara.telukutla
32d1bf64-4cc3-4cda-89e8-d83379059101	d0899fbd-65e4-4ed5-8fe1-1a143f715acd	sankara.telukutla	sankara.telukutla/d0899fbd-65e4-4ed5-8fe1-1a143f715acd/32d1bf64-4cc3-4cda-89e8-d83379059101	148358	application/pdf	\N	2026-07-15 19:44:48.013691-07	sankara.telukutla
eec86c83-a186-476f-9074-94fe16ee8175	effac209-583b-4a82-80f0-1e51e38ccb45	sankara.telukutla	sankara.telukutla/effac209-583b-4a82-80f0-1e51e38ccb45/eec86c83-a186-476f-9074-94fe16ee8175	677407	image/jpeg	\N	2026-07-16 08:44:48.018506-07	sankara.telukutla
936f26c7-c929-4e9b-bcad-3704d02ef78c	d8619f43-1c7b-45ef-a018-20e899e4a6b9	sankara.telukutla	sankara.telukutla/d8619f43-1c7b-45ef-a018-20e899e4a6b9/936f26c7-c929-4e9b-bcad-3704d02ef78c	13100510	application/pdf	\N	2026-07-16 08:47:39.641877-07	sankara.telukutla
2b4ed4f4-e7b8-4e05-b64c-9afbc2199cfa	c78e1df7-d173-4cae-ba45-de50bdb96b9f	sankara.telukutla	sankara.telukutla/c78e1df7-d173-4cae-ba45-de50bdb96b9f/2b4ed4f4-e7b8-4e05-b64c-9afbc2199cfa	11517285	application/pdf	\N	2026-07-16 08:48:54.657234-07	sankara.telukutla
fd607757-11b6-45fe-9ed3-d2e441521fee	524b6097-fa3c-43ab-93cc-015c592c26ba	sankara.telukutla	sankara.telukutla/524b6097-fa3c-43ab-93cc-015c592c26ba/fd607757-11b6-45fe-9ed3-d2e441521fee	115716	image/jpeg	\N	2026-07-16 09:13:48.38962-07	sankara.telukutla
5f3635e9-c0c1-472b-8f73-eb2601e2b924	74970757-9790-4495-b7da-0d364c9ad212	sankara.telukutla	sankara.telukutla/74970757-9790-4495-b7da-0d364c9ad212/5f3635e9-c0c1-472b-8f73-eb2601e2b924	5782	image/jpeg	\N	2026-07-16 11:47:04.532362-07	sankara.telukutla
ba588919-06a2-4511-82c4-2e26f9df5d60	695801f2-b8b3-48a8-aa9c-aa806592e3d2	sankara.telukutla	sankara.telukutla/695801f2-b8b3-48a8-aa9c-aa806592e3d2/ba588919-06a2-4511-82c4-2e26f9df5d60	278050	image/jpeg	\N	2026-07-16 11:47:15.7633-07	sankara.telukutla
76fef2e3-e929-43c1-b815-6b8a57817e9b	74970757-9790-4495-b7da-0d364c9ad212	sankara.telukutla	sankara.telukutla/74970757-9790-4495-b7da-0d364c9ad212/76fef2e3-e929-43c1-b815-6b8a57817e9b	5782	image/jpeg	\N	2026-07-19 08:13:47.621173-07	sankara.telukutla
3c2ef296-bce9-460d-b9be-7b16db20aab6	aa789b7e-9d36-4e7c-839b-66b6bf5e6d9e	sankara.telukutla	sankara.telukutla/aa789b7e-9d36-4e7c-839b-66b6bf5e6d9e/3c2ef296-bce9-460d-b9be-7b16db20aab6	487103	image/jpeg	\N	2026-07-19 08:14:01.875144-07	sankara.telukutla
10dc8311-87ca-48a7-9280-a3dc5c3f50f0	effac209-583b-4a82-80f0-1e51e38ccb45	sankara.telukutla	sankara.telukutla/effac209-583b-4a82-80f0-1e51e38ccb45/10dc8311-87ca-48a7-9280-a3dc5c3f50f0	677407	image/jpeg	\N	2026-07-19 09:41:11.84363-07	sankara.telukutla
ec07a559-e630-43d1-a31d-5a3d601481a5	c6c32752-a518-4ebf-9c6a-0826567ce7b7	sankara.telukutla	sankara.telukutla/c6c32752-a518-4ebf-9c6a-0826567ce7b7/ec07a559-e630-43d1-a31d-5a3d601481a5	772917	image/jpeg	\N	2026-07-19 09:41:38.807708-07	sankara.telukutla
9acfd767-3c5d-4633-8cd9-bde6d64fad0b	673ac97d-504b-4e12-b69a-f6ac3972db0f	sankara.telukutla	sankara.telukutla/673ac97d-504b-4e12-b69a-f6ac3972db0f/9acfd767-3c5d-4633-8cd9-bde6d64fad0b	232093	image/jpeg	\N	2026-07-19 09:42:14.83093-07	sankara.telukutla
8dd522bc-89b0-4238-a9f5-2838eb7576c6	695801f2-b8b3-48a8-aa9c-aa806592e3d2	sankara.telukutla	sankara.telukutla/695801f2-b8b3-48a8-aa9c-aa806592e3d2/8dd522bc-89b0-4238-a9f5-2838eb7576c6	278050	image/jpeg	\N	2026-07-19 09:42:45.591623-07	sankara.telukutla
b64c1888-8afc-4f1a-83c6-6f2de112fa78	cfadd7db-70be-4b54-a52a-01b72b9f3aaa	sankara.telukutla	sankara.telukutla/cfadd7db-70be-4b54-a52a-01b72b9f3aaa/b64c1888-8afc-4f1a-83c6-6f2de112fa78	435719	application/pdf	\N	2026-07-19 09:44:58.957797-07	sankara.telukutla
327154ca-38f0-4aaf-9b3a-def445360fc9	dd35155f-8aa3-4f5a-bdec-9bf1218b4c58	sankara.telukutla	sankara.telukutla/dd35155f-8aa3-4f5a-bdec-9bf1218b4c58/327154ca-38f0-4aaf-9b3a-def445360fc9	358800	image/jpeg	\N	2026-07-19 10:03:49.482964-07	sankara.telukutla
672636d8-7ae3-45a4-ac1e-1aac9cf316cd	c78e1df7-d173-4cae-ba45-de50bdb96b9f	sankara.telukutla	sankara.telukutla/c78e1df7-d173-4cae-ba45-de50bdb96b9f/672636d8-7ae3-45a4-ac1e-1aac9cf316cd	11517285	application/pdf	\N	2026-07-22 06:38:11.527268-07	sankara.telukutla
2f27d38e-9189-4b25-b57b-645457fccc51	c1997925-d9b5-430c-ad2e-c06b1ef8f742	sankara.telukutla	sankara.telukutla/c1997925-d9b5-430c-ad2e-c06b1ef8f742/2f27d38e-9189-4b25-b57b-645457fccc51	273266	application/pdf	\N	2026-07-22 07:46:34.777654-07	sankara.telukutla
3ef62a51-3350-4057-990a-a7e57f044847	c1997925-d9b5-430c-ad2e-c06b1ef8f742	sankara.telukutla	sankara.telukutla/c1997925-d9b5-430c-ad2e-c06b1ef8f742/3ef62a51-3350-4057-990a-a7e57f044847	273266	application/pdf	\N	2026-07-22 07:53:11.76991-07	sankara.telukutla
6d67f7e1-094b-4466-a08c-7fa4cdd90e9b	c1997925-d9b5-430c-ad2e-c06b1ef8f742	sankara.telukutla	sankara.telukutla/c1997925-d9b5-430c-ad2e-c06b1ef8f742/6d67f7e1-094b-4466-a08c-7fa4cdd90e9b	273266	application/pdf	\N	2026-07-22 08:22:32.646644-07	sankara.telukutla
5bce2fe9-d259-4d0e-9480-5e18e74611bb	bc08cce8-2038-44fa-a0c4-792b3c3b8935	sankara.telukutla	sankara.telukutla/bc08cce8-2038-44fa-a0c4-792b3c3b8935/5bce2fe9-d259-4d0e-9480-5e18e74611bb	255595	image/jpeg	\N	2026-07-22 08:32:07.77107-07	sankara.telukutla
f7098385-50a5-4ea7-92c0-e927061cb36c	e418ec24-c1e8-4553-b7cb-f28cf42b4714	sankara.telukutla	sankara.telukutla/e418ec24-c1e8-4553-b7cb-f28cf42b4714/f7098385-50a5-4ea7-92c0-e927061cb36c	273266	application/pdf	\N	2026-07-22 08:32:17.647118-07	sankara.telukutla
bf8b0c32-3734-4b1d-8db4-fde00c801ff7	eaaf57ef-f5be-4bbf-81a9-4b8fb11c703f	sankara.telukutla	sankara.telukutla/eaaf57ef-f5be-4bbf-81a9-4b8fb11c703f/bf8b0c32-3734-4b1d-8db4-fde00c801ff7	255595	image/jpeg	\N	2026-07-23 01:57:33.617465-07	sankara.telukutla
0a1c2ac4-d769-47a0-844e-da561e29275d	3e8cda7a-3e9f-421d-bc5c-f5caa8b99bbc	sankara.telukutla	sankara.telukutla/3e8cda7a-3e9f-421d-bc5c-f5caa8b99bbc/0a1c2ac4-d769-47a0-844e-da561e29275d	90672	image/jpeg	\N	2026-07-23 02:37:58.283619-07	sankara.telukutla
cd1da4f4-693c-4b79-93fd-68f3c434c3c9	618a7b9f-c47d-43e7-8911-e66fd6facb30	sankara.telukutla	sankara.telukutla/618a7b9f-c47d-43e7-8911-e66fd6facb30/cd1da4f4-693c-4b79-93fd-68f3c434c3c9	171012	image/jpeg	\N	2026-07-23 02:37:58.308359-07	sankara.telukutla
0e40de7e-a923-44f6-8aa0-860d34e10b10	bc4aa857-eca4-4f7d-8b8a-9e52b1adcab3	sankara.telukutla	sankara.telukutla/bc4aa857-eca4-4f7d-8b8a-9e52b1adcab3/0e40de7e-a923-44f6-8aa0-860d34e10b10	225878	image/jpeg	\N	2026-07-23 02:37:58.33114-07	sankara.telukutla
976b29f2-6ede-4102-a732-627e41d86ccd	0b2cc39e-a0d3-49cf-9f95-a95e007dc676	sankara.telukutla	sankara.telukutla/0b2cc39e-a0d3-49cf-9f95-a95e007dc676/976b29f2-6ede-4102-a732-627e41d86ccd	245040	image/jpeg	\N	2026-07-23 02:37:58.355105-07	sankara.telukutla
24de05d9-6d16-4935-8d62-82712e70e711	9892e9f2-a1ce-4e6c-a2fe-dd008bd92a83	sankara.telukutla	sankara.telukutla/9892e9f2-a1ce-4e6c-a2fe-dd008bd92a83/24de05d9-6d16-4935-8d62-82712e70e711	177718	image/jpeg	\N	2026-07-23 02:37:58.377619-07	sankara.telukutla
4902b3d6-eb62-4994-aab5-70cd083176cc	a16acbbe-29a1-45d9-b5b3-3397120d2a9b	sankara.telukutla	sankara.telukutla/a16acbbe-29a1-45d9-b5b3-3397120d2a9b/4902b3d6-eb62-4994-aab5-70cd083176cc	220064	image/jpeg	\N	2026-07-23 02:37:58.398123-07	sankara.telukutla
4a0aa164-95bd-4328-a5af-42aa88f03dfa	3cd909c9-68a8-4c12-a60e-8de92891a516	sankara.telukutla	sankara.telukutla/3cd909c9-68a8-4c12-a60e-8de92891a516/4a0aa164-95bd-4328-a5af-42aa88f03dfa	227481	image/jpeg	\N	2026-07-23 02:37:58.421247-07	sankara.telukutla
4bb81261-2d20-43b4-a094-e924c07c3e09	f2f07f9f-d342-47ce-9bca-6924e6cfc3a9	sankara.telukutla	sankara.telukutla/f2f07f9f-d342-47ce-9bca-6924e6cfc3a9/4bb81261-2d20-43b4-a094-e924c07c3e09	243506	image/jpeg	\N	2026-07-23 02:37:58.444565-07	sankara.telukutla
164cc65b-0b3b-4533-90e4-16b429764a08	56527c17-214d-400e-a490-815fcdc49d67	sankara.telukutla	sankara.telukutla/56527c17-214d-400e-a490-815fcdc49d67/164cc65b-0b3b-4533-90e4-16b429764a08	257908	image/jpeg	\N	2026-07-23 02:37:58.46746-07	sankara.telukutla
290a36ad-0126-4224-ae1c-3a2bf455c931	1df55d18-b5b7-4c39-be85-7b6384eabbd6	sankara.telukutla	sankara.telukutla/1df55d18-b5b7-4c39-be85-7b6384eabbd6/290a36ad-0126-4224-ae1c-3a2bf455c931	219085	image/jpeg	\N	2026-07-23 02:37:58.486713-07	sankara.telukutla
cc14030a-231a-4fd9-b7d0-44f8ecb3d164	4ba07bc9-effb-4cce-a008-07ae4a0abf36	sankara.telukutla	sankara.telukutla/4ba07bc9-effb-4cce-a008-07ae4a0abf36/cc14030a-231a-4fd9-b7d0-44f8ecb3d164	303119	image/jpeg	\N	2026-07-23 02:37:58.512577-07	sankara.telukutla
75af56f6-69a6-4f4a-a59c-fe2b47b4192a	fa781cef-2b7c-4862-b6c4-ec157607923b	sankara.telukutla	sankara.telukutla/fa781cef-2b7c-4862-b6c4-ec157607923b/75af56f6-69a6-4f4a-a59c-fe2b47b4192a	216177	image/jpeg	\N	2026-07-23 02:37:58.535093-07	sankara.telukutla
496ca55d-51fb-4b81-acd8-1de23c95e1c0	4ecf2ca5-393a-4dce-b363-1ffabe46ce4b	sankara.telukutla	sankara.telukutla/4ecf2ca5-393a-4dce-b363-1ffabe46ce4b/496ca55d-51fb-4b81-acd8-1de23c95e1c0	290947	image/jpeg	\N	2026-07-23 02:37:58.56075-07	sankara.telukutla
d17a53a6-d5c1-40cd-8b0f-9bead18f792b	f83ba95a-cd8c-4cc6-8504-b6acc80954a1	sankara.telukutla	sankara.telukutla/f83ba95a-cd8c-4cc6-8504-b6acc80954a1/d17a53a6-d5c1-40cd-8b0f-9bead18f792b	351369	image/jpeg	\N	2026-07-23 02:37:58.588027-07	sankara.telukutla
7866f76d-bdba-4399-8371-ea5f5fb6c4b6	11edd37d-da36-4030-be34-e10ce81756f0	sankara.telukutla	sankara.telukutla/11edd37d-da36-4030-be34-e10ce81756f0/7866f76d-bdba-4399-8371-ea5f5fb6c4b6	210308	image/jpeg	\N	2026-07-23 02:37:58.613254-07	sankara.telukutla
1a9491b9-d40a-429b-91ea-e02adbaaade1	cdea4b63-d70c-472e-8ad1-91f384bbcb9f	sankara.telukutla	sankara.telukutla/cdea4b63-d70c-472e-8ad1-91f384bbcb9f/1a9491b9-d40a-429b-91ea-e02adbaaade1	294074	image/jpeg	\N	2026-07-23 02:37:58.636723-07	sankara.telukutla
27228678-7464-43cb-b664-b5fb64a8edb2	182fc84f-e450-41c4-8b4c-36374caef904	sankara.telukutla	sankara.telukutla/182fc84f-e450-41c4-8b4c-36374caef904/27228678-7464-43cb-b664-b5fb64a8edb2	220511	image/jpeg	\N	2026-07-23 02:37:58.658323-07	sankara.telukutla
c07f6e6e-2d3f-45d9-b77f-f85fdd261d45	f4aa41eb-80cf-4744-bd8a-68860d7144ec	sankara.telukutla	sankara.telukutla/f4aa41eb-80cf-4744-bd8a-68860d7144ec/c07f6e6e-2d3f-45d9-b77f-f85fdd261d45	11517285	application/pdf	\N	2026-07-23 12:27:20.794932-07	sankara.telukutla
17e3f066-1007-4a20-bc8f-89e7a129e865	f4aa41eb-80cf-4744-bd8a-68860d7144ec	sankara.telukutla	sankara.telukutla/f4aa41eb-80cf-4744-bd8a-68860d7144ec/17e3f066-1007-4a20-bc8f-89e7a129e865	11517285	application/pdf	\N	2026-07-23 12:27:57.943288-07	sankara.telukutla
2ecdf677-4de9-4ded-ab0b-0ad19f39e142	f4aa41eb-80cf-4744-bd8a-68860d7144ec	sankara.telukutla	sankara.telukutla/f4aa41eb-80cf-4744-bd8a-68860d7144ec/2ecdf677-4de9-4ded-ab0b-0ad19f39e142	11517285	application/pdf	\N	2026-07-23 12:28:11.064568-07	sankara.telukutla
8b08e3bf-695c-4bf2-9682-3771b30c6483	ca247aad-d624-45c2-b529-8256be9bcfcd	sankara.telukutla	sankara.telukutla/ca247aad-d624-45c2-b529-8256be9bcfcd/8b08e3bf-695c-4bf2-9682-3771b30c6483	14439064	application/pdf	\N	2026-07-23 12:28:16.340233-07	sankara.telukutla
60e3c3b8-8f6e-41eb-92c6-14ebeb66c888	f4aa41eb-80cf-4744-bd8a-68860d7144ec	sankara.telukutla	sankara.telukutla/f4aa41eb-80cf-4744-bd8a-68860d7144ec/60e3c3b8-8f6e-41eb-92c6-14ebeb66c888	11517285	application/pdf	\N	2026-07-23 12:44:42.551398-07	sankara.telukutla
e73bd6dd-d40b-49d0-b103-5febf2ca67b0	f4aa41eb-80cf-4744-bd8a-68860d7144ec	sankara.telukutla	sankara.telukutla/f4aa41eb-80cf-4744-bd8a-68860d7144ec/e73bd6dd-d40b-49d0-b103-5febf2ca67b0	11517285	application/pdf	\N	2026-07-23 12:56:14.745576-07	sankara.telukutla
9f755db2-8a87-4a29-9e7e-4b0b1b4ef6be	f4aa41eb-80cf-4744-bd8a-68860d7144ec	sankara.telukutla	sankara.telukutla/f4aa41eb-80cf-4744-bd8a-68860d7144ec/9f755db2-8a87-4a29-9e7e-4b0b1b4ef6be	11517285	application/pdf	\N	2026-07-23 13:53:41.663438-07	sankara.telukutla
4c0c6c4b-9ded-4301-bd24-1c72fe2806b9	f4aa41eb-80cf-4744-bd8a-68860d7144ec	sankara.telukutla	sankara.telukutla/f4aa41eb-80cf-4744-bd8a-68860d7144ec/4c0c6c4b-9ded-4301-bd24-1c72fe2806b9	11517285	application/pdf	\N	2026-07-23 13:54:01.774424-07	sankara.telukutla
afd097cf-1974-4059-bc6f-fa631a4f3ff1	00a6349e-dcdf-43cf-9255-e6f250fb23a7	sankara.telukutla	sankara.telukutla/00a6349e-dcdf-43cf-9255-e6f250fb23a7/afd097cf-1974-4059-bc6f-fa631a4f3ff1	14007415	application/pdf	\N	2026-07-23 13:56:52.161545-07	sankara.telukutla
cdac882b-1f5a-4bcc-b71a-561268d0b076	d8619f43-1c7b-45ef-a018-20e899e4a6b9	sankara.telukutla	sankara.telukutla/d8619f43-1c7b-45ef-a018-20e899e4a6b9/cdac882b-1f5a-4bcc-b71a-561268d0b076	13100510	application/pdf	\N	2026-07-23 13:57:44.755033-07	sankara.telukutla
75706fee-2722-45bb-b5a0-37be19411af8	ca247aad-d624-45c2-b529-8256be9bcfcd	sankara.telukutla	sankara.telukutla/ca247aad-d624-45c2-b529-8256be9bcfcd/75706fee-2722-45bb-b5a0-37be19411af8	14439064	application/pdf	\N	2026-07-23 14:04:12.743395-07	sankara.telukutla
4e278f2d-a89c-4821-b7b8-b2114a90439c	ca247aad-d624-45c2-b529-8256be9bcfcd	sankara.telukutla	sankara.telukutla/ca247aad-d624-45c2-b529-8256be9bcfcd/4e278f2d-a89c-4821-b7b8-b2114a90439c	14439064	application/pdf	\N	2026-07-23 14:07:03.671467-07	sankara.telukutla
6d672016-c7f2-44b7-a722-037d2ec83545	ca247aad-d624-45c2-b529-8256be9bcfcd	sankara.telukutla	sankara.telukutla/ca247aad-d624-45c2-b529-8256be9bcfcd/6d672016-c7f2-44b7-a722-037d2ec83545	14439064	application/pdf	\N	2026-07-23 14:06:23.424581-07	sankara.telukutla
4af24e95-bd8b-42b6-bc54-a4caaf8f595d	13264e0a-80cf-4087-824f-4f00494cb19f	sankara.telukutla	sankara.telukutla/13264e0a-80cf-4087-824f-4f00494cb19f/4af24e95-bd8b-42b6-bc54-a4caaf8f595d	5467602	video/mp4	\N	2026-07-23 15:19:38.748287-07	sankara.telukutla
d0052a61-3796-4d75-991c-1ff2ca08730e	f4a1921e-1228-4232-a123-88a9bb9e140f	sankara.telukutla	sankara.telukutla/f4a1921e-1228-4232-a123-88a9bb9e140f/d0052a61-3796-4d75-991c-1ff2ca08730e	13601089	video/mp4	\N	2026-07-23 15:19:38.982234-07	sankara.telukutla
90e91b1e-07e3-4574-8514-4eb130b273bd	38d040f4-e17e-41da-980c-5674aa4f4bba	sankara.telukutla	sankara.telukutla/38d040f4-e17e-41da-980c-5674aa4f4bba/90e91b1e-07e3-4574-8514-4eb130b273bd	1863160	application/pdf	\N	2026-07-23 15:19:39.094653-07	sankara.telukutla
45c8192b-9f21-4ae6-b6c3-a4f717c035cb	5e595833-c7a9-407f-b1c9-5dd2a34eda67	sankara.telukutla	sankara.telukutla/5e595833-c7a9-407f-b1c9-5dd2a34eda67/45c8192b-9f21-4ae6-b6c3-a4f717c035cb	1943595	application/pdf	\N	2026-07-23 15:19:39.136666-07	sankara.telukutla
9c66f3c5-2983-4354-8b00-3ac844c1a2f9	ffc35543-f3ca-4fd7-a579-97db8c48a60c	sankara.telukutla	sankara.telukutla/ffc35543-f3ca-4fd7-a579-97db8c48a60c/9c66f3c5-2983-4354-8b00-3ac844c1a2f9	1900921	application/pdf	\N	2026-07-23 15:19:39.174551-07	sankara.telukutla
924e0458-d84a-4f05-a9f4-a8ce1bc74052	cc9ac12d-6acd-425b-80dc-6b704f64811a	sankara.telukutla	sankara.telukutla/cc9ac12d-6acd-425b-80dc-6b704f64811a/924e0458-d84a-4f05-a9f4-a8ce1bc74052	1969716	application/pdf	\N	2026-07-23 15:19:39.214922-07	sankara.telukutla
4b7fce99-32d1-46c2-b2fe-4c679b495bd8	50e9f60b-b902-48db-8054-3534eec9073a	sankara.telukutla	sankara.telukutla/50e9f60b-b902-48db-8054-3534eec9073a/4b7fce99-32d1-46c2-b2fe-4c679b495bd8	5017285	application/pdf	\N	2026-07-23 15:19:39.291727-07	sankara.telukutla
2276c6d6-1391-4cbf-b2c6-3cc3691b9b98	3a73dbbd-0c84-4a04-8ab9-05c4f90f2386	sankara.telukutla	sankara.telukutla/3a73dbbd-0c84-4a04-8ab9-05c4f90f2386/2276c6d6-1391-4cbf-b2c6-3cc3691b9b98	4965620	application/pdf	\N	2026-07-23 15:19:39.354555-07	sankara.telukutla
a01ad9b9-2727-440a-821d-700d1e578b4f	e1e38eec-7ddf-4c3c-b365-bfcbc24be056	sankara.telukutla	sankara.telukutla/e1e38eec-7ddf-4c3c-b365-bfcbc24be056/a01ad9b9-2727-440a-821d-700d1e578b4f	4372863	application/pdf	\N	2026-07-23 15:19:39.420239-07	sankara.telukutla
d1c405a3-a896-41dc-9ed4-ce41f57750a0	09553b23-0d1f-4a62-89ed-02df34c09f28	sankara.telukutla	sankara.telukutla/09553b23-0d1f-4a62-89ed-02df34c09f28/d1c405a3-a896-41dc-9ed4-ce41f57750a0	4172527	application/pdf	\N	2026-07-23 15:19:39.480405-07	sankara.telukutla
ccab2f91-3b0e-48ff-b649-699ec28d72ea	66327fc5-a63e-4992-b63f-19957616aed3	sankara.telukutla	sankara.telukutla/66327fc5-a63e-4992-b63f-19957616aed3/ccab2f91-3b0e-48ff-b649-699ec28d72ea	166470	application/pdf	\N	2026-07-23 15:19:39.499247-07	sankara.telukutla
2414795b-fd33-4e06-80a2-8b90576bd5b3	ca247aad-d624-45c2-b529-8256be9bcfcd	sankara.telukutla	sankara.telukutla/ca247aad-d624-45c2-b529-8256be9bcfcd/2414795b-fd33-4e06-80a2-8b90576bd5b3	14439064	application/pdf	\N	2026-07-23 23:47:12.146071-07	sankara.telukutla
88503fa6-9bbf-4ea4-98b1-b17bceb52471	ca247aad-d624-45c2-b529-8256be9bcfcd	sankara.telukutla	sankara.telukutla/ca247aad-d624-45c2-b529-8256be9bcfcd/88503fa6-9bbf-4ea4-98b1-b17bceb52471	14439064	application/pdf	\N	2026-07-23 23:49:43.899289-07	sankara.telukutla
d5a9e11c-8052-4db3-b359-0a3af30a9340	00a6349e-dcdf-43cf-9255-e6f250fb23a7	sankara.telukutla	sankara.telukutla/00a6349e-dcdf-43cf-9255-e6f250fb23a7/d5a9e11c-8052-4db3-b359-0a3af30a9340	14007415	application/pdf	\N	2026-07-23 23:49:58.282569-07	sankara.telukutla
b5ddea91-56f1-4e79-98d2-9d3607e67141	00a6349e-dcdf-43cf-9255-e6f250fb23a7	sankara.telukutla	sankara.telukutla/00a6349e-dcdf-43cf-9255-e6f250fb23a7/b5ddea91-56f1-4e79-98d2-9d3607e67141	14007415	application/pdf	\N	2026-07-23 23:59:19.104057-07	sankara.telukutla
d76ec489-186e-43bf-8ab9-f645d4adada1	f4aa41eb-80cf-4744-bd8a-68860d7144ec	sankara.telukutla	sankara.telukutla/f4aa41eb-80cf-4744-bd8a-68860d7144ec/d76ec489-186e-43bf-8ab9-f645d4adada1	11517285	application/pdf	\N	2026-07-24 00:00:24.244713-07	sankara.telukutla
d99ec166-3d7b-4178-9beb-3bc9dba71443	d8619f43-1c7b-45ef-a018-20e899e4a6b9	sankara.telukutla	sankara.telukutla/d8619f43-1c7b-45ef-a018-20e899e4a6b9/d99ec166-3d7b-4178-9beb-3bc9dba71443	13100510	application/pdf	\N	2026-07-24 00:25:05.271421-07	sankara.telukutla
216063d2-1af4-499e-a65a-81ff60c3e75d	f4aa41eb-80cf-4744-bd8a-68860d7144ec	sankara.telukutla	sankara.telukutla/f4aa41eb-80cf-4744-bd8a-68860d7144ec/216063d2-1af4-499e-a65a-81ff60c3e75d	11517285	application/pdf	\N	2026-07-24 00:25:05.319508-07	sankara.telukutla
ee5e8812-77ff-4632-8619-97f92366d9ba	ca247aad-d624-45c2-b529-8256be9bcfcd	sankara.telukutla	sankara.telukutla/ca247aad-d624-45c2-b529-8256be9bcfcd/ee5e8812-77ff-4632-8619-97f92366d9ba	14439064	application/pdf	\N	2026-07-24 00:25:05.398381-07	sankara.telukutla
2bdc4280-e828-4148-9613-2f4e710e5c10	00a6349e-dcdf-43cf-9255-e6f250fb23a7	sankara.telukutla	sankara.telukutla/00a6349e-dcdf-43cf-9255-e6f250fb23a7/2bdc4280-e828-4148-9613-2f4e710e5c10	14007415	application/pdf	\N	2026-07-24 00:25:05.40597-07	sankara.telukutla
a310eb2e-b084-40cd-9322-a29839681768	f4aa41eb-80cf-4744-bd8a-68860d7144ec	sankara.telukutla	sankara.telukutla/f4aa41eb-80cf-4744-bd8a-68860d7144ec/a310eb2e-b084-40cd-9322-a29839681768	11517285	application/pdf	\N	2026-07-24 00:29:30.572746-07	sankara.telukutla
9f6b503c-af81-4f94-b430-6b2564fb94fe	d8619f43-1c7b-45ef-a018-20e899e4a6b9	sankara.telukutla	sankara.telukutla/d8619f43-1c7b-45ef-a018-20e899e4a6b9/9f6b503c-af81-4f94-b430-6b2564fb94fe	13100510	application/pdf	\N	2026-07-24 00:29:30.658864-07	sankara.telukutla
72d016ff-2fbb-41ad-ad9a-c27c9b32be6a	00a6349e-dcdf-43cf-9255-e6f250fb23a7	sankara.telukutla	sankara.telukutla/00a6349e-dcdf-43cf-9255-e6f250fb23a7/72d016ff-2fbb-41ad-ad9a-c27c9b32be6a	14007415	application/pdf	\N	2026-07-24 00:29:30.690334-07	sankara.telukutla
340d8c3d-a2d4-473c-84ee-aba64a34ae79	ca247aad-d624-45c2-b529-8256be9bcfcd	sankara.telukutla	sankara.telukutla/ca247aad-d624-45c2-b529-8256be9bcfcd/340d8c3d-a2d4-473c-84ee-aba64a34ae79	14439064	application/pdf	\N	2026-07-24 00:29:30.692593-07	sankara.telukutla
9e2ada6f-2460-4423-a217-e2789ad17360	f4aa41eb-80cf-4744-bd8a-68860d7144ec	sankara.telukutla	sankara.telukutla/f4aa41eb-80cf-4744-bd8a-68860d7144ec/9e2ada6f-2460-4423-a217-e2789ad17360	11517285	application/pdf	\N	2026-07-24 00:29:48.365604-07	sankara.telukutla
6ad8e450-3936-4fd1-bca3-2638ae7cbb1c	ca247aad-d624-45c2-b529-8256be9bcfcd	sankara.telukutla	sankara.telukutla/ca247aad-d624-45c2-b529-8256be9bcfcd/6ad8e450-3936-4fd1-bca3-2638ae7cbb1c	14439064	application/pdf	\N	2026-07-24 00:29:48.365311-07	sankara.telukutla
8ec6279c-77ef-4081-bc73-b94c28692da0	00a6349e-dcdf-43cf-9255-e6f250fb23a7	sankara.telukutla	sankara.telukutla/00a6349e-dcdf-43cf-9255-e6f250fb23a7/8ec6279c-77ef-4081-bc73-b94c28692da0	14007415	application/pdf	\N	2026-07-24 00:29:48.403155-07	sankara.telukutla
70297b00-30d7-43a3-8463-383705da7d61	d8619f43-1c7b-45ef-a018-20e899e4a6b9	sankara.telukutla	sankara.telukutla/d8619f43-1c7b-45ef-a018-20e899e4a6b9/70297b00-30d7-43a3-8463-383705da7d61	13100510	application/pdf	\N	2026-07-24 00:29:48.403232-07	sankara.telukutla
4ba2d6fb-a5ac-4707-9dd3-68d1139c3953	ca247aad-d624-45c2-b529-8256be9bcfcd	sankara.telukutla	sankara.telukutla/ca247aad-d624-45c2-b529-8256be9bcfcd/4ba2d6fb-a5ac-4707-9dd3-68d1139c3953	14439064	application/pdf	\N	2026-07-24 00:38:52.004746-07	sankara.telukutla
fbd15719-bc52-479b-95cd-e369634da131	d8619f43-1c7b-45ef-a018-20e899e4a6b9	sankara.telukutla	sankara.telukutla/d8619f43-1c7b-45ef-a018-20e899e4a6b9/fbd15719-bc52-479b-95cd-e369634da131	13100510	application/pdf	\N	2026-07-24 00:38:52.063449-07	sankara.telukutla
9ec1539c-b4db-43b4-b57a-9f8f92a63729	00a6349e-dcdf-43cf-9255-e6f250fb23a7	sankara.telukutla	sankara.telukutla/00a6349e-dcdf-43cf-9255-e6f250fb23a7/9ec1539c-b4db-43b4-b57a-9f8f92a63729	14007415	application/pdf	\N	2026-07-24 00:39:30.567098-07	sankara.telukutla
b82b9dd6-6662-4211-a6e5-0f7c95b61e9c	f4aa41eb-80cf-4744-bd8a-68860d7144ec	sankara.telukutla	sankara.telukutla/f4aa41eb-80cf-4744-bd8a-68860d7144ec/b82b9dd6-6662-4211-a6e5-0f7c95b61e9c	11517285	application/pdf	\N	2026-07-24 00:39:53.675173-07	sankara.telukutla
d5a0f3df-7729-4cd8-82e8-c63f61bcb498	d8619f43-1c7b-45ef-a018-20e899e4a6b9	sankara.telukutla	sankara.telukutla/d8619f43-1c7b-45ef-a018-20e899e4a6b9/d5a0f3df-7729-4cd8-82e8-c63f61bcb498	13100510	application/pdf	\N	2026-07-24 00:54:34.887852-07	sankara.telukutla
f1912159-5eb7-4899-ae94-d4d5d9573bd1	ca247aad-d624-45c2-b529-8256be9bcfcd	sankara.telukutla	sankara.telukutla/ca247aad-d624-45c2-b529-8256be9bcfcd/f1912159-5eb7-4899-ae94-d4d5d9573bd1	14439064	application/pdf	\N	2026-07-24 00:54:34.887959-07	sankara.telukutla
9eacf918-5cef-475e-9c01-f1a5a3b72255	ca247aad-d624-45c2-b529-8256be9bcfcd	sankara.telukutla	sankara.telukutla/ca247aad-d624-45c2-b529-8256be9bcfcd/9eacf918-5cef-475e-9c01-f1a5a3b72255	14439064	application/pdf	\N	2026-07-24 01:29:28.964639-07	sankara.telukutla
3a78875b-6119-4f4d-8715-ba4bdc63a052	00a6349e-dcdf-43cf-9255-e6f250fb23a7	sankara.telukutla	sankara.telukutla/00a6349e-dcdf-43cf-9255-e6f250fb23a7/3a78875b-6119-4f4d-8715-ba4bdc63a052	14007415	application/pdf	\N	2026-07-24 01:30:40.359633-07	sankara.telukutla
4427044b-6dfc-40d9-805b-14031d2e5011	ca247aad-d624-45c2-b529-8256be9bcfcd	sankara.telukutla	sankara.telukutla/ca247aad-d624-45c2-b529-8256be9bcfcd/4427044b-6dfc-40d9-805b-14031d2e5011	14439064	application/pdf	\N	2026-07-24 01:48:51.837326-07	sankara.telukutla
c3073473-c523-4e45-a664-d80dc7bc1c5f	f4aa41eb-80cf-4744-bd8a-68860d7144ec	sankara.telukutla	sankara.telukutla/f4aa41eb-80cf-4744-bd8a-68860d7144ec/c3073473-c523-4e45-a664-d80dc7bc1c5f	11517285	application/pdf	\N	2026-07-24 01:50:39.126696-07	sankara.telukutla
0f97c0d1-dd68-4d1c-92f9-90f43643e2cf	00a6349e-dcdf-43cf-9255-e6f250fb23a7	sankara.telukutla	sankara.telukutla/00a6349e-dcdf-43cf-9255-e6f250fb23a7/0f97c0d1-dd68-4d1c-92f9-90f43643e2cf	14007415	application/pdf	\N	2026-07-24 00:55:58.267446-07	sankara.telukutla
0004b77e-73ef-4bca-a2de-5940398c5a92	f4aa41eb-80cf-4744-bd8a-68860d7144ec	sankara.telukutla	sankara.telukutla/f4aa41eb-80cf-4744-bd8a-68860d7144ec/0004b77e-73ef-4bca-a2de-5940398c5a92	11517285	application/pdf	\N	2026-07-24 00:56:13.707891-07	sankara.telukutla
dccea5ff-67cf-4ee7-8e52-e73313bb576a	d8619f43-1c7b-45ef-a018-20e899e4a6b9	sankara.telukutla	sankara.telukutla/d8619f43-1c7b-45ef-a018-20e899e4a6b9/dccea5ff-67cf-4ee7-8e52-e73313bb576a	13100510	application/pdf	\N	2026-07-24 01:29:28.964465-07	sankara.telukutla
6488999b-431a-4193-beae-25290dfbe6c1	f4aa41eb-80cf-4744-bd8a-68860d7144ec	sankara.telukutla	sankara.telukutla/f4aa41eb-80cf-4744-bd8a-68860d7144ec/6488999b-431a-4193-beae-25290dfbe6c1	11517285	application/pdf	\N	2026-07-24 01:31:09.382784-07	sankara.telukutla
9f4be631-85ba-4d87-ab87-e4016094f858	ca247aad-d624-45c2-b529-8256be9bcfcd	sankara.telukutla	sankara.telukutla/ca247aad-d624-45c2-b529-8256be9bcfcd/9f4be631-85ba-4d87-ab87-e4016094f858	14439064	application/pdf	\N	2026-07-24 01:43:38.232517-07	sankara.telukutla
536241d7-1830-4a64-ac39-1a704f6b24fe	d8619f43-1c7b-45ef-a018-20e899e4a6b9	sankara.telukutla	sankara.telukutla/d8619f43-1c7b-45ef-a018-20e899e4a6b9/536241d7-1830-4a64-ac39-1a704f6b24fe	13100510	application/pdf	\N	2026-07-24 01:43:38.232602-07	sankara.telukutla
aef97566-66bd-4c06-b32e-e925851c167b	00a6349e-dcdf-43cf-9255-e6f250fb23a7	sankara.telukutla	sankara.telukutla/00a6349e-dcdf-43cf-9255-e6f250fb23a7/aef97566-66bd-4c06-b32e-e925851c167b	14007415	application/pdf	\N	2026-07-24 01:45:29.432541-07	sankara.telukutla
9b3dcf6b-a8ad-453f-8066-fd4a87b76f02	f4aa41eb-80cf-4744-bd8a-68860d7144ec	sankara.telukutla	sankara.telukutla/f4aa41eb-80cf-4744-bd8a-68860d7144ec/9b3dcf6b-a8ad-453f-8066-fd4a87b76f02	11517285	application/pdf	\N	2026-07-24 01:45:32.461268-07	sankara.telukutla
375bc5c3-df50-41dd-b2e9-070e7a771b5b	d8619f43-1c7b-45ef-a018-20e899e4a6b9	sankara.telukutla	sankara.telukutla/d8619f43-1c7b-45ef-a018-20e899e4a6b9/375bc5c3-df50-41dd-b2e9-070e7a771b5b	13100510	application/pdf	\N	2026-07-24 01:48:51.837451-07	sankara.telukutla
7b0abe81-1260-410c-ab53-3958c72d2646	00a6349e-dcdf-43cf-9255-e6f250fb23a7	sankara.telukutla	sankara.telukutla/00a6349e-dcdf-43cf-9255-e6f250fb23a7/7b0abe81-1260-410c-ab53-3958c72d2646	14007415	application/pdf	\N	2026-07-24 01:50:02.205705-07	sankara.telukutla
ac90ebf1-1173-4b14-a16a-ff68b9925a8c	d8619f43-1c7b-45ef-a018-20e899e4a6b9	sankara.telukutla	sankara.telukutla/d8619f43-1c7b-45ef-a018-20e899e4a6b9/ac90ebf1-1173-4b14-a16a-ff68b9925a8c	13100510	application/pdf	\N	2026-07-24 02:00:18.351631-07	sankara.telukutla
db4a9509-6f63-40b8-bd9b-6cd0eed4a32e	ca247aad-d624-45c2-b529-8256be9bcfcd	sankara.telukutla	sankara.telukutla/ca247aad-d624-45c2-b529-8256be9bcfcd/db4a9509-6f63-40b8-bd9b-6cd0eed4a32e	14439064	application/pdf	\N	2026-07-24 02:00:18.351702-07	sankara.telukutla
8b11b24d-c895-4b13-a10e-ef6867f0ec2d	00a6349e-dcdf-43cf-9255-e6f250fb23a7	sankara.telukutla	sankara.telukutla/00a6349e-dcdf-43cf-9255-e6f250fb23a7/8b11b24d-c895-4b13-a10e-ef6867f0ec2d	14007415	application/pdf	\N	2026-07-24 02:01:54.516274-07	sankara.telukutla
5aa610a9-bb4f-4c4b-b56c-c76bfda95cf0	f4aa41eb-80cf-4744-bd8a-68860d7144ec	sankara.telukutla	sankara.telukutla/f4aa41eb-80cf-4744-bd8a-68860d7144ec/5aa610a9-bb4f-4c4b-b56c-c76bfda95cf0	11517285	application/pdf	\N	2026-07-24 02:02:03.619644-07	sankara.telukutla
b5c6a1a3-540e-46fb-a30e-cb0f531790ed	d8619f43-1c7b-45ef-a018-20e899e4a6b9	sankara.telukutla	sankara.telukutla/d8619f43-1c7b-45ef-a018-20e899e4a6b9/b5c6a1a3-540e-46fb-a30e-cb0f531790ed	13100510	application/pdf	\N	2026-07-24 02:31:16.059822-07	sankara.telukutla
7bc6191b-a79c-405a-a5bb-1df73efeec7e	ca247aad-d624-45c2-b529-8256be9bcfcd	sankara.telukutla	sankara.telukutla/ca247aad-d624-45c2-b529-8256be9bcfcd/7bc6191b-a79c-405a-a5bb-1df73efeec7e	14439064	application/pdf	\N	2026-07-24 02:31:16.060039-07	sankara.telukutla
e170a81a-6326-4e4d-a63b-2f9d1206b016	00a6349e-dcdf-43cf-9255-e6f250fb23a7	sankara.telukutla	sankara.telukutla/00a6349e-dcdf-43cf-9255-e6f250fb23a7/e170a81a-6326-4e4d-a63b-2f9d1206b016	14007415	application/pdf	\N	2026-07-24 02:31:58.139549-07	sankara.telukutla
6e62ab69-cc1e-4d83-ab29-a4d88b9885b9	f4aa41eb-80cf-4744-bd8a-68860d7144ec	sankara.telukutla	sankara.telukutla/f4aa41eb-80cf-4744-bd8a-68860d7144ec/6e62ab69-cc1e-4d83-ab29-a4d88b9885b9	11517285	application/pdf	\N	2026-07-24 02:32:40.374895-07	sankara.telukutla
246149e6-f818-41a4-a658-0a30b29bacc6	d8619f43-1c7b-45ef-a018-20e899e4a6b9	sankara.telukutla	sankara.telukutla/d8619f43-1c7b-45ef-a018-20e899e4a6b9/246149e6-f818-41a4-a658-0a30b29bacc6	13100510	application/pdf	\N	2026-07-24 02:46:54.365217-07	sankara.telukutla
62c224d6-a789-4183-9ed9-c9809152ac3a	ca247aad-d624-45c2-b529-8256be9bcfcd	sankara.telukutla	sankara.telukutla/ca247aad-d624-45c2-b529-8256be9bcfcd/62c224d6-a789-4183-9ed9-c9809152ac3a	14439064	application/pdf	\N	2026-07-24 02:46:54.365314-07	sankara.telukutla
52823934-8e3e-484f-98aa-d388f73e37c9	00a6349e-dcdf-43cf-9255-e6f250fb23a7	sankara.telukutla	sankara.telukutla/00a6349e-dcdf-43cf-9255-e6f250fb23a7/52823934-8e3e-484f-98aa-d388f73e37c9	14007415	application/pdf	\N	2026-07-24 02:47:00.446878-07	sankara.telukutla
8a493a81-41cc-4731-8424-5851cf60b072	f4aa41eb-80cf-4744-bd8a-68860d7144ec	sankara.telukutla	sankara.telukutla/f4aa41eb-80cf-4744-bd8a-68860d7144ec/8a493a81-41cc-4731-8424-5851cf60b072	11517285	application/pdf	\N	2026-07-24 02:47:04.546692-07	sankara.telukutla
d4e50f82-7b39-474e-8d9b-dada1f966035	ca247aad-d624-45c2-b529-8256be9bcfcd	sankara.telukutla	sankara.telukutla/ca247aad-d624-45c2-b529-8256be9bcfcd/d4e50f82-7b39-474e-8d9b-dada1f966035	14439064	application/pdf	\N	2026-07-24 02:47:17.837953-07	sankara.telukutla
92260394-a17b-47cd-b4a6-0ef291be760a	d8619f43-1c7b-45ef-a018-20e899e4a6b9	sankara.telukutla	sankara.telukutla/d8619f43-1c7b-45ef-a018-20e899e4a6b9/92260394-a17b-47cd-b4a6-0ef291be760a	13100510	application/pdf	\N	2026-07-24 02:47:17.838376-07	sankara.telukutla
8c9fd502-4793-46b3-a985-1566e0e48d89	00a6349e-dcdf-43cf-9255-e6f250fb23a7	sankara.telukutla	sankara.telukutla/00a6349e-dcdf-43cf-9255-e6f250fb23a7/8c9fd502-4793-46b3-a985-1566e0e48d89	14007415	application/pdf	\N	2026-07-24 02:49:05.25423-07	sankara.telukutla
53eb7621-1089-4315-b179-457b0babfb94	f4aa41eb-80cf-4744-bd8a-68860d7144ec	sankara.telukutla	sankara.telukutla/f4aa41eb-80cf-4744-bd8a-68860d7144ec/53eb7621-1089-4315-b179-457b0babfb94	11517285	application/pdf	\N	2026-07-24 02:49:22.215996-07	sankara.telukutla
04afaaf9-47c0-4eef-b3a1-c7eb7903d62d	ca247aad-d624-45c2-b529-8256be9bcfcd	sankara.telukutla	sankara.telukutla/ca247aad-d624-45c2-b529-8256be9bcfcd/04afaaf9-47c0-4eef-b3a1-c7eb7903d62d	14439064	application/pdf	\N	2026-07-24 02:53:00.968097-07	sankara.telukutla
0156c8b1-d447-41b5-a54b-0b43d35c2ecd	d8619f43-1c7b-45ef-a018-20e899e4a6b9	sankara.telukutla	sankara.telukutla/d8619f43-1c7b-45ef-a018-20e899e4a6b9/0156c8b1-d447-41b5-a54b-0b43d35c2ecd	13100510	application/pdf	\N	2026-07-24 02:53:00.96815-07	sankara.telukutla
fced9a31-48f3-4240-9d78-d28704720a12	00a6349e-dcdf-43cf-9255-e6f250fb23a7	sankara.telukutla	sankara.telukutla/00a6349e-dcdf-43cf-9255-e6f250fb23a7/fced9a31-48f3-4240-9d78-d28704720a12	14007415	application/pdf	\N	2026-07-24 02:53:43.899609-07	sankara.telukutla
5c06ff16-55d6-4054-a1f5-f8b7f70778a5	f4aa41eb-80cf-4744-bd8a-68860d7144ec	sankara.telukutla	sankara.telukutla/f4aa41eb-80cf-4744-bd8a-68860d7144ec/5c06ff16-55d6-4054-a1f5-f8b7f70778a5	11517285	application/pdf	\N	2026-07-24 02:54:19.440713-07	sankara.telukutla
073eb16e-fa77-453d-a04a-8fde46ec82dc	13d01ca9-648c-4065-9fa6-6fdb9690b82a	sankara.telukutla	sankara.telukutla/13d01ca9-648c-4065-9fa6-6fdb9690b82a/073eb16e-fa77-453d-a04a-8fde46ec82dc	197976	image/jpeg	\N	2026-07-24 07:48:19.790347-07	sankara.telukutla
07253931-67aa-426a-b0e8-7e7f8a4bbc6c	6bf7cca0-9880-4464-9426-c064efc81fcf	sankara.telukutla	sankara.telukutla/6bf7cca0-9880-4464-9426-c064efc81fcf/07253931-67aa-426a-b0e8-7e7f8a4bbc6c	13601089	video/mp4	\N	2026-07-24 07:55:30.531019-07	sankara.telukutla
9596a40d-e596-4ee6-a7fc-2a2fff70ef13	48bf8bcb-267b-4834-a4db-6997826f087c	sankara.telukutla	sankara.telukutla/48bf8bcb-267b-4834-a4db-6997826f087c/9596a40d-e596-4ee6-a7fc-2a2fff70ef13	13601089	video/mp4	\N	2026-07-24 07:55:35.124984-07	sankara.telukutla
79fcec8a-d0d5-4805-a522-bc324db9db75	2b1c5526-5ec5-4948-90d4-731b235bd904	sankara.telukutla	sankara.telukutla/2b1c5526-5ec5-4948-90d4-731b235bd904/79fcec8a-d0d5-4805-a522-bc324db9db75	1969716	application/pdf	\N	2026-07-24 08:00:26.366878-07	sankara.telukutla
ed888e89-d45b-49d5-9115-9cf33acc1247	bbddd4ad-f099-4d80-8914-387928d1642f	sankara.telukutla	sankara.telukutla/bbddd4ad-f099-4d80-8914-387928d1642f/ed888e89-d45b-49d5-9115-9cf33acc1247	110754	image/jpeg	\N	2026-07-24 08:02:22.647661-07	sankara.telukutla
99a06058-d9d7-4a25-815d-d4ba12537f41	1ed48580-0bdb-467e-b531-0b6485fd44d8	sankara.telukutla	sankara.telukutla/1ed48580-0bdb-467e-b531-0b6485fd44d8/99a06058-d9d7-4a25-815d-d4ba12537f41	171931	image/jpeg	\N	2026-07-24 08:02:22.789477-07	sankara.telukutla
cc5874fd-888a-4392-bb90-ec22d6b161df	b679e7f5-69e2-4567-bca0-d104f91d39e1	sankara.telukutla	sankara.telukutla/b679e7f5-69e2-4567-bca0-d104f91d39e1/cc5874fd-888a-4392-bb90-ec22d6b161df	197976	image/jpeg	\N	2026-07-24 08:02:22.98982-07	sankara.telukutla
59c6833c-0b82-41b2-8686-bde88dd55257	c6c32752-a518-4ebf-9c6a-0826567ce7b7	sankara.telukutla	sankara.telukutla/c6c32752-a518-4ebf-9c6a-0826567ce7b7/59c6833c-0b82-41b2-8686-bde88dd55257	772917	image/jpeg	\N	2026-07-25 01:02:04.235248-07	sankara.telukutla
3c0a9d0c-dfff-4e84-aece-5326cf4ea177	effac209-583b-4a82-80f0-1e51e38ccb45	sankara.telukutla	sankara.telukutla/effac209-583b-4a82-80f0-1e51e38ccb45/3c0a9d0c-dfff-4e84-aece-5326cf4ea177	677407	image/jpeg	\N	2026-07-25 01:02:04.238608-07	sankara.telukutla
1ab51162-9629-4c3b-918a-60a810dd16fd	695801f2-b8b3-48a8-aa9c-aa806592e3d2	sankara.telukutla	sankara.telukutla/695801f2-b8b3-48a8-aa9c-aa806592e3d2/1ab51162-9629-4c3b-918a-60a810dd16fd	278050	image/jpeg	\N	2026-07-25 01:39:52.225338-07	sankara.telukutla
fd4e1b0d-4594-4323-b230-3a090c1169dc	d8619f43-1c7b-45ef-a018-20e899e4a6b9	sankara.telukutla	sankara.telukutla/d8619f43-1c7b-45ef-a018-20e899e4a6b9/fd4e1b0d-4594-4323-b230-3a090c1169dc	13100510	application/pdf	\N	2026-07-25 01:50:37.532745-07	sankara.telukutla
cdab3133-22d2-4303-8e45-cf5e0d39e12a	ca247aad-d624-45c2-b529-8256be9bcfcd	sankara.telukutla	sankara.telukutla/ca247aad-d624-45c2-b529-8256be9bcfcd/cdab3133-22d2-4303-8e45-cf5e0d39e12a	14439064	application/pdf	\N	2026-07-25 01:50:37.532823-07	sankara.telukutla
87c287ac-5358-4d52-a113-32a8597f30d2	00a6349e-dcdf-43cf-9255-e6f250fb23a7	sankara.telukutla	sankara.telukutla/00a6349e-dcdf-43cf-9255-e6f250fb23a7/87c287ac-5358-4d52-a113-32a8597f30d2	14007415	application/pdf	\N	2026-07-25 01:53:41.292086-07	sankara.telukutla
ac134c46-2b83-45cd-acbd-2a8c8815c65e	f4aa41eb-80cf-4744-bd8a-68860d7144ec	sankara.telukutla	sankara.telukutla/f4aa41eb-80cf-4744-bd8a-68860d7144ec/ac134c46-2b83-45cd-acbd-2a8c8815c65e	11517285	application/pdf	\N	2026-07-25 01:53:54.966447-07	sankara.telukutla
18493706-7b71-4d52-acc5-e6add4d7602d	d8619f43-1c7b-45ef-a018-20e899e4a6b9	sankara.telukutla	sankara.telukutla/d8619f43-1c7b-45ef-a018-20e899e4a6b9/18493706-7b71-4d52-acc5-e6add4d7602d	13100510	application/pdf	\N	2026-07-25 06:22:44.781602-07	sankara.telukutla
767fc6ef-e2ef-4215-99a4-e3af77bc8350	ca247aad-d624-45c2-b529-8256be9bcfcd	sankara.telukutla	sankara.telukutla/ca247aad-d624-45c2-b529-8256be9bcfcd/767fc6ef-e2ef-4215-99a4-e3af77bc8350	14439064	application/pdf	\N	2026-07-25 06:22:44.782314-07	sankara.telukutla
eb5355dc-7eb1-4f07-bf76-b1ca22d81ac8	00a6349e-dcdf-43cf-9255-e6f250fb23a7	sankara.telukutla	sankara.telukutla/00a6349e-dcdf-43cf-9255-e6f250fb23a7/eb5355dc-7eb1-4f07-bf76-b1ca22d81ac8	14007415	application/pdf	\N	2026-07-25 06:23:49.171855-07	sankara.telukutla
477d8a6d-a6cb-40ca-a21a-0c55cd609772	f4aa41eb-80cf-4744-bd8a-68860d7144ec	sankara.telukutla	sankara.telukutla/f4aa41eb-80cf-4744-bd8a-68860d7144ec/477d8a6d-a6cb-40ca-a21a-0c55cd609772	11517285	application/pdf	\N	2026-07-25 06:24:23.512208-07	sankara.telukutla
ae88e440-bb08-40ce-9733-9ae422dd9658	1a452205-a976-4cb9-adb3-beb0cac071ee	sankara.telukutla	sankara.telukutla/1a452205-a976-4cb9-adb3-beb0cac071ee/ae88e440-bb08-40ce-9733-9ae422dd9658	110754	image/jpeg	\N	2026-07-25 07:18:46.934131-07	sankara.telukutla
7436bcb5-23b7-40d7-ac84-87fe9e462e3a	715a59e0-8d8b-47c0-91e5-783e9693ee17	sankara.telukutla	sankara.telukutla/715a59e0-8d8b-47c0-91e5-783e9693ee17/7436bcb5-23b7-40d7-ac84-87fe9e462e3a	171931	image/jpeg	\N	2026-07-25 07:19:04.406352-07	sankara.telukutla
92590205-511b-43ad-9dd4-43ded2b38c77	1b9b09dd-1d69-4223-a260-a5bb40e07626	sankara.telukutla	sankara.telukutla/1b9b09dd-1d69-4223-a260-a5bb40e07626/92590205-511b-43ad-9dd4-43ded2b38c77	13601089	video/mp4	\N	2026-07-25 07:21:44.901496-07	sankara.telukutla
9aecb936-28dd-42d5-8c1d-065dc5da51d8	12c5253f-7250-4a20-8521-8a02104bc5b2	sankara.telukutla	sankara.telukutla/12c5253f-7250-4a20-8521-8a02104bc5b2/9aecb936-28dd-42d5-8c1d-065dc5da51d8	110754	image/jpeg	\N	2026-07-25 07:25:33.850876-07	sankara.telukutla
ce4f3768-5b19-4963-bce6-e648c33bb52a	12c5253f-7250-4a20-8521-8a02104bc5b2	sankara.telukutla	sankara.telukutla/12c5253f-7250-4a20-8521-8a02104bc5b2/ce4f3768-5b19-4963-bce6-e648c33bb52a	110754	image/jpeg	\N	2026-07-25 07:33:46.111556-07	sankara.telukutla
4b0815af-977f-4d9d-bc1b-0578e0c55aee	b679e7f5-69e2-4567-bca0-d104f91d39e1	sankara.telukutla	sankara.telukutla/b679e7f5-69e2-4567-bca0-d104f91d39e1/4b0815af-977f-4d9d-bc1b-0578e0c55aee	197976	image/jpeg	\N	2026-07-25 07:34:18.859893-07	sankara.telukutla
61e8ae89-4b5d-426a-be88-75aafa1942b9	12c5253f-7250-4a20-8521-8a02104bc5b2	sankara.telukutla	sankara.telukutla/12c5253f-7250-4a20-8521-8a02104bc5b2/61e8ae89-4b5d-426a-be88-75aafa1942b9	110754	image/jpeg	\N	2026-07-25 07:37:16.904581-07	sankara.telukutla
e295ad35-83ab-4571-9c9c-fbb1885ec94e	b679e7f5-69e2-4567-bca0-d104f91d39e1	sankara.telukutla	sankara.telukutla/b679e7f5-69e2-4567-bca0-d104f91d39e1/e295ad35-83ab-4571-9c9c-fbb1885ec94e	197976	image/jpeg	\N	2026-07-25 07:37:35.696548-07	sankara.telukutla
1e8491b4-7016-4423-ad2e-6ab87c33bb7a	12c5253f-7250-4a20-8521-8a02104bc5b2	sankara.telukutla	sankara.telukutla/12c5253f-7250-4a20-8521-8a02104bc5b2/1e8491b4-7016-4423-ad2e-6ab87c33bb7a	110754	image/jpeg	\N	2026-07-25 07:45:01.053594-07	sankara.telukutla
cd97300a-c804-4fad-8b4f-8460f8128c15	b679e7f5-69e2-4567-bca0-d104f91d39e1	sankara.telukutla	sankara.telukutla/b679e7f5-69e2-4567-bca0-d104f91d39e1/cd97300a-c804-4fad-8b4f-8460f8128c15	197976	image/jpeg	\N	2026-07-25 07:45:05.383231-07	sankara.telukutla
a92e4a5f-3d71-4be0-b0cd-61427965ad2b	695801f2-b8b3-48a8-aa9c-aa806592e3d2	sankara.telukutla	sankara.telukutla/695801f2-b8b3-48a8-aa9c-aa806592e3d2/a92e4a5f-3d71-4be0-b0cd-61427965ad2b	278050	image/jpeg	\N	2026-07-25 08:02:49.39373-07	sankara.telukutla
9d3ed31d-110c-4cff-8c6b-ce13e3e8147c	dd35155f-8aa3-4f5a-bdec-9bf1218b4c58	sankara.telukutla	sankara.telukutla/dd35155f-8aa3-4f5a-bdec-9bf1218b4c58/9d3ed31d-110c-4cff-8c6b-ce13e3e8147c	358800	image/jpeg	\N	2026-07-25 08:03:07.493647-07	sankara.telukutla
d377b694-381f-4493-b72a-802131cc5c61	12c5253f-7250-4a20-8521-8a02104bc5b2	sankara.telukutla	sankara.telukutla/12c5253f-7250-4a20-8521-8a02104bc5b2/d377b694-381f-4493-b72a-802131cc5c61	110754	image/jpeg	\N	2026-07-25 08:03:40.581411-07	sankara.telukutla
3dec9241-6bac-4b83-8379-a7a5ea74bccf	344bd91c-9e19-486e-a9c5-63cee0a1ff84	sankara.telukutla	sankara.telukutla/344bd91c-9e19-486e-a9c5-63cee0a1ff84/3dec9241-6bac-4b83-8379-a7a5ea74bccf	171931	image/jpeg	\N	2026-07-25 08:03:44.113023-07	sankara.telukutla
ede848f1-a390-40a2-b008-6609a2e14169	344bd91c-9e19-486e-a9c5-63cee0a1ff84	sankara.telukutla	sankara.telukutla/344bd91c-9e19-486e-a9c5-63cee0a1ff84/ede848f1-a390-40a2-b008-6609a2e14169	171931	image/jpeg	\N	2026-07-25 08:03:56.246949-07	sankara.telukutla
c506a3cc-2a42-41cf-8cf0-c562f139c6ed	21744d10-d99b-46b0-aac1-adec6c6f6912	sankara.telukutla	sankara.telukutla/21744d10-d99b-46b0-aac1-adec6c6f6912/c506a3cc-2a42-41cf-8cf0-c562f139c6ed	13601089	video/mp4	\N	2026-07-25 08:07:14.885274-07	sankara.telukutla
8d06bb01-7a40-4603-814e-93f48a5b34b1	aa789b7e-9d36-4e7c-839b-66b6bf5e6d9e	sankara.telukutla	sankara.telukutla/aa789b7e-9d36-4e7c-839b-66b6bf5e6d9e/8d06bb01-7a40-4603-814e-93f48a5b34b1	487103	image/jpeg	\N	2026-07-25 08:58:09.157379-07	sankara.telukutla
dd6b484d-99a5-4988-a56a-c548c8e0ee19	1e6f8e07-9b22-443a-9ea8-c661a07de572	sankara.telukutla	sankara.telukutla/1e6f8e07-9b22-443a-9ea8-c661a07de572/dd6b484d-99a5-4988-a56a-c548c8e0ee19	5467602	video/mp4	\N	2026-07-25 08:59:10.741492-07	sankara.telukutla
2d2bf6f2-8b79-4e55-8494-6fd87b03218c	ee0e629c-2c3e-4d1f-82fc-cee8cf36c791	sankara.telukutla	sankara.telukutla/ee0e629c-2c3e-4d1f-82fc-cee8cf36c791/2d2bf6f2-8b79-4e55-8494-6fd87b03218c	110754	image/jpeg	\N	2026-07-25 08:59:10.971788-07	sankara.telukutla
1188df5e-ed96-4c3e-b292-f47939a13c00	b679e7f5-69e2-4567-bca0-d104f91d39e1	sankara.telukutla	sankara.telukutla/b679e7f5-69e2-4567-bca0-d104f91d39e1/1188df5e-ed96-4c3e-b292-f47939a13c00	197976	image/jpeg	\N	2026-07-25 09:09:12.435751-07	sankara.telukutla
c62c45a5-da1d-4f8c-8d9b-9a9fccc4dabc	5d361b33-ad2a-471d-b919-70c1dc421271	sankara.telukutla	sankara.telukutla/5d361b33-ad2a-471d-b919-70c1dc421271/c62c45a5-da1d-4f8c-8d9b-9a9fccc4dabc	171931	image/jpeg	\N	2026-07-25 09:09:18.762283-07	sankara.telukutla
65d01bc0-a06d-452a-be52-95b6240badca	166415a9-b1c5-4f97-8d5d-e9ba0c2ad617	sankara.telukutla	sankara.telukutla/166415a9-b1c5-4f97-8d5d-e9ba0c2ad617/65d01bc0-a06d-452a-be52-95b6240badca	677407	image/jpeg	\N	2026-07-25 11:19:34.919414-07	sankara.telukutla
e0ffd6d1-46df-4d1d-816e-8f9904c8d5e2	02672173-ab2c-4954-8499-6e6f75ef86b8	sankara.telukutla	sankara.telukutla/02672173-ab2c-4954-8499-6e6f75ef86b8/e0ffd6d1-46df-4d1d-816e-8f9904c8d5e2	772917	image/jpeg	\N	2026-07-25 11:20:15.205605-07	sankara.telukutla
fabdc33e-a846-420f-8db4-2e759a7905cd	32209a62-04ad-4ae1-8297-6d191866fc34	sankara.telukutla	sankara.telukutla/32209a62-04ad-4ae1-8297-6d191866fc34/fabdc33e-a846-420f-8db4-2e759a7905cd	278050	image/jpeg	\N	2026-07-25 11:21:15.972103-07	sankara.telukutla
c4f728a9-3747-4095-aa00-76105e9a26c2	673ac97d-504b-4e12-b69a-f6ac3972db0f	sankara.telukutla	sankara.telukutla/673ac97d-504b-4e12-b69a-f6ac3972db0f/c4f728a9-3747-4095-aa00-76105e9a26c2	232093	image/jpeg	\N	2026-07-25 11:21:35.520169-07	sankara.telukutla
\.


--
-- Name: platform_model_audit_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.platform_model_audit_id_seq', 38, true);


--
-- Name: platform_model_audit platform_model_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_model_audit
    ADD CONSTRAINT platform_model_audit_pkey PRIMARY KEY (id);


--
-- Name: platform_models platform_models_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_models
    ADD CONSTRAINT platform_models_pkey PRIMARY KEY (id);


--
-- Name: platform_models platform_models_provider_id_model_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_models
    ADD CONSTRAINT platform_models_provider_id_model_id_key UNIQUE (provider_id, model_id);


--
-- Name: storage_node_tags storage_node_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.storage_node_tags
    ADD CONSTRAINT storage_node_tags_pkey PRIMARY KEY (node_id, tag_id);


--
-- Name: storage_nodes storage_nodes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.storage_nodes
    ADD CONSTRAINT storage_nodes_pkey PRIMARY KEY (id);


--
-- Name: storage_shares storage_shares_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.storage_shares
    ADD CONSTRAINT storage_shares_pkey PRIMARY KEY (id);


--
-- Name: storage_shares storage_shares_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.storage_shares
    ADD CONSTRAINT storage_shares_token_key UNIQUE (token);


--
-- Name: storage_tags storage_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.storage_tags
    ADD CONSTRAINT storage_tags_pkey PRIMARY KEY (id);


--
-- Name: storage_versions storage_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.storage_versions
    ADD CONSTRAINT storage_versions_pkey PRIMARY KEY (id);


--
-- Name: idx_platform_model_audit_model; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_model_audit_model ON public.platform_model_audit USING btree (model_id, at DESC);


--
-- Name: idx_platform_models_enabled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_models_enabled ON public.platform_models USING btree (enabled) WHERE (enabled = true);


--
-- Name: idx_platform_models_provider; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_models_provider ON public.platform_models USING btree (provider_id);


--
-- Name: idx_platform_models_released; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_models_released ON public.platform_models USING btree (released_at DESC);


--
-- Name: idx_platform_models_use_cases; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_models_use_cases ON public.platform_models USING gin (use_cases);


--
-- Name: storage_node_tags_node; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX storage_node_tags_node ON public.storage_node_tags USING btree (node_id);


--
-- Name: storage_node_tags_tag; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX storage_node_tags_tag ON public.storage_node_tags USING btree (tag_id);


--
-- Name: storage_nodes_owner_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX storage_nodes_owner_org ON public.storage_nodes USING btree (owner_id, org_id) WHERE (trashed_at IS NULL);


--
-- Name: storage_nodes_owner_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX storage_nodes_owner_parent ON public.storage_nodes USING btree (owner_id, parent_id) WHERE (trashed_at IS NULL);


--
-- Name: storage_nodes_owner_starred; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX storage_nodes_owner_starred ON public.storage_nodes USING btree (owner_id) WHERE (starred AND (trashed_at IS NULL));


--
-- Name: storage_nodes_unique_name; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX storage_nodes_unique_name ON public.storage_nodes USING btree (owner_id, parent_id, lower(name)) NULLS NOT DISTINCT WHERE (trashed_at IS NULL);


--
-- Name: storage_nodes_ws_app; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX storage_nodes_ws_app ON public.storage_nodes USING btree (workspace_id, app_id) WHERE ((app_id IS NOT NULL) AND (trashed_at IS NULL));


--
-- Name: storage_shares_grantee; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX storage_shares_grantee ON public.storage_shares USING btree (grantee_id);


--
-- Name: storage_shares_node; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX storage_shares_node ON public.storage_shares USING btree (node_id);


--
-- Name: storage_tags_owner_name; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX storage_tags_owner_name ON public.storage_tags USING btree (owner_id, lower(name));


--
-- Name: storage_versions_node; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX storage_versions_node ON public.storage_versions USING btree (node_id);


--
-- Name: platform_models platform_models_provider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_models
    ADD CONSTRAINT platform_models_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.model_providers(id) ON DELETE RESTRICT;


--
-- Name: storage_node_tags storage_node_tags_node_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.storage_node_tags
    ADD CONSTRAINT storage_node_tags_node_id_fkey FOREIGN KEY (node_id) REFERENCES public.storage_nodes(id) ON DELETE CASCADE;


--
-- Name: storage_node_tags storage_node_tags_tag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.storage_node_tags
    ADD CONSTRAINT storage_node_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.storage_tags(id) ON DELETE CASCADE;


--
-- Name: storage_nodes storage_nodes_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.storage_nodes
    ADD CONSTRAINT storage_nodes_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.storage_nodes(id) ON DELETE CASCADE;


--
-- Name: storage_shares storage_shares_node_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.storage_shares
    ADD CONSTRAINT storage_shares_node_id_fkey FOREIGN KEY (node_id) REFERENCES public.storage_nodes(id) ON DELETE CASCADE;


--
-- Name: storage_versions storage_versions_node_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.storage_versions
    ADD CONSTRAINT storage_versions_node_id_fkey FOREIGN KEY (node_id) REFERENCES public.storage_nodes(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

