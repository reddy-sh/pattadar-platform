# TODO — temporary share links, for known users only

Status: **not built.** Written down so the requirement is not lost.

Raised while building the vault parity work
([2026-08-14-vault-parity-design.md](2026-08-14-vault-parity-design.md)),
deliberately left out of it.

## What was asked for

> "allow multi select and download and share as well. TODO : temporray link and
> for known user only."

## What shipped instead

Sharing works today by **sending the bytes**, not by sending a link:

- **Web** — select rows → *Download as zip* → one archive.
- **iOS** — *Select* → *Share* → the same archive through the system share
  sheet, which already reaches WhatsApp, Mail, AirDrop and Files.

That covers "share these documents with someone" without inventing an auth
surface. It does not cover "give someone a link that stops working next week".

## Why it was not built

The storage gateway has **share grants** (`storage_shares`,
`_attach_shares`, `list_shared_children` in `services/gateway/app/storage_service.py`)
— per-node grants to a named grantee. It has **no** signed URL, no expiry, no
revocation surface, and no notion of a link that authenticates on its own.

Building that is not a UI change. It needs decisions nobody has made yet:

1. **Who may open it.** "Known user" needs defining: an existing Pattadar
   account, someone invited by phone number, or a beneficiary already on the
   record? The beneficiary/invite flow
   ([pattadar-member-verification-policy]) is the nearest existing model.
2. **How the link authenticates.** A signed token in the URL is the simple
   answer and the wrong one for land records — a forwarded WhatsApp message
   becomes a permanent leak. The link should identify the *document*, and the
   opener should still have to be signed in as someone on the grant list.
3. **Expiry.** Default window, maximum window, and what a viewer sees after it
   lapses (a plain "this link has expired", never a 404 that reads as deletion).
4. **Revocation.** The owner has to be able to end access before expiry, and
   see who still has it.
5. **Audit.** Every open logged — who, when, which document. Land documents
   carry Aadhaar numbers and party names; an access nobody can reconstruct is
   worse than no sharing at all.
6. **Masking.** The vault masks Aadhaar by default. A shared copy must be at
   least as careful as the app is, which means the shared artifact may need to
   be a redacted render rather than the original bytes.

## Sketch, when it is picked up

```
storage_share_links
  id, owner_user_id, node_id | document_id
  grantee_user_id      -- resolved account, NOT an open link
  token                -- opaque, single-purpose, revocable
  expires_at
  revoked_at
  created_at

GET  /api/gateway/storage/shared/{token}   -- 401 unless signed in AS the grantee
POST /api/gateway/storage/shares           -- create, with an expiry
DELETE /api/gateway/storage/shares/{id}    -- revoke
```

Every open appends to the existing `audit_events` trail.

## Until then

Nothing in the shipped work exposes a document at a URL that works without a
session. The zip is handed to the person who is already signed in, and it is
their own operating system that shares it onward.
