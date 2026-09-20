# Pattadar University

Independent React/Vite product shell for `university.pattadar.com`.

## What works in this scaffold

- Role-filtered course catalog for buyers, sellers, surveyors, document writers, legal professionals, field services, and Pattadar staff.
- Stable course and location slugs.
- Course enrollment and module progress saved locally behind a repository port.
- Personal learning record and completion state.
- Browser-generated PDF course guides and clearly marked completion-record previews.
- Proposed opportunity, mentor-role, and location discovery without presenting them as live offerings.
- Grounded demo AI tutor with explicit human escalation for live legal, survey, safety, and property decisions.
- Shared Cognito OIDC/PKCE configuration for Pattadar accounts.
- Light, dark, and high-contrast appearance modes.

Course progress and saved opportunity interest use local prototype adapters, not the production source of truth. Course outlines, mentor roles, location plans, opportunity paths, and completion records are visibly marked as preview content. The production API and DynamoDB migration path are defined in [ARCHITECTURE.md](./ARCHITECTURE.md).

## Run it

From the repository root:

```bash
bun run --filter @pattadar/university dev
```

The development URL is `http://localhost:5181`.

Without Cognito environment variables the app runs as `preview-learner`. Copy `.env.example` to `.env.local` and set the shared Pattadar user-pool values to exercise hosted sign-in.

## Production identity setup

Use the existing Pattadar Cognito user pool with a dedicated public app client for University. Register these exact URLs:

- `https://university.pattadar.com/auth/callback`
- `https://university.pattadar.com/`
- `http://localhost:5181/auth/callback`
- `http://localhost:5181/`

The immutable Cognito `sub` is the learner identifier. Email is display/contact data and must never be used as a primary key.

## Verification

```bash
bun run --filter @pattadar/university typecheck
bun run --filter @pattadar/university test
bun run --filter @pattadar/university build
```
