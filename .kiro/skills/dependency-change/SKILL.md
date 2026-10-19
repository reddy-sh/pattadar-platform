---
name: dependency-change
description: Use this skill when adding, removing or upgrading a Pattadar dependency (Bun/npm packages, Python requirements, Anthropic SDKs, Swift packages/toolchain, Terraform providers, Docker base images, GitHub Actions), including Dependabot PRs and compatibility, security, lockfile, image or CI impact. Not for enabling a provider or model (provider-activation) or Terraform resource changes (infrastructure-change).
compatibility: Requires pattadar-platform manifests. Registry/network installs are not performed until the exact package/version and impact are reviewed.
metadata:
  project: pattadar-platform
  standard: agentskills.io
  verified: "2026-10-09"
---

# Dependency Change

Plan the blast radius before contacting a registry or changing a lockfile.
Primary for version, manifest and lockfile changes. Not this skill: a
security-only review (security-review) or Expo native module work
(mobile-feature-delivery).

## Workflow

1. Read `references/ecosystem-map.md` for the affected ecosystem and identify
   every consumer, image, lockfile, generated project, CI job, and
   `.github/dependabot.yml` entry.
2. Read compatibility comments/caps before changing versions. State why the
   dependency is needed and why existing stack capabilities are insufficient.
3. Check package identity/maintainer, release notes, security/advisories,
   license, architecture support, transitive impact, and runtime/bundle effects.
4. For new dependencies use an exact reviewed version. Pin unusual names and
   flag possible typosquatting before install.
5. Show the exact install/update command and network/files changed, then wait for
   confirmation before registry access. Never execute untrusted lifecycle
   scripts blindly.
6. Update manifests/lockfiles intentionally and hand validation to
   `verify-change`, plus the map's image and Terraform checks it does not
   cover; invoke `security-review` for auth/crypto/storage/parser deps.

## Stack constraints

Use Bun 1.3.14. Do not introduce pnpm, webpack/module federation, Ant Design, or
a parallel framework without explicit architecture approval. Do not remove a
compatibility cap until its documented upstream issue is proven resolved.
