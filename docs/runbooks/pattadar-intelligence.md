# Intelligence: which AI reads documents

The page is **Administration → Intelligence** (`/admin/intelligence`). It is
open only to a super-admin (`SUPER_ADMIN_UIDS`, set locally in
`.local/cognito-local.env`, or `platform_settings 'super_admin.uids'`); anyone else sees a restricted state, and the API returns
nothing to them.

It chooses the reader for new passbooks, registered documents and property
documents. Aadhaar cards and photo checks always use Claude. Claude is the
default, and it stays the reader until Gemini is chosen **and** everything
Gemini needs is saved.

## What the page stores

| Field | Where it lives | Notes |
| --- | --- | --- |
| Reader, models, OCR on/off, processor | `platform_settings` `intelligence.*` | Plain values; applied to the next reading, no restart. |
| Claude API key | `intelligence.secret.anthropic_api_key` | Encrypted (see below). Never returned to the browser. |
| Gemini API key | `intelligence.secret.gemini_api_key` | Encrypted. Never returned. |
| Document AI service-account JSON | `intelligence.secret.google_service_account` | Encrypted. Never returned. |
| Model lists | `intelligence.models.{anthropic,gemini}` | Written by **Check connection**. |

Credentials are write-only. The page shows only where each one comes from
(saved on the page, held on the server, or missing) and when it changed. A
blank field on save keeps the saved value, and **Remove** deletes it. If no
value is saved on the page, the env vars `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`
and `GOOGLE_SERVICE_ACCOUNT_JSON` act as a fallback. Locally, put any of them in
the gitignored `.local/cognito-local.env`; `scripts/start-local.sh` hardcodes
none of them (nor any admin identity).

Every save writes the audit event `intelligence_settings.update` (security
retention). It records the reader, the models, OCR on or off, and the *names* of
any credentials that changed, never their values.

## Encryption

Saved credentials are Fernet-encrypted under `PLATFORM_SECRETS_KEY`, a key used
for nothing else. The Aadhaar vault is never used for them, and no runtime path
may decrypt with it (`tests/test_aadhaar_security.py`). Without
`PLATFORM_SECRETS_KEY` the page says keys cannot be saved, the key fields are
disabled, and the env fallbacks still work. Locally the key lives in
`.local/cognito-local.env`. Rotating it makes saved keys show as
"can no longer be decrypted", so type them again.

**Production prerequisite (not applied):** the api task has no
`PLATFORM_SECRETS_KEY` yet. It needs a Secrets Manager secret wired into the
api task definition (`infra/terraform/modules/runtime/ecs.tf`), which is
Reddy's decision. Until then production uses the env keys and Claude keeps
reading.

## The screen

- **Document reader:** one choice, "Reads new documents with", and **Switch
  reader**. Only providers that are set up can be chosen; Claude, the
  fallback, always can, so rolling back never fails.
- **Providers:** one row per provider in the server's registry
  (`ai_reading/admin.py` `PROVIDERS`), with model, where its key comes from,
  and status (Reading, Ready, Needs setup, Key unreadable). A row opens that
  provider's drawer: API key, model, **Check connection**, and any
  provider-specific step (Gemini's Document AI OCR).

Adding a provider is an entry in `PROVIDERS` plus its reading adapter in
`ai_reading/providers/`; the page lists it with no UI change.

## Set up Gemini

1. Open **Gemini** in Providers. Paste a Gemini API key from Google AI Studio
   and save.
2. Choose **Check connection**. A refused key reads "Gemini did not accept the
   API key". The check lists models only; it sends no document and costs
   nothing.
3. For Telugu scans, keep **Document AI OCR** on in the same drawer. Create an
   Enterprise Document OCR processor (region `us`, `eu` or `asia-south1`), give
   a service account permission to process documents on it, and paste the
   processor's resource name and the service account's JSON key. With OCR off,
   Gemini reads the scan itself and only the API key is needed.
4. Under **Document reader**, choose Gemini and **Switch reader**. While Gemini
   reads, its key cannot be removed and OCR cannot be left half set up; switch
   back to Claude first.
5. Test a small Telugu/English passbook and a registered document. Check the
   fields against the scan before filing.

Document AI's online OCR takes about 15 pages per document; a longer deed fails
under Gemini with OCR on and does not fall back to Claude.

To roll back, choose **Claude** and **Switch reader**. Readings dispatch once, with no
automatic retry, on both providers.
