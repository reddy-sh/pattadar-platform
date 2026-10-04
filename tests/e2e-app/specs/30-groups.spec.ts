/**
 * Families & groups (/app/groups, w360/pages/Groups.tsx) after the safeguard
 * redesign: the inactivity safeguard is its own tab with a glyph-and-word
 * status, the Members table has the shared filter, and the page head carries
 * Print beside an outlined New group.
 *
 * The screen reads through the root schema, not `web { … }`, so every answer
 * here is a `root.<field>` set before `goto`.
 */
import { test, expect, World } from '../fixtures/harness';
import type { Locator, Page } from '@playwright/test';

const FAMILY = 'grp-family';
const FIRM = 'grp-firm';

/** A full GroupRow (groupsData.ts GroupRow), whole until a test takes
 *  something away. */
const group = (over: Record<string, unknown> = {}) => ({
  id: FAMILY, ownerUserId: 'u-1', type: 'family', name: 'Telukutla Family', description: '',
  myRole: 'Head', landCount: 0, memberCount: 2, totalExtent: 0, totalShare: 0,
  createdAt: '2026-09-01T00:00:00Z', parcelCount: 0, propertyCount: 0, headName: 'You',
  lastActiveAt: '2026-09-20T00:00:00Z', inactivityStage: 'active', inactivityNextAt: '',
  inactivityLastOutcome: '', inactiveContactGaps: 0,
  ...over,
});

const member = (over: Record<string, unknown>) => ({
  id: 'm', ownerUserId: 'u-1', name: '', relation: '', gender: '', dob: '', phone: '', email: '',
  bio: '', photo: '', groupId: FAMILY, role: '', isSelf: false, fatherId: '', motherId: '',
  spouseId: '', isBeneficiary: false, sharePct: 0, kind: '', status: '', inviteStatus: '',
  inviteToken: '', phoneVerified: false, emailVerified: false, inactivityEmailConsent: false,
  parcelId: '', presentAddress: '', aadhaarMasked: '', isMinor: false, guardianName: '',
  guardianContact: '', maritalStatus: '', spouseName: '', spouseStatus: '', spouseContact: '',
  createdAt: '2026-09-01T00:00:00Z', heirConfirmed: '', heirNote: '',
  ...over,
});

const SELF = member({ id: 'm-self', name: 'Ravi Kumar', isSelf: true, role: 'head', relation: 'self' });
// Server-masked, as the API sends it: the screen only ever formats this.
const WIFE = member({
  id: 'm-wife', name: 'Lakshmi', relation: 'spouse', email: 'lakshmi@example.com',
  emailVerified: true, status: 'verified', aadhaarMasked: 'XXXXXXXX1234',
});
const SON = member({
  id: 'm-son', name: 'Arjun', relation: 'son', email: 'arjun@example.com', status: 'pending',
  inviteToken: 'tok-son',
});
const MEMBERS = [SELF, WIFE, SON];

function seed(world: World, groups = [group({ inactiveContactGaps: 1 })]) {
  world.set('root.groups', groups);
  world.set('root.members', MEMBERS);
  world.set('root.groupActivity', []);
  world.set('root.notifiers', []);
}

/** The one contact-gap sentence (groupsView contactGapSentence), shared by the
 *  Safeguard tab and the notifier editor. */
const GAP_SENTENCE = '1 member needs a verified email and safeguard-email consent before everyone can be contacted.';

const tabs = (page: Page) => page.getByRole('tablist', { name: /detail$/ }).getByRole('tab');

/** The text a tab draws. The status word is in its accessible name and the
 *  glyph's tooltip, never on screen. */
const drawnText = (tab: Locator) => tab.innerText();

test.describe('the inactivity safeguard', () => {
  test('a family\'s safeguard is its own tab, and while a member has no verified email it says it needs action', async ({ page, world }) => {
    seed(world);
    await page.goto(`/app/groups?g=${FAMILY}`);
    await expect(tabs(page)).toHaveText([/^Members/, /^Properties/, /^Safeguard/, /^Activity/]);
    const safeguard = page.getByRole('tab', { name: 'Safeguard, needs action' });
    await expect(safeguard).toBeVisible();
    // Only the glyph is drawn: the word is the glyph's tooltip and, through
    // the button's aria-label, the end of the tab's name, never visible text.
    await expect(safeguard.locator('[title="needs action"]')).toHaveText('!');
    expect(await drawnText(safeguard)).not.toContain('needs action');
    await expect(page.getByRole('tab', { name: /^Members/ })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('heading', { name: 'Inactivity safeguard' })).toHaveCount(0);

    await safeguard.click();
    await expect(safeguard).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveURL(/[?&]tab=safeguard/);
    await expect(page.getByRole('heading', { level: 2, name: 'Inactivity safeguard' })).toBeVisible();
    const panel = page.getByRole('tabpanel');
    await expect(panel.getByText('Active', { exact: true })).toBeVisible();
    await expect(panel.getByText('You were last active 20/09/2026')).toBeVisible();
    await expect(panel.getByText(GAP_SENTENCE)).toBeVisible();
    // The explanation lives behind the ⓘ now, not as a standing sentence.
    await expect(page.getByText('After 6 months of inactivity', { exact: false })).toBeHidden();
    // Still announced to a screen reader, as 11-vault checks its ⓘ.
    await expect(page.getByRole('button', { name: 'About Inactivity safeguard' }))
      .toHaveAccessibleDescription('After 6 months of inactivity: a reminder to the head, then verified family emails.');
  });

  test('with every contact verified and the stage active, the tab reads set and no warning is drawn', async ({ page, world }) => {
    seed(world, [group()]);
    await page.goto(`/app/groups?g=${FAMILY}&tab=safeguard`);
    const tab = page.getByRole('tab', { name: 'Safeguard, set' });
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    await expect(tab.locator('[title="set"]')).toHaveText('✓');
    expect(await drawnText(tab)).not.toContain('set');
    await expect(page.getByText(/safeguard-email consent before everyone can be contacted/)).toHaveCount(0);
    await expect(page.getByText('Delivery not confirmed', { exact: false })).toHaveCount(0);
  });

  test('a reminder stage reads as a warning, not a danger', async ({ page, world }) => {
    seed(world, [group({ inactivityStage: 'reminder_1' })]);
    await page.goto(`/app/groups?g=${FAMILY}&tab=safeguard`);
    await expect(page.getByRole('tab', { name: 'Safeguard, needs action' })).toBeVisible();
    const chip = page.getByRole('tabpanel').getByText('First reminder sent', { exact: true });
    await expect(chip).toBeVisible();
    // The tone is only in the class: no role or text tells warn from danger.
    await expect(chip).toHaveClass(/\bschip\b.*\bwarn\b/);
  });

  test('a partnership has no Safeguard tab, and a deep link to one lands on Members', async ({ page, world }) => {
    seed(world, [group({ id: FIRM, type: 'partnership', name: 'Reddy & Sons' })]);
    await page.goto(`/app/groups?g=${FIRM}&tab=safeguard`);
    await expect(tabs(page)).toHaveText([/^Members/, /^Properties/, /^Activity/]);
    await expect(page.getByRole('tab', { name: /^Members/ })).toHaveAttribute('aria-selected', 'true');
  });

  test('a link to the Safeguard tab opens on it, and choosing another group lands on Members', async ({ page, world }) => {
    seed(world, [group({ inactiveContactGaps: 1 }), group({ id: 'grp-two', name: 'Second Family' })]);
    await page.goto(`/app/groups?g=${FAMILY}&tab=safeguard`);
    await expect(page.getByRole('heading', { name: 'Inactivity safeguard' })).toBeVisible();
    await page.getByRole('button', { name: /Second Family/ }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Second Family' })).toBeVisible();
    await expect(page.getByRole('tab', { name: /^Members/ })).toHaveAttribute('aria-selected', 'true');
    await expect(page).not.toHaveURL(/tab=/);
  });

  test('@phone the Safeguard tab fits a phone and the page never scrolls sideways', async ({ page, world }) => {
    seed(world);
    await page.goto(`/app/groups?g=${FAMILY}`);
    const safeguard = page.getByRole('tab', { name: 'Safeguard, needs action' });
    await safeguard.click();
    await expect(page.getByRole('heading', { level: 2, name: 'Inactivity safeguard' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Configure notifiers' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('Arrow, Home and End move between the four tabs', async ({ page, world }) => {
    seed(world);
    await page.goto(`/app/groups?g=${FAMILY}`);
    const members = page.getByRole('tab', { name: /^Members/ });
    await members.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: /^Properties/ })).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Safeguard, needs action' })).toBeFocused();
    await page.keyboard.press('End');
    await expect(page.getByRole('tab', { name: /^Activity/ })).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Home');
    await expect(members).toBeFocused();
    await expect(members).toHaveAttribute('aria-selected', 'true');
  });

});

/** Lakshmi with safeguard-email consent: the one family email that can be
 *  contacted. The default seed's Lakshmi is verified but has not consented. */
const CONSENTING_WIFE = { ...WIFE, inactivityEmailConsent: true };

/** The editor reads `notifiers` and `members` in ONE document, and the World
 *  routes a document by its first field (`root.notifiers`) and answers only
 *  that field. So the editor's answer is the whole response body, served
 *  through httpError's `body` with a 200 — still the sealed switchboard, and
 *  still counted in `world.calls('root.notifiers')`. */
function notifierSettings(world: World, members: unknown[], notifiers: unknown[] = []) {
  world.set('root.notifiers', World.httpError(200, { data: { notifiers, members } }));
}
const TOGETHER = 'Email all family members with a verified email together';
const IN_ORDER = 'Email selected family members in order';
const SAVE = 'Save notification settings';

async function openEditor(page: Page) {
  await page.goto(`/app/groups?g=${FAMILY}&tab=safeguard`);
  await page.getByRole('button', { name: 'Configure notifiers' }).click();
  const drawer = page.getByRole('dialog', { name: 'Inactivity notifications' });
  await expect(drawer).toBeVisible();
  return drawer;
}

test.describe('the inactivity notifications editor', () => {
  test('opens in the shared drawer with its subject, Save first, and focus on the checked option', async ({ page, world }) => {
    seed(world);
    notifierSettings(world, [SELF, CONSENTING_WIFE, SON]);
    const drawer = await openEditor(page);
    await expect(drawer).toHaveClass(/\bdrawer\b/);
    await expect(drawer.locator('.eyebrow')).toHaveText('Telukutla Family · Safeguard');
    await expect(drawer).toHaveAccessibleDescription('Contacted only after the head misses every activity reminder.');
    const foot = drawer.locator('.drawerfoot button');
    await expect(foot).toHaveText([SAVE, 'Cancel']);
    // The one filled action in the panel is Save.
    await expect(drawer.locator('.btn.primary')).toHaveCount(1);
    await expect(drawer.getByRole('radio', { name: TOGETHER })).toBeChecked();
    await expect(drawer.getByRole('radio', { name: TOGETHER })).toBeFocused();

    // The borderless picker: a top hairline, a 13px 700 legend, and options in
    // 14px sentence-case body text — not the uppercased field label.
    const fieldset = drawer.locator('fieldset');
    const box = await fieldset.evaluate((el) => {
      const s = getComputedStyle(el);
      return [s.borderTopStyle, s.borderRightStyle, s.borderBottomStyle, s.borderLeftStyle];
    });
    expect(box).toEqual(['solid', 'none', 'none', 'none']);
    const legend = await fieldset.locator('legend').evaluate((el) => {
      const s = getComputedStyle(el);
      return [s.fontSize, s.fontWeight];
    });
    expect(legend).toEqual(['13px', '700']);
    const option = await drawer.locator('label', { hasText: TOGETHER }).evaluate((el) => {
      const s = getComputedStyle(el);
      return [s.fontSize, s.fontWeight, s.textTransform];
    });
    expect(option).toEqual(['14px', '400', 'none']);
  });

  test('with nobody to contact, Save is disabled and the line pinned above the footer says why', async ({ page, world }) => {
    seed(world);
    // Lakshmi is verified but has not consented; Arjun is unverified.
    notifierSettings(world, MEMBERS);
    const drawer = await openEditor(page);
    const save = drawer.getByRole('button', { name: SAVE });
    await expect(save).toBeDisabled();
    const why = drawer.locator('.drawerwhy');
    await expect(why).toHaveText('No family member has a verified email yet.');
    await expect(save).toHaveAccessibleDescription('No family member has a verified email yet.');
    await drawer.getByRole('radio', { name: IN_ORDER }).check();
    await expect(save).toBeDisabled();
    await expect(why).toHaveText('No family member has a verified email yet.');

    // The gap is the server's count, in the Safeguard tab's chip and words.
    const chip = drawer.locator('.schip.warn');
    await expect(chip).toHaveText(GAP_SENTENCE);
    // The tab behind is inert while the drawer is open, so read it by class.
    await expect(page.locator('.safeguardtab .schip.warn')).toHaveText(GAP_SENTENCE);
  });

  test('together lists the recipients read-only; in order needs one before it can save', async ({ page, world }) => {
    seed(world);
    notifierSettings(world, [SELF, CONSENTING_WIFE, SON]);
    const drawer = await openEditor(page);
    const save = drawer.getByRole('button', { name: SAVE });
    await expect(drawer.getByText('1 verified family email will be contacted together.')).toBeVisible();
    const rows = drawer.locator('.rows.boxed > div');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('Lakshmi');
    await expect(rows.first()).toContainText('lakshmi@example.com');
    await expect(rows.first().getByRole('button')).toHaveCount(0);
    await expect(save).toBeEnabled();
    await expect(drawer.locator('.drawerwhy')).toHaveCount(0);

    await drawer.getByRole('radio', { name: IN_ORDER }).check();
    await expect(rows).toHaveCount(0);
    await expect(save).toBeDisabled();
    await expect(drawer.locator('.drawerwhy')).toHaveText('Add at least one verified family email to create an order.');
    await drawer.getByLabel('Add a verified family email').selectOption({ label: 'Lakshmi — Spouse' });
    await expect(rows).toHaveCount(1);
    await expect(rows.first().getByRole('button', { name: 'Move Lakshmi up' })).toBeVisible();
    await expect(save).toBeEnabled();
  });

  test('a configured order opens on "in order", focused, with its numbered row', async ({ page, world }) => {
    seed(world);
    notifierSettings(world, [SELF, CONSENTING_WIFE, SON], [{
      memberId: 'm-wife', name: 'Lakshmi', relation: 'spouse', contact: 'lakshmi@example.com',
      priority: 1, channel: 'email', eligible: true,
    }]);
    const drawer = await openEditor(page);
    await expect(drawer.getByRole('radio', { name: IN_ORDER })).toBeFocused();
    const rows = drawer.locator('.rows.boxed > div');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('1');
    await expect(rows.first().getByRole('button', { name: 'Move Lakshmi up' })).toBeVisible();
    await expect(rows.first().getByRole('button', { name: 'Take out' })).toBeVisible();

    await drawer.getByRole('radio', { name: TOGETHER }).check();
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('Lakshmi');
    await expect(rows.first().getByRole('button')).toHaveCount(0);
  });

  test('the gap links to the Members tab, which takes focus', async ({ page, world }) => {
    seed(world);
    notifierSettings(world, MEMBERS);
    const drawer = await openEditor(page);
    await drawer.getByRole('button', { name: 'Open the Members tab' }).click();
    await expect(drawer).toHaveCount(0);
    const members = page.getByRole('tab', { name: /^Members/ });
    await expect(members).toHaveAttribute('aria-selected', 'true');
    await expect(page).not.toHaveURL(/tab=/);
    await expect(members).toBeFocused();
  });

  test('saves everyone together, or an order, and hands focus back to Configure notifiers', async ({ page, world }) => {
    seed(world);
    notifierSettings(world, [SELF, CONSENTING_WIFE, SON]);
    world.set('root.setNotifiers', []);
    let drawer = await openEditor(page);
    await drawer.getByRole('button', { name: SAVE }).click();
    await expect.poll(() => world.calls('root.setNotifiers').length).toBe(1);
    expect(world.lastVars('root.setNotifiers')).toMatchObject({ g: FAMILY, ids: [] });
    await expect(drawer).toHaveCount(0);
    await expect(page.getByText('All verified family emails will be contacted together')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Configure notifiers' })).toBeFocused();

    await page.getByRole('button', { name: 'Configure notifiers' }).click();
    drawer = page.getByRole('dialog', { name: 'Inactivity notifications' });
    await drawer.getByRole('radio', { name: IN_ORDER }).check();
    await drawer.getByLabel('Add a verified family email').selectOption({ label: 'Lakshmi — Spouse' });
    await drawer.getByRole('button', { name: SAVE }).click();
    await expect.poll(() => world.calls('root.setNotifiers').length).toBe(2);
    expect(world.lastVars('root.setNotifiers')).toMatchObject({ g: FAMILY, ids: ['m-wife'] });
    await expect(drawer).toHaveCount(0);
    await expect(page.getByText('Notifier order saved')).toBeVisible();
  });

  test('Escape and Cancel close without saving and return focus to Configure notifiers', async ({ page, world }) => {
    seed(world);
    notifierSettings(world, [SELF, CONSENTING_WIFE, SON]);
    world.set('root.setNotifiers', []);
    let drawer = await openEditor(page);
    await expect(drawer.getByRole('radio', { name: TOGETHER })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);
    const configure = page.getByRole('button', { name: 'Configure notifiers' });
    await expect(configure).toBeFocused();

    await configure.click();
    drawer = page.getByRole('dialog', { name: 'Inactivity notifications' });
    await drawer.getByRole('button', { name: 'Cancel' }).click();
    await expect(drawer).toHaveCount(0);
    await expect(configure).toBeFocused();
    expect(world.calls('root.setNotifiers').length).toBe(0);
  });

  test('@phone each option keeps its radio on its line and the drawer never scrolls sideways', async ({ page, world }) => {
    seed(world);
    notifierSettings(world, [SELF, CONSENTING_WIFE, SON]);
    const drawer = await openEditor(page);
    for (const name of [TOGETHER, IN_ORDER]) {
      const label = drawer.locator('label', { hasText: name });
      const radio = await label.locator('input').boundingBox();
      const text = await label.locator('span').evaluate((el) => {
        const r = document.createRange();
        r.selectNodeContents(el);
        const first = r.getClientRects()[0];
        return { top: first.top, bottom: first.bottom };
      });
      expect(radio).toBeTruthy();
      const mid = radio!.y + radio!.height / 2;
      expect(mid).toBeGreaterThanOrEqual(text.top - 1);
      expect(mid).toBeLessThanOrEqual(text.bottom + 1);
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test.describe('the Members table', () => {
  test('the member filter narrows by relationship and status, says how many are shown, and Clear all brings everyone back', async ({ page, world }) => {
    seed(world);
    await page.goto(`/app/groups?g=${FAMILY}`);
    const rows = page.getByRole('tabpanel').locator('tbody tr');
    await expect(rows).toHaveCount(3);
    await expect(page.getByText('3 of 3 shown')).toBeVisible();

    await page.getByRole('button', { name: '+ Filter' }).click();
    const pop = page.getByRole('group', { name: 'Narrow the list' });
    await pop.getByRole('button', { name: /^Spouse/ }).click();
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('Lakshmi');
    await expect(page.getByText('1 of 3 shown')).toBeVisible();

    await pop.getByRole('button', { name: /^Invited/ }).click();
    await expect(page.getByText('No members match these filters')).toBeVisible();
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(rows).toHaveCount(3);

    await page.getByRole('button', { name: '+ Filter' }).click();
    await page.getByRole('group', { name: 'Narrow the list' }).getByRole('button', { name: /^Son/ }).click();
    await expect(rows).toHaveCount(1);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Remove filter Relationship Son' }).click();
    await expect(rows).toHaveCount(3);
    await page.getByRole('button', { name: '+ Filter' }).click();
    await page.getByRole('group', { name: 'Narrow the list' }).getByRole('button', { name: /^Active/ }).click();
    await expect(rows).toHaveCount(1);
    await page.getByRole('button', { name: 'Clear all' }).click();
    await expect(rows).toHaveCount(3);
  });

  test('a group of one draws no filter, because there is nothing to narrow', async ({ page, world }) => {
    seed(world);
    world.set('root.members', [SELF]);
    await page.goto(`/app/groups?g=${FAMILY}`);
    await expect(page.getByRole('tabpanel').locator('tbody tr')).toHaveCount(1);
    await expect(page.getByRole('button', { name: '+ Filter' })).toHaveCount(0);
  });

  test('Add a person opens the member form and Cancel closes it', async ({ page, world }) => {
    seed(world);
    await page.goto(`/app/groups?g=${FAMILY}`);
    await page.getByRole('button', { name: 'Add a person' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add person' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
  });

  test('removing a member from a filtered table removes that member', async ({ page, world }) => {
    seed(world);
    world.set('root.removeMember', true);
    await page.goto(`/app/groups?g=${FAMILY}`);
    await page.getByRole('button', { name: '+ Filter' }).click();
    await page.getByRole('group', { name: 'Narrow the list' }).getByRole('button', { name: /^Spouse/ }).click();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Actions for Lakshmi' }).click();
    await page.getByRole('menuitem', { name: 'Remove from this group' }).click();
    await page.getByRole('dialog', { name: 'Remove Lakshmi?' }).getByRole('button', { name: 'Remove' }).click();
    await expect.poll(() => world.calls('root.removeMember').length).toBe(1);
    expect(world.lastVars('root.removeMember')).toMatchObject({ id: 'm-wife' });
    await expect(page.getByText('Lakshmi removed')).toBeVisible();
  });

  test('removing a member sends their kept Aadhaar card to Trash, and nothing else', async ({ page, world }) => {
    seed(world);
    world.set('root.removeMember', true);
    world.set('vaultFolders', [
      { id: 'f-lakshmi', name: 'Lakshmi', parentId: '', fileCount: 1, folderCount: 1, createdAt: '', personId: 'm-wife' },
      { id: 'f-lakshmi-aadhaar', name: 'Aadhaar', parentId: 'f-lakshmi', fileCount: 1, folderCount: 0, createdAt: '',
        personId: 'm-wife' },
      { id: 'f-mine', name: 'Deeds', parentId: '', fileCount: 1, folderCount: 0, createdAt: '', personId: '' },
    ]);
    const paper = (id: string, fileRef: string, folderId: string, aadhaarCard: boolean) => ({
      id, title: 'Aadhaar card', detail: 'XXXX-XXXX-9012', shelf: 'identity', icon: 'identity', tags: [],
      shared: false, pageCount: 0, fileRef, mimeType: 'application/pdf', recordId: '', recordTitle: '',
      createdAt: '2026-10-03T10:00:00', jointFmbId: '', folderId, sizeBytes: 2048, aadhaarCard, linkedProperties: [],
    });
    world.set('vaultPapers', [
      paper('d-card', 'node-card', 'f-lakshmi-aadhaar', true),
      paper('d-note', 'node-note', 'f-lakshmi', false),
      paper('d-moved', 'node-moved', 'f-mine', true),
    ]);
    await page.goto(`/app/groups?g=${FAMILY}`);
    await page.getByRole('button', { name: 'Actions for Lakshmi' }).click();
    await page.getByRole('menuitem', { name: 'Remove from this group' }).click();
    await page.getByRole('dialog', { name: 'Remove Lakshmi?' }).getByRole('button', { name: 'Remove' }).click();
    await expect(page.getByText('Lakshmi removed')).toBeVisible();
    const trashed = world.restCalls(/storage\/nodes\//).filter((c) => c.method === 'DELETE');
    expect(trashed.map((c) => c.path)).toEqual(['/api/gateway/storage/nodes/node-card']);
    // Trash only after the server removed the person and the card's row.
    expect(trashed[0].at).toBeGreaterThan(world.calls('root.removeMember')[0].at);
  });
});

test.describe('the page head', () => {
  test('Print hands the page to the browser, and the Aadhaar stays masked on paper', async ({ page, world }) => {
    seed(world);
    // Headless Chromium has no printer; the stub is the only way to see that
    // the button reaches window.print at all (12-reader does the same).
    await page.addInitScript(() => {
      (window as unknown as { __prints: number }).__prints = 0;
      window.print = () => { (window as unknown as { __prints: number }).__prints += 1; };
    });
    await page.goto(`/app/groups?g=${FAMILY}`);
    await page.getByRole('button', { name: 'Print' }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __prints: number }).__prints)).toBe(1);

    await page.emulateMedia({ media: 'print' });
    const masked = page.getByRole('tabpanel').getByText(/1234$/);
    await expect(masked).toBeVisible();
    await expect(masked).toHaveText(/X/);
    const text = await page.evaluate(() => document.body.innerText);
    expect(text).not.toMatch(/\d{12}/);
    expect(text).not.toMatch(/\d{4}\s\d{4}\s\d{4}/);
    await expect(page.getByRole('button', { name: 'Add a person' })).toBeHidden();
    await expect(page.getByRole('button', { name: '+ Filter' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Print' })).toBeHidden();
    await expect(page.getByRole('tab', { name: 'Safeguard, needs action' })).toBeVisible();
  });

  test('New group is outlined, so the open tab\'s own action is the one filled button in view', async ({ page, world }) => {
    seed(world);
    world.set('root.createGroup', { id: 'grp-new' });
    await page.goto(`/app/groups?g=${FAMILY}`);
    const newGroup = page.getByRole('button', { name: 'New group' });
    // Fill is a class: nothing in the accessibility tree says filled.
    await expect(newGroup).not.toHaveClass(/\bprimary\b/);
    await expect(page.locator('main .btn.primary:visible')).toHaveCount(1);
    await expect(page.locator('main .btn.primary:visible')).toHaveText(/Add a person/);
    await page.getByRole('tab', { name: 'Safeguard, needs action' }).click();
    await expect(page.locator('main .btn.primary:visible')).toHaveCount(1);
    await expect(page.locator('main .btn.primary:visible')).toHaveText('Configure notifiers');

    await newGroup.click();
    const dialog = page.getByRole('dialog', { name: 'New group' });
    await dialog.getByLabel('Name').fill('Kondapalli Family');
    await dialog.getByRole('button', { name: 'Create group' }).click();
    await expect.poll(() => world.calls('root.createGroup').length).toBe(1);
    await expect(page.getByText('Kondapalli Family created')).toBeVisible();
  });

  test('the group\'s own Edit and Delete still work from the header kebab', async ({ page, world }) => {
    seed(world);
    world.set('root.updateGroup', { id: FAMILY });
    world.set('root.deleteGroup', true);
    await page.goto(`/app/groups?g=${FAMILY}`);
    await page.getByRole('button', { name: 'Actions for Telukutla Family' }).click();
    await page.getByRole('menuitem', { name: 'Edit name and description' }).click();
    const edit = page.getByRole('dialog', { name: 'Edit Telukutla Family' });
    await edit.getByLabel('Name').fill('Telukutla Family Trust');
    await edit.getByRole('button', { name: 'Save' }).click();
    await expect.poll(() => world.calls('root.updateGroup').length).toBe(1);
    await expect(edit).toHaveCount(0);

    await page.getByRole('button', { name: 'Actions for Telukutla Family' }).click();
    await page.getByRole('menuitem', { name: 'Delete this group' }).click();
    await page.getByRole('dialog', { name: 'Delete Telukutla Family?' })
      .getByRole('button', { name: 'Delete this group' }).click();
    await expect.poll(() => world.calls('root.deleteGroup').length).toBe(1);
  });

  test('@phone-only the group header wraps: name and menu on one line, then the facts, then the property link', async ({ page, world }) => {
    seed(world, [group({ parcelCount: 2, description: 'The family land in Markapur.' })]);
    await page.goto(`/app/groups?g=${FAMILY}`);
    const name = page.getByRole('heading', { level: 2, name: 'Telukutla Family' });
    const menu = page.getByRole('button', { name: 'Actions for Telukutla Family' });
    const facts = page.getByText(/^Family · Your role: Head/);
    const link = page.getByRole('link', { name: 'See its 2 properties' });
    const [n, m, f, l] = await Promise.all([name, menu, facts, link].map((x) => x.boundingBox()));
    expect(n && m && f && l).toBeTruthy();
    // The kebab sits on the name's line, not under the link.
    expect(Math.abs(m!.y + m!.height / 2 - (n!.y + n!.height / 2))).toBeLessThan(m!.height);
    expect(f!.y).toBeGreaterThanOrEqual(n!.y + n!.height - 1);
    expect(l!.y).toBeGreaterThan(f!.y);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test.describe('a refused write keeps its dialog', () => {
  // Each test provokes a GraphQL error on purpose, which the app logs.
  test.use({ allowConsole: true });

  test('a notifier save the server refuses keeps the drawer, keeps focus on Save, and words the toast for the mode', async ({ page, world }) => {
    seed(world);
    notifierSettings(world, [SELF, CONSENTING_WIFE, SON]);
    world.set('root.setNotifiers', World.gqlError('the safeguard store is down'));
    const drawer = await openEditor(page);
    const save = drawer.getByRole('button', { name: SAVE });
    await save.click();
    await expect(page.getByRole('alert').filter({
      hasText: 'Contacting all verified family emails together could not be saved. Nothing has changed.',
    })).toBeVisible();
    // The sentence says what failed; the server's raw words are not printed.
    await expect(page.getByText('the safeguard store is down')).toHaveCount(0);
    await expect(drawer).toBeVisible();
    await expect(save).toBeFocused();

    await drawer.getByRole('radio', { name: IN_ORDER }).check();
    await drawer.getByLabel('Add a verified family email').selectOption({ label: 'Lakshmi — Spouse' });
    // The first toast still sits over the footer's corner, so this save is by
    // keyboard — the way someone whose focus was kept on Save would retry.
    await save.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('alert').filter({
      hasText: 'That notifier order could not be saved. Nothing has changed.',
    })).toBeVisible();
    await expect(page.getByText('the safeguard store is down')).toHaveCount(0);
    await expect(drawer).toBeVisible();
    await expect(save).toBeFocused();
    expect(world.calls('root.setNotifiers').length).toBe(2);
  });

  test('a group the server refuses to create keeps the typed name in the dialog', async ({ page, world }) => {
    seed(world);
    world.set('root.createGroup', World.gqlError('refused'));
    await page.goto(`/app/groups?g=${FAMILY}`);
    await page.getByRole('button', { name: 'New group' }).click();
    const dialog = page.getByRole('dialog', { name: 'New group' });
    await dialog.getByLabel('Name').fill('Kondapalli Family');
    await dialog.getByRole('button', { name: 'Create group' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'That group could not be created. Nothing has changed.' })).toBeVisible();
    await expect(dialog.getByLabel('Name')).toHaveValue('Kondapalli Family');
  });

  test('a rename or delete the server refuses keeps its dialog on screen', async ({ page, world }) => {
    seed(world);
    world.set('root.updateGroup', World.gqlError('refused'));
    world.set('root.deleteGroup', World.gqlError('refused'));
    await page.goto(`/app/groups?g=${FAMILY}`);
    await page.getByRole('button', { name: 'Actions for Telukutla Family' }).click();
    await page.getByRole('menuitem', { name: 'Edit name and description' }).click();
    const edit = page.getByRole('dialog', { name: 'Edit Telukutla Family' });
    await edit.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'That change could not be saved.' })).toBeVisible();
    await expect(edit).toBeVisible();
    await edit.getByRole('button', { name: 'Cancel' }).click();

    await page.getByRole('button', { name: 'Actions for Telukutla Family' }).click();
    await page.getByRole('menuitem', { name: 'Delete this group' }).click();
    const del = page.getByRole('dialog', { name: 'Delete Telukutla Family?' });
    await del.getByRole('button', { name: 'Delete this group' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'That group could not be deleted.' })).toBeVisible();
    await expect(del).toBeVisible();
  });

  test('a removal the server refuses keeps the dialog naming who it was about', async ({ page, world }) => {
    seed(world);
    world.set('root.removeMember', World.gqlError('refused'));
    await page.goto(`/app/groups?g=${FAMILY}`);
    await page.getByRole('button', { name: 'Actions for Lakshmi' }).click();
    await page.getByRole('menuitem', { name: 'Remove from this group' }).click();
    const dialog = page.getByRole('dialog', { name: 'Remove Lakshmi?' });
    await dialog.getByRole('button', { name: 'Remove' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'That person could not be removed.' })).toBeVisible();
    await expect(dialog).toBeVisible();
    // A refused removal moves no file to Trash.
    expect(world.restCalls(/storage\/nodes\//).filter((c) => c.method === 'DELETE')).toHaveLength(0);
  });
});
