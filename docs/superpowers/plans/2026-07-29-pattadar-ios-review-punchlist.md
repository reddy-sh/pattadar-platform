# Pattadar iOS Review Punch‑List — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every finding in the 29 Jul 2026 Pattadar iOS App Review — configuration/foundation, security core (device + backend C‑1), error‑vs‑empty states, accessibility, HIG consistency, the ~18 screen bugs, and the export/restore feature (H‑7) — so `apps/mobile` is App‑Store‑submittable and safe for real land records.

**Architecture:** The Expo/React‑Native app (`apps/mobile`, expo‑router, React Native Paper theme) is the primary surface; it talks to a Python gateway (`services/gateway`) → main API (`services/api`) and a storage layer. Fixes are grouped into phases that mirror the review's priority order. Cross‑cutting fixes (theme tokens, shared a11y components, one bottom‑inset source) are done once so every screen inherits them. C‑1 additionally touches the backend gateway/API and Cognito Terraform.

**Tech Stack:** Expo SDK 57, React Native, expo‑router, React Native Paper, @tanstack/react‑query, expo‑secure‑store / expo‑file‑system / expo‑crypto / expo‑local‑authentication / expo‑location / expo‑notifications, react‑native‑webview, react‑native‑maps, react‑native‑safe‑area‑context, react‑native‑gesture‑handler. Backend: FastAPI (Python), Terraform (Cognito). Bun for JS tooling.

**Verification model:** There is NO JS test harness in `apps/mobile` (only `npm run typecheck` = `tsc --noEmit`). Each task verifies with (1) `cd apps/mobile && npm run typecheck` clean, and (2) an explicit manual/device check named in the task. A minimal unit test is added ONLY for pure‑logic units where it pays off (error‑vs‑empty branching, contrast helper, unit conversion) — introduced with a tiny `node:test`/`tsx` runner, not a full jest setup, unless a task says otherwise.

## Global Constraints

- **Platform invariants (do not violate):** requests carry `x-user-id` today (being replaced in Phase 2), the id‑format invariant, and the **≥200s client timeout** invariant must be preserved.
- **Customer‑facing URLs = own domain only.** Never surface `*.amazoncognito.com` or raw IdP hosts to users; auth redirects go through `auth.pattadar.com`. In‑app native login pages only.
- **Dates:** DD/MM/YYYY (India) everywhere user‑facing.
- **No internal/roadmap copy in shipped UI:** no "Phase 4", "TODO", "Coming soon (dev)", or throwaway Who/When dev labels in user‑facing screens.
- **Surgical changes:** every changed line traces to a review finding. Do not refactor working code beyond the finding. Never remove a working feature to "fix" it.
- **Theme‑first:** read colors/spacing/typography from the Paper theme (`useTheme()`); no new hardcoded hex or fixed type metrics.
- **Pattadar‑only blast radius:** this work stays inside `apps/mobile` (+ `services/gateway`, `services/api`, `infra/terraform` for C‑2 only). Do not touch shared `packages/core` in a way that changes web behavior without calling it out.

---

## Phase 0 — Checkpoint & Foundation (blocks App Store submission)

### Task 0.0: Checkpoint the current working tree
- [ ] Commit the existing ~5,600‑line uncommitted `apps/mobile` diff as a checkpoint on `main` so the punch‑list lands as a clean, reviewable diff with a rollback point. Message: `chore(mobile): checkpoint pre-iOS-review-punchlist state`.

### Task 0.1: iOS permission usage strings + config plugins  <!-- review §3 High — SUBMISSION BLOCKER -->

**Files:** Modify `apps/mobile/app.json` (only config source — no `app.config.*`/`eas.json` exists).

**Verified current state:** camera + photo strings present (well-worded, via `expo-image-picker` plugin). MISSING: `NSLocationWhenInUseUsageDescription`, `NSFaceIDUsageDescription`, and the `expo-location` config plugin. Native modules ARE used: expo-location in `src/app/set-location.tsx` + `src/app/holding/[id].tsx`; Face ID (expo-local-authentication) in `src/lib/secureReveal.ts`; expo-notifications (local only) in `src/lib/notify.ts`.

- [ ] Add to `plugins` array in `app.json`:
```json
["expo-location", { "locationWhenInUsePermission": "Pattadar uses your location to pin land parcels on the map." }],
["expo-local-authentication", { "faceIDPermission": "Pattadar uses Face ID to unlock sensitive land records like your Aadhaar." }]
```
(No Info.plist string needed for expo-notifications local notifications; add its plugin only if APNs/push is introduced.)
- [ ] **Verify:** `cd apps/mobile && npx expo config --type introspect | grep -iE "NSLocationWhenInUse|NSFaceID"` shows both strings; `npm run typecheck` clean.

### Task 0.2: Root providers — GestureHandlerRootView + SafeAreaProvider  <!-- review §3 Medium (load-bearing) -->

**Files:** Modify `apps/mobile/src/app/_layout.tsx:27-49`.

**Verified current state:** root wraps only `QueryClientProvider → PaperProvider → StatusBar + Stack`. Neither `SafeAreaProvider` nor `GestureHandlerRootView` exists anywhere in `src/`. `SafeAreaView`/`useSafeAreaInsets` from `react-native-safe-area-context` are already used in ~82 places → insets silently fall back to defaults today. Both libs are already deps.

- [ ] Wrap the existing tree so the outermost layers are `GestureHandlerRootView style={{flex:1}}` then `SafeAreaProvider` (imports: `GestureHandlerRootView` from `react-native-gesture-handler`, `SafeAreaProvider` from `react-native-safe-area-context`):
```jsx
<GestureHandlerRootView style={{ flex: 1 }}>
  <SafeAreaProvider>
    <QueryClientProvider client={queryClient}>
      <PaperProvider theme={theme}>{/* StatusBar + Stack unchanged */}</PaperProvider>
    </QueryClientProvider>
  </SafeAreaProvider>
</GestureHandlerRootView>
```
- [ ] **Verify:** `npm run typecheck` clean; on device, a screen using `useSafeAreaInsets` (e.g. `set-location.tsx`) reports non-zero top inset on a notched device.

### Task 0.3: Brand the iOS icon; (optional) manage splash  <!-- review §3 Medium/Low — CORRECTION -->

**Files:** `apps/mobile/assets/expo.icon/` (asset bundle), optionally `apps/mobile/src/app/_layout.tsx`.

**Correction to review:** `ios.icon: "./assets/expo.icon"` is NOT a broken path — it's a valid Apple Icon Composer `.icon` bundle. The real defect: it's the **unbranded `create-expo-app` default** (blue gradient + Expo symbol + grid). This needs **Pattadar icon art** (a design asset — cannot be produced in code).

- [ ] Replace the contents of `assets/expo.icon/` with Pattadar-branded icon art (or drop `ios.icon` and let top-level `./assets/images/icon.png` serve iOS). **Blocked on a design asset — flag to Sankara.**
- [ ] (Optional) If a startup asset/font gate is wanted: `SplashScreen.preventAutoHideAsync()` at module scope in `_layout.tsx`, `hideAsync()` after `healApiBase()`/fonts settle. Skip if no async gate needed (current auto-hide is acceptable).
- [ ] **Verify:** icon renders as Pattadar branding in a dev-client/simulator build.

---

## Phase 1 — Security core (device‑side)  <!-- review §4 Security -->

### Task 1.1: Sign‑out tears down the full session (H‑1)

**Files:** Modify `apps/mobile/src/app/account.tsx:438-449`; import from `apps/mobile/src/auth/cognitoConfig.ts` (`TOKENS_KEY = 'pattadar_tokens'`); use revocation endpoint from `apps/mobile/src/auth/useCognitoAuth.ts:21`.

**Verified current state:** sign-out does `setIdentity('')` (deletes only `pattadar_identity`) + `qc.invalidateQueries({queryKey:['pattadar']})` (marks stale, does not evict) + navigate. **Cognito `TOKENS_KEY` is never deleted and the session is never revoked** → refresh token survives, storage layer can still mint access tokens as the signed-out user; cached PII only stale, not gone.

- [ ] In the sign-out handler, after clearing identity: `await SecureStore.deleteItemAsync(TOKENS_KEY)`; delete other per-user SecureStore keys (`pattadar_storage_url`, avatar, and the local-file map key `pattadar_local_files`); call the local-files + drive-cache wipe (the "clear cached files" helper from Task 1.2); POST the refresh token to the Cognito `revocationEndpoint`; then `qc.clear()` (NOT `invalidateQueries`).
- [ ] Extract a `signOut()` helper into `auth/` (there is none today — sign-out is hand-rolled in `account.tsx`, which is why it leaks) so the teardown is testable and reusable.
- [ ] **Verify:** `npm run typecheck` clean; on device, after sign-out, `SecureStore.getItemAsync('pattadar_tokens')` returns null and a subsequent storage call fails auth (StorageAuthError) instead of succeeding.

### Task 1.2: Documents at rest — no-backup dir + eviction + clear control (H‑2)

**Files:** Modify `apps/mobile/src/api/storage.ts:176-198` (cache download) and `apps/mobile/src/lib/localFiles.ts:40-51` (permanent copy).

**Verified current state:** deed/Aadhaar bytes download into `FileSystem.cacheDirectory` as `drive-<nodeId>-<name>`, plaintext, **never expiring** (returned forever if present). `localFiles.ts` copies into `FileSystem.documentDirectory` (iCloud-backed on iOS by default), plaintext, permanent. No TTL, no size cap (deeds up to ~14 MB noted), no clear control. `expo-crypto` IS a dep but provides only digest/random — **no AES**, so app-level symmetric encryption is a larger lift.

- [ ] Write on-device copies to a **no-backup** location (exclude from iCloud: dedicated dir + `FileSystem` no-backup, or mark excluded-from-backup) so scans never enter iCloud backups; rely on iOS Data Protection (files are protected-until-first-unlock by default) as the at-rest baseline.
- [ ] Add eviction to `fetchDriveFile`: sweep `cacheDirectory` for `drive-*` on each open, deleting entries older than a TTL (e.g. 7 days) and enforcing a total-size cap (e.g. 200 MB, LRU by mtime).
- [ ] Add `clearCachedFiles()` to the storage/localFiles layer (deletes all `drive-*` cache entries + `doc-*` documentDirectory copies) and expose a "Clear cached files" control in `account.tsx`. This is the helper Task 1.1 reuses on sign-out.
- [ ] **(Stretch, flag as sub-decision)** App-level AES encryption of bytes at rest (per-install key in SecureStore) — larger than expo-crypto alone supports; decide separately whether iOS Data Protection + no-backup is sufficient for the threat model.
- [ ] **Verify:** `npm run typecheck` clean; on device, a cached file older than TTL is removed on next open; "Clear cached files" empties both dirs; new local copies are excluded from backup.

### Task 1.3: Delete a document removes the on-disk file + cache (H‑3)

**Files:** Modify `apps/mobile/src/app/documents.tsx:581-587`, `apps/mobile/src/app/document/[id].tsx:270-273`, and/or the mutations in `apps/mobile/src/data/hooks.ts:525-557` (`deleteRegistered`, `deleteDocument`).

**Verified current state:** both delete handlers call only the GraphQL mutation + navigate; mutations are pure `api.gql(...)` + invalidate — they never touch disk. The `documentDirectory` copy and `cacheDirectory` `drive-*` entry are orphaned. Toast says "deleted permanently" and `document/[id].tsx:262` says "stored file stays in My Drive" — both misleading about the local plaintext copy.

- [ ] Add `removeLocalCopy(docId)` to `localFiles.ts` (delete the `documentDirectory` file + drop the map key) and `evictDriveCache(nodeId, name)` to `storage.ts`; call both from the two delete handlers (or the mutations' `onSuccess`).
- [ ] Reconcile the "deleted permanently" copy so it's accurate once local removal lands.
- [ ] **Verify:** `npm run typecheck` clean; on device, after delete, no `doc-<id>-*` or `drive-<nodeId>-*` file remains.

### Task 1.4: Local document index out of a single SecureStore item (H‑4)

**Files:** Modify `apps/mobile/src/lib/localFiles.ts:30-51` (key `pattadar_local_files`).

**Verified current state:** the entire document map is serialized into ONE SecureStore/Keychain item; grows unbounded; the write is swallowed (`.catch(() => undefined)`) so past the Keychain size limit, saves silently fail and file references are lost with no signal.

- [ ] Move the index to a plain JSON file (`documentDirectory/local-files.json` via `expo-file-system`); keep only the (future) encryption key in SecureStore.
- [ ] Replace the swallowed write with error surfacing (log + return a failure the caller can react to).
- [ ] Migrate any existing map from the old SecureStore key on first read (read-old → write-new → delete-old).
- [ ] **Verify:** `npm run typecheck` clean; saving many documents persists all references; a simulated write failure is surfaced, not swallowed.

### Task 1.5: Lock down the document-viewer WebView (H‑5)

**Files:** Modify `apps/mobile/src/app/viewer.tsx:110-117`.

**Verified current state:** non-image files render in `WebView` with `originWhitelist={['*']}`, `allowFileAccess`, `allowFileAccessFromFileURLs`, and `javaScriptEnabled` unset → **defaults to true** in react-native-webview ^14. A spoofed-extension HTML/JS file from a `file://` URI could read other local documents. (Does NOT set `allowUniversalAccessFromFileURLs`, limiting blast radius — hence High.)

- [ ] For the plain viewer WebView: `javaScriptEnabled={false}`, `allowFileAccessFromFileURLs={false}`, `allowUniversalAccessFromFileURLs={false}`, and narrow `originWhitelist` to `['file://*']`. If PDFs need scripting, render them via a sandboxed pdf.js instead.
- [ ] **Verify:** `npm run typecheck` clean; a PDF still renders; an HTML file with an inline `<script>` that reads another cached file does nothing.
- [ ] _(Viewer image aspect + a11y label + local-file loading copy are handled in Task 6.6.)_

### Task 1.6: Aadhaar re-auth per reveal + HTTPS-only server override (H‑8)

**Files:** Modify `apps/mobile/src/app/account.tsx` (reveal ~252, state ~82/256; debug gate ~166, override dialog ~339-352/588-633), `apps/mobile/src/lib/secureReveal.ts:15-20`, `apps/mobile/src/api/client.ts:53-58` (`setApiBase`).

**Verified current state (a):** reveal gates biometric on `!revealedOnce`, so after the first reveal per mount the full Aadhaar can be copied repeatedly with no re-auth. Worse, `authenticateForReveal` returns `true` when no Face ID/passcode is enrolled → no gate at all on such devices. **(b):** `showDebug = __DEV__ || debugTaps >= 7` makes the server-URL override reachable in release after 7 taps; Save (`setApiBase`/`setStorageBase`) does **no scheme validation** (only strips trailing slash); placeholder even suggests `http://<mac-ip>:8080`. A 7-tap actor can repoint the app at a hostile `http://` host and exfiltrate all PII (headers ship in cleartext).

- [ ] (a) Drop `!revealedOnce` so every reveal re-authenticates (or gate on a 30–60s TTL); remove the now-unused `revealedOnce` state. In `secureReveal.ts`, treat "no biometric enrolled" as a **failed** gate (deny or require device passcode) rather than returning `true`.
- [ ] (b) Reject non-`https://` URLs in `setApiBase`/`setStorageBase` (permit `http`/RFC-1918/localhost only under `__DEV__`); validate scheme in the dialog Save before persisting; drop the `http://` hint from the placeholder in release builds and warn that changing it sends records to that server.
- [ ] **Verify:** `npm run typecheck` clean; on device, each Aadhaar reveal prompts Face ID; entering an `http://` override in a release build is rejected with an error.

---

## Phase 2 — C‑1: route the mobile main API through the verified gateway  <!-- review C-1 Critical -->

**Key correction from research:** the gateway (`services/gateway/app/auth.py` + `cognito_jwt.py`) ALREADY verifies Cognito JWTs, strips spoofable identity headers (`StripIdentityHeadersMiddleware`), and injects a trusted `x-user-id` to downstream — and its client-id allowlist already supports "web SPA + native iOS." The main API (`services/api/src/main.py`) has **no** verification (`_uid_from_info` reads `x-user-id` verbatim). Today the raw API is network-isolated to the gateway SG, so the hole is latent — but mobile's main-data path (`apps/mobile/src/api/client.ts`) hits the raw API directly with `x-user-id`, so the moment mobile prod ships pointing at a real host, it's full account impersonation. **Fix = move mobile onto the gateway path + Bearer, and close the Terraform drift.** No new server verification code.

**Ordering:** Task 2.1 (infra) MUST land before 2.3 (mobile), or mobile tokens 401 in prod.

### Task 2.1: Infra — native Cognito app client + widen gateway allowlist (hard prerequisite)

**Files:** `infra/terraform/modules/persistent/cognito.tf` (+ `outputs.tf`), `infra/terraform/modules/runtime/ecs.tf:185`.

**Verified current state:** only ONE app client exists in Terraform — `spa` (web callbacks). The mobile app hardcodes native client id `44gv48ihjlgub7h0lnvjbdmj89` + `auth.pattadar.com` in `apps/mobile/src/auth/cognitoConfig.ts`, unmanaged by TF. Prod gateway `COGNITO_CLIENT_ID = cognito_spa_client_id` (SPA only) → rejects mobile tokens. `auth.pattadar.com` custom domain is gated behind `custom_auth_domain != "" && manage_dns`.

- [ ] Add `aws_cognito_user_pool_client "native"` (public, PKCE `code` + `ALLOW_REFRESH_TOKEN_AUTH`, callback `pattadar://auth`, Google/Apple/Facebook IdPs, scopes `openid email profile`); output `cognito_native_client_id`. Reconcile the drifted `44gv48…` id (import as this resource, or create fresh + rebuild mobile with the new id).
- [ ] Change gateway `COGNITO_CLIENT_ID` in `ecs.tf` to `"${spa_id},${native_id}"` (the gateway's `cognito_jwt.py` already parses the comma list).
- [ ] Confirm the `auth.pattadar.com` custom domain is applied in the target env (login + refresh both hit it). Per the customer-facing-URL invariant, users must only ever see `auth.pattadar.com`, never `*.amazoncognito.com`.
- [ ] **Verify:** `terraform plan` shows the native client + allowlist change and nothing destructive; the native client id matches what mobile is built with.

### Task 2.2: Mobile — hoist Cognito token access into shared auth

**Files:** `apps/mobile/src/api/storage.ts` (has `accessToken()`/`refreshAccessToken()`), new `apps/mobile/src/auth/tokens.ts`.

- [ ] Extract `accessToken()` / `refreshAccessToken()` (currently living in `storage.ts`) into `auth/tokens.ts` so both the storage client and the main-API client share one token source/refresh path. Keep behavior identical.
- [ ] **Verify:** `npm run typecheck` clean; storage still uploads/downloads (regression check).

### Task 2.3: Mobile — route main API + imports through the gateway with Bearer; remove x‑user‑id

**Files:** `apps/mobile/src/api/client.ts` (GraphQL + `uploadDocument`), plus `getIdentity`/`EXPO_PUBLIC_DEV_USER` consumers: `PhotoSection.tsx`, `account.tsx`, `more.tsx`.

**Verified current state:** `client.ts` points at `EXPO_PUBLIC_API_URL` (raw API) `/graphql` + `/import-*`,`/extract-*`, attaching only `x-user-id` (release included). The shared factory `packages/core/src/api/client.ts` never injects a Bearer — it's per-consumer.

- [ ] Repoint the GraphQL URL and the `/import-*`,`/extract-*` upload URLs at the gateway path `${EXPO_PUBLIC_GATEWAY_URL}/api/gateway/pattadar/*` (the gateway proxy already grants import/extract the ≥200s no-retry timeout — **preserve that invariant**).
- [ ] Make the `headers` provider return `Authorization: Bearer <accessToken()>` (from Task 2.2). **In the same change**, delete the `x-user-id` injection in both the GraphQL client and `uploadDocument`, and remove the now-orphaned `getIdentity`/`setIdentity`/`EXPO_PUBLIC_DEV_USER` plumbing and its screen references. (Doing header-removal before Bearer exists locks users out — the file's own comment warns this.)
- [ ] Leave web dev proxies (`apps/web/vite.config.ts`, `apps/web-next/.../route.ts`) untouched — they inject `x-user-id` for local dev only.
- [ ] **Verify:** `npm run typecheck` clean; against a gateway build, a GraphQL query and a passbook import both succeed with Bearer and no `x-user-id`; a request with a tampered/absent token is rejected by the gateway (401).

### Task 2.4: Affirm/harden the API network boundary (defense-in-depth decision)

**Files:** `services/api/src/main.py` (decision), `infra/terraform/modules/runtime/*` (SG affirmation).

**Decision to make:** the main API still owner-scopes purely on gateway-injected `x-user-id` with no independent verification. Given it's isolated to the gateway SG, keeping the trust is defensible — but the plan must guarantee mobile can never reach the API off-gateway again.

- [ ] Affirm (in code comment + a TF assertion/test) that the API target group is only reachable from the gateway SG; if cheap, add lightweight independent JWT verification in `main.py` as defense-in-depth (reuse the gateway's `cognito_jwt` pattern). Otherwise document the boundary explicitly so a future direct-exposure doesn't silently reopen C‑1.
- [ ] **Verify:** SG rule confirmed; if verification added, a direct (non-gateway) request to the API with only `x-user-id` is rejected.

---

## Phase 3 — "Error ≠ empty" across every list screen (H‑6)

**Verified current state:** `useLiveOrSample` (`apps/mobile/src/data/hooks.ts:109-139`) catches every fetch failure and *resolves* with `{ data: empty(), isSample: true }` (one 700ms internal retry, `retry:false`). So react-query's `isError` is always false — **`result.isSample===true` is the only error signal**, and it cleanly distinguishes "fetch failed" from "genuinely empty account". The bug is purely that screens use `isSample` to add an `OfflineBanner` but STILL render the "No X yet" CTA underneath. `OfflineBanner` already exists (`components/OfflineBanner.tsx`, `{visible,onRetry}`); there is no `ErrorRetry` component. The error path also **clobbers cached rows** with `empty()`.

### Task 3.1: (test-first) Preserve last-good data on fetch failure

**Files:** Modify `apps/mobile/src/data/hooks.ts:109-139`; Test: `apps/mobile/src/data/__tests__/useLiveOrSample.test.ts` (introduce a minimal `tsx`/`node:test` runner — this is the one pure-logic unit worth a test).

- [ ] **Write the failing test:** the queryFn, on `fetcher` reject, returns the previous good `{data, isSample:false}` re-flagged `isSample:true` (via `queryClient.getQueryData`) rather than `empty()`; on first-ever failure (no prior data) returns `{data: empty(), isSample:true}`.
- [ ] Run it → fails.
- [ ] Implement: in the final `catch`, `const prev = queryClient.getQueryData<LiveResult<T>>(['pattadar', key]); return prev ? { data: prev.data, isSample: true } : { data: empty(), isSample: true };`
- [ ] Run → passes. This means a transient outage never wipes a landowner's already-loaded holdings.
- [ ] **Verify:** `npm run typecheck` clean; test green.

### Task 3.2: Shared `ErrorRetry` + gate every empty CTA on `!isSample`

**Files:** Create `apps/mobile/src/components/ErrorRetry.tsx`; Modify `(tabs)/holdings.tsx:733` (`ListEmptyComponent`), `(tabs)/family.tsx:304` (`noData` gate), `(tabs)/passbooks.tsx:615` (`ListEmptyComponent`), `(tabs)/index.tsx:359` (cold-start early return).

- [ ] Create `ErrorRetry({ onRetry })` (or reuse `OfflineBanner` as the whole empty body) — icon + "Can't reach your records" + Retry.
- [ ] In each of the four screens, where the empty-state currently renders, branch: `result?.isSample ? <ErrorRetry onRetry={refetch}/> : <EmptyState …/>`. The "Scan passbook / Create a group / No passbooks yet" CTAs must NOT show when `isSample`.
- [ ] **Home extra:** replace the `if (isLoading || !result) return <ActivityIndicator/>` full-screen gate (`index.tsx:359-367`) so a cold-start error surfaces the banner + retry instead of a bare spinner that can hang ~40s offline (driven by the 20s `timeoutMs` in `packages/core/src/api/client.ts:81`). Show the `OfflineBanner` during load, or branch to `ErrorRetry` once resolved with `isSample`.
- [ ] **Verify:** `npm run typecheck` clean; with the server unreachable, each list screen shows retry (not "you own nothing"); after a real empty account, the normal empty CTA still shows.

---

## Phase 4 — Accessibility  <!-- review §4 H-9 + §5 a11y -->

### Task 4.1: PersonAvatar — accessibilityLabel + contrast-safe initials (H‑9)

**Files:** Modify `apps/mobile/src/components/PersonAvatar.tsx:25-35`; consider a `apps/mobile/src/lib/contrast.ts` helper (+ a small test).

**Verified:** neither the `Avatar.Image` nor `Avatar.Text` branch sets `accessibilityLabel` (VoiceOver reads "image" or raw letters); `labelStyle` hardcodes `#fff` over `avatarColor(shown)` (a per-name hue that can be light → contrast fail).

- [ ] Add `accessibilityLabel={shown}` to both branches (and `accessible`).
- [ ] Add `relLuminance(hex)` helper (+ test for a light and dark input); set initials `color = relLuminance(avatarColor(shown)) > 0.5 ? '#000' : '#fff'`.
- [ ] **Verify:** `npm run typecheck` clean; VoiceOver announces the person's name; initials are legible on a light generated background.

### Task 4.2: Shared component roles/labels/state — StickyTitleBar, InlinePicker, SheetDialog

**Files:** `apps/mobile/src/components/StickyTitleBar.tsx` (avatar ~97-102), `apps/mobile/src/components/InlinePicker.tsx:83-100`, `apps/mobile/src/components/SheetDialog.tsx:31-35`.

**Verified (with corrections):** AppHeader IconButtons already carry `accessibilityLabel` (only touch size is wrong — Task 4.3). InlinePicker's *outer* toggle is already good (`role=button`, `state.expanded`, label); the gap is the **option rows** (`:83-100`) never expose `selected` (the check icon is the only cue) and the list has no `maxHeight`/scroll. SheetDialog's `RNModal` lacks `accessibilityViewIsModal`/focus trap and announces scrim+card as buttons.

- [ ] StickyTitleBar: add `accessibilityLabel` to the `Avatar.Text` fallback.
- [ ] InlinePicker: add `accessibilityState={{ selected: value === o.value, disabled: o.disabled }}` to each option Pressable; add `maxHeight: 240` + nested `ScrollView` (`nestedScrollEnabled`) so long lists don't push the form off-screen.
- [ ] SheetDialog: `accessibilityViewIsModal` + `accessibilityRole="none"` on the card (or make it a `View`); `accessibilityRole="header"` on the title; move initial focus to the title via `AccessibilityInfo.setAccessibilityFocus` on open.
- [ ] **Verify:** `npm run typecheck` clean; VoiceOver announces selected option state; a long picker scrolls; the sheet traps focus and doesn't announce phantom buttons.

### Task 4.3: 44pt minimum touch targets

**Files (verified sub-44 clusters — Paper IconButton container ≈ size×1.5):** `AppHeader.tsx:74,86` (size 22), `StickyTitleBar.tsx:115,121` (20), `holdings.tsx:153,579,680` (20/20/18), `passbooks.tsx:119,479` (18/20), `documents.tsx:508` (18), `group/[id].tsx:200` (18), `holding/[id].tsx:655` (18), `family.tsx:397` (18). Compact chips/buttons: `account.tsx:248,266,363,520`, `activity.tsx:104`.

- [ ] Add `hitSlop={8}` (cheapest, no layout shift) — or a 44×44 container — to each IconButton cluster above; keep `margin:0` for visual alignment. Copy the established good pattern: `family.tsx:133-138` (Aadhaar toggle) and `allocation.tsx` steppers (`stepBtn {width:44,height:44}`) are already compliant — do not touch them.
- [ ] **Verify:** `npm run typecheck` clean; on device, each control has a ≥44pt tappable area (Accessibility Inspector).

### Task 4.4: Dynamic Type — minHeight/padding + scalable line height

**Files:** `apps/mobile/src/theme/paper.ts:12-30` (type scale), `holdings.tsx:809` (`height:56`), `StickyTitleBar.tsx:159` (`height:48`), `EmptyState.tsx:67` (`lineHeight:20`), `add-member.tsx:731` (`fontSize:11`), `activity.tsx:180` (`search:{height:44}`).

**Verified:** every MD3 variant in `paper.ts` hardcodes both `fontSize` and `lineHeight`; RN scales fontSize by OS font scale but NOT lineHeight → glyphs grow, line boxes don't → platform-wide clipping. (Correction: `activity.tsx` has no hardcoded `fontSize`; its risk is the fixed `height:44` search field.)

- [ ] In `paper.ts`, either drop `lineHeight` from the variants (let RN derive) or make it a scaled multiple: `lineHeight: Math.round(fontSize * 1.3 * PixelRatio.getFontScale())`. This is the load-bearing, once-and-done fix.
- [ ] Replace fixed `height` with `minHeight` + `paddingVertical` on the data rows: `holdings.tsx:809`, `StickyTitleBar.tsx:159`, `activity.tsx:180` search field.
- [ ] `EmptyState.tsx:67`: drop the hardcoded `lineHeight`; `add-member.tsx:731`: use `labelSmall` variant instead of raw `fontSize:11`.
- [ ] **Verify:** `npm run typecheck` clean; at XXL Dynamic Type, rows grow without clipping.

### Task 4.5: One bottom-inset source + pinned action-bar bottom inset

**Files:** delete/repair `apps/mobile/src/components/AppFab.tsx` (dead code); `add-member.tsx:316,628,736`, `allocation.tsx:165,334,396`.

**Verified (correction):** the "two competing systems" is actually **one live** (`lib/listInset.ts` `listBottomInset = 84 + safeAreaBottom`, consumed via `useListBottomInset()`) plus **one orphan** — `AppFab.tsx` (`LIST_BOTTOM_INSET=224`) is imported nowhere. Pinned Save/Cancel bars in add-member + allocation use `SafeAreaView edges={['top']}` with no bottom pad → they sit under the home indicator.

- [ ] Remove the orphaned `AppFab.tsx` + `LIST_BOTTOM_INSET` (single source = `listBottomInset`). Per repo convention this dead code IS in scope because the review named it; flag in the commit that it was unused.
- [ ] Add the bottom inset to both pinned bars: apply `paddingBottom: useSafeAreaInsets().bottom` to `saveBar` in `add-member.tsx` and `allocation.tsx` (or add `'bottom'` to `edges`).
- [ ] **Verify:** `npm run typecheck` clean; on a home-indicator device, Save/Cancel bars clear the indicator.

---

## Phase 5 — HIG consistency  <!-- review §5 -->

### Task 5.1: Semantic success/warning theme tokens; replace hardcoded status hex

**Files:** `apps/mobile/src/theme/paper.ts` (add tokens to both light `:36-54` and dark `:61-76` palettes), then replace literals in: `(tabs)/family.tsx:99,101,329`, `group/[id].tsx:121`, `(tabs)/index.tsx:624,639,752`, `allocation.tsx:292`, `account.tsx:489`, `add-member.tsx:386`, `documents.tsx:615,616`, `verify/[token].tsx:21`.

**Verified:** `paper.ts` has NO success/warning tokens; greens/ambers are raw literals identical in both themes (fail dark mode + some contrast). Inventory: `#2e7d32` success(light), `#6fcf97` success(dark), `#b45309`/`#e8a13d` warning, `#a61b1b`/`#ef6a6a` critical. `verify/[token].tsx:21` already hand-rolls a light/dark `statusColors` map — the model to collapse into tokens.

- [ ] Add `success` + `warning` (light + dark) to both palettes; expose via the typed theme; read through `useTheme()`. Map criticals to existing `error` (or add `critical`).
- [ ] Replace each literal above with `theme.colors.<token>`. **Leave intentional non-status colors alone:** `PersonAvatar.tsx:33` `#fff` (handled in 4.1), `PhotoSection.tsx` gallery chrome, `lib/family.ts:67 AVATAR_PALETTE`.
- [ ] **Verify:** `npm run typecheck` clean; greens/ambers adapt correctly in dark mode.

### Task 5.2: Replace emoji with vector icons

**Files:** `apps/mobile/src/app/add-khata.tsx:246` (📸), `apps/mobile/src/components/ScanFirstCard.tsx:175` (📄).

- [ ] Replace the emoji-in-Text with a Paper `Icon`/`List.Icon` (e.g. `camera`, `text-box-search-outline`), matching `documents.tsx:247`.
- [ ] **Verify:** `npm run typecheck` clean; icons render; VoiceOver no longer reads an emoji name.

### Task 5.3: Hide "coming soon" dead rows; strip dev copy

**Files:** `apps/mobile/src/app/(tabs)/more.tsx`, `apps/mobile/src/components/QuickActions.tsx:12,23-30`.

**Verified:** `more.tsx` is entirely inert `List.Item`s (no `onPress`) under a "Coming soon" header, leaking dev strings "needs sign-in (Cognito)", "local dev uses a dev identity", "Pattadar mobile 0.1.0 · Phase 4" — and it largely duplicates the real, wired `account.tsx`. `QuickActions` "Request" tile has no route → pressable but does nothing, no disabled state.

- [ ] Remove the unshipped/dead rows from `more.tsx` and strip all "Cognito"/"Phase 4"/dev-identity strings (per the no-internal-copy invariant). If `more.tsx` is fully redundant with `account.tsx`, reduce it to only shipped entries (confirm with Sankara before deleting the tab).
- [ ] Remove the "Request" tile (or disable it with `accessibilityState={{disabled:true}}` + no press animation).
- [ ] **Verify:** `npm run typecheck` clean; no dead rows or dev copy in a release build.

### Task 5.4: More-sheet grabber theme color + grid roles

**Files:** `apps/mobile/src/app/(tabs)/_layout.tsx:158` (grabber), grid cells `:109-133`.

- [ ] `grabber.backgroundColor` `#9aa0a6` → `theme.colors.outline` / `onSurfaceVariant`; add `accessibilityRole="button"` + labels to the grid cell Pressables.
- [ ] **Verify:** `npm run typecheck` clean; grabber adapts to theme; VoiceOver announces each cell as a labelled button.

### Task 5.5: Account settings → iOS grouped-inset cards

**Files:** `apps/mobile/src/app/account.tsx:220-428`.

- [ ] Wrap each `List.Section` in an inset rounded `Surface`/card container (HIG grouped-inset), rather than bare rows divided by `<Divider>`. Background is already the iOS grouped color (`#F2F2F7`).
- [ ] **Verify:** `npm run typecheck` clean; settings render as grouped rounded cards on device.

---

## Phase 6 — Screen functional bugs  <!-- review §6 -->

> **Corrections applied (do NOT do these — verified not bugs):** add-member DOB "fresh-form error / hard-required" — WRONG (`packages/core/src/format/dob.ts:34` treats empty as valid); only the photo-consent gap is real. `add-parcel.tsx` scan mapping — no bug (`'agri'`/`'non-agri'` are valid). set-location & activity are PARTIAL — the real gap is a VoiceOver announcement, not "map-only"/"color-only".

### Task 6.1: holding/[id] — property geo shortcuts no-op; succession confirm

**Files:** `apps/mobile/src/app/holding/[id].tsx` (`saveGeo:258`, `clearGeo:274`, controls `:350,522,916`; ownership `:814-862`).

**Verified (nuance):** the primary "Edit/Set location" button works (routes to `set-location.tsx`, which calls `setPropertyGeo` at `:223`). Broken only for the two **in-page shortcuts** — suspect-pin "Move to {village}" (`:522`) and overflow "Clear location" (`:916`) — because `saveGeo`/`clearGeo` early-return `if (!parcel)` yet render for properties (`canEditGeo = !!parcel || !!property`). `setPropertyGeo` is imported but only read for a spinner.

- [ ] In `saveGeo`/`clearGeo`, branch `parcel ? setParcelGeo(parcelId,…) : setPropertyGeo(propertyId,…)` and drop the `if (!parcel) return`.
- [ ] Ownership change (`:814-862`): add an old→new confirmation summary before the `RECORD_PARCEL_MUTATION` write (currently gated only by non-empty `mutOwner`).
- [ ] **Verify:** `npm run typecheck` clean; on a property, "Move to village" + "Clear location" actually update the pin; ownership change shows a confirm summary.

### Task 6.2: add-property — scan maps house → invalid enum

**Files:** `apps/mobile/src/app/add-property.tsx:162`.

**Verified:** picker keys are `open_plot|flat|independent_house|villa|commercial|rental|other`; scan sets `'house'` (no such key) → property saves with blank/invalid type.

- [ ] Change the scan mapping `'house'` → `'independent_house'`.
- [ ] **Verify:** `npm run typecheck` clean; scanning a house doc selects "Independent house".

### Task 6.3: add-member — real photo-consent control

**Files:** `apps/mobile/src/app/add-member.tsx` (dead `Switch` import `:30`, dead styles `:744-745`, unconditional `photo` in mutations `:268,287`).

**Verified:** comment promises photo "only persisted on consent" but no consent control renders; third-party PII (photo) is stored unconditionally. (DOB claims are NOT bugs — skip.)

- [ ] Render a consent `Switch` (wire the dead `Switch`/`styles.consent`); only include `photo` in the add/update mutation when consent is on. Default off.
- [ ] **Verify:** `npm run typecheck` clean; with consent off, the member is saved without a photo.

### Task 6.4: family — phantom buttons, ambiguous nested tap, dead code

**Files:** `apps/mobile/src/app/(tabs)/family.tsx` (group icon `:343`, chevron `:450`, nested land-count `Text` `:350-358`; dead `MemberRow` `:72-172`, unreachable share dialog `:184,488-520`).

- [ ] Replace the two decorative `IconButton`s (no `onPress`) with non-interactive `<Icon>` so VoiceOver stops announcing phantom buttons and they stop stealing row taps.
- [ ] Resolve the nested `onPress` dual target: either remove the inner navigation on the land-count text or make the row not wrap it.
- [ ] Remove the dead `MemberRow` + unreachable heir-share dialog (orphaned by the list→detail refactor) — flag as dead code in the commit.
- [ ] **Verify:** `npm run typecheck` clean; row tap goes one place; VoiceOver announces no phantom buttons.

### Task 6.5: group/[id] — adjacent sub-44pt remove/share (mis-tap removes heir)

**Files:** `apps/mobile/src/app/group/[id].tsx:182-207`.

- [ ] Space/enlarge the share-% `Button` and remove `IconButton size={18}` (both <44pt and adjacent); move Remove into an overflow menu OR add a confirmation. (Touch-size bump also covered by Task 4.3 — do the layout separation here.)
- [ ] **Verify:** `npm run typecheck` clean; removing an heir requires a deliberate, non-adjacent action.

### Task 6.6: viewer — image aspect, a11y label, local-file loading copy

**Files:** `apps/mobile/src/app/viewer.tsx` (image `:106,129`, loading copy `:90`, local branch `:28-37`).

- [ ] Replace fixed `image.height:500` with flex + `aspectRatio` sizing so portrait scans don't letterbox; add `accessibilityLabel={name}` to the `<Image>`; branch the loading copy on `local` ("Opening…" vs "Fetching from My Drive…").
- [ ] **Verify:** `npm run typecheck` clean; a portrait scan fills width; VoiceOver labels the image; local files don't say "Fetching from My Drive".

### Task 6.7: ScanFirstCard — PII out of lock-screen notification

**Files:** `apps/mobile/src/components/ScanFirstCard.tsx:96-99`.

- [ ] Replace the notification body (currently the first sentence of the AI summary = owner names/village/consideration) with generic text: "Your document was read — tap to review." Keep PII in-app.
- [ ] **Verify:** `npm run typecheck` clean; the local notification body contains no record details.

### Task 6.8: set-location — manual entry fallback + announce reverse geocode

**Files:** `apps/mobile/src/app/set-location.tsx` (pin `:311-320`, region `:302-306`, address `:335`, results `:170-178`).

**Verified (PARTIAL):** search + "use my location" already exist; the real gaps are (a) no manual lat/lng/address entry and (b) the reverse-geocoded address is plain `Text` with no live region, so VoiceOver users get no readout while panning; and search results share one title with a raw-coord subtitle.

- [ ] Add a manual lat/lng (or address) entry fallback for placing the pin without the map.
- [ ] Add `accessibilityLiveRegion="polite"` to the reverse-geocoded address so it's announced on change.
- [ ] Give search results distinct reverse-geocoded titles instead of the repeated search term + raw coords.
- [ ] **Verify:** `npm run typecheck` clean; VoiceOver announces the address as the pin moves; results are distinguishable.

### Task 6.9: activity — label the status dot (not color-only)

**Files:** `apps/mobile/src/app/activity.tsx:150-155`.

**Verified (PARTIAL):** the action word IS in text (`{label}`, `:158`) so a screen reader hears "Deleted…"; the gap is specifically the **color-only dot**.

- [ ] Add an icon or `accessibilityLabel` to the status dot (or drop the dot and lean on the text label) so delete/add is distinguishable without color.
- [ ] **Verify:** `npm run typecheck` clean; add vs delete is distinguishable in grayscale / to VoiceOver.

### Task 6.10: documents — upload progress/cancel, temp cleanup, effect, Open Settings

**Files:** `apps/mobile/src/app/documents.tsx` (upload `:144-148`, picker `:291-294`, init side-effect `:101-105`, perm denial `:261`).

**Verified (all 4):** `uploadToDrive` supports `onProgress` (`storage.ts:130`) but `fileIt` passes none (button spinner only); `DocumentPicker`/camera temp files never deleted; a side-effect runs in a `useState` initializer; permission denial dead-ends.

- [ ] Wire `onProgress` → a percent bar + cancel for uploads.
- [ ] Delete picker/camera temp files after read (mirror `add-member.tsx:189-191`).
- [ ] Move the `SecureStore.getItemAsync(...).then(setLocalFiles)` side-effect from the `useState` initializer into a `useEffect`.
- [ ] On permission denial, offer `Linking.openSettings()` ("Open Settings") instead of a dead-end error.
- [ ] **Verify:** `npm run typecheck` clean; a large upload shows percent + cancel; no temp files linger; permission denial offers Settings.

---

## Phase 7 — Export / restore "records vault" (H‑7)

**Verified current state:** account.tsx "Export your records" (`:357-368`) is a permanent `<Chip>Soon</Chip>` + snackbar; "Delete account" (`:369-380`) is a `mailto:`. Storage layer exposes `uploadToDrive`, `fetchDriveFile(nodeId,name)` (download by id), `getLocalFiles`, `saveLocalCopy`, `openLocalCopy` — but **no `listDriveFiles`/enumerate** and **no delete**; the web app lists via raw `GET /api/gateway/storage/files?appId=pattadar`. Document→file mapping currently lives only in the local map (being moved out of SecureStore in Task 1.4).

> **Sub-decisions to confirm before building (flag to Sankara):** (a) export format — JSON manifest + bundled document bytes as a **.zip** (needs a zip lib — none in deps today) vs a manifest + share-sheet of individual files; (b) whether "Delete account" needs a real backend deletion endpoint in `services/api` (there is none today).

### Task 7.1: Add a drive-list capability to the mobile storage layer

**Files:** `apps/mobile/src/api/storage.ts` (add `listDriveFiles(appId): Promise<StorageNode[]>`), mirroring the web gateway call `GET /api/gateway/storage/files?appId=pattadar` with the Cognito Bearer.

- [ ] Implement `listDriveFiles` (Bearer, ≥200s-safe timeout) returning `StorageNode[]`; add a `deleteDriveFile(nodeId)` if the export/restore flow needs cleanup.
- [ ] **Verify:** `npm run typecheck` clean; on device, it enumerates the signed-in user's drive files.

### Task 7.2: Export all records + documents to a portable archive

**Files:** new `apps/mobile/src/lib/exportVault.ts`; `apps/mobile/src/app/account.tsx:357-368` (replace the "Soon" chip).

- [ ] Build `exportVault()`: gather all GraphQL records (holdings, groups/members, passbooks, registered documents metadata) into a versioned JSON manifest; download each document's bytes via `fetchDriveFile`; package per the chosen format (Task 7 sub-decision); hand off via `expo-sharing`.
- [ ] Replace the permanent "Soon" chip with a real "Export your records" action that runs `exportVault()` with progress; keep dates DD/MM/YYYY in the manifest's human-readable fields.
- [ ] **Verify:** `npm run typecheck` clean; export produces an archive containing the manifest + every document; opening it shows all records.

### Task 7.3: Restore/import + recoverability check; real Delete-account

**Files:** `apps/mobile/src/lib/exportVault.ts` (add `restoreVault(archive)`); `apps/mobile/src/app/account.tsx:369-380` (Delete account).

- [ ] Implement `restoreVault()`: parse the manifest, re-create records via the existing mutations, re-upload documents via `uploadToDrive`; a "verify recoverability" step that confirms counts match. Guard with a confirmation (destructive-action pattern the app already uses).
- [ ] Replace the `mailto:` "Delete account" with an in-app flow: confirm → call a real deletion (backend endpoint if built per the sub-decision, else a well-formed request) → sign out (reuse Task 1.1 teardown). Copy must not overpromise if server deletion isn't wired.
- [ ] **Verify:** `npm run typecheck` clean; exporting then restoring into a clean account reproduces the records; Delete-account performs a real action, not an email draft.

---

## Self‑Review (run after all tasks filled)
- Spec coverage: every review finding (§3, §4 C‑1/H‑1..H‑9, §5 themes, §6 screens, §7 done‑well = keep) maps to a task.
- Placeholder scan: no FILL‑FROM markers remain; every code step shows real code.
- Type consistency: shared symbols (theme token names, ErrorRetry props, storage fn names, PersonAvatar props) match across tasks.
