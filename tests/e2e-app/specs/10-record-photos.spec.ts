/**
 * W05 + W14 — the photos hanger, /properties/:id/media.
 *
 * One route, two screens. Scoped to the record it is the gallery: a strip of
 * every photo, a caption you can type into, a cover to choose, tags, download
 * and a delete that asks twice. Scoped to a feature (`?feature=`) it becomes
 * the provenance panel: why this picture is evidence of THAT bore, and what a
 * forwarded one can and cannot be used for.
 *
 * Two things a reader should know before changing anything here:
 *
 *  · A PICK IS AN UPLOAD. The hidden `<input type=file aria-label="Upload a
 *    photo or video to this record">` is mounted on the page at all times, so
 *    handing it files sends them — which is why `upload` below is one helper and
 *    not two. There was a panel here for a while, holding the pick so it could be
 *    looked at and captioned before the bytes went; it was removed because the
 *    file browser the person just came out of already showed them the names, the
 *    sizes and the thumbnails, and because a caption is easier to write next to
 *    the photograph than next to a filename. `caption` is `''` at file time again
 *    — and `lastAdded` walks the gallery to the new photograph, whose Caption box
 *    is right there. The header control is "Add photos or video", relabelling to
 *    "Uploading…" while a pick goes up; the single `.droptile` drop zone opens
 *    the same picker, and a DROP onto it uploads what was dropped without asking
 *    again. It replaced six near-identical tiles that all opened this one drawer.
 *  · The seeded photos carry legacy `fileRef`s ('file-photo-cover'), which
 *    `isStorageRef` rejects, so nothing is fetched from storage and the frame
 *    draws its placeholder. Every test that needs real bytes — download, the
 *    video, the thumbnail sizes — sets a UUID ref of its own and routes the
 *    content path itself.
 *  · `uploadToDrive` POSTs to /api/gateway/storage/files?…, which the seal has
 *    no seeded answer for (seed.ts answers /storage/nodes and /storage/files/
 *    <id>/content, not the upload). Every upload test routes it itself, which
 *    is also how each one decides whether storage says yes.
 *  · components/FileViewer.tsx is NOT reachable from this route. The gallery
 *    is its own lightbox and nothing here calls `openFileViewer` (its four
 *    callers are all legacy pages), so the only thing this file has to say
 *    about it is that Download goes through `downloadBlob` instead — which
 *    "a stored photo downloads under the name it was filed with" asserts.
 *
 * Eight defects are marked `test.fail()` rather than softened, each with the
 * line that causes it: the stage's two unconditional chips, the ISO capture
 * stamp, the provenance checklist's half-sentences, the same checklist's
 * claims about facts the row denies, a Download that can never work on a
 * legacy ref, an upload the storage refuses in silence, a strip thumbnail that
 * puts a button inside a button when its bytes are refused, and an 80vh wait
 * that never says what it is waiting for.
 */
import { test, expect, World, BLANK_JPEG } from '../fixtures/harness';
import { ID, PHOTO, FEATURE } from '../fixtures/ids';
import { PHOTOS } from '../fixtures/seed';

const GALLERY = (suffix = '') => `/properties/${ID.parcel}/media${suffix}`;

/** A storage node id — `isStorageRef` only believes a UUID, and the whole
 *  bytes half of this screen is behind that guard. */
const STORED = '11111111-2222-4333-8444-555555555555';
const STORED_SECOND = '66666666-7777-4888-8999-000000000000';

/** 537 bytes of real VP8 (ffmpeg, 16x16, black). A <video> pointed at a JPEG
 *  never reaches HAVE_CURRENT_DATA, so "it plays" could not be asserted with
 *  the seal's placeholder pixel. */
const TINY_WEBM =
  'GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAAAAHpEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHYTbuMU6uEElTDZ1OsggElTbuMU6uEHFO7a1OsggHT7AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsirXsYMPQkBNgI1MYXZmNjIuMTIuMTAxV0GNTGF2ZjYyLjEyLjEwMUSJiEBpAAAAAAAAFlSua8iuAQAAAAAAAD/XgQFzxYjh6kAJBACGu5yBACK1nIN1bmSIgQCGhVZfVlA4g4EBI+ODhAvrwgDgkLCBELqBEJqBAlWwhFW5gQESVMNn/HNzoGPAgGfImkWjh0VOQ09ERVJEh41MYXZmNjIuMTIuMTAxc3PWY8CLY8WI4epACQQAhrtnyKFFo4dFTkNPREVSRIeUTGF2YzYyLjI4LjEwMSBsaWJ2cHhnyKFFo4hEVVJBVElPTkSHkzAwOjAwOjAwLjIwMDAwMDAwMAAfQ7Z1qOeBAKOjgQAAgBACAJ0BKhAAEAAARwiFhYiFhIgCAgAMDWAA/v+rUIAcU7trkbuPs4EAt4r3gQHxggGm8IED';

type Row = Record<string, unknown>;

const seeded = () => structuredClone(PHOTOS) as Record<string, unknown> & { photos: Row[] };

/** One seeded photo, with anything this test needs to be different about it. */
function row(id: string, over: Row = {}): Row {
  const found = seeded().photos.find((r) => r.id === id);
  if (!found) throw new Error(`fixtures/seed.ts has no photo ${id}`);
  return { ...found, ...over };
}

/** A photos answer built around `rows`, with the counts the server would have
 *  derived from them — so a test never has to state a total that disagrees
 *  with the strip it is about to assert. */
function list(rows: Row[], over: Record<string, unknown> = {}) {
  return {
    ...seeded(),
    photos: rows,
    total: rows.length,
    videoCount: rows.filter((r) => r.mediaKind === 'video').length,
    verifiedCount: rows.filter((r) => r.verified).length,
    unprovenCount: rows.filter((r) => !r.verified).length,
    ...over,
  };
}

/** The strip has no landmark role of its own — it is a span of buttons — and
 *  counting the thumbs is half of what this screen promises, so the class is
 *  the only handle. `.stamp`, `.side` and `.checks` below are the same case. */
const strip = (page: import('@playwright/test').Page) => page.locator('.photostrip button');
const side = (page: import('@playwright/test').Page) => page.locator('aside.side');
/** Select and Compare live in the head's More menu (Reddy, 13/10/2026). */
const moreMedia = (page: import('@playwright/test').Page) =>
  page.getByRole('button', { name: /^More actions for Media/ });
async function mediaMenu(page: import('@playwright/test').Page, item: string) {
  await moreMedia(page).click();
  await page.getByRole('menuitem', { name: item, exact: true }).click();
}
/** The kinds are a group in the band's one filter (FacetFilter): "+ Filter"
 *  opens a panel whose options count the gallery — "Photos 2", "Videos 1"
 *  (RecordPhotos.tsx, "Filter media type"). */
const kinds = (page: import('@playwright/test').Page) =>
  page.getByRole('group', { name: 'Filter media type' });
async function openKinds(page: import('@playwright/test').Page) {
  const trigger = page.getByRole('button', { name: '+ Filter' });
  if (await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click();
  return kinds(page);
}
/** The band's tally: "N of M shown". */
const tally = (page: import('@playwright/test').Page) => page.locator('.filterbar .tally');
/** The shared floating selection bar ("N items selected", its actions, Clear). */
const bar = (page: import('@playwright/test').Page) =>
  page.getByRole('group', { name: 'Act on the selected media' });
/** "Photo 1 of 3" over the stage: which item, of how many the strip shows. */
const position = (page: import('@playwright/test').Page) => page.locator('.lightbox .stage .eyebrow');

/** A file the picker will accept, sized to order. Its bytes are filler, so
 *  `probe()` cannot read a width out of it — see PNG_8x4 for the one test
 *  that is about exactly that. */
const file = (name: string, mimeType: string, bytes: number) =>
  ({ name, mimeType, buffer: Buffer.alloc(bytes, 7) });

type Picked = { name: string; mimeType: string; buffer: Buffer };

/** The header's own way in. It opens the panel and nothing else — it no longer
 *  fires a file picker directly, and it no longer relabels itself while a pick
 *  goes up, because the panel's own primary reports that now. */
const addTrigger = (page: import('@playwright/test').Page) =>
  page.getByRole('button', { name: 'Add photos, videos or recordings' });

/** The panel that files a pick (RecordPhotos.PhotoDrawer over the shared
 *  Drawer.tsx). Its heading counts the pick once there is more than one file. */
const photoDrawer = (page: import('@playwright/test').Page) =>
  page.getByRole('dialog', { name: /^Add (photos, videos or recordings|\d+ files)$/ });

/** The panel's primary. It reads "Uploading…" while the bytes are going, which
 *  is where the header button's old "Uploading…" went. */
const addButton = (page: import('@playwright/test').Page) =>
  page.getByRole('button', { name: /^(Add (it|\d+ files)|Uploading…)$/ });

/**
 * Open the panel and hand it a pick, WITHOUT sending it.
 *
 * A pick is no longer an upload. The hidden input lives inside the panel now,
 * which is the point of the panel: the files can be listed by name and size, a
 * wrong one taken out, and the one question worth asking — what these show —
 * actually asked, where `caption` used to be hard-coded empty. So the tests
 * about refusing a pick can now assert the refusal without pressing anything at
 * all, which is the real change: the refusal arrives before the press.
 *
 * The panel only exists once the photos query has answered — before that the
 * screen is one <Loading> block — and `setInputFiles` has nothing but the 10s
 * action timeout to wait for that. This suite runs several workers against the
 * same dev server, and the failure when it loses that race is a timeout on the
 * picker rather than anything about the upload. Waiting on the trigger first is
 * the same wait, said once.
 */
async function pick(page: import('@playwright/test').Page, files: Picked | Picked[]) {
  await expect(addTrigger(page)).toBeEnabled();
  await addTrigger(page).click();
  await expect(photoDrawer(page)).toBeVisible();
  await page.getByLabel('Upload media').setInputFiles(files);
}

/** Pick and send — what handing the input files used to do on its own. */
async function upload(page: import('@playwright/test').Page, files: Picked | Picked[]) {
  await pick(page, files);
  await addButton(page).click();
}

/** A real 8 × 4 PNG, 121 bytes. `filePhotos.ts probe()` decodes the picked
 *  file in the browser to file its pixel size, and a buffer of 7s decodes to
 *  nothing — so a test about the dimensions has to hand over a real image. */
const PNG_8x4 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAECAIAAAA8r+mnAAAAQElEQVR4nBXIQREAMAzDMCMpkiAZEiMpkiAZot30FOBg8KC4WLwIcWLiicaNjTeCzh+P32r1KtSpqaf/trbe+gCKLidhrW0SaAAAAABJRU5ErkJggg==',
  'base64',
);

/** The upload endpoint the seal has no seeded answer for, answered the way
 *  the gateway does — including handing back the name it was sent, so a test
 *  can prove which file of a batch each `addPhoto` is about. */
const takesUploads = (world: World) =>
  world.route(/\/api\/gateway\/storage\/files\?/, (_route, call) => ({
    json: {
      id: STORED,
      name: /filename="([^"]+)"/.exec(call.body ?? '')?.[1] ?? 'upload.jpg',
      sizeBytes: 2048,
      mimeType: 'image/jpeg',
    },
  }));

/** The full-size fetch behind Download is the ONE storage read with no query
 *  string — `fetchFileBlob` asks for /content flat, while every frame and
 *  thumbnail asks for ?format=web&thumb=N. Anchoring on that is what lets a
 *  test refuse the download without also blinding the frame, and it does not
 *  depend on how many times React's StrictMode mounted the frame. */
const DOWNLOAD_OF = (ref: string) => new RegExp(`/storage/files/${ref}/content$`);
const FRAME_OF = (ref: string) => new RegExp(`/storage/files/${ref}/content\\?.*thumb=1024`);

// ── The gallery ────────────────────────────────────────────────────────

test.describe('the gallery', () => {
  test('Compare opens two distinct items, swaps them, and the rail changes the right side', async ({ page, world }) => {
    world.set('photos', list([
      row(PHOTO.cover), row(PHOTO.well),
      row(PHOTO.cover, { id: 'compare-third', caption: 'South boundary after rain', isCover: false }),
    ]));
    await page.goto(GALLERY());
    await mediaMenu(page, 'Compare');
    await expect(page.getByText('Comparing two items')).toBeVisible();
    const panes = page.locator('.compare-pane');
    await expect(panes).toHaveCount(2);
    const before = await panes.first().locator('h3').textContent();
    await page.getByRole('button', { name: 'Swap sides' }).click();
    await expect(panes.nth(1).locator('h3')).toHaveText(before || '');
    await page.getByRole('button', { name: /South boundary after rain/ }).click();
    await expect(panes.nth(1)).toContainText('South boundary after rain');
    await mediaMenu(page, 'Exit compare');
    await expect(page.getByText('Comparing two items')).toHaveCount(0);
  });

  test('the desktop viewer contains the stage and selection rail without horizontal overflow', async ({ page, world }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    world.set('photos', list([
      row(PHOTO.clip, { fileRef: STORED, mediaKind: 'video', width: 1920, height: 1080 }),
      row(PHOTO.well),
    ]));
    await page.goto(GALLERY());
    await mediaMenu(page, 'Select');
    await strip(page).nth(0).click();

    const viewport = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.clientWidth + 1);
    const stage = await page.locator('.lightbox .stage').boundingBox();
    const rail = await side(page).boundingBox();
    expect(stage).not.toBeNull();
    expect(rail).not.toBeNull();
    expect(rail!.x).toBeGreaterThanOrEqual(stage!.x + stage!.width - 1);
    expect(rail!.x + rail!.width).toBeLessThanOrEqual(viewport.innerWidth + 1);
    await expect(bar(page).getByRole('button', { name: 'Download as .zip' })).toBeVisible();
  });

  test('every photo the record holds is in the strip, and the kind chips count the same photos', async ({ page, world }) => {
    await page.goto(GALLERY());

    // The tab's own noun heads it under the property's h1, and the counts are
    // the kind chips (one word per kind: photo, video — design.md § Property
    // tabs). The old "N photos · N video · N site visits" line is gone.
    await expect(page.getByRole('heading', { level: 1, name: 'Sy 214/2' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Media', exact: true })).toBeVisible();
    await expect(tally(page)).toHaveText('3 of 3 shown');
    // The tab counts what the tab lists — the clip too — so it agrees with
    // the tally beneath it (mediaCount, not the stills-only photoCount).
    await expect(page.getByRole('navigation', { name: 'This property' }).getByRole('link', { name: /^Media/ }))
      .toHaveText('Media3');
    await expect((await openKinds(page)).getByRole('button')).toHaveText([/^Photos\s*2$/, /^Videos\s*1$/]);
    await expect(strip(page)).toHaveCount(3);
    await expect(position(page)).toHaveText('Photo 1 of 3');
    expect(world.lastVars('photos')).toMatchObject({ id: ID.parcel, featureId: null });
  });

  test('the gallery opens on the cover, and the cover cannot be made the cover twice', async ({ page }) => {
    await page.goto(GALLERY());

    // The photo on the stage is the one the record calls its cover, so the
    // button names the state it is already in rather than offering the move.
    await expect(page.getByLabel('Title', { exact: true })).toHaveValue('The well from the gate');
    await expect(strip(page).nth(0)).toHaveAttribute('aria-current', 'true');
    await expect(page.getByRole('button', { name: 'Cover', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Make cover' })).toHaveCount(0);
  });

  test('the strip says which photo the stage is showing', async ({ page }) => {
    await page.goto(GALLERY());

    await page.getByRole('button', { name: 'Next photo' }).click();

    await expect(strip(page).nth(1)).toHaveAttribute('aria-current', 'true');
    await expect(strip(page).nth(0)).toHaveAttribute('aria-current', 'false');
    await expect(strip(page).nth(2)).toHaveAttribute('aria-current', 'false');
  });

  test('a still with no caption is named in the strip by what it is and when it was taken', async ({ page }) => {
    await page.goto(GALLERY());

    // ne-stone.jpg carries no caption at all; an aria-label of "" would leave
    // a row of unnamed buttons over alt="" images (RecordPhotos.tsx, the
    // strip). Whether it was verified on site is in the name too, in words:
    // the dot on the thumbnail is a shape and a colour and aria-hidden.
    await expect(strip(page).nth(1)).toHaveAttribute('aria-label', 'Photo 2 — boundary, 12/08/2026, verified on site');
  });

  test('the frame takes each photo’s own shape rather than sitting everything in one box', async ({ page }) => {
    await page.goto(GALLERY());

    await expect(page.locator('.frame')).toHaveCSS('aspect-ratio', '1600 / 1200');

    await strip(page).nth(2).click();

    // The portrait clip fills the stage instead of a thin strip inside 4:3.
    await expect(page.locator('.frame')).toHaveCSS('aspect-ratio', '1080 / 1920');
  });

  test('a clip is filed as a video, and the stage stands in for it with a clip placeholder', async ({ page }) => {
    await page.goto(GALLERY());

    await expect(strip(page).nth(2)).toHaveAttribute('aria-label', 'Walking the eastern edge, not verified');
    await strip(page).nth(2).click();

    // The stage names it a video, and with no stored bytes behind it the frame
    // stands in with the file it is for (a stored clip's player is the test
    // below; its button is named by the caption, PhotoImg in ui.tsx).
    await expect(position(page)).toHaveText('Video 3 of 3');
    await expect(page.locator('.frame')).toContainText('east-walk.mp4');
  });

  test('a clip with no caption is still named a video in the strip', async ({ page, world }) => {
    world.set('photos', list([row(PHOTO.cover), row(PHOTO.clip, { caption: '' })]));
    await page.goto(GALLERY());

    await expect(strip(page).nth(1)).toHaveAttribute('aria-label', 'Video 2 — visit, 02/06/2026, not verified');
  });

  test('a stored clip renders real thumbnail frames and then plays through the native video element', async ({ page, world }) => {
    world.set('photos', list([row(PHOTO.clip, { fileRef: STORED, mediaKind: 'video' })]));
    world.route(new RegExp(`/storage/files/${STORED}/content`), () => ({
      contentType: 'video/webm', body: Buffer.from(TINY_WEBM, 'base64'),
    }));
    await page.goto(GALLERY());

    await expect(page.locator(
      '.photostrip .video-thumb > img, .photostrip .video-thumb-frame.ready',
    )).toHaveCount(1);

    await mediaMenu(page, 'Select');
    await strip(page).click();
    await expect(side(page).locator(
      '.selection-preview .video-thumb > img, .selection-preview .video-thumb-frame.ready',
    )).toHaveCount(1);
    await mediaMenu(page, 'Done selecting');

    // The play button is named with its verb, not by the caption alone.
    await page.locator('.frame').getByRole('button', { name: 'Play Walking the eastern edge', exact: true }).click();
    const video = page.locator('.frame video[controls]');
    await expect(video).toHaveAttribute('aria-label', 'Walking the eastern edge');
    await expect(video).toHaveJSProperty('controls', true);
    await expect.poll(() => video.evaluate((node: HTMLVideoElement) => node.readyState))
      .toBeGreaterThanOrEqual(2);
    const asked = world.restCalls(/\/content/).map((call) => call.url);
    expect(asked.length).toBeGreaterThan(0);
    expect(asked.every((url) => !url.includes('thumb='))).toBe(true);
  });

  test('the stage asks for a frame and the strip for a thumbnail, of the same file', async ({ page, world }) => {
    world.set('photos', list([row(PHOTO.cover, { fileRef: STORED })]));
    await page.goto(GALLERY());

    await expect(page.getByRole('img', { name: 'The well from the gate' })).toBeVisible();
    // Distinct, not every call: the dev server runs React in StrictMode, which
    // mounts each effect twice, so every ref is fetched twice in this build.
    // The bare read ('') is the original, fetched once for the Details panel's
    // camera facts (photoExif.ts useExif) — not a second rendition of the frame.
    await expect.poll(() => [...new Set(world.restCalls(/\/content/).map((c) => new URL(c.url).search))].sort())
      .toEqual(['', '?format=web&thumb=1024', '?format=web&thumb=128']);
  });

  test('a photo with no bytes behind it says which file it is standing in for', async ({ page }) => {
    await page.goto(GALLERY());

    await expect(page.getByText('photo placeholder · well-gate.jpg · 1600 × 1200')).toBeVisible();
  });

  test('a clip with no bytes behind it is called a video, not a photo', async ({ page }) => {
    await page.goto(GALLERY());
    await strip(page).nth(2).click();

    await expect(page.getByText('video placeholder · east-walk.mp4 · 1080 × 1920')).toBeVisible();
    await expect(page.getByText(/photo placeholder · east-walk\.mp4/)).toHaveCount(0);
  });

  test('a photo whose size could not be read stands in for it without inventing one', async ({ page, world }) => {
    // 0 × 0 is the ordinary answer for a HEIC — no browser decodes one, which
    // is why the gateway transcodes (filePhotos.ts:22-36). The placeholder
    // names the file and stops there rather than printing "0 × 0".
    world.set('photos', list([row(PHOTO.cover, { width: 0, height: 0 })]));
    await page.goto(GALLERY());

    await expect(page.getByText('photo placeholder · well-gate.jpg', { exact: true })).toBeVisible();
    await expect(page.getByText('0 × 0')).toHaveCount(0);
  });

  test.describe('and the storage will not hand the bytes over', () => {
    // Every test below provokes a real failed fetch, which the browser logs
    // by itself; the screen's own answer to it is what is being asserted.
    test.use({ allowConsole: true });

    test('a photo that exists and could not be read says so, and lets me ask again', async ({ page, world }) => {
      let offline = true;
      world.set('photos', list([row(PHOTO.cover, { fileRef: STORED })]));
      // Only the stage's fetch is refused: the strip's thumbnail keeps its
      // bytes, so what is asserted here is the frame and nothing else.
      world.route(FRAME_OF(STORED), () =>
        (offline ? { status: 502, body: 'no' } : { contentType: 'image/jpeg', body: BLANK_JPEG }));
      await page.goto(GALLERY());

      const frame = page.locator('.frame');
      await expect(frame.getByRole('alert')).toContainText('This did not load');
      // …and it is NOT the "nothing was ever filed here" placeholder.
      await expect(page.getByText('photo placeholder · well-gate.jpg · 1600 × 1200')).toHaveCount(0);

      offline = false;
      await frame.getByRole('button', { name: 'Try again' }).click();

      await expect(page.getByRole('img', { name: 'The well from the gate' })).toBeVisible();
      await expect(frame.getByRole('alert')).toHaveCount(0);
    });

    test('a photo this account is not allowed to see says that, rather than blaming the connection', async ({ page, world }) => {
      world.set('photos', list([row(PHOTO.cover, { fileRef: STORED })]));
      world.route(FRAME_OF(STORED), () => ({ status: 403, json: { error: 'not yours' } }));
      await page.goto(GALLERY());

      await expect(page.locator('.frame').getByRole('alert'))
        .toContainText('You do not have access to this file');
    });

    test('a thumbnail that could not be read stays one button, not a button inside a button', async ({ page, world }) => {
      // DEFECT · RecordPhotos.tsx:532-537 renders <PhotoImg> INSIDE the strip's
      // own <button className="thumb">, and ui.tsx:264-276 answers a refused
      // read with a "Try again" <button>. A button inside a button is invalid
      // HTML: React logs "In HTML, <button> cannot be a descendant of <button>.
      // This will cause a hydration error.", the inner click also fires the
      // outer one, and which control a screen reader or a keyboard lands on is
      // anyone's guess. The stage is free to offer the retry — it is a plain
      // div — but the strip cannot. Owed: the thumb's failed state is a mark
      // rather than a control — ui.tsx:273 is the nested button, and PhotoImg
      // wants a `retry={false}` for callers that are themselves a button.
      test.fail();
      world.set('photos', list([row(PHOTO.cover, { fileRef: STORED })]));
      world.route(new RegExp(`/storage/files/${STORED}/content`), () => ({ status: 502, body: 'no' }));
      await page.goto(GALLERY());
      await expect(page.locator('.photostrip .photo-failed')).toBeVisible();

      // No role can express "a button nested in a button" — this is the DOM
      // fact itself, which is what makes it invalid.
      await expect(page.locator('.photostrip button button')).toHaveCount(0);
    });
  });

  test('the frame stamps the coordinates and the accuracy the camera recorded', async ({ page }) => {
    await page.goto(GALLERY());

    await expect(page.locator('.stamp')).toContainText('15.7408° N 79.2697° E ±4 m');
    await expect(page.locator('.frame').getByText('Verified on site')).toBeVisible();
  });

  test('a photo that carries no coordinates gets no stamp at all', async ({ page, world }) => {
    world.set('photos', list([row(PHOTO.clip)]));
    await page.goto(GALLERY());

    await expect(position(page)).toHaveText('Video 1 of 1');
    await expect(page.locator('.stamp')).toHaveCount(0);
    await expect(page.locator('.frame').getByText('Verified on site')).toHaveCount(0);
  });

  // The "Grouped by visit · date · N photos" line under the strip is gone; the
  // date of the item on the stage is the panel's Taken row.
  test('paging to an older item re-dates the panel beside it', async ({ page }) => {
    await page.goto(GALLERY());
    await expect(side(page)).toContainText('12/08/2026');

    await strip(page).nth(2).click();

    await expect(side(page)).toContainText('02/06/2026');
    await expect(position(page)).toHaveText('Video 3 of 3');
  });

  test('the chevrons walk the strip and stop at both ends', async ({ page }) => {
    await page.goto(GALLERY());
    // At an end the arrow is hidden rather than greyed (visibility, so the
    // frame does not shift), and each arrow names the kind it leads to.
    const back = page.getByRole('button', { name: /^Previous (photo|video)$/ });
    const on = page.getByRole('button', { name: /^Next (photo|video)$/ });

    await expect(back).toBeHidden();
    await page.getByRole('button', { name: 'Next photo' }).click();
    await expect(position(page)).toHaveText('Photo 2 of 3');
    await expect(back).toBeVisible();
    await page.getByRole('button', { name: 'Next video' }).click();
    await expect(position(page)).toHaveText('Video 3 of 3');
    await expect(on).toBeHidden();
  });

  test('the arrow keys page the gallery', async ({ page }) => {
    await page.goto(GALLERY());
    await expect(page.getByText('Photo 1 of 3')).toBeVisible();

    await page.locator('body').press('ArrowRight');
    await expect(page.getByText('Photo 2 of 3')).toBeVisible();
    await page.locator('body').press('ArrowLeft');
    await expect(page.getByText('Photo 1 of 3')).toBeVisible();
  });

  test('an arrow key inside the caption box belongs to the caret, not to the gallery', async ({ page }) => {
    await page.goto(GALLERY());
    await page.getByLabel('Title', { exact: true }).click();

    await page.getByLabel('Title', { exact: true }).press('ArrowRight');

    await expect(page.getByText('Photo 1 of 3')).toBeVisible();
  });

  test('unverified media carries no global geo or visit claims', async ({ page, world }) => {
    world.set('photos', list([row(PHOTO.clip)]));
    await page.goto(GALLERY());
    await expect(position(page)).toHaveText('Video 1 of 1');

    await expect(page.getByText('geo-stamped')).toHaveCount(0);
    await expect(page.getByText('from a Pattadar visit')).toHaveCount(0);
  });

  test('Taken prints the capture stamp as a date a person reads', async ({ page }) => {
    await page.goto(GALLERY());

    // In the owner's own clock (the suite runs in Asia/Kolkata): 06:40 UTC is
    // 12:10 IST, printed the way Activity and Notes print a time.
    await expect(side(page).getByText(/^12\/08\/2026, 12:10$/)).toBeVisible();
    await expect(side(page).getByText(/T\d\d:\d\d:\d\dZ/)).toHaveCount(0);
    await expect(side(page).getByText(/UTC/)).toHaveCount(0);
  });
});

// ── The search ─────────────────────────────────────────────────────────

test.describe('searching the strip', () => {
  test('the search and the kinds sit in one band under the head, 24px from it and from the stage', async ({ page }) => {
    await page.goto(GALLERY());
    const head = page.locator('header.sechead').filter({ has: page.getByRole('heading', { level: 2, name: 'Media', exact: true }) });
    const band = page.locator('.filterbar');
    // A head holds commands only (design.md § Page head slot 5, SC-H6).
    await expect(head.getByRole('textbox')).toHaveCount(0);
    await expect(band.getByLabel('Search photos')).toBeVisible();
    await expect(band.getByRole('button', { name: '+ Filter' })).toBeVisible();
    const [h, b, stage] = await Promise.all([head.boundingBox(), band.boundingBox(), page.locator('.lightbox').boundingBox()]);
    expect(Math.round(b!.y - (h!.y + h!.height))).toBe(24);
    expect(Math.round(stage!.y - (b!.y + b!.height))).toBe(24);
  });

  test('a kind narrows the strip and the tally, and its chip lets it go', async ({ page }) => {
    await page.goto(GALLERY());
    await (await openKinds(page)).getByRole('button', { name: /^Videos/ }).click();
    await expect(strip(page)).toHaveCount(1);
    await expect(tally(page)).toHaveText('1 of 3 shown');
    await page.getByRole('button', { name: 'Remove filter Kind Videos' }).click();
    await expect(strip(page)).toHaveCount(3);
    await expect(tally(page)).toHaveText('3 of 3 shown');
  });

  test('@phone the band is one row and the search is an icon, not a ⋮ item', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(GALLERY());
    const band = page.locator('.filterbar');
    await expect(band.getByRole('textbox')).toHaveCount(0);
    const icon = band.getByRole('button', { name: 'Search photos' });
    const [f, i] = await Promise.all([band.getByRole('button', { name: '+ Filter' }).boundingBox(), icon.boundingBox()]);
    expect(Math.abs(f!.y + f!.height / 2 - (i!.y + i!.height / 2))).toBeLessThanOrEqual(4);
    await moreMedia(page).click();
    await expect(page.getByRole('menuitem', { name: 'Search', exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await icon.click();
    await page.getByRole('textbox', { name: 'Search photos' }).fill('boundary');
    await expect(strip(page)).toHaveCount(1);
  });

  test('the search narrows the strip, and the count says how much of the gallery is left', async ({ page }) => {
    await page.goto(GALLERY());

    await page.getByLabel('Search photos').fill('boundary');

    // The position counts what the search left; the band's tally says how
    // much of the whole gallery that is.
    await expect(strip(page)).toHaveCount(1);
    await expect(position(page)).toHaveText('Photo 1 of 1');
    await expect(tally(page)).toHaveText('1 of 3 shown');
  });

  test('the search reads a capture date in the form the screen prints it', async ({ page }) => {
    await page.goto(GALLERY());

    await page.getByLabel('Search photos').fill('12/08/2026');

    await expect(strip(page)).toHaveCount(2);
    await expect(position(page)).toHaveText('Photo 1 of 2');
  });

  test('the search reads a tag, which is what the box says it is for', async ({ page }) => {
    await page.goto(GALLERY());

    // The box is labelled "Search photos by tag or date" and the empty state
    // promises tags; only the cover carries 'water'.
    await page.getByLabel('Search photos').fill('water');

    await expect(strip(page)).toHaveCount(1);
    await expect(page.getByText('Photo 1 of 1')).toBeVisible();
    await expect(page.getByLabel('Title', { exact: true })).toHaveValue('The well from the gate');
  });

  test('the count over the stage counts what the search left, not the whole gallery', async ({ page }) => {
    await page.goto(GALLERY());
    await expect(position(page)).toHaveText('Photo 1 of 3');

    await page.getByLabel('Search photos').fill('well-gate');

    await expect(strip(page)).toHaveCount(1);
    await expect(position(page)).toHaveText('Photo 1 of 1');
  });

  test('the search reads a file name too', async ({ page }) => {
    await page.goto(GALLERY());

    await page.getByLabel('Search photos').fill('east-walk');

    await expect(strip(page)).toHaveCount(1);
    await expect(position(page)).toHaveText('Video 1 of 1');
  });

  test('a search that matches nothing says what it looked in, and offers the way back', async ({ page }) => {
    await page.goto(GALLERY());

    await page.getByLabel('Search photos').fill('mangoes');

    await expect(page.getByText(/No photo matches .mangoes./)).toBeVisible();
    await expect(strip(page)).toHaveCount(0);

    // Two controls carry this name at once — the pill inside the search box and
    // the way out of the empty state. This is the second one.
    await page.locator('.blank').getByRole('button', { name: 'Clear the search' }).click();

    await expect(strip(page)).toHaveCount(3);
    await expect(page.getByLabel('Search photos')).toHaveValue('');
  });

  test('emptying the band search puts the whole strip back', async ({ page }) => {
    await page.goto(GALLERY());
    await page.getByLabel('Search photos').fill('boundary');
    await expect(strip(page)).toHaveCount(1);

    await page.getByLabel('Search photos').fill('');

    await expect(strip(page)).toHaveCount(3);
    await expect(position(page)).toHaveText('Photo 1 of 3');
  });
});

// ── Captions ───────────────────────────────────────────────────────────

test.describe('the caption', () => {
  test('a caption typed and entered is saved against the photo on the stage', async ({ page, world }) => {
    await page.goto(GALLERY());

    await page.getByLabel('Title', { exact: true }).fill('The well from the road');
    await page.getByLabel('Title', { exact: true }).press('Enter');

    await expect.poll(() => world.calls('updateCaption').length).toBe(1);
    expect(world.lastVars('updateCaption')).toMatchObject({
      photoId: PHOTO.cover, caption: 'The well from the road',
    });
  });

  test('Enter saves the caption once, and clicking away does not save it again', async ({ page, world }) => {
    await page.goto(GALLERY());

    await page.getByLabel('Title', { exact: true }).fill('Rewired in 2024');
    await page.getByLabel('Title', { exact: true }).press('Enter');
    await expect.poll(() => world.calls('updateCaption').length).toBe(1);
    await page.getByLabel('Search photos').click();

    await expect.poll(() => world.calls('updateCaption').length).toBe(1);
  });

  test('Enter on a caption I did not change writes nothing at all', async ({ page, world }) => {
    await page.goto(GALLERY());

    await page.getByLabel('Title', { exact: true }).press('Enter');
    await strip(page).nth(1).click();

    await expect(page.getByText('Photo 2 of 3')).toBeVisible();
    expect(world.calls('updateCaption')).toHaveLength(0);
  });

  test('a caption survives a reload, because the server was actually told', async ({ page, world }) => {
    const rows = [row(PHOTO.cover), row(PHOTO.well), row(PHOTO.clip)];
    world.set('photos', () => list(rows));
    world.set('updateCaption', (vars) => {
      const hit = rows.find((r) => r.id === vars.photoId);
      if (hit) hit.caption = String(vars.caption);
      return true;
    });
    await page.goto(GALLERY());

    await page.getByLabel('Title', { exact: true }).fill('The well from the road');
    await page.getByLabel('Title', { exact: true }).press('Enter');
    await expect.poll(() => world.calls('updateCaption').length).toBe(1);

    await page.reload();

    await expect(page.getByLabel('Title', { exact: true })).toHaveValue('The well from the road');
  });

  test('clicking another photo saves the caption you had just typed, against the photo you typed it on', async ({ page, world }) => {
    await page.goto(GALLERY());

    await page.getByLabel('Title', { exact: true }).fill('Half a sentence about the well');
    await strip(page).nth(1).click();

    await expect.poll(() => world.calls('updateCaption').length).toBe(1);
    expect(world.lastVars('updateCaption')).toMatchObject({
      photoId: PHOTO.cover, caption: 'Half a sentence about the well',
    });
    // and the box now holds the photo it moved to, not the words it saved
    await expect(page.getByLabel('Title', { exact: true })).toHaveValue('');
  });

  test('a caption still being typed when an upload lands is saved against the photo it was typed on', async ({ page, world }) => {
    // The words must survive the strip jumping to the newly filed photo. WHICH
    // mechanism saves them changed with the panel: adding is now a control that
    // has to be pressed, and pressing it blurs the caption box, so `commitCaption`
    // takes the words while the box is still on screen. The draft-ref flush this
    // test used to exercise — for the case where nothing blurs the box at all —
    // is now reached only by clicking another photo in the strip, which is the
    // test above. That is also why there is no "Caption saved." toast to assert
    // here any more: the toast exists because the flush saves after the box has
    // gone, and this path saves before it does.
    const rows = [row(PHOTO.cover), row(PHOTO.well), row(PHOTO.clip)];
    world.set('photos', () => list(rows));
    world.route(/\/api\/gateway\/storage\/files\?/, () => ({
      json: { id: STORED, name: 'gate.jpg', sizeBytes: 2048, mimeType: 'image/jpeg' },
    }));
    world.set('addPhoto', () => {
      rows.push(row(PHOTO.cover, {
        id: 'w-photo-new', caption: '', isCover: false, fileRef: '', fileName: 'gate.jpg', tags: [],
      }));
      return 'w-photo-new';
    });
    await page.goto(GALLERY());

    await page.getByLabel('Title', { exact: true }).fill('Half a sentence about the well');
    await upload(page, file('gate.jpg', 'image/jpeg', 2048));

    await expect.poll(() => world.calls('updateCaption').length).toBe(1);
    expect(world.lastVars('updateCaption')).toMatchObject({
      photoId: PHOTO.cover, caption: 'Half a sentence about the well',
    });
    await expect(page.getByText('Photo 4 of 4')).toBeVisible();
  });

  test('a caption the server refuses says so, and stays on the screen', async ({ page, world }) => {
    world.set('updateCaption', World.gqlError('captions are read-only on this record'));
    await page.goto(GALLERY());

    await page.getByLabel('Title', { exact: true }).fill('Not going anywhere');
    await page.getByLabel('Title', { exact: true }).press('Enter');

    await expect(page.getByRole('alert').filter({ hasText: 'That caption could not be saved. Nothing has changed.' })).toBeVisible();
    await expect(page.getByText('captions are read-only on this record')).toBeVisible();
    await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Not going anywhere');
  });

  test('a caption the server refused once can be sent again the moment it is back', async ({ page, world }) => {
    // The guard that stops Enter saving twice is `captionSent`, and a refusal
    // that left it set would have made the second Enter do nothing at all —
    // the owner pressing Enter at a screen that has already told them it
    // failed (RecordPhotos.tsx:293-295).
    const rows = [row(PHOTO.cover), row(PHOTO.well), row(PHOTO.clip)];
    world.set('photos', () => list(rows));
    world.set('updateCaption', World.gqlError('the caption store is down'));
    await page.goto(GALLERY());

    await page.getByLabel('Title', { exact: true }).fill('The well from the road');
    await page.getByLabel('Title', { exact: true }).press('Enter');
    await expect(page.getByRole('alert').filter({ hasText: 'That caption could not be saved. Nothing has changed.' })).toBeVisible();

    // The store comes back; the words are still in the box, so Enter is all
    // the owner should have to do.
    world.set('updateCaption', (vars) => {
      const hit = rows.find((r) => r.id === vars.photoId);
      if (hit) hit.caption = String(vars.caption);
      return true;
    });
    await page.getByLabel('Title', { exact: true }).press('Enter');

    await expect.poll(() => world.calls('updateCaption').length).toBe(2);
    expect(world.lastVars('updateCaption')).toMatchObject({
      photoId: PHOTO.cover, caption: 'The well from the road',
    });
    // and it really landed this time
    await page.reload();
    await expect(page.getByLabel('Title', { exact: true })).toHaveValue('The well from the road');
  });
});

// ── Cover ──────────────────────────────────────────────────────────────

test.describe('choosing the cover', () => {
  test('making a photo the cover asks the server for that photo', async ({ page, world }) => {
    await page.goto(GALLERY());
    await strip(page).nth(1).click();

    await page.getByRole('button', { name: 'Make cover' }).click();

    await expect.poll(() => world.calls('setCoverPhoto').length).toBe(1);
    expect(world.lastVars('setCoverPhoto')).toMatchObject({ photoId: PHOTO.well });
  });

  test('a cover the server will not set says so on the screen', async ({ page, world }) => {
    world.set('setCoverPhoto', false);
    await page.goto(GALLERY());
    await strip(page).nth(1).click();

    await page.getByRole('button', { name: 'Make cover' }).click();

    await expect(page.getByRole('alert').filter({
      hasText: 'That photo could not be made the cover. It may no longer be filed here.',
    })).toBeVisible();
  });

  test('a cover the server never answers about is reported as a failed write', async ({ page, world }) => {
    world.set('setCoverPhoto', World.gqlError('the cover is pinned by an open order'));
    await page.goto(GALLERY());
    await strip(page).nth(1).click();

    await page.getByRole('button', { name: 'Make cover' }).click();

    await expect(page.getByRole('alert').filter({ hasText: 'That cover photo could not be saved. Nothing has changed.' })).toBeVisible();
    await expect(page.getByText('the cover is pinned by an open order')).toBeVisible();
  });
});

// ── Selection ──────────────────────────────────────────────────────────

test.describe('selecting media', () => {
  test('selected originals download together as one ZIP', async ({ page, world }) => {
    world.set('photos', list([
      row(PHOTO.cover, { fileRef: STORED, fileName: 'north-boundary.jpg' }),
      row(PHOTO.well, { fileRef: STORED_SECOND, fileName: 'south-boundary.jpg' }),
    ]));
    world.route(DOWNLOAD_OF(STORED), () => ({
      contentType: 'image/jpeg', body: BLANK_JPEG,
    }));
    world.route(DOWNLOAD_OF(STORED_SECOND), () => ({
      delayMs: 500, contentType: 'image/jpeg', body: BLANK_JPEG,
    }));
    await page.goto(GALLERY());
    await mediaMenu(page, 'Select');
    await strip(page).nth(0).click();
    await strip(page).nth(1).click();

    const started = page.waitForEvent('download');
    await bar(page).getByRole('button', { name: 'Download as .zip' }).click();

    await expect(bar(page).getByRole('button', { name: /Preparing \d+ of 2…/ })).toBeDisabled();
    expect((await started).suggestedFilename()).toMatch(/^pattadar-media-\d{4}-\d{2}-\d{2}\.zip$/);
    await expect(bar(page).getByRole('button', { name: 'Download as .zip' })).toBeEnabled();
  });

  test('selected rows without stored originals report the refusal', async ({ page }) => {
    await page.goto(GALLERY());
    await mediaMenu(page, 'Select');
    await strip(page).nth(0).click();

    await bar(page).getByRole('button', { name: 'Download as .zip' }).click();

    await expect(page.getByRole('alert').filter({
      hasText: 'None of the selected originals could be downloaded.',
    })).toBeVisible();
  });

  test('Select, Done, Clear and bulk Delete work without leaving hidden items armed', async ({ page, world }) => {
    let rows = [row(PHOTO.cover), row(PHOTO.well), row(PHOTO.clip)];
    world.set('photos', () => list(rows));
    world.set('deletePhoto', (vars) => {
      rows = rows.filter((item) => item.id !== vars.photoId);
      return true;
    });
    await page.goto(GALLERY());

    await expect(page.getByText('They are kept for 30 days, then deleted for good.')).toHaveCount(0);
    await mediaMenu(page, 'Select');
    // The shared floating bar, as on every table: only while something is ticked.
    await expect(bar(page)).toHaveCount(0);

    await strip(page).nth(0).click();
    await strip(page).nth(2).click();
    await expect(strip(page).nth(0)).toHaveAttribute('aria-pressed', 'true');
    await expect(strip(page).nth(2)).toHaveAttribute('aria-pressed', 'true');
    await expect(bar(page).getByRole('status')).toHaveText('2 items selected');
    await expect(bar(page).getByRole('button')).toHaveText(['Download as .zip', 'Delete selected', 'Clear']);

    await bar(page).getByRole('button', { name: 'Delete selected' }).click();
    await expect(page.getByText('They are kept for 30 days, then deleted for good.')).toBeVisible();
    expect(world.calls('deletePhoto')).toHaveLength(0);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(bar(page).getByRole('status')).toHaveText('2 items selected');

    await bar(page).getByRole('button', { name: 'Clear', exact: true }).click();
    await expect(bar(page)).toHaveCount(0);
    await strip(page).nth(0).click();
    await (await openKinds(page)).getByRole('button', { name: /^Videos/ }).click();
    await expect(bar(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Clear all' }).click();
    await page.keyboard.press('Escape');
    await strip(page).nth(0).click();
    await mediaMenu(page, 'Done selecting');
    await moreMedia(page).click();
    await expect(page.getByRole('menuitem', { name: 'Select', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(strip(page).nth(0)).not.toHaveAttribute('aria-pressed');

    await mediaMenu(page, 'Select');
    await strip(page).nth(0).click();
    await strip(page).nth(2).click();
    await bar(page).getByRole('button', { name: 'Delete selected' }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();

    await expect.poll(() => world.calls('deletePhoto').map((call) => call.vars.photoId))
      .toEqual([PHOTO.cover, PHOTO.clip]);
    await expect(strip(page)).toHaveCount(1);
    await moreMedia(page).click();
    await expect(page.getByRole('menuitem', { name: 'Select', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
  });
});

// ── Delete ─────────────────────────────────────────────────────────────

test.describe('deleting a photo', () => {
  test('deleting asks a second time before anything is taken', async ({ page, world }) => {
    await page.goto(GALLERY());

    await page.getByRole('button', { name: 'Delete The well from the gate' }).click();

    await expect(side(page).getByRole('button', { name: 'Delete', exact: true })).toBeVisible();
    await expect(side(page).getByRole('button', { name: 'Cancel', exact: true })).toBeVisible();
    expect(world.calls('deletePhoto')).toHaveLength(0);
  });

  test('cancelling leaves the photo where it is', async ({ page, world }) => {
    await page.goto(GALLERY());
    await page.getByRole('button', { name: 'Delete The well from the gate' }).click();

    await side(page).getByRole('button', { name: 'Cancel', exact: true }).click();

    await expect(page.getByRole('button', { name: 'Delete The well from the gate' })).toBeVisible();
    await expect(strip(page)).toHaveCount(3);
    expect(world.calls('deletePhoto')).toHaveLength(0);
  });

  test('a confirmed delete takes the photo out of the strip', async ({ page, world }) => {
    let rows = [row(PHOTO.cover), row(PHOTO.well), row(PHOTO.clip)];
    world.set('photos', () => list(rows));
    world.set('deletePhoto', (vars) => {
      rows = rows.filter((r) => r.id !== vars.photoId);
      return true;
    });
    await page.goto(GALLERY());

    await page.getByRole('button', { name: 'Delete The well from the gate' }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();

    await expect(strip(page)).toHaveCount(2);
    expect(world.lastVars('deletePhoto')).toMatchObject({ photoId: PHOTO.cover });
    await expect(page.getByText('Photo 1 of 2')).toBeVisible();
  });

  test('the thirty-day retention appears only after Delete is chosen', async ({ page }) => {
    await page.goto(GALLERY());
    await expect(side(page).getByText('It is kept for 30 days, then deleted for good.')).toHaveCount(0);

    await page.getByRole('button', { name: 'Delete The well from the gate' }).click();
    await expect(side(page).getByText('It is kept for 30 days, then deleted for good.')).toBeVisible();
  });

  test('a delete in flight says so, and the confirm closes itself once it lands', async ({ page, world }) => {
    world.set('deletePhoto', World.slow(900, true));
    await page.goto(GALLERY());
    await page.getByRole('button', { name: 'Delete The well from the gate' }).click();

    await side(page).getByRole('button', { name: 'Delete', exact: true }).click();

    // The shared confirmation's busy word, on the one button that would send
    // it again (PropertyActions.tsx ConfirmDialog).
    await expect(side(page).getByRole('button', { name: 'Working…' })).toBeDisabled();
    // Back to the one-click state: nothing is left armed to delete a second
    // photo with the next click.
    await expect(page.getByRole('button', { name: 'Delete The well from the gate' })).toBeVisible();
    await expect(side(page).getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
  });

  test('a delete the server never answers about is reported once, in the confirmation', async ({ page, world }) => {
    world.set('deletePhoto', World.gqlError('that photo is held by an open dispute'));
    await page.goto(GALLERY());

    await page.getByRole('button', { name: 'Delete The well from the gate' }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();

    await expect(page.getByRole('dialog').getByText('This item could not be deleted. It is still here.')).toBeVisible();
    // One report, in owner words: no second toast and no server text.
    await expect(page.getByText('Deleting that photo could not be saved. Nothing has changed.')).toHaveCount(0);
    await expect(page.getByText('that photo is held by an open dispute')).toHaveCount(0);
    await expect(strip(page)).toHaveCount(3);
  });

  test('a delete the server refuses says the photo may already be gone', async ({ page, world }) => {
    world.set('deletePhoto', false);
    await page.goto(GALLERY());

    await page.getByRole('button', { name: 'Delete The well from the gate' }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();

    await expect(page.getByRole('alert').filter({
      hasText: 'This item could not be deleted. Reload the gallery and try again.',
    })).toBeVisible();
    await expect(strip(page)).toHaveCount(3);
  });
});

// ── Tags ───────────────────────────────────────────────────────────────

test.describe('tagging a photo', () => {
  test('the tag row carries the photo’s own tags and nothing the screen already says', async ({ page }) => {
    // Three automatic tags used to lead the row — the kind, the property's
    // title and the visit date — each a fact already on screen (the eyebrow,
    // the record's h1, the stamp), so the owner's own tag came fourth.
    await page.goto(GALLERY());

    const tags = side(page).locator('.tag');
    await expect(tags).toHaveText(['water']);
    await expect(side(page).getByRole('button', { name: 'Add a tag' })).toBeVisible();
  });

  test('a typed tag is filed against the photo you are looking at', async ({ page, world }) => {
    await page.goto(GALLERY());

    await page.getByRole('button', { name: 'Add a tag' }).click();
    await page.getByLabel('New tag').fill('fence line');
    await page.getByLabel('New tag').press('Enter');

    await expect.poll(() => world.calls('setTag').length).toBe(1);
    expect(world.lastVars('setTag')).toMatchObject({
      entityType: 'photo', entityId: PHOTO.cover, tag: 'fence line', on: true,
    });
    await expect(page.getByRole('button', { name: 'Add a tag' })).toBeFocused();
  });

  test('Escape abandons a tag and files nothing', async ({ page, world }) => {
    await page.goto(GALLERY());

    await page.getByRole('button', { name: 'Add a tag' }).click();
    await page.getByLabel('New tag').fill('not this one');
    await page.getByLabel('New tag').press('Escape');

    await expect(page.getByLabel('New tag')).toHaveCount(0);
    expect(world.calls('setTag')).toHaveLength(0);
  });

  test('a tag the photo already carries is not written a second time', async ({ page, world }) => {
    await page.goto(GALLERY());

    await page.getByRole('button', { name: 'Add a tag' }).click();
    await page.getByLabel('New tag').fill('water');
    await page.getByLabel('New tag').press('Enter');

    await expect(page.getByLabel('New tag')).toHaveCount(0);
    expect(world.calls('setTag')).toHaveLength(0);
  });

  test('a tag I typed and then clicked away from is filed rather than thrown away', async ({ page, world }) => {
    await page.goto(GALLERY());

    await page.getByRole('button', { name: 'Add a tag' }).click();
    await page.getByLabel('New tag').fill('fence line');
    await page.getByLabel('Search photos').click();

    await expect.poll(() => world.calls('setTag').length).toBe(1);
    expect(world.lastVars('setTag')).toMatchObject({ entityId: PHOTO.cover, tag: 'fence line', on: true });
    await expect(page.getByLabel('New tag')).toHaveCount(0);
  });

  test('a tag the server refuses says so rather than pretending it was filed', async ({ page, world }) => {
    world.set('setTag', World.gqlError('tags are frozen while the dispute is open'));
    await page.goto(GALLERY());

    await page.getByRole('button', { name: 'Add a tag' }).click();
    await page.getByLabel('New tag').fill('fence line');
    await page.getByLabel('New tag').press('Enter');

    await expect(page.getByRole('alert').filter({
      hasText: 'That tag could not be saved. Nothing has changed.',
    })).toBeVisible();
    await expect(page.getByText('tags are frozen while the dispute is open')).toBeVisible();
  });

  test('a tag left empty files nothing', async ({ page, world }) => {
    await page.goto(GALLERY());

    await page.getByRole('button', { name: 'Add a tag' }).click();
    await page.getByLabel('New tag').press('Enter');

    await expect(page.getByLabel('New tag')).toHaveCount(0);
    expect(world.calls('setTag')).toHaveLength(0);
  });
});

// ── The facts under the caption ────────────────────────────────────────

test.describe('what the panel says about the file', () => {
  test('a photo that came in on no order gets no order row invented for it', async ({ page }) => {
    await page.goto(GALLERY());

    // Every row is drawn now, and a value the photo does not hold reads
    // "not set" (design.md § Property tabs, "Missing reads as missing"). The
    // order rows say so rather than inventing one. `.kv` has no role of its own.
    const rowOf = (k: string) => side(page).locator('.kv > div').filter({ has: page.locator('.k', { hasText: new RegExp(`^${k}$`) }) });
    await expect(rowOf('Visit')).toContainText('not set');
    await expect(rowOf('Service order')).toContainText('not set');
    await expect(side(page).getByRole('link', { name: /ORD-/ })).toHaveCount(0);
  });

  test('the file facts state only what the camera actually recorded', async ({ page, world }) => {
    world.set('photos', list([row(PHOTO.clip)]));
    await page.goto(GALLERY());

    // The clip carries no coordinates, so Where says "not set" rather than
    // 0.0000, 0.0000 as if it were a place.
    const where = side(page).locator('.kv > div').filter({ has: page.locator('.k', { hasText: /^Where$/ }) });
    await expect(where).toContainText('not set');
    await expect(side(page).getByText('0.0000')).toHaveCount(0);
  });

  test('the coordinates in the panel are the ones stamped on the frame', async ({ page }) => {
    await page.goto(GALLERY());

    await expect(side(page).locator('.kv .v').filter({ hasText: '15.7408, 79.2697' })).toBeVisible();
    await expect(side(page).getByText('Shankar Reddy', { exact: true })).toBeVisible();
    await expect(side(page).getByText('12/08/2026, 12:10').first()).toBeVisible();
  });

  test('a photo that came in on an order links to where that order is printed', async ({ page, world }) => {
    world.set('photos', list([row(PHOTO.cover, { orderRef: 'ORD-2291' })]));
    await page.goto(GALLERY());

    const link = side(page).getByRole('link', { name: 'ORD-2291 ›' });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', `/properties/${ID.parcel}/services`);
  });
});

// ── Upload ─────────────────────────────────────────────────────────────

test.describe('adding a photo', () => {
  test('the picker lives in the panel, and takes video and recordings as well as stills', async ({ page }) => {
    // The input used to be mounted on the page at all times, because handing it
    // files WAS the upload. It is inside the panel now, so there is nothing on
    // the page to hand a file to until somebody has asked to add one — and the
    // limit is stated in there, beside the drop zone, where the choosing happens.
    await page.goto(GALLERY());

    await expect(page.getByLabel('Upload media')).toHaveCount(0);
    await addTrigger(page).click();

    const panel = photoDrawer(page);
    await expect(panel).toBeVisible();
    await expect(panel.locator('.eyebrow')).toHaveText('Sy 214/2 · Media');
    await expect(panel).toContainText('Photos up to 15.0 MB; videos and recordings up to 50.0 MB.');

    const picker = page.getByLabel('Upload media');
    await expect(picker).toHaveCount(1);
    await expect(picker).toHaveAttribute('accept', 'image/*,video/*,audio/*');
    await expect(picker).toHaveAttribute('multiple', '');
    // Nothing picked, so there is nothing to send.
    await expect(addButton(page)).toBeDisabled();
  });

  test('an oversize file is refused by name, before a byte of it leaves the browser', async ({ page, world }) => {
    // The refusal arrives BEFORE the press now, which is the real gain from the
    // panel: the file is sized against the limit on its own row the moment it is
    // picked, and the primary simply will not send. It used to be a sentence
    // printed after a press that had already been made.
    await page.goto(GALLERY());

    await pick(page, file('east-field.jpg', 'image/jpeg', 16 * 1024 * 1024));

    const panel = photoDrawer(page);
    await expect(panel.locator('.rows.boxed > div').filter({ hasText: 'east-field.jpg' }))
      .toContainText('16.0 MB · over the 15.0 MB limit');
    await expect(panel.getByRole('alert')).toContainText('Remove that one to upload the rest.');
    await expect(addButton(page)).toBeDisabled();
    expect(world.restCalls(/storage/)).toHaveLength(0);
    expect(world.calls('addPhoto')).toHaveLength(0);
  });

  test('two oversize files are refused together, each named and sized', async ({ page, world }) => {
    await page.goto(GALLERY());

    await pick(page, [
      file('east-field.jpg', 'image/jpeg', 16 * 1024 * 1024),
      file('north-field.jpg', 'image/jpeg', 17 * 1024 * 1024),
    ]);

    // Each on its own row, against its own size — an owner cannot tell which of
    // their files was the problem from one sentence naming both.
    const rows = photoDrawer(page).locator('.rows.boxed > div');
    await expect(rows.filter({ hasText: 'east-field.jpg' })).toContainText('16.0 MB · over the');
    await expect(rows.filter({ hasText: 'north-field.jpg' })).toContainText('17.0 MB · over the');
    await expect(photoDrawer(page).getByRole('alert')).toContainText('Remove those to upload the rest.');
    expect(world.restCalls(/storage/)).toHaveLength(0);
  });

  test('a refusal goes when the file it is about comes out of the pick', async ({ page, world }) => {
    // The reason goes when its cause does. Paging the strip used to be the way
    // out of it; the panel is modal, so the way out is to take the file out —
    // which is also the only thing that would actually fix it.
    takesUploads(world);
    await page.goto(GALLERY());
    await pick(page, [
      file('gate.jpg', 'image/jpeg', 2048),
      file('east-field.jpg', 'image/jpeg', 16 * 1024 * 1024),
    ]);
    const panel = photoDrawer(page);
    await expect(panel.getByRole('alert')).toBeVisible();
    await expect(addButton(page)).toBeDisabled();

    await panel.getByRole('button', { name: 'Take east-field.jpg out' }).click();

    await expect(panel.getByRole('alert')).toHaveCount(0);
    // And the one that was always fine can now go.
    await expect(addButton(page)).toBeEnabled();
    await addButton(page).click();
    await expect.poll(() => world.calls('addPhoto').length).toBe(1);
    expect(world.lastVars('addPhoto')).toMatchObject({ fileName: 'gate.jpg' });
  });

  test('one oversize file refuses the whole pick, so nothing is half filed', async ({ page, world }) => {
    await page.goto(GALLERY());

    await pick(page, [
      file('gate.jpg', 'image/jpeg', 2048),
      file('east-field.jpg', 'image/jpeg', 16 * 1024 * 1024),
    ]);

    // The good one is not sent on its own, which is the fault this test was
    // written for: the sizing happens across the pick, not inside the loop.
    await expect(addButton(page)).toBeDisabled();
    expect(world.restCalls(/storage/)).toHaveLength(0);
    expect(world.calls('addPhoto')).toHaveLength(0);
  });

  test('a pick is filed uncaptioned, and the gallery lands on it with the caption box ready', async ({ page, world }) => {
    // "What these show" is optional, and left empty it files empty — `caption`
    // used to be hard-coded to '' with nothing to type it into at all, so this is
    // the floor, not the feature. The gallery still walks to the photograph that
    // landed, where the per-photo Caption box can correct any one of them.
    const rows = [row(PHOTO.cover), row(PHOTO.well), row(PHOTO.clip)];
    world.set('photos', () => list(rows));
    takesUploads(world);
    // One id per file, named after it. Pushing the same id twice makes
    // `lastAdded` ambiguous — the gallery walks to the FIRST row carrying it — so
    // a two-file pick could not say which photograph it had landed on.
    world.set('addPhoto', (vars) => {
      const id = `w-photo-${String(vars.fileName).replace(/\W/g, '-')}`;
      rows.push(row(PHOTO.cover, {
        id, caption: '', isCover: false, fileRef: '',
        fileName: String(vars.fileName), tags: [],
      }));
      return id;
    });
    await page.goto(GALLERY());

    await upload(page, [
      file('gate.jpg', 'image/jpeg', 2048),
      file('fence.jpg', 'image/jpeg', 4096),
    ]);

    await expect.poll(() => world.calls('addPhoto').length).toBe(2);
    expect(world.calls('addPhoto').map((c) => c.vars.caption)).toEqual(['', '']);

    // The box is on the LAST photograph that arrived, and typing into it writes
    // against that photograph and no other.
    await expect(page.getByText('Photo 5 of 5')).toBeVisible();
    await page.getByLabel('Title', { exact: true }).fill('North bund after the rain');
    await page.getByLabel('Title', { exact: true }).press('Enter');

    await expect.poll(() => world.calls('updateCaption').length).toBe(1);
    expect(world.lastVars('updateCaption')).toMatchObject({
      photoId: 'w-photo-fence-jpg', caption: 'North bund after the rain',
    });
  });

  test('the caption asked for once is written onto every file in the pick', async ({ page, world }) => {
    // The panel's one question, and the reason it is asked before the bytes go
    // rather than after: a pick is almost always one visit, and `caption` used to
    // be hard-coded '' with nowhere at all to say what the photographs showed.
    const rows = [row(PHOTO.cover)];
    world.set('photos', () => list(rows));
    takesUploads(world);
    await page.goto(GALLERY());

    await pick(page, [
      file('gate.jpg', 'image/jpeg', 2048),
      file('fence.jpg', 'image/jpeg', 4096),
    ]);
    // Two files, so the panel counts them — in its heading and on its primary.
    await expect(photoDrawer(page).getByRole('heading', { name: 'Add 2 files' })).toBeVisible();
    await photoDrawer(page).getByLabel('What these show').fill('  North bund after the rain  ');
    await page.getByRole('button', { name: 'Add 2 files' }).click();

    await expect.poll(() => world.calls('addPhoto').length).toBe(2);
    expect(world.calls('addPhoto').map((c) => c.vars.caption))
      .toEqual(['North bund after the rain', 'North bund after the rain']);
  });

  test('a second pick is added to the gallery rather than replacing the first', async ({ page, world }) => {
    // Somebody photographing a visit has the files in two folders. Each pick is
    // filed as it arrives, so the second cannot displace the first — which is what
    // a panel holding one pick at a time had to be careful about.
    const rows = [row(PHOTO.cover), row(PHOTO.well), row(PHOTO.clip)];
    world.set('photos', () => list(rows));
    takesUploads(world);
    let n = 0;
    world.set('addPhoto', (vars) => {
      n += 1;
      rows.push(row(PHOTO.cover, {
        id: `w-photo-new-${n}`, caption: '', isCover: false, fileRef: '',
        fileName: String(vars.fileName), tags: [],
      }));
      return `w-photo-new-${n}`;
    });
    await page.goto(GALLERY());

    await upload(page, file('gate.jpg', 'image/jpeg', 2048));
    await expect(strip(page)).toHaveCount(4);

    await upload(page, file('fence.jpg', 'image/jpeg', 4096));
    await expect(strip(page)).toHaveCount(5);
    expect(world.calls('addPhoto').map((c) => c.vars.fileName))
      .toEqual(['gate.jpg', 'fence.jpg']);
  });

  test('the drop zone on a record with nothing filed opens the same picker the header does', async ({ page }) => {
    // One drop zone stands in for the gallery on a record with nothing on it —
    // the shortest path there is from a camera roll to a filed, dated
    // photograph. It replaced six near-identical tiles that all did this same
    // thing; one action belongs on the screen once, not six times.
    await page.goto(`/properties/${ID.plot}/media`);

    const tiles = page.locator('.droptile');
    // Exactly one drop zone — not six near-identical tiles that all did this
    // same thing. It opens the same panel the header does (the invitation, not a
    // second way of filing), and the picker is in there with it.
    await expect(tiles).toHaveCount(1);
    await expect(tiles.first()).toHaveAttribute('aria-haspopup', 'dialog');
    await expect(page.getByLabel('Upload media')).toHaveCount(0);
    await tiles.first().click();
    await expect(photoDrawer(page)).toBeVisible();
    await expect(page.getByLabel('Upload media')).toHaveCount(1);
  });

  test('files dropped onto the zone arrive in the panel already picked, not thrown away', async ({ page, world }) => {
    // The point of dragging onto the zone is that the choosing is already done,
    // so the drop carries its files INTO the panel rather than opening an empty
    // one and asking again. What the panel is still for is the caption and the
    // last look before any bytes leave.
    world.route(/\/api\/gateway\/storage\/files\?/, () => ({
      json: { id: STORED, name: 'north-bund.jpg', sizeBytes: 2048, mimeType: 'image/jpeg' },
    }));
    await page.goto(`/properties/${ID.plot}/media`);
    const tile = page.locator('.droptile').first();
    await expect(tile).toBeVisible();

    // A real drop, built in the page: DataTransfer is the only way to hand files
    // to a `drop` handler, and Playwright cannot drag from outside the browser.
    await tile.evaluate((el) => {
      const dt = new DataTransfer();
      dt.items.add(new File([new Uint8Array(2048)], 'north-bund.jpg', { type: 'image/jpeg' }));
      el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    });

    // The panel opens holding it, named and sized, with nothing sent yet.
    const panel = photoDrawer(page);
    await expect(panel).toBeVisible();
    await expect(panel.locator('.rows.boxed > div').filter({ hasText: 'north-bund.jpg' }))
      .toContainText('0.0 MB');
    expect(world.calls('addPhoto')).toHaveLength(0);

    await panel.getByLabel('What these show').fill('North bund after the rain');
    await addButton(page).click();

    await expect.poll(() => world.calls('addPhoto').length).toBe(1);
    expect(world.lastVars('addPhoto')).toMatchObject({
      fileName: 'north-bund.jpg', caption: 'North bund after the rain',
    });
  });

  test('a picked photo is uploaded, filed against this record, and the gallery moves to it', async ({ page, world }) => {
    const rows = [row(PHOTO.cover), row(PHOTO.well), row(PHOTO.clip)];
    world.set('photos', () => list(rows));
    world.route(/\/api\/gateway\/storage\/files\?/, () => ({
      json: { id: STORED, name: 'gate.jpg', sizeBytes: 2048, mimeType: 'image/jpeg' },
    }));
    world.set('addPhoto', (vars) => {
      rows.push(row(PHOTO.cover, {
        id: 'w-photo-new', caption: '', category: '', isCover: false,
        fileRef: '', fileName: String(vars.fileName), mediaKind: String(vars.mediaKind),
        capturedAt: String(vars.capturedAt), tags: [],
      }));
      return 'w-photo-new';
    });
    await page.goto(GALLERY());

    await upload(page, file('gate.jpg', 'image/jpeg', 2048));

    await expect(strip(page)).toHaveCount(4);
    await expect(page.getByText('Photo 4 of 4')).toBeVisible();
    expect(world.lastVars('addPhoto')).toMatchObject({
      recordId: ID.parcel, fileRef: STORED, fileName: 'gate.jpg', mediaKind: 'photo', caption: '',
    });
    // The stamp is the file's own mtime — nothing in a browser upload proves
    // when the shutter fell (filePhotos.ts stampOf).
    expect(String(world.lastVars('addPhoto').capturedAt)).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    expect(world.restCalls(/\/api\/gateway\/storage\/files\?/)).toHaveLength(1);
  });

  test('a picked clip is filed as a video', async ({ page, world }) => {
    world.route(/\/api\/gateway\/storage\/files\?/, () => ({
      json: { id: STORED, name: 'walk.mp4', sizeBytes: 4096, mimeType: 'video/mp4' },
    }));
    await page.goto(GALLERY());

    await upload(page, file('walk.mp4', 'video/mp4', 4096));

    await expect.poll(() => world.calls('addPhoto').length).toBe(1);
    expect(world.lastVars('addPhoto')).toMatchObject({ fileName: 'walk.mp4', mediaKind: 'video' });
  });

  test('the panel says the upload is running, and will not send the same pick twice', async ({ page, world }) => {
    world.route(/\/api\/gateway\/storage\/files\?/, () => ({
      delayMs: 1500,
      json: { id: STORED, name: 'gate.jpg', sizeBytes: 2048, mimeType: 'image/jpeg' },
    }));
    await page.goto(GALLERY());

    // Said on the control that was pressed, which is now the panel's own primary
    // rather than the header button. It reports it AND refuses a second press,
    // which is what stops one pick being filed twice.
    await upload(page, file('gate.jpg', 'image/jpeg', 2048));

    const working = page.getByRole('button', { name: 'Uploading…' });
    await expect(working).toBeVisible();
    await expect(working).toBeDisabled();
    // The file cannot be taken out from under a write that is already going.
    await expect(page.getByRole('button', { name: 'Take gate.jpg out' })).toBeDisabled();

    // And it lands: the panel closes itself, which is what says the pick went in.
    await expect(photoDrawer(page)).toHaveCount(0, { timeout: 15_000 });
    await expect(addTrigger(page)).toBeEnabled();
    expect(world.calls('addPhoto')).toHaveLength(1);
  });

  test('bytes that went up but could not be filed say exactly that', async ({ page, world }) => {
    world.route(/\/api\/gateway\/storage\/files\?/, () => ({
      json: { id: STORED, name: 'gate.jpg', sizeBytes: 2048, mimeType: 'image/jpeg' },
    }));
    world.set('addPhoto', '');
    await page.goto(GALLERY());

    await upload(page, file('gate.jpg', 'image/jpeg', 2048));

    await expect(page.getByRole('alert').filter({
      hasText: 'The photo was uploaded but could not be added to this property.',
    })).toBeVisible();
  });

  test('picking two photos at once files both of them, and the gallery lands on the last', async ({ page, world }) => {
    const rows = [row(PHOTO.cover), row(PHOTO.well), row(PHOTO.clip)];
    world.set('photos', () => list(rows));
    takesUploads(world);
    world.set('addPhoto', (vars) => {
      const id = `w-photo-${String(vars.fileName)}`;
      rows.push(row(PHOTO.cover, {
        id, caption: '', isCover: false, fileRef: '', fileName: String(vars.fileName), tags: [],
      }));
      return id;
    });
    await page.goto(GALLERY());

    await upload(page, [
      file('gate.jpg', 'image/jpeg', 2048),
      file('fence.jpg', 'image/jpeg', 4096),
    ]);

    await expect(strip(page)).toHaveCount(5);
    await expect(page.getByText('Photo 5 of 5')).toBeVisible();
    expect(world.calls('addPhoto').map((c) => c.vars.fileName)).toEqual(['gate.jpg', 'fence.jpg']);
    expect(world.restCalls(/\/api\/gateway\/storage\/files\?/)).toHaveLength(2);
  });

  test('a pick that stops partway says how far it got and keeps only the files still to send', async ({ page, world }) => {
    const rows = [row(PHOTO.cover), row(PHOTO.well), row(PHOTO.clip)];
    world.set('photos', () => list(rows));
    takesUploads(world);
    let refused = false;
    world.set('addPhoto', (vars) => {
      // The second file is refused once, then filed when it is sent again.
      if (vars.fileName === 'fence.jpg' && !refused) { refused = true; return ''; }
      const id = `w-photo-${String(vars.fileName)}`;
      rows.push(row(PHOTO.cover, {
        id, caption: '', isCover: false, fileRef: '', fileName: String(vars.fileName), tags: [],
      }));
      return id;
    });
    await page.goto(GALLERY());

    await upload(page, [
      file('gate.jpg', 'image/jpeg', 2048),
      file('fence.jpg', 'image/jpeg', 4096),
    ]);

    await expect(photoDrawer(page).getByRole('alert')).toContainText(
      '1 of 2 files were added. The photo was uploaded but could not be added to this property.');
    await expect(photoDrawer(page).getByText('gate.jpg')).toHaveCount(0);
    await expect(photoDrawer(page).getByText('fence.jpg')).toBeVisible();

    await addButton(page).click();

    await expect(photoDrawer(page)).toHaveCount(0);
    expect(world.calls('addPhoto').map((c) => c.vars.fileName)).toEqual(['gate.jpg', 'fence.jpg', 'fence.jpg']);
    await expect(strip(page)).toHaveCount(5);
  });

  test('the size filed with a photo is the photo’s own, read off the file before it goes up', async ({ page, world }) => {
    takesUploads(world);
    await page.goto(GALLERY());

    await upload(page, { name: 'corner.png', mimeType: 'image/png', buffer: PNG_8x4 });

    await expect.poll(() => world.calls('addPhoto').length).toBe(1);
    // filePhotos.ts probe() decodes the picked file in the browser; 0 × 0 is
    // what a HEIC gives, and would be what a broken probe gives for every file.
    expect(world.lastVars('addPhoto')).toMatchObject({ fileName: 'corner.png', width: 8, height: 4 });
  });

  test('a photo that lands outside the search I am typing is shown, not hidden by it', async ({ page, world }) => {
    const rows = [row(PHOTO.cover), row(PHOTO.well), row(PHOTO.clip)];
    world.set('photos', () => list(rows));
    takesUploads(world);
    world.set('addPhoto', (vars) => {
      rows.push(row(PHOTO.cover, {
        id: 'w-photo-new', caption: '', isCover: false, fileRef: '',
        fileName: String(vars.fileName), tags: [],
      }));
      return 'w-photo-new';
    });
    await page.goto(GALLERY());
    await page.getByLabel('Search photos').fill('well-gate');
    await expect(strip(page)).toHaveCount(1);

    await upload(page, file('gate.jpg', 'image/jpeg', 2048));

    // An upload that arrives into a filtered strip reads as an upload that
    // did nothing (RecordPhotos.tsx:227-234): the query is dropped instead.
    await expect(page.getByLabel('Search photos')).toHaveValue('');
    await expect(strip(page)).toHaveCount(4);
    await expect(page.getByText('Photo 4 of 4')).toBeVisible();
  });

  test('the first photo on a record that has none opens the gallery on it', async ({ page, world }) => {
    const rows: Row[] = [];
    world.set('photos', () => list(rows, { visitCount: rows.length, subject: 'Sy 88' }));
    takesUploads(world);
    world.set('addPhoto', (vars) => {
      rows.push(row(PHOTO.cover, {
        id: 'w-photo-first', caption: '', isCover: true, fileRef: '',
        fileName: String(vars.fileName), tags: [],
      }));
      return 'w-photo-first';
    });
    await page.goto(`/properties/${ID.plot}/media`);
    // One dashed drop zone stands in for the gallery on a record with nothing
    // filed — not a grey sentence, and not the six near-identical tiles it
    // replaced, all of which opened this same drawer.
    await expect(page.locator('.droptile')).toHaveCount(1);

    await upload(page, file('first.jpg', 'image/jpeg', 2048));

    await expect(strip(page)).toHaveCount(1);
    await expect(page.getByText('Photo 1 of 1')).toBeVisible();
    await expect(page.locator('.droptile')).toHaveCount(0);
    expect(world.lastVars('addPhoto')).toMatchObject({ recordId: ID.plot, fileName: 'first.jpg' });
  });

  test('a record the server refuses to file against raises the write failure', async ({ page, world }) => {
    world.route(/\/api\/gateway\/storage\/files\?/, () => ({
      json: { id: STORED, name: 'gate.jpg', sizeBytes: 2048, mimeType: 'image/jpeg' },
    }));
    world.set('addPhoto', World.gqlError('this record is archived'));
    await page.goto(GALLERY());

    await upload(page, file('gate.jpg', 'image/jpeg', 2048));

    // The pick reports once, in the drawer, which stays open with the file.
    await expect(page.getByRole('alert').filter({
      hasText: 'The photo was uploaded but could not be added to this property.',
    })).toBeVisible();
    await expect(page.getByText('That photo could not be saved. Nothing has changed.')).toHaveCount(0);
  });
});

test.describe('an upload storage refuses', () => {
  // The defect below is an unhandled promise rejection, which the console
  // guard would otherwise report instead of the missing message.
  test.use({ allowConsole: true });

  test('an upload the storage refuses tells the owner what happened to their file', async ({ page, world }) => {
    // Was a DEFECT (test.fail) — fixed: the refusal is caught and said. The
    // original diagnosis is kept below for the record. filePhotos.ts:77-80. `uploadToDrive` THROWS on a refusal
    // (storage.ts:58-65) and never returns null, so the `if (!node)` guard on
    // line 80 is dead code and the throw escapes `file()` — which the caller
    // invokes as `void onPick(picked)` (RecordPhotos.tsx:404). The spinner
    // clears in the `finally`, `err` is never set, and the owner is left
    // looking at a gallery that silently did not take their photo, with the
    // reason in the console as an unhandled rejection. Owed: the same red line
    // every other refusal on this screen gets — STORAGE_OFFLINE_MSG, or the
    // gateway's own sentence — and it has to name the upload, because from
    // where the owner is sitting nothing at all happened.
    world.route(/\/api\/gateway\/storage\/files\?/, () => ({ status: 503, json: { error: 'storage is down' } }));
    await page.goto(GALLERY());

    await upload(page, file('gate.jpg', 'image/jpeg', 2048));

    await expect(page.getByRole('alert').filter({ hasText: /upload/i })).toBeVisible();
  });
});

// ── Download ───────────────────────────────────────────────────────────

test.describe('taking a copy', () => {
  test('a stored photo downloads under the name it was filed with', async ({ page, world }) => {
    world.set('photos', list([row(PHOTO.cover, { fileRef: STORED })]));
    await page.goto(GALLERY());
    await expect(page.getByRole('img', { name: 'The well from the gate' })).toBeVisible();

    const started = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download' }).click();

    expect((await started).suggestedFilename()).toBe('well-gate.jpg');
  });

  test.describe('and storage will not hand the file over', () => {
    // A refused fetch is a real HTTP 502, which the browser logs to the console
    // by itself. Provoking it is the point of the test below.
    test.use({ allowConsole: true });

    test('a download the storage refuses says so, and says the photo is untouched', async ({ page, world }) => {
      world.set('photos', list([row(PHOTO.cover, { fileRef: STORED })]));
      // Only the query-less read — the full-size original — is refused. The
      // frame keeps its bytes from the seed, and nothing here depends on how
      // many times StrictMode remounted the frame.
      world.route(DOWNLOAD_OF(STORED), () => ({ status: 502, body: 'no' }));
      await page.goto(GALLERY());
      await expect(page.getByRole('img', { name: 'The well from the gate' })).toBeVisible();

      await page.getByRole('button', { name: 'Download' }).click();

      await expect(page.getByRole('alert').filter({
        hasText: 'That file could not be downloaded. Storage could not be reached.',
      })).toBeVisible();
      // The photo is still on the stage: nothing about it was changed by a
      // failed copy.
      await expect(page.getByRole('img', { name: 'The well from the gate' })).toBeVisible();
    });

    test('a download that failed on one photo stops accusing the next one', async ({ page, world }) => {
      world.set('photos', list([row(PHOTO.cover, { fileRef: STORED }), row(PHOTO.well, { fileRef: STORED })]));
      world.route(DOWNLOAD_OF(STORED), () => ({ status: 502, body: 'no' }));
      await page.goto(GALLERY());
      await page.getByRole('button', { name: 'Download' }).click();
      await expect(page.getByRole('alert').filter({ hasText: 'could not be downloaded' })).toBeVisible();

      await strip(page).nth(1).click();

      await expect(page.getByRole('alert').filter({ hasText: 'could not be downloaded' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Download' })).toBeEnabled();
    });
  });

  test('a download that takes a moment says it is preparing, and refuses a second click', async ({ page, world }) => {
    world.set('photos', list([row(PHOTO.cover, { fileRef: STORED })]));
    world.route(DOWNLOAD_OF(STORED), () => ({
      delayMs: 1200, contentType: 'image/jpeg', body: BLANK_JPEG,
    }));
    await page.goto(GALLERY());
    await expect(page.getByRole('img', { name: 'The well from the gate' })).toBeVisible();

    const started = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download' }).click();

    await expect(page.getByRole('button', { name: 'Preparing…' })).toBeDisabled();
    expect((await started).suggestedFilename()).toBe('well-gate.jpg');
    await expect(page.getByRole('button', { name: 'Download' })).toBeEnabled();
  });

  test('a photo whose fileRef is a legacy file name offers a Download that can never work', async ({ page }) => {
    // DEFECT · RecordPhotos.tsx:722-723. `disabled={!isStorageRef(p.fileRef)}`
    // is right — a pre-migration row holds a file NAME where a node id should
    // be (storage.ts:13) and there is nothing to fetch — but the control says
    // nothing about why. This screen deleted "Pin on map" and "Share" for
    // exactly this reason and wrote a sentence in their place
    // (RecordPhotos.tsx:765). Owed: the same treatment — the button says the
    // original is not in storage, or it is not drawn for that row.
    test.fail();
    await page.goto(GALLERY());

    await expect(page.getByRole('button', { name: 'Download' })).toBeDisabled();
    await expect(side(page).getByText(/original|not in storage|cannot be downloaded/i)).toBeVisible();
  });
});

// ── What this screen does not do ───────────────────────────────────────

test.describe('what this screen says it cannot do', () => {
  // The explanatory sentences that stood in for unbuilt controls are gone with
  // the panel's redesign (no dead controls, and none explained in their place —
  // RecordPhotos.tsx, the note where "Set their place by hand" stood). What is
  // still owed is that the dead controls stay gone.
  test('it draws no buttons for sharing or pinning that answer nothing', async ({ page }) => {
    await page.goto(GALLERY());

    await expect(side(page).getByLabel('Title', { exact: true })).toBeVisible();
    await expect(side(page).getByRole('button', { name: /Pin on map|^Share/ })).toHaveCount(0);
  });

  test('the panel’s actions name the photo in front of me, not the whole strip', async ({ page }) => {
    await page.goto(GALLERY());

    await expect(side(page).getByRole('button', { name: 'Delete The well from the gate' })).toBeVisible();
  });
});

test.describe('leaving', () => {
  // Media is a tab of the property's frame now (RecordHead.tsx TABS: the
  // full-bleed gallery with its own back arrow "dropped you out of the
  // record"), so the way back is the frame's breadcrumb.
  test('the breadcrumb takes me back to the property', async ({ page }) => {
    await page.goto(GALLERY());

    await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Sy 214/2' }).click();

    await expect(page).toHaveURL(new RegExp(`/properties/${ID.parcel}$`));
  });
});

// ── Nothing to show ────────────────────────────────────────────────────

test.describe('a record with nothing photographed', () => {
  test('says so, and still offers the first upload', async ({ page }) => {
    await page.goto(`/properties/${ID.plot}/media`);

    // One drop zone stands in for the gallery (the empty state), under the
    // tab's own heading.
    await expect(page.getByRole('button', { name: /^Drop photos, videos or recordings here/ })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Media', exact: true })).toBeVisible();
    // The header control is named for what it does rather than for the machinery
    // behind it, and what it does now is open the panel.
    await expect(addTrigger(page)).toBeEnabled();
    await expect(strip(page)).toHaveCount(0);
  });

  test('counts nothing rather than leaving the count blank', async ({ page }) => {
    await page.goto(`/properties/${ID.plot}/media`);

    // The tab strip prints 0 (RecordHead.tsx); a filter or search over
    // nothing would lead nowhere, so no band is drawn.
    await expect(page.getByRole('navigation', { name: 'This property' }).getByRole('link', { name: /^Media/ }))
      .toHaveText('Media0');
    await expect(page.getByRole('button', { name: '+ Filter' })).toHaveCount(0);
    await expect(page.getByLabel('Search photos')).toHaveCount(0);
  });
});

test.describe('while and when the read fails', () => {
  test('the gallery holds its shape while the photos are still on their way', async ({ page, world }) => {
    world.set('photos', World.never());
    await page.goto(GALLERY());

    // Scoped to the page's own main: the shell keeps a live region mounted at
    // all times for the jump search (Shell.tsx:348-357), so a bare `status`
    // is two elements on every screen in this app and says nothing about
    // whether THIS screen held its shape.
    const waiting = page.locator('main').getByRole('status');
    await expect(waiting).toBeVisible();
    await expect(waiting).toHaveAttribute('aria-label', 'Loading these photos');
    // and it must not claim the record is empty while it is still asking
    await expect(page.getByRole('button', { name: /^Drop photos, videos or recordings here/ })).toHaveCount(0);
  });

  test('a slow list arrives rather than giving up', async ({ page, world }) => {
    world.set('photos', World.slow(1200, seeded()));
    await page.goto(GALLERY());
    await expect(page.locator('main [role="status"][aria-busy="true"][aria-label="Loading these photos"]')).toBeVisible();

    await expect(strip(page)).toHaveCount(3);
  });

  test('photos that do not come back say so, with the reason, and offer to try again', async ({ page, world }) => {
    world.set('photos', World.gqlError('the photo store is down'));
    await page.goto(GALLERY());

    await expect(page.getByRole('alert').filter({ hasText: 'These photos did not load' })).toBeVisible();
    await expect(page.getByText('the photo store is down')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try again' })).toBeEnabled();
  });

  test('Try again actually asks again, and the gallery arrives', async ({ page, world }) => {
    world.set('photos', World.gqlError('the photo store is down'));
    await page.goto(GALLERY());
    await expect(page.getByRole('alert').filter({ hasText: 'These photos did not load' })).toBeVisible();
    const asked = world.calls('photos').length;

    // The store comes back between the failure and the click.
    world.set('photos', seeded());
    await page.getByRole('button', { name: 'Try again' }).click();

    await expect(strip(page)).toHaveCount(3);
    await expect(tally(page)).toHaveText('3 of 3 shown');
    expect(world.calls('photos').length).toBeGreaterThan(asked);
  });

  test('the wait says which of this screen’s things has not arrived', async ({ page, world }) => {
    // Was a DEFECT (test.fail) — fixed: the skeleton's status region is named
    // for the photos, the same noun the failure uses ("These photos did not load").
    world.set('photos', World.never());
    await page.goto(GALLERY());

    await expect(page.locator('main').getByRole('status', { name: /photos/i })).toBeVisible();
  });

  test.describe('and the failure is the transport rather than the answer', () => {
    // A 503 is a real failed request, which the browser logs by itself.
    test.use({ allowConsole: true });

    test('a transport failure is told apart from a refusal, and still says to check the connection and try again', async ({ page, world }) => {
      world.set('photos', World.httpError(503));
      await page.goto(GALLERY());

      await expect(page.getByRole('alert').filter({ hasText: 'These photos did not load' })).toBeVisible();
      await expect(page.getByText('GraphQL HTTP 503')).toBeVisible();
      await expect(page.getByText(/Check your connection and try again/)).toBeVisible();
    });
  });
});

// ── Scoped to a feature: W14 ───────────────────────────────────────────

test.describe('scoped to a feature', () => {
  const FEATURE_URL = `/properties/${ID.parcel}/media?feature=${FEATURE.well}`;

  test('the screen counts only that feature’s photos, and says which ones are proven', async ({ page, world }) => {
    await page.goto(FEATURE_URL);

    await expect.poll(() => world.asked('photos')).toBe(true);
    expect(world.lastVars('photos')).toMatchObject({ id: ID.parcel, featureId: FEATURE.well });
    // The heading names the feature and its line counts its items; which are
    // proven is said per item, in each thumbnail's name.
    await expect(page.getByRole('heading', { level: 2, name: /^Media of / })).toBeVisible();
    await expect(page.locator('header.sechead p.note')).toHaveText('1 item');
    await expect(strip(page)).toHaveCount(1);
    await expect(strip(page).nth(0)).toHaveAttribute('aria-label', /, verified on site$/);
  });

  test('a verified photo says how far from the pin it was taken', async ({ page }) => {
    await page.goto(FEATURE_URL);

    await expect(page.getByRole('heading', { name: 'Why this is Sy 214/2' })).toBeVisible();
    // The drawing's name is the same verdict the Location check gives, with the
    // distance measured from the saved pin (RecordPhotos.tsx WhereDrawing).
    await expect(page.getByRole('img', { name: /^Where the photo was taken: Inside the boundary · \d+ m from the saved pin$/ }))
      .toBeVisible();
  });

  test('the checklist says who took it and whether the clock agreed, and only what holds', async ({ page }) => {
    // Rewritten 28/09/2026. Every line used to be printed for every photo,
    // true or not, with the colour of an aria-hidden icon the only thing
    // telling them apart. Only the claims the row supports are drawn now,
    // each in words (RecordPhotos.tsx Provenance `claims`). Two are gone
    // because nothing behind them is recorded — an uploader's role and "ID
    // verified" — and "paid", because no payment moves while the provider is
    // a stub (design.md § App vocabulary).
    await page.goto(FEATURE_URL);

    const checks = page.locator('.checks');
    await expect(checks).toContainText("Time stamp matches Pattadar's clock");
    await expect(checks).toContainText('Taken by Shankar Reddy');
    // A file hash proves the file is unchanged since it was filed.
    await expect(checks).toContainText('Not changed since it was added');
    await expect(checks.locator(':scope > div')).toHaveCount(3);

    // The seeded well photo came from a phone upload, not the app's camera,
    // and on no order — so neither line is drawn, rather than drawn grey.
    await expect(checks).not.toContainText('Taken in the Pattadar app');
    await expect(checks).not.toContainText('service order');
    for (const unbacked of ['ID verified', 'caretaker', 'paid']) {
      await expect(checks).not.toContainText(unbacked);
    }
  });

  test('the checklist does not print half a sentence about facts the row does not carry', async ({ page }) => {
    // Was a DEFECT marker: both lines were interpolated from the row and then
    // greyed out when the row was empty, so a photo with no order read "Came
    // in on order , a paid site visit" and one with no hash read "Unedited
    // since capture  sha256 …". Fixed 28/09/2026: a line the row cannot
    // support is not drawn. The seeded photo carries orderRef '' — the
    // ordinary case: most photos are not the deliverable of a paid job.
    await page.goto(FEATURE_URL);
    await expect(page.locator('.checks')).toContainText('Taken by Shankar Reddy');

    await expect(page.locator('.checks')).not.toContainText('Came in on');
    await expect(page.locator('.checks')).not.toContainText('sha256 …');
  });

  test('the checklist does not tick a box the row says is false', async ({ page, world }) => {
    // Was a DEFECT marker: the seeded clip — `deviceClockOk: false`, `source:
    // 'upload'`, no hash — was read out word for word as "Device clock matched
    // our server to the second" and "Shot inside Pattadar, not picked from a
    // gallery", the opposite of its own row, with only an aria-hidden icon's
    // colour saying otherwise. Fixed 28/09/2026: a line the row cannot support
    // is not drawn at all. A clip no longer gets the photo checklist at all
    // (its card says "Location and metadata checks do not apply."), so the
    // clip's facts ride on a photo here.
    world.set('photos', list([row(PHOTO.cover, {
      verified: false, source: 'upload', deviceClockOk: false, sha256: '',
    })]));
    await page.goto(FEATURE_URL);
    await expect(page.getByText('Not shot in the app. Not checked against the saved pin.')).toBeVisible();

    // `.checks` is a bare grid of divs — no role, no name; the sentences
    // inside it are the assertion.
    const checks = page.locator('.checks');
    await expect(checks).toContainText('Taken by Shankar Reddy');
    await expect(checks).not.toContainText('device clock');
    await expect(checks).not.toContainText('Taken in the Pattadar app');
    await expect(checks).not.toContainText('sha256');
  });

  test('a photo shot in the app but not checked on site is not said to come from outside it', async ({ page, world }) => {
    world.set('photos', list([row(PHOTO.cover, { source: 'app', verified: false })]));
    await page.goto(FEATURE_URL);

    await expect(page.getByText('Not checked against the saved pin.', { exact: true })).toBeVisible();
    await expect(page.getByText(/Not shot in the app/)).toHaveCount(0);
    // Nor by the advisory card beside it, which used to say "Filed from
    // outside the app" of every unchecked photo.
    await expect(page.getByRole('heading', { name: '1 photo here proves nothing' })).toBeVisible();
    await expect(page.getByText(/from outside the app/)).toHaveCount(0);
    await expect(page.getByText('Dated 12/08/2026. Not checked against the saved pin.')).toBeVisible();
    await expect(page.locator('.checks')).toContainText('Taken in the Pattadar app, not picked from a gallery');
  });

  test('a photo that came in on no order is not said to be evidence on one', async ({ page }) => {
    await page.goto(FEATURE_URL);

    // The checklist claims an order only when the row carries one.
    await expect(page.getByRole('heading', { name: 'Why this is Sy 214/2' })).toBeVisible();
    await expect(side(page).getByText(/Came in on service order/)).toHaveCount(0);
    await expect(side(page).getByText(/the evidence on order/)).toHaveCount(0);
  });

  test('an unproven photo claims nothing, and says exactly why', async ({ page, world }) => {
    // A still, not the clip: location checks do not apply to a video, so the
    // provenance panel is drawn only for a photo (RecordPhotos.tsx).
    world.set('photos', list([row(PHOTO.well, { featureId: FEATURE.well, verified: false, source: 'upload' })]));
    await page.goto(FEATURE_URL);

    await expect(page.getByRole('img', { name: /^Where the photo was taken/ })).toHaveCount(0);
    await expect(page.getByText(/Not checked against the saved pin/).first()).toBeVisible();
    await expect(strip(page).nth(0)).toHaveAttribute('aria-label', /, not verified$/);
  });

  test('a forwarded photo is named as forwarded rather than lumped in with the rest', async ({ page, world }) => {
    world.set('photos', list([row(PHOTO.well, { featureId: FEATURE.well, verified: false, source: 'forwarded' })]));
    await page.goto(FEATURE_URL);

    await expect(side(page).getByText('Forwarded, not shot here. Not checked against the saved pin.')).toBeVisible();
  });

  test('the advisory card reads the rows rather than the comp it was drawn from', async ({ page, world }) => {
    world.set('photos', list([row(PHOTO.well, { featureId: FEATURE.well, verified: false, source: 'upload' })]));
    await page.goto(FEATURE_URL);

    await expect(page.getByRole('heading', { name: '1 photo here proves nothing' })).toBeVisible();
    await expect(page.getByText('Filed from outside the app, dated 12/08/2026. Not checked against the saved pin.')).toBeVisible();
  });

  test('two forwarded photos are described as forwarded, across the days they were taken', async ({ page, world }) => {
    world.set('photos', list([
      row(PHOTO.well, { featureId: FEATURE.well, verified: false, source: 'forwarded', capturedAt: '2026-06-02T05:10:00Z' }),
      row(PHOTO.well, { id: 'w-photo-fwd', featureId: FEATURE.well, verified: false, source: 'forwarded', capturedAt: '2026-07-04T05:00:00Z' }),
    ]));
    await page.goto(FEATURE_URL);

    await expect(page.getByRole('heading', { name: '2 photos here prove nothing' })).toBeVisible();
    await expect(page.getByText(/^Forwarded, not shot here, dated 02\/06\/2026 – 04\/07\/2026\. Not checked against the saved pin\.$/)).toBeVisible();
  });

  test('Leave as is puts the advisory away for this visit, and not for good', async ({ page, world }) => {
    world.set('photos', list([row(PHOTO.well, { featureId: FEATURE.well, verified: false, source: 'upload' })]));
    await page.goto(FEATURE_URL);
    await expect(page.getByRole('heading', { name: '1 photo here proves nothing' })).toBeVisible();

    await page.getByRole('button', { name: 'Leave as is' }).click();
    await expect(page.getByRole('heading', { name: '1 photo here proves nothing' })).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole('heading', { name: '1 photo here proves nothing' })).toBeVisible();
  });

  // "Set their place by hand" was a disabled control for something the app
  // cannot do; it is not drawn until it can (RecordPhotos.tsx, the note where
  // it stood; web zero-state standard: no dead controls). Its test went with it.
  test('no control is drawn for placing a photo by hand, which is not built', async ({ page, world }) => {
    world.set('photos', list([row(PHOTO.well, { featureId: FEATURE.well, verified: false, source: 'upload' })]));
    await page.goto(FEATURE_URL);
    await expect(page.getByRole('heading', { name: '1 photo here proves nothing' })).toBeVisible();

    await expect(page.getByRole('button', { name: 'Set their place by hand' })).toHaveCount(0);
  });

  /** The header's one control into the order flow. Everything the flow needs
   *  to open on the service already chosen rides in the query string: the
   *  service key, the step, the brief this screen used to compose as `params`,
   *  and the provenance it used to compose as `note` — built by orderHref, the
   *  one way into ordering, so it opens on the services step with this
   *  property already chosen. */
  const ASK_HREF = `/order?for=${ID.parcel}&step=services`
    + '&service=site_visit&a.check=General+condition&why=photos';

  test('asking for a fresh photo takes me into the order flow with the visit, the brief and the reason already stated', async ({ page }) => {
    await page.goto(FEATURE_URL);

    const ask = page.getByRole('link', { name: 'Ask for a fresh photo' });
    await expect(ask).toBeVisible();
    await expect(ask).toHaveAttribute('href', ASK_HREF);
  });

  test('nothing is ordered from this screen, so there is nothing here that can be half filed', async ({ page, world }) => {
    await page.goto(FEATURE_URL);

    await page.getByRole('link', { name: 'Ask for a fresh photo' }).click();

    // Straight into the one order flow, this property already chosen.
    await expect(page).toHaveURL(/\/order\?for=w-sy-214-2&step=services&service=site_visit&a\.check=General\+condition&why=photos$/);
    // The mutation went, and with it the pending label, the "Visit ordered"
    // state that outlived the feature it was ordered for, and the two
    // sentences a refusal needed. A link cannot be refused.
    expect(world.calls('orderService')).toHaveLength(0);
    await expect(page.getByRole('button', { name: /Ordering…|Visit ordered/ })).toHaveCount(0);
  });

  test('following it opens the order flow on the site visit, with what to check already answered', async ({ page, world }) => {
    world.set('orders', []);
    await page.goto(FEATURE_URL);

    await page.getByRole('link', { name: 'Ask for a fresh photo' }).click();

    await expect(page.getByRole('heading', { name: 'Choose the services' })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Choose Site visit' })).toBeChecked();

    // `a.check` is the answer this header used to post as params. The flow
    // prefills the service's own field with it.
    await page.getByRole('button', { name: 'Next: review' }).click();

    await expect(page.getByRole('heading', { name: 'Review and place' })).toBeVisible();
    await expect(page.getByLabel('What to check')).toHaveValue('General condition');
    expect(world.calls('orderService')).toHaveLength(0);
  });

  test('a feature with nothing photographed says so without calling the whole record empty', async ({ page }) => {
    await page.goto(`/properties/${ID.parcel}/media?feature=${FEATURE.fence}`);

    await expect(page.getByText('No photos of Sy 214/2 yet')).toBeVisible();
    await expect(page.getByRole('link', { name: 'All photos on this property' }))
      .toHaveAttribute('href', `/properties/${ID.parcel}/media`);
    // Not the whole property's empty state: that is the drop zone.
    await expect(page.getByRole('button', { name: /^Drop photos, videos or recordings here/ })).toHaveCount(0);
  });

  test('an unlabelled feature gets a headline rather than a hole', async ({ page, world }) => {
    world.set('photos', list([row(PHOTO.cover)], { subject: '' }));
    await page.goto(FEATURE_URL);

    await expect(page.getByRole('heading', { name: 'Why this is evidence' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Media of this feature' })).toBeVisible();
  });

  test('an unlabelled feature with nothing filed still names what is empty', async ({ page, world }) => {
    world.set('photos', list([], { subject: '' }));
    await page.goto(FEATURE_URL);

    await expect(page.getByText('No photos of this feature yet')).toBeVisible();
  });

  test('deleting a photo that is doing three jobs names every one of them first', async ({ page, world }) => {
    // W14: one file is the cover, the well's current condition and the
    // evidence on an order. delete_photo removes the row, so all three go —
    // said in the confirmation, before anything is taken (photoUses.ts).
    world.set('photos', list([row(PHOTO.cover, { orderRef: 'ORD-2291' })]));
    await page.goto(GALLERY());

    await page.getByRole('button', { name: 'Delete The well from the gate' }).click();
    const confirm = page.getByRole('dialog', { name: 'Delete this photo?' });
    await expect(confirm).toContainText(
      'This photo is also this property’s cover, a feature’s current condition on the Site features tab and the evidence on order ORD-2291.');
    await expect(confirm).toContainText('deleting it here takes it off all of them too');
    expect(world.calls('deletePhoto')).toHaveLength(0);
  });

  // The visual legend under the strip is gone; each dot is a ✓ glyph or
  // nothing, and what it means is said in words in its thumbnail's name.
  test('the strip says in words what its dots mean when the scope is a feature', async ({ page, world }) => {
    world.set('photos', list([row(PHOTO.cover, { featureId: FEATURE.well }), row(PHOTO.well, { featureId: FEATURE.well, verified: false, source: 'upload' })]));
    await page.goto(FEATURE_URL);

    await expect(strip(page).nth(0)).toHaveAttribute('aria-label', /, verified on site$/);
    await expect(strip(page).nth(1)).toHaveAttribute('aria-label', /, not verified$/);
  });

  test('the dots in the strip are the ones the names describe', async ({ page, world }) => {
    world.set('photos', list([
      row(PHOTO.cover, { featureId: FEATURE.well }),
      row(PHOTO.clip, { featureId: FEATURE.well }),
    ]));
    await page.goto(FEATURE_URL);

    // A legend is only worth drawing if the marks it explains track the rows.
    // The marks are aria-hidden spans (RecordPhotos.tsx:538) — `.src` / `.src
    // no` is the whole of what they are, so the class is the assertion.
    await expect(strip(page).nth(0).locator('.src')).not.toHaveClass(/\bno\b/);
    await expect(strip(page).nth(1).locator('.src')).toHaveClass(/\bno\b/);
    await expect(strip(page).nth(0)).toHaveAttribute('aria-label', /, verified on site$/);
    await expect(strip(page).nth(1)).toHaveAttribute('aria-label', /, not verified$/);
  });

  test('the feature scope offers no search box, because the strip is already the feature', async ({ page }) => {
    await page.goto(FEATURE_URL);

    // Something positive first: the absence below is true of a page that has not
    // drawn, and the old second half of this test ("no Upload button") was
    // passing vacuously once that control was renamed.
    await expect(page.getByRole('link', { name: 'Ask for a fresh photo' })).toBeVisible();
    await expect(page.getByLabel('Search photos')).toHaveCount(0);
    // Adding is still offered here, and deliberately: the panel files against the
    // record, so it is the same control on every scope of this screen.
    await expect(addTrigger(page)).toBeEnabled();
  });
});
