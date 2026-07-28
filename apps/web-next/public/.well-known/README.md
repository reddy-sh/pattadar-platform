# `/.well-known/` — mobile app-link files

Next serves everything in `apps/web-next/public/` at the site root, so files
placed here are reachable at `https://pattadar.com/.well-known/<file>` once the
CloudFront `web_origin` switch is flipped to `ecs` (decision D9; the `ecs`-mode
`/.well-known/*` behavior in `infra/terraform/modules/runtime/cloudfront.tf`
retargets this path from the S3 SPA bucket to the ALB/Next origin).

## Files required here (NOT yet committed — D4/D5 must supply the real ones)

The mobile app (`apps/mobile/app.json`) declares deep links, so both files are
mandatory for verified app links to work:

- **`apple-app-site-association`** (no extension, served as `application/json`)
  - iOS `associatedDomains: ["applinks:pattadar.com"]`
  - Needs the real **Apple App ID** = `<TEAM_ID>.com.pattadar.app`.
- **`assetlinks.json`**
  - Android `package: com.pattadar.app`, `intentFilters` autoVerify for
    `https://pattadar.com/verify`.
  - Needs the real Android signing cert **SHA-256 fingerprint(s)** (Play App
    Signing + upload key).

These are intentionally **not fabricated**: a wrong Team ID or SHA-256
fingerprint silently breaks universal/app links. The Apple Team ID and the
release-keystore fingerprints are supplied at cutover (D4/D5); drop the two
files here then and redeploy the web image.

Until they exist, `/.well-known/*` returns a genuine 404 (there is no SPA
index.html rewrite on this path), which is the correct behavior for a missing
app-link file.
