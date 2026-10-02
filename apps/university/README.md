# Pattadar University

Independent React/Vite product shell for `university.pattadar.com`.

## What works in this preview

- URL-backed course filters for buyer, seller, and career goals, with career-discipline and all-India state or union-territory refinement across the catalog and personal learning record.
- A four-path learning map for buyers, sellers, employees, and service professionals, with suggested course order and jurisdiction limits.
- A certificates page that explains the difference between local completion previews and future reviewed, verifiable credentials.
- A government-sourced `/states` library covering all 28 states and 8 union territories, with answer-first record explainers, official access steps, mutation and survey guidance, registration boundaries, due-diligence checklists, FAQs, digital-availability limits, and dated source review.
- Per-jurisdiction canonical metadata and Article, FAQ, and breadcrumb structured data, plus build-generated crawlable route HTML, `sitemap.xml`, `robots.txt`, and `llms.txt` for search and answer engines.
- Explicit course scope: India-wide practice courses remain visible for every jurisdiction, while state-specific legal and record curricula appear only where published.
- Career opportunities filter by discipline and work-location state, while course cards name the state curriculum they cover.
- Stable course and location slugs.
- Eleven courses with 60 complete reading lessons, objectives, guided practice, deliverables, and knowledge checks.
- A ten-module Andhra Pradesh land-record foundation covering 1-B, Pattadar passbooks, Adangal, FMB/RSR/BhuNaksha, prohibited and assigned land, registration, EC/CC, mutation, and professional escalation.
- Per-lesson government references and downloadable handbooks that preserve source authority and URL; automated checks reject non-government reference domains.
- A visible `/compliance` matrix mapping the Andhra Pradesh Admin checklist and all ten company workforce rules to specific lessons.
- ChatGPT-generated, course-specific instructional artwork with prompt provenance in `public/course-art/PROMPTS.md`.
- Course enrollment and module progress saved locally behind a repository port.
- Personal learning record and completion state.
- Downloadable browser-generated course handbooks containing the full lesson material, plus clearly marked completion-record previews.
- Eleven original narrated visual lessons for Andhra Pradesh and Telangana records, each with English captions, a transcript, a fictional field-by-field sample, and government source links.
- Proposed opportunity, mentor-role, and location discovery without presenting them as live offerings.
- Grounded demo AI tutor with explicit human escalation for live legal, survey, safety, and property decisions.
- Shared Cognito OIDC/PKCE configuration for Pattadar accounts.
- Light, dark, and high-contrast appearance modes.

Course progress and saved opportunity interest use local prototype adapters, not the production source of truth. Curriculum, mentor roles, location plans, opportunity paths, and completion records are visibly marked as preview content. English is the current source language; Telugu publication remains planned and requires human terminology review. The production API and DynamoDB migration path are defined in [ARCHITECTURE.md](./ARCHITECTURE.md).

The current product and launch gaps are ordered in [REVIEW.md](./REVIEW.md). No verified certificate is issued by this preview.

## State record video libraries

- Andhra Pradesh: `/states/andhra-pradesh/records` covers passbook, 1-B, Adangal, old RSR records, FMB and village maps, and EC with deeds.
- Telangana: `/states/telangana/records` covers ePPB and ROR, Pahani, old Khasra and Sethwar records, Tippan and LPM, and EC with registration.

The canonical teaching data is `src/data/recordGuides.json`. Its fictional examples are never copied from a real landowner. `scripts/renderRecordVideos.py` renders the MP4s, posters, WebVTT captions, and transcripts into `public/record-videos/`. It needs Pillow, ffmpeg, [Piper](https://github.com/OHF-Voice/piper1-gpl), and the [en_US-ljspeech-medium voice model](https://huggingface.co/rhasspy/piper-voices/tree/main/en/en_US/ljspeech/medium). Download the `.onnx` and matching `.onnx.json` files to a local directory, then set `PATTADAR_PIPER_BIN` and `PATTADAR_PIPER_MODEL` before running the script. The model card identifies the [LJ Speech dataset](https://keithito.com/LJ-Speech-Dataset/) as public domain. The model is used only to render audio; neither Piper nor model weights are shipped with the site. A production content review should verify any changed government service, the English narration's pronunciation, and a human-reviewed Telugu version before claiming bilingual coverage.

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

The production build first refreshes public discovery files, builds the Vite bundle, and then writes a crawlable `index.html` for `/states` and every `/states/:slug` route. The generated `dist` directory is deployable; generated files are not a substitute for the CloudFront route and cache rules described in the architecture document.
