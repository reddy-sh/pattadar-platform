/**
 * Families & groups (w360/pages/Groups.tsx), a list and one page per group:
 *
 *   /groups      — the LIST: a Grid | List toggle (?view=table), a Type
 *                      filter (?type=, multi), a SortCycle, and per group a
 *                      card or a row whose name opens the group; its kebab
 *                      has Open / Edit / Delete. "New family or group" lands
 *                      on the new group's page.
 *   /groups/:id  — the GROUP: crumbs back to the list, the name as h1,
 *                      a facts line, Print / Edit / Delete, and the detail
 *                      tabs (Members · Details · Properties · Safeguard ·
 *                      Activity) in
 *                      ?tab=. The inactivity safeguard is its own tab with a
 *                      glyph-and-word status; the Members table has the
 *                      shared filter.
 *
 * The screen reads through the root schema, not `web { … }`, so every answer
 * here is a `root.<field>` set before `goto`.
 */
import { test, expect, World } from '../fixtures/harness';
import { CARDS, holderChangeOver, propertiesOver } from '../fixtures/seed';
import { ID } from '../fixtures/ids';
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

type Card = Record<string, unknown>;
const BY_ID = new Map(CARDS.map((c) => [c.id as string, c]));
/** A seeded card, cloned, in the units the server spells (web360: 'ac' for
 *  land, 'sq.ft' for a building), with whatever this test changes on it. */
const cardOf = (id: string, over: Card = {}): Card => {
  const c = structuredClone(BY_ID.get(id)!);
  return { ...c, extentUnit: c.kind === 'parcel' ? 'ac' : 'sq.ft', ...over };
};
const HELD_HERE: Card = { groupId: FAMILY, groupName: 'Telukutla Family', holderLabel: 'Telukutla Family' };

/** What the family holds, as the `properties` query answers for
 *  `groups: [grp-family]` — the read Properties makes for `?group=`. Khata
 *  1042 is two parcels (Sy 214/2, part of Thota farm, and Sy 214/3); khata
 *  318 is Sy 88; and a flat. 4.3 + 0.2 + 1.2 = 5.70 ac. Sy 301 is in your own
 *  name, and the archived shop is out of every list. The acre figure is
 *  Properties' own sum (PropertyTable inAcres), so the flat's 1,450 sq.ft
 *  adds 0.03: 5.73 ac, the number Properties prints for the same list. */
const LAND_CARDS = (): Card[] => [
  cardOf(ID.parcel, { ...HELD_HERE, holdingId: 'cp-thota', holdingName: 'Thota farm' }),
  cardOf(ID.parcel, { ...HELD_HERE, id: 'w-sy-214-3', title: 'Sy 214/3', extent: 0.2, tags: [] }),
  cardOf(ID.plot, HELD_HERE),
  cardOf(ID.flat, HELD_HERE),
  cardOf(ID.watched),
  cardOf(ID.shop),
];
/** Everything in your own name: the family holds nothing. */
const NO_LAND = (): Card[] => CARDS.map((c) => cardOf(c.id as string));

/** The group that holds LAND_CARDS. Its server counts are deliberately the
 *  founder's shape — ten khatas, nine of them empty passbooks — because the
 *  page must not print them: it counts properties from the query. */
const LANDED = () => group({ landCount: 10, propertyCount: 1, parcelCount: 3, totalExtent: 5.7, totalShare: 100 });

function seed(world: World, groups = [group({ inactiveContactGaps: 1 })], land: Card[] = NO_LAND()) {
  world.set('root.groups', groups);
  world.set('root.members', MEMBERS);
  world.set('root.groupActivity', []);
  world.set('root.notifiers', []);
  // The group's properties: the same `properties` read Properties makes.
  world.set('properties', propertiesOver(land));
  const names = { [FAMILY]: 'Telukutla Family' };
  world.set('holderChange', holderChangeOver(land, names));
  world.set('setRecordHolder', holderChangeOver(land, names));
}

/** The one contact-gap sentence (groupsView contactGapSentence), shared by the
 *  Safeguard tab and the notifier editor. */
const GAP_SENTENCE = '1 member needs a confirmed email and must agree to safeguard emails before everyone can be reached.';

const tabs = (page: Page) => page.getByRole('tablist', { name: /detail$/ }).getByRole('tab');

/** The text a tab draws. The status word is in its accessible name and the
 *  glyph's tooltip, never on screen. */
const drawnText = (tab: Locator) => tab.innerText();

test.describe('the inactivity safeguard', () => {
  test('a family\'s safeguard is its own tab, and while a member has no verified email it says it needs action', async ({ page, world }) => {
    seed(world);
    await page.goto(`/groups/${FAMILY}`);
    await expect(tabs(page)).toHaveText([/^Members/, /^Details/, /^Properties/, /^Safeguard/, /^Activity/]);
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
    await page.goto(`/groups/${FAMILY}?tab=safeguard`);
    const tab = page.getByRole('tab', { name: 'Safeguard, set' });
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    await expect(tab.locator('[title="set"]')).toHaveText('✓');
    expect(await drawnText(tab)).not.toContain('set');
    await expect(page.getByText(/safeguard-email consent before everyone can be contacted/)).toHaveCount(0);
    await expect(page.getByText('Delivery not confirmed', { exact: false })).toHaveCount(0);
  });

  test('a reminder stage reads as a warning, not a danger', async ({ page, world }) => {
    seed(world, [group({ inactivityStage: 'reminder_1' })]);
    await page.goto(`/groups/${FAMILY}?tab=safeguard`);
    await expect(page.getByRole('tab', { name: 'Safeguard, needs action' })).toBeVisible();
    const chip = page.getByRole('tabpanel').getByText('First reminder sent', { exact: true });
    await expect(chip).toBeVisible();
    // The tone is only in the class: no role or text tells warn from danger.
    await expect(chip).toHaveClass(/\bschip\b.*\bwarn\b/);
  });

  test('a partnership has no Safeguard tab, and a deep link to one lands on Members', async ({ page, world }) => {
    seed(world, [group({ id: FIRM, type: 'partnership', name: 'Reddy & Sons' })]);
    await page.goto(`/groups/${FIRM}?tab=safeguard`);
    await expect(tabs(page)).toHaveText([/^Members/, /^Details/, /^Properties/, /^Activity/]);
    await expect(page.getByRole('tab', { name: /^Members/ })).toHaveAttribute('aria-selected', 'true');
  });

  test('a link to the Safeguard tab opens on it, and opening another group from the list lands on Members', async ({ page, world }) => {
    seed(world, [group({ inactiveContactGaps: 1 }), group({ id: 'grp-two', name: 'Second Family' })]);
    await page.goto(`/groups/${FAMILY}?tab=safeguard`);
    await expect(page.getByRole('heading', { name: 'Inactivity safeguard' })).toBeVisible();
    await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Families & groups' }).click();
    await expect(page).toHaveURL(/\/groups$/);
    await page.getByRole('link', { name: 'Second Family' }).click();
    await expect(page).toHaveURL(/\/groups\/grp-two$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Second Family' })).toBeVisible();
    await expect(page.getByRole('tab', { name: /^Members/ })).toHaveAttribute('aria-selected', 'true');
  });

  test('@phone the Safeguard tab fits a phone and the page never scrolls sideways', async ({ page, world }) => {
    seed(world);
    await page.goto(`/groups/${FAMILY}`);
    const safeguard = page.getByRole('tab', { name: 'Safeguard, needs action' });
    await safeguard.click();
    await expect(page.getByRole('heading', { level: 2, name: 'Inactivity safeguard' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Configure notifiers' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('Arrow, Home and End move between the five tabs', async ({ page, world }) => {
    seed(world);
    await page.goto(`/groups/${FAMILY}`);
    const members = page.getByRole('tab', { name: /^Members/ });
    await members.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: /^Details/ })).toBeFocused();
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
  await page.goto(`/groups/${FAMILY}?tab=safeguard`);
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
    await expect(drawer.locator('.drawerwhy')).toHaveText('Add at least one verified family email to choose who is notified first.');
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
    await expect(page.getByText('Notifiers saved')).toBeVisible();
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
    await page.goto(`/groups/${FAMILY}`);
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
    await page.locator('.emptypanel, .blank').getByRole('button', { name: 'Clear all' }).click();
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
    await page.goto(`/groups/${FAMILY}`);
    await expect(page.getByRole('tabpanel').locator('tbody tr')).toHaveCount(1);
    await expect(page.getByRole('button', { name: '+ Filter' })).toHaveCount(0);
  });

  test('Add a member opens the member form and Cancel closes it', async ({ page, world }) => {
    seed(world);
    await page.goto(`/groups/${FAMILY}`);
    await page.getByRole('button', { name: 'Add a member' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add member' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
  });

  test('removing a member from a filtered table removes that member', async ({ page, world }) => {
    seed(world);
    world.set('root.removeMember', true);
    await page.goto(`/groups/${FAMILY}`);
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
    await page.goto(`/groups/${FAMILY}`);
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

/** The properties the group's own query answers (`properties(groups:[id])`,
 *  the same read Properties makes), filtered by the fixture the way the
 *  resolver filters. The archived shop is left out; of the four active
 *  records the first two are held by `id`. */
const heldBy = (id: string, name = 'Telukutla Family') => CARDS
  .filter((c) => c.status !== 'archived')
  .map((c, i) => (i < 2
    ? { ...structuredClone(c), groupId: id, groupName: name, holderLabel: name }
    : structuredClone(c)));

test.describe('the land tile lands on Properties filtered to the group', () => {
  // A seeded id and the shape the founder's real ids have.
  for (const id of [FAMILY, '6f1c2a9e-3b7d-4e21-9a55-0c8d1e2f3a4b']) {
    test(`the Holder chip is on, its box is ticked and the list is narrowed (${id.slice(0, 4)})`, async ({ page, world }) => {
      seed(world, [{ ...LANDED(), id }]);
      world.set('properties', propertiesOver(heldBy(id)));
      await page.goto(`/groups/${id}`);
      await page.getByRole('link', { name: /Open them in Properties$/ }).click();

      await expect(page).toHaveURL(new RegExp(`/properties\\?group=${id}$`));
      const chip = page.locator('.fchip');
      await expect(chip).toHaveCount(1);
      await expect(chip.locator('.grp')).toHaveText('Holder');
      await expect(chip.locator('.val')).toHaveText('Telukutla Family');
      await expect(page.getByRole('button', { name: 'Remove filter Holder Telukutla Family' })).toBeVisible();
      await expect(page.locator('.filterbar .tally')).toHaveText('2 of 4 shown');
      await expect(page.locator('.cards .rec')).toHaveCount(2);

      await page.getByRole('button', { name: '+ Filter' }).click();
      const holder = page.getByRole('group', { name: 'Narrow the list' }).locator('.fgrp').filter({ hasText: 'Holder' });
      const opt = holder.getByRole('button', { name: /^Telukutla Family/ });
      await expect(opt).toHaveAttribute('aria-pressed', 'true');
      await expect(opt.locator('.box')).toHaveText('✓');
      await expect(holder.getByRole('button', { name: /^In your own name/ })).toHaveAttribute('aria-pressed', 'false');
    });
  }
});

test.describe('the group page', () => {
  test('Print hands the page to the browser, and the Aadhaar stays masked on paper', async ({ page, world }) => {
    seed(world);
    // Headless Chromium has no printer; the stub is the only way to see that
    // the button reaches window.print at all (12-reader does the same).
    await page.addInitScript(() => {
      (window as unknown as { __prints: number }).__prints = 0;
      window.print = () => { (window as unknown as { __prints: number }).__prints += 1; };
    });
    await page.goto(`/groups/${FAMILY}`);
    // Print sits in the head's kebab, one step removed like Delete.
    await page.getByRole('button', { name: 'Actions for Telukutla Family', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Print' }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __prints: number }).__prints)).toBe(1);

    await page.emulateMedia({ media: 'print' });
    const masked = page.getByRole('tabpanel').getByText(/1234$/);
    await expect(masked).toBeVisible();
    await expect(masked).toHaveText(/X/);
    const text = await page.evaluate(() => document.body.innerText);
    expect(text).not.toMatch(/\d{12}/);
    expect(text).not.toMatch(/\d{4}\s\d{4}\s\d{4}/);
    await expect(page.getByRole('button', { name: 'Add a member' })).toBeHidden();
    await expect(page.getByRole('button', { name: '+ Filter' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Actions for Telukutla Family', exact: true })).toBeHidden();
    await expect(page.getByRole('tab', { name: 'Safeguard, needs action' })).toBeVisible();
  });

  test('crumbs lead back to the list; the head is the name, the facts, the description, two outlined actions and a kebab', async ({ page, world }) => {
    seed(world, [{ ...LANDED(), description: 'The family land in Markapur.' }], LAND_CARDS());
    await page.goto(`/groups/${FAMILY}`);
    const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
    await expect(crumbs).toContainText('Families & groups');
    await expect(crumbs).toContainText('Telukutla Family');
    await expect(crumbs.locator('[aria-current="page"]')).toHaveText('Telukutla Family');
    await expect(page.getByRole('heading', { level: 1, name: 'Telukutla Family' })).toBeVisible();
    // The type and your role, then a line about people — never an acre
    // headline. The land is one tile that opens Properties filtered to it.
    await expect(page.getByText('Family · Your role: Head', { exact: true })).toBeVisible();
    // Properties, counted once from the Properties query: never khatas.
    await expect(page.getByText('3 members · shares 100% · 4 properties', { exact: true })).toBeVisible();
    await expect(page.getByText('The family land in Markapur.')).toBeVisible();
    const tile = page.getByRole('link', { name: '4 properties · 5.73 ac. Open them in Properties' });
    await expect(tile).toHaveAttribute('href', `/properties?group=${FAMILY}`);
    await expect(tile).toHaveText('4 properties · 5.73 ac');
    await expect(page.getByRole('link', { name: /^See its/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
    // Print and Delete are one step removed, as on the property and holding
    // heads: in the kebab, Delete last and under a rule.
    await expect(page.getByRole('button', { name: 'Print', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Actions for Telukutla Family', exact: true }).click();
    await expect(page.getByRole('menuitem')).toHaveText(['Print', 'Delete this family']);
    await page.keyboard.press('Escape');
    // The head's actions are outlined, so the
    // open tab's own action is the one filled button in view.
    await expect(page.locator('main .btn.primary:visible')).toHaveCount(1);
    await expect(page.locator('main .btn.primary:visible')).toHaveText(/Add a member/);
    await page.getByRole('tab', { name: 'Safeguard, set' }).click();
    await expect(page.locator('main .btn.primary:visible')).toHaveCount(1);
    await expect(page.locator('main .btn.primary:visible')).toHaveText('Configure notifiers');

    await crumbs.getByRole('link', { name: 'Families & groups' }).click();
    await expect(page).toHaveURL(/\/groups$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Families & groups' })).toBeVisible();
  });

  test('a group that holds nothing draws no land tile', async ({ page, world }) => {
    seed(world, [group()]);
    await page.goto(`/groups/${FAMILY}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Telukutla Family' })).toBeVisible();
    await expect(page.getByText('3 members', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: /Open them in Properties$/ })).toHaveCount(0);
  });

  test('an id that is not on file says so, and links back to the list', async ({ page, world }) => {
    seed(world);
    await page.goto('/groups/grp-gone');
    await expect(page.getByText('This family or group is not on file')).toBeVisible();
    await expect(page.getByRole('tablist')).toHaveCount(0);
    await page.getByRole('link', { name: 'All families and groups' }).click();
    await expect(page).toHaveURL(/\/groups$/);
    await expect(page.locator('.groupcard')).toHaveCount(1);
  });

  test('Edit renames the group in place: the heading, the crumb and the list all say the new name', async ({ page, world }) => {
    liveGroups(world, [group()]);
    await page.goto(`/groups/${FAMILY}`);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const edit = page.getByRole('dialog', { name: 'Edit Telukutla Family' });
    await expect(edit.getByLabel('Name')).toHaveValue('Telukutla Family');
    await edit.getByLabel('Name').fill('Telukutla Family Trust');
    await edit.getByLabel('Description').fill('Held since 1984.');
    await edit.getByRole('button', { name: 'Save' }).click();
    await expect.poll(() => world.calls('root.updateGroup').length).toBe(1);
    expect(world.lastVars('root.updateGroup')).toMatchObject({ id: FAMILY, n: 'Telukutla Family Trust', d: 'Held since 1984.' });
    await expect(edit).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: 'Telukutla Family Trust' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Telukutla Family Trust');
    await expect(page.getByText('Held since 1984.')).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/groups/${FAMILY}$`));

    await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Families & groups' }).click();
    await expect(cardNames(page)).toHaveText(['Telukutla Family Trust']);
  });

  test('Delete asks first, Cancel keeps it, and Delete this group returns to the list without it', async ({ page, world }) => {
    liveGroups(world, [group(), group({ id: FIRM, type: 'partnership', name: 'Reddy & Sons' })]);
    await page.goto(`/groups/${FAMILY}`);
    const kebab = page.getByRole('button', { name: 'Actions for Telukutla Family', exact: true });
    await kebab.click();
    await page.getByRole('menuitem', { name: 'Delete this family' }).click();
    const del = page.getByRole('dialog', { name: 'Delete Telukutla Family?' });
    await del.getByRole('button', { name: 'Cancel' }).click();
    await expect(del).toHaveCount(0);
    expect(world.calls('root.deleteGroup')).toHaveLength(0);

    await kebab.click();
    await page.getByRole('menuitem', { name: 'Delete this family' }).click();
    await del.getByRole('button', { name: 'Delete this group' }).click();
    await expect.poll(() => world.calls('root.deleteGroup').length).toBe(1);
    expect(world.lastVars('root.deleteGroup')).toMatchObject({ id: FAMILY });
    await expect(page).toHaveURL(/\/groups$/);
    await expect(page.getByText('Telukutla Family deleted')).toBeVisible();
    await expect(cardNames(page)).toHaveText(['Reddy & Sons']);
  });

  test('@phone-only the group head stacks: crumbs, the name with its ⋮, then the facts, and nothing scrolls sideways', async ({ page, world }) => {
    seed(world, [{ ...LANDED(), description: 'The family land in Markapur.' }], LAND_CARDS());
    await page.goto(`/groups/${FAMILY}`);
    const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
    const name = page.getByRole('heading', { level: 1, name: 'Telukutla Family' });
    const facts = page.getByText(/^Family · Your role: Head/);
    const kebab = page.getByRole('button', { name: 'Actions for Telukutla Family', exact: true });
    const [c, n, f, d] = await Promise.all([crumbs, name, facts, kebab].map((x) => x.boundingBox()));
    expect(c && n && f && d).toBeTruthy();
    expect(n!.y).toBeGreaterThanOrEqual(c!.y + c!.height - 1);
    expect(f!.y).toBeGreaterThanOrEqual(n!.y + n!.height - 1);
    // Under 600px Edit joins Print and Delete in the ⋮, which keeps its place
    // on the title row, above the facts (design.md § Page head, Phone).
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
    await expect(kebab).toBeInViewport();
    expect(d!.y + d!.height).toBeLessThanOrEqual(f!.y + 1);
    await expect(page.getByRole('link', { name: '4 properties · 5.73 ac. Open them in Properties' })).toBeInViewport();
    // Edit first, Delete last under its rule: never a thumb's width apart.
    await kebab.click();
    const items = page.getByRole('menuitem');
    await expect(items.first()).toHaveText('Edit');
    await expect(items.last()).toHaveText('Delete this family');
    await page.keyboard.press('Escape');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

// ── The list ────────────────────────────────────────────────────────────

/** Seven groups — three families (your own, your parents', your in-laws'),
 *  an HUF, a partnership, a trust and a company — listed in an order that
 *  is NOT families-first, so the Type order is the screen's doing. */
const MANY = [
  group({ id: FIRM, type: 'partnership', name: 'Reddy & Sons', memberCount: 1, myRole: 'Partner', parcelCount: 2 }),
  group({ id: 'grp-own', name: 'Telukutla Family', totalExtent: 4.5, inactiveContactGaps: 1 }),
  group({ id: 'grp-huf', type: 'huf', name: 'Telukutla HUF', myRole: 'Karta' }),
  group({ id: 'grp-parents', name: 'Telukutla Family (parents)', parcelCount: 3 }),
  group({ id: 'grp-trust', type: 'trust', name: 'Temple Trust', myRole: 'Trustee', createdAt: '2026-10-01T00:00:00Z' }),
  group({ id: 'grp-wallet', type: 'company', name: 'Rental flats', myRole: 'Director', propertyCount: 5, memberCount: 0 }),
  group({ id: 'grp-inlaws', name: 'Kondapalli Family' }),
];

/** Type, then name: families first. */
const BY_TYPE = [
  'Kondapalli Family', 'Telukutla Family', 'Telukutla Family (parents)', 'Telukutla HUF',
  'Reddy & Sons', 'Rental flats', 'Temple Trust',
];

const cardNames = (page: Page) => page.locator('.cards .groupcard h3');
const rowNames = (page: Page) => page.locator('table.rectable tbody tr td:nth-child(2)');
/** One card, by its exact name — "Telukutla Family" is not also "(parents)". */
const card = (page: Page, name: string) =>
  page.locator('.groupcard').filter({ has: page.getByRole('heading', { name, exact: true }) });
const row = (page: Page, name: string) =>
  page.locator('table.rectable tbody tr').filter({ has: page.getByRole('link', { name, exact: true }) });

/**
 * A list that answers its own writes: create adds a row, update renames one,
 * delete takes one out, and `groups` reads whatever is there now — so the
 * refetch every group write triggers draws what the server would.
 */
function liveGroups(world: World, start: ReturnType<typeof group>[]) {
  const rows = start.map((g) => ({ ...g }));
  seed(world, rows);
  world.set('root.groups', () => rows);
  world.set('root.createGroup', (v: Record<string, unknown>) => {
    const g = group({
      id: 'grp-new', type: v.t, name: v.n, description: v.d, memberCount: 0, myRole: '', facts: v.x ?? '{}',
    });
    rows.push(g);
    return { id: g.id };
  });
  world.set('root.updateGroup', (v: Record<string, unknown>) => {
    const g = rows.find((r) => r.id === v.id);
    // A null `facts` keeps what is stored, as the server does.
    if (g) Object.assign(g, { name: v.n, description: v.d }, v.x == null ? {} : { facts: v.x });
    return { id: v.id };
  });
  world.set('root.deleteGroup', (v: Record<string, unknown>) => {
    const at = rows.findIndex((r) => r.id === v.id);
    if (at >= 0) rows.splice(at, 1);
    return at >= 0;
  });
  return rows;
}

test.describe('the list: scanning', () => {
  test('the head offers a filled New family or group; the band counts, sorts and switches Grid | List', async ({ page, world }) => {
    seed(world, MANY);
    await page.goto('/groups');
    await expect(page.getByRole('heading', { level: 1, name: 'Families & groups' })).toBeVisible();
    // The summary carries the account's totals, the band's tally what the
    // filter lets through (design.md § Page head, "Summary"): seven groups of
    // mixed types holding 2 + 3 parcels and 5 other properties, 4.5 acres.
    await expect(page.locator('.pagehead-summary')).toHaveText('7 groups · 10 properties · 4.50 ac');
    const view = page.locator('.filterbar').getByRole('group', { name: 'View' });
    await expect(view.getByRole('button', { name: 'Grid' })).toHaveAttribute('aria-pressed', 'true');
    await expect(view.getByRole('button', { name: 'Table' })).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByRole('button', { name: 'New family or group' })).toHaveClass(/\bprimary\b/);
    await expect(page.getByText('7 of 7 shown')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sort: Type' })).toBeVisible();
    // No tabs and no member table on the list: a group's detail is its page.
    await expect(page.getByRole('tablist')).toHaveCount(0);
  });

  test('Grid draws a card per group, families first, each with its type, your role and the four facts', async ({ page, world }) => {
    seed(world, MANY);
    await page.goto('/groups');
    await expect(cardNames(page)).toHaveText(BY_TYPE);

    const own = card(page, 'Telukutla Family');
    await expect(own).toContainText('Family · Your role: Head');
    const facts = own.locator('dl.groupcard-facts');
    await expect(facts.locator('dt')).toHaveText(['People', 'Properties', 'Extent', 'Safeguard']);
    await expect(facts.locator('dd').nth(0)).toHaveText('You and 2 others');
    await expect(facts.locator('dd').nth(1)).toHaveText('0');
    await expect(facts.locator('dd').nth(2)).not.toHaveText('—');
    await expect(facts.locator('dd').nth(3)).toHaveText('Needs action');

    const flats = card(page, 'Rental flats').locator('dl.groupcard-facts dd');
    await expect(card(page, 'Rental flats')).toContainText('Company or LLP · Your role: Director');
    await expect(flats).toHaveText(['Just you', '5', '—', '—']);
    // A partnership has no family tree, so no safeguard: a dash, never "Set".
    await expect(card(page, 'Reddy & Sons').locator('dl.groupcard-facts dd')).toHaveText(['You and 1 other', '2', '—', '—']);
    await expect(card(page, 'Kondapalli Family').locator('dl.groupcard-facts dd').nth(3)).toHaveText('Set');
  });

  test('List draws a row per group with the same facts, and the choice is kept in ?view=table', async ({ page, world }) => {
    seed(world, MANY);
    await page.goto('/groups');
    await page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Table' }).click();
    await expect(page).toHaveURL(/[?&]view=table/);
    await expect(page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Table' }))
      .toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.cards')).toHaveCount(0);
    await expect(page.locator('table.rectable thead th')).toHaveText([
      '', 'Name', 'Type', 'Your role', 'People', 'Properties', 'Extent', 'Safeguard', '',
    ]);
    await expect(rowNames(page)).toHaveText(BY_TYPE);
    await expect(row(page, 'Rental flats').locator('td')).toHaveText([
      '', 'Rental flats', 'Company or LLP', 'Director', 'Just you', '5', '—', '—', '',
    ]);
    await expect(row(page, 'Telukutla Family').locator('td').nth(7)).toHaveText('Needs action');
    await expect(row(page, 'Telukutla Family').locator('td').nth(6)).not.toHaveText('—');
    await expect(row(page, 'Reddy & Sons').locator('td').nth(3)).toHaveText('Partner');

    // Kept across a reload, and Grid takes the parameter away again.
    await page.reload();
    await expect(rowNames(page)).toHaveCount(7);
    await page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Grid' }).click();
    await expect(page).not.toHaveURL(/view=/);
    await expect(cardNames(page)).toHaveCount(7);
  });

  test('the Type filter takes several types, narrows both views, updates the tally, and Clear all brings everyone back', async ({ page, world }) => {
    seed(world, MANY);
    await page.goto('/groups');
    await page.getByRole('button', { name: '+ Filter' }).click();
    const pop = page.getByRole('group', { name: 'Narrow families and groups' });
    // The options are the types this list has, in Type order, each counted.
    await expect(pop.getByRole('button')).toHaveText([
      /^Families\s*3/, /^HUFs\s*1/, /^Partnerships\s*1/, /^Companies & LLPs\s*1/, /^Trusts & societies\s*1/,
    ]);
    await pop.getByRole('button', { name: /^Families/ }).click();
    await expect(cardNames(page)).toHaveText(['Kondapalli Family', 'Telukutla Family', 'Telukutla Family (parents)']);
    await expect(page.getByText('3 of 7 shown')).toBeVisible();
    await pop.getByRole('button', { name: /^Companies/ }).click();
    await expect(cardNames(page)).toHaveText([
      'Kondapalli Family', 'Telukutla Family', 'Telukutla Family (parents)', 'Rental flats',
    ]);
    await expect(page.getByText('4 of 7 shown')).toBeVisible();
    await expect(page).toHaveURL(/type=family/);
    await expect(page).toHaveURL(/type=company/);
    await page.keyboard.press('Escape');

    // The same narrowing in List.
    await page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Table' }).click();
    await expect(rowNames(page)).toHaveText([
      'Kondapalli Family', 'Telukutla Family', 'Telukutla Family (parents)', 'Rental flats',
    ]);
    await expect(page.getByText('4 of 7 shown')).toBeVisible();

    await page.getByRole('button', { name: 'Clear all' }).click();
    await expect(rowNames(page)).toHaveCount(7);
    await expect(page.getByText('7 of 7 shown')).toBeVisible();
    await expect(page).not.toHaveURL(/type=/);
  });

  test('a ?type= link opens narrowed', async ({ page, world }) => {
    seed(world, MANY);
    await page.goto('/groups?type=trust&view=table');
    await expect(rowNames(page)).toHaveText(['Temple Trust']);
    await expect(page.getByText('1 of 7 shown')).toBeVisible();
  });

  test('Sort cycles Type → Name A–Z → Most properties → Newest first → Type, in both views', async ({ page, world }) => {
    seed(world, MANY);
    await page.goto('/groups');
    await expect(cardNames(page)).toHaveText(BY_TYPE);
    await page.getByRole('button', { name: 'Sort: Type' }).click();
    const byName = [
      'Kondapalli Family', 'Reddy & Sons', 'Rental flats', 'Telukutla Family', 'Telukutla Family (parents)',
      'Telukutla HUF', 'Temple Trust',
    ];
    await expect(cardNames(page)).toHaveText(byName);
    await page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Table' }).click();
    await expect(rowNames(page)).toHaveText(byName);

    await page.getByRole('button', { name: 'Sort: Name A–Z' }).click();
    await expect(rowNames(page)).toHaveText([
      'Rental flats', 'Telukutla Family (parents)', 'Reddy & Sons',
      'Kondapalli Family', 'Telukutla Family', 'Telukutla HUF', 'Temple Trust',
    ]);
    await page.getByRole('button', { name: 'Sort: Most properties' }).click();
    await expect(rowNames(page).first()).toHaveText('Temple Trust');
    await page.getByRole('button', { name: 'Sort: Newest first' }).click();
    await expect(page.getByRole('button', { name: 'Sort: Type' })).toBeVisible();
    await expect(rowNames(page)).toHaveText(BY_TYPE);
  });

  test('List sorts by a heading, totals every filtered row in its footer, and pages past twenty', async ({ page, world }) => {
    const many = Array.from({ length: 25 }, (_, i) =>
      group({ id: `grp-${i}`, name: `Group ${String(i).padStart(2, '0')}`, parcelCount: 1, totalExtent: 0.5 }));
    seed(world, many);
    await page.goto('/groups?view=table');
    await expect(rowNames(page)).toHaveCount(20);
    const foot = page.locator('table.rectable tfoot tr');
    await expect(foot.locator('th')).toHaveText('Total · 25 groups');
    await expect(foot.locator('td').nth(1)).toHaveText('25');
    await expect(foot.locator('td').nth(2)).toHaveText(/^12 Acres/);
    const pager = page.getByRole('navigation', { name: 'Families and groups pages' });
    await expect(pager).toContainText('1–20 of 25');
    await pager.getByRole('button', { name: 'Next' }).click();
    await expect(rowNames(page)).toHaveCount(5);
    // A heading's sort starts again on page one; the band's Sort hands the order back.
    await page.getByRole('button', { name: 'Name' }).click();
    await expect(page.locator('th', { has: page.getByRole('button', { name: 'Name' }) })).toHaveAttribute('aria-sort', 'ascending');
    await expect(rowNames(page)).toHaveCount(20);
    await page.getByRole('button', { name: 'Name' }).click();
    await expect(rowNames(page).first()).toHaveText('Group 24');
  });

  test('ticking two rows sums them in the footer and offers Export in the selection bar', async ({ page, world }) => {
    const many = Array.from({ length: 6 }, (_, i) =>
      group({ id: `grp-${i}`, name: `Group ${i}`, parcelCount: i + 1, totalExtent: 0.5 }));
    seed(world, many);
    await page.goto('/groups?view=table');
    await page.getByRole('checkbox', { name: 'Select Group 1' }).check();
    await page.getByRole('checkbox', { name: 'Select Group 2' }).check();
    const foot = page.locator('table.rectable tfoot tr');
    await expect(foot.locator('th')).toHaveText('2 groups selected');
    await expect(foot.locator('td').nth(1)).toHaveText('5');
    const bar = page.getByRole('group', { name: 'Act on the selected groups' });
    await expect(bar.getByRole('status')).toHaveText('2 groups selected');
    await expect(bar.getByRole('button', { name: 'Export' })).toBeVisible();
    await bar.getByRole('button', { name: 'Clear' }).click();
    await expect(foot.locator('th')).toHaveText('Total · 6 groups');
  });

  test('clicking anywhere on a card opens that group, and its menu does not', async ({ page, world }) => {
    seed(world, MANY);
    await page.goto('/groups');
    // The kebab sits above the stretched link: opening it navigates nowhere.
    await card(page, 'Temple Trust').getByRole('button', { name: 'Actions for Temple Trust' }).click();
    await expect(page.getByRole('menuitem', { name: 'Open' })).toBeVisible();
    await expect(page).toHaveURL(/\/groups$/);
    await page.keyboard.press('Escape');

    // Bottom-left corner, in the facts, nowhere near the name.
    const target = card(page, 'Temple Trust');
    const box = (await target.boundingBox())!;
    await target.click({ position: { x: 8, y: box.height - 8 } });
    await expect(page).toHaveURL(/\/groups\/grp-trust$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Temple Trust' })).toBeVisible();
    await expect(tabs(page)).toHaveText([/^Members/, /^Details/, /^Properties/, /^Activity/]);

    await page.goBack();
    await card(page, 'Kondapalli Family').getByRole('link', { name: 'Kondapalli Family' }).click();
    await expect(page).toHaveURL(/\/groups\/grp-inlaws$/);
  });

  test('a list row\'s name opens that group, and so does the kebab\'s Open', async ({ page, world }) => {
    seed(world, MANY);
    await page.goto('/groups?view=table');
    await row(page, 'Telukutla HUF').getByRole('link', { name: 'Telukutla HUF' }).click();
    await expect(page).toHaveURL(/\/groups\/grp-huf$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Telukutla HUF' })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/view=table/);
    await page.getByRole('button', { name: 'Actions for Reddy & Sons' }).click();
    await page.getByRole('menuitem', { name: 'Open' }).click();
    await expect(page).toHaveURL(/\/groups\/grp-firm$/);
  });

  test('the kebab offers Open, Edit and Delete, the last named for the type', async ({ page, world }) => {
    seed(world, MANY);
    await page.goto('/groups');
    await page.getByRole('button', { name: 'Actions for Reddy & Sons' }).click();
    await expect(page.getByRole('menuitem')).toHaveText(['Open', 'Edit details', 'Delete this partnership']);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Actions for Kondapalli Family', exact: true }).click();
    await expect(page.getByRole('menuitem', { name: 'Delete this family' })).toBeVisible();
  });

  test('a filter that matches nothing says so and offers Clear all', async ({ page, world }) => {
    seed(world, MANY.filter((g) => g.type === 'family'));
    await page.goto('/groups?type=trust');
    await expect(page.getByText('No families or groups match these filters')).toBeVisible();
    await page.locator('.emptypanel, .blank').getByRole('button', { name: 'Clear all' }).click();
    await expect(cardNames(page)).toHaveCount(3);
  });

  test('an account with no groups gets one way in, and no toggle, filter or sort', async ({ page, world }) => {
    seed(world, []);
    await page.goto('/groups');
    await expect(page.getByText('No families or groups yet')).toBeVisible();
    await expect(page.getByRole('button', { name: 'New family or group' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'View' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '+ Filter' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Sort:/ })).toHaveCount(0);
  });

  test('@phone the grid is one column of cards and the page never scrolls sideways', async ({ page, world }) => {
    seed(world, MANY);
    await page.goto('/groups');
    await expect(cardNames(page)).toHaveCount(7);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('@phone-only the grid stacks the cards in one column', async ({ page, world }) => {
    seed(world, MANY);
    await page.goto('/groups');
    const a = (await card(page, 'Kondapalli Family').boundingBox())!;
    const b = (await card(page, 'Telukutla Family').boundingBox())!;
    expect(Math.abs(a.x - b.x)).toBeLessThan(1);
    expect(b.y).toBeGreaterThan(a.y);
  });

  test('@phone the list scrolls inside its card, never the page', async ({ page, world }) => {
    seed(world, MANY);
    await page.goto('/groups?view=table');
    await expect(rowNames(page)).toHaveCount(7);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test.describe('the list: create, edit and delete', () => {
  test('New family or group creates the chosen type and lands on the new group\'s page', async ({ page, world }) => {
    liveGroups(world, MANY);
    await page.goto('/groups?view=table');
    await page.getByRole('button', { name: 'New family or group' }).click();
    const dialog = page.getByRole('dialog', { name: 'New family or group' });
    await dialog.getByRole('button', { name: /^HUF/ }).click();
    await dialog.getByLabel('Name').fill('Kondapalli HUF');
    await dialog.getByLabel('Description').fill('Ancestral.');
    await dialog.getByRole('button', { name: 'Add the group' }).click();
    await expect.poll(() => world.calls('root.createGroup').length).toBe(1);
    expect(world.lastVars('root.createGroup')).toMatchObject({ t: 'huf', n: 'Kondapalli HUF', d: 'Ancestral.' });
    await expect(page.getByText('Kondapalli HUF created')).toBeVisible();
    await expect(page).toHaveURL(/\/groups\/grp-new$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Kondapalli HUF' })).toBeVisible();
    await expect(page.getByText(/^HUF · Your role: /)).toBeVisible();
    await expect(page.getByText('Ancestral.')).toBeVisible();

    await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Families & groups' }).click();
    await expect(page.getByText('8 of 8 shown')).toBeVisible();
    await expect(card(page, 'Kondapalli HUF')).toHaveCount(1);
  });

  test('a new group whose list cannot be read again never opens on "not on file"', async ({ page, world }) => {
    const rows = liveGroups(world, MANY);
    // The create succeeds, then every read of the list fails: the group was
    // made, so the page must say the list did not load, not that it is gone.
    world.set('root.createGroup', (v: Record<string, unknown>) => {
      rows.push(group({ id: 'grp-new', type: v.t, name: v.n, description: v.d }));
      world.set('root.groups', World.gqlError('the database is down'));
      return { id: 'grp-new' };
    });
    await page.goto('/groups');
    await page.getByRole('button', { name: 'New family or group' }).click();
    const dialog = page.getByRole('dialog', { name: 'New family or group' });
    await dialog.getByLabel('Name').fill('Kondapalli Family');
    await dialog.getByRole('button', { name: 'Add the group' }).click();
    await expect(page).toHaveURL(/\/groups\/grp-new$/);
    await expect(page.getByText('This family or group did not load')).toBeVisible();
    await expect(page.getByText('This family or group is not on file')).toHaveCount(0);
  });

  test('a long name wraps to two lines on its card, and the link carries the whole name', async ({ page, world }) => {
    const parents = 'Venkatasubramanian Reddy Family (parents)';
    const inlaws = 'Venkatasubramanian Reddy Family (in-laws)';
    seed(world, [group({ id: 'grp-p', name: parents }), group({ id: 'grp-i', name: inlaws })]);
    await page.goto('/groups');
    for (const name of [parents, inlaws]) {
      const link = card(page, name).getByRole('link', { name, exact: true });
      await expect(link).toHaveAttribute('title', name);
      const h3 = card(page, name).locator('h3');
      // Nothing clipped: the suffix that tells the two apart is on screen.
      expect(await h3.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
    }
  });

  test('the first group is created from the empty state', async ({ page, world }) => {
    liveGroups(world, []);
    await page.goto('/groups');
    await page.getByRole('button', { name: 'New family or group' }).click();
    const dialog = page.getByRole('dialog', { name: 'New family or group' });
    await dialog.getByLabel('Name').fill('Telukutla Family');
    await dialog.getByRole('button', { name: 'Add the group' }).click();
    await expect(page).toHaveURL(/\/groups\/grp-new$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Telukutla Family' })).toBeVisible();
  });

  test('Cancel creates nothing and stays on the list', async ({ page, world }) => {
    liveGroups(world, MANY);
    await page.goto('/groups');
    await page.getByRole('button', { name: 'New family or group' }).click();
    const dialog = page.getByRole('dialog', { name: 'New family or group' });
    await dialog.getByLabel('Name').fill('Nobody');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
    expect(world.calls('root.createGroup')).toHaveLength(0);
    await expect(page).toHaveURL(/\/groups$/);
  });

  test('a nameless group is refused in the dialog, before any write', async ({ page, world }) => {
    liveGroups(world, MANY);
    await page.goto('/groups');
    await page.getByRole('button', { name: 'New family or group' }).click();
    const dialog = page.getByRole('dialog', { name: 'New family or group' });
    await dialog.getByRole('button', { name: 'Add the group' }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Give the group a name.');
    expect(world.calls('root.createGroup')).toHaveLength(0);
  });

  test('Edit from a card\'s kebab renames it on the list, and its page says the new name', async ({ page, world }) => {
    liveGroups(world, MANY);
    await page.goto('/groups');
    await page.getByRole('button', { name: 'Actions for Temple Trust' }).click();
    await page.getByRole('menuitem', { name: 'Edit details' }).click();
    const edit = page.getByRole('dialog', { name: 'Edit Temple Trust' });
    await expect(edit.getByText('Trust or society · cannot be changed', { exact: false })).toBeVisible();
    await edit.getByLabel('Name').fill('Sri Rama Temple Trust');
    await edit.getByRole('button', { name: 'Save' }).click();
    await expect.poll(() => world.calls('root.updateGroup').length).toBe(1);
    expect(world.lastVars('root.updateGroup')).toMatchObject({ id: 'grp-trust', n: 'Sri Rama Temple Trust' });
    await expect(edit).toHaveCount(0);
    await expect(page).toHaveURL(/\/groups$/);
    await expect(card(page, 'Sri Rama Temple Trust')).toHaveCount(1);
    await expect(card(page, 'Temple Trust')).toHaveCount(0);

    await card(page, 'Sri Rama Temple Trust').getByRole('link').click();
    await expect(page.getByRole('heading', { level: 1, name: 'Sri Rama Temple Trust' })).toBeVisible();
  });

  test('Edit from a list row\'s kebab renames the row', async ({ page, world }) => {
    liveGroups(world, MANY);
    await page.goto('/groups?view=table');
    await page.getByRole('button', { name: 'Actions for Rental flats' }).click();
    await page.getByRole('menuitem', { name: 'Edit details' }).click();
    const edit = page.getByRole('dialog', { name: 'Edit Rental flats' });
    await edit.getByLabel('Name').fill('Rental flats, Ongole');
    await edit.getByRole('button', { name: 'Save' }).click();
    await expect(edit).toHaveCount(0);
    await expect(row(page, 'Rental flats, Ongole')).toHaveCount(1);
    await expect(page).toHaveURL(/view=table/);
  });

  test('a new LLP asks for its LLPIN, not a CIN, and refuses to save without its required details', async ({ page, world }) => {
    liveGroups(world, MANY);
    await page.goto('/groups');
    await page.getByRole('button', { name: 'New family or group' }).click();
    const dialog = page.getByRole('dialog', { name: 'New family or group' });
    await dialog.getByRole('button', { name: /^Company or LLP/ }).click();
    await expect(dialog.getByLabel('Country')).toHaveValue('IN');
    await dialog.getByLabel('Kind of company').selectOption('LLP');
    await expect(dialog.getByLabel('LLPIN')).toBeVisible();
    await expect(dialog.getByLabel('CIN', { exact: true })).toHaveCount(0);
    await dialog.getByLabel('Name').fill('Reddy Farms LLP');
    await dialog.getByRole('button', { name: 'Add the group' }).click();
    await expect(dialog.getByRole('alert')).toContainText('Fill in LLPIN');
    expect(world.calls('root.createGroup')).toHaveLength(0);

    await dialog.getByLabel('LLPIN').fill('aab-1234');
    await dialog.getByLabel('Date of incorporation').fill('2015-04-01');
    await dialog.getByLabel('Registered office').fill('Plot 4, Ongole');
    await dialog.getByRole('button', { name: 'Add the group' }).click();
    await expect.poll(() => world.calls('root.createGroup').length).toBe(1);
    const sent = world.lastVars('root.createGroup');
    expect(sent).toMatchObject({ t: 'company', n: 'Reddy Farms LLP' });
    expect(JSON.parse(String(sent.x))).toEqual({
      country: 'IN', sub_kind: 'LLP', llpin: 'AAB-1234', incorporated_on: '2015-04-01', address: 'Plot 4, Ongole',
    });
  });

  test('a company abroad asks for a tax ID and registration number, never an Indian PAN or CIN', async ({ page, world }) => {
    liveGroups(world, MANY);
    await page.goto('/groups');
    await page.getByRole('button', { name: 'New family or group' }).click();
    const dialog = page.getByRole('dialog', { name: 'New family or group' });
    await dialog.getByRole('button', { name: /^Company or LLP/ }).click();
    await dialog.getByLabel('Country').selectOption('US');
    await dialog.getByLabel('Kind of company').selectOption('Private limited');
    await expect(dialog.getByLabel('Tax ID')).toBeVisible();
    await expect(dialog.getByLabel('Registration number')).toBeVisible();
    await expect(dialog.getByLabel('PAN', { exact: true })).toHaveCount(0);
    await expect(dialog.getByLabel('CIN', { exact: true })).toHaveCount(0);
  });

  test('a personal PAN in a firm\'s PAN field blocks the save', async ({ page, world }) => {
    liveGroups(world, MANY);
    await page.goto('/groups');
    await page.getByRole('button', { name: 'New family or group' }).click();
    const dialog = page.getByRole('dialog', { name: 'New family or group' });
    await dialog.getByRole('button', { name: /^Partnership/ }).click();
    await dialog.getByLabel('Registered firm?').selectOption('No');
    await dialog.getByLabel('Partnership deed date').fill('2019-06-01');
    await dialog.getByLabel('PAN', { exact: true }).fill('ABCPE1234F');
    await dialog.getByLabel('Name').fill('Reddy & Sons 2');
    await dialog.getByRole('button', { name: 'Add the group' }).click();
    await expect(dialog.getByRole('alert')).toHaveText("This is a personal PAN; enter the firm's PAN.");
    expect(world.calls('root.createGroup')).toHaveLength(0);
  });

  test('Delete from a card\'s kebab asks, then takes the card off the list', async ({ page, world }) => {
    liveGroups(world, MANY);
    await page.goto('/groups');
    await page.getByRole('button', { name: 'Actions for Reddy & Sons' }).click();
    await page.getByRole('menuitem', { name: 'Delete this partnership' }).click();
    const del = page.getByRole('dialog', { name: 'Delete Reddy & Sons?' });
    await del.getByRole('button', { name: 'Delete this group' }).click();
    await expect.poll(() => world.calls('root.deleteGroup').length).toBe(1);
    expect(world.lastVars('root.deleteGroup')).toMatchObject({ id: FIRM });
    await expect(del).toHaveCount(0);
    await expect(page.getByText('Reddy & Sons deleted')).toBeVisible();
    await expect(card(page, 'Reddy & Sons')).toHaveCount(0);
    await expect(cardNames(page)).toHaveCount(6);
    await expect(page.getByText('6 of 6 shown')).toBeVisible();
    await expect(page).toHaveURL(/\/groups$/);
  });

  test('Delete from a list row\'s kebab takes the row away; Cancel does not', async ({ page, world }) => {
    liveGroups(world, MANY);
    await page.goto('/groups?view=table');
    await page.getByRole('button', { name: 'Actions for Telukutla HUF' }).click();
    await page.getByRole('menuitem', { name: 'Delete this HUF' }).click();
    const del = page.getByRole('dialog', { name: 'Delete Telukutla HUF?' });
    await del.getByRole('button', { name: 'Cancel' }).click();
    await expect(rowNames(page)).toHaveCount(7);
    expect(world.calls('root.deleteGroup')).toHaveLength(0);

    await page.getByRole('button', { name: 'Actions for Telukutla HUF' }).click();
    await page.getByRole('menuitem', { name: /^Delete this/ }).click();
    await del.getByRole('button', { name: 'Delete this group' }).click();
    await expect(row(page, 'Telukutla HUF')).toHaveCount(0);
    await expect(rowNames(page)).toHaveCount(6);
  });

  test('a new group named like an existing one gets a note, not a refusal', async ({ page, world }) => {
    seed(world, MANY);
    world.set('root.createGroup', { id: 'grp-new' });
    await page.goto('/groups');
    await page.getByRole('button', { name: 'New family or group' }).click();
    const dialog = page.getByRole('dialog', { name: 'New family or group' });
    const name = dialog.getByLabel('Name');
    await name.fill('  telukutla   FAMILY ');
    const note = dialog.getByRole('status');
    await expect(note).toContainText('You already have a group with this name.');
    await expect(note).toContainText('in-laws');
    await expect(name).toHaveAccessibleDescription(/You already have a group with this name/);
    await name.fill('Telukutla Family (in-laws)');
    await expect(dialog.getByText('You already have a group with this name.', { exact: false })).toHaveCount(0);
    await name.fill('Telukutla Family');
    await dialog.getByRole('button', { name: 'Add the group' }).click();
    await expect.poll(() => world.calls('root.createGroup').length).toBe(1);
  });

  test('renaming a group to its own name draws no note', async ({ page, world }) => {
    seed(world, MANY);
    await page.goto('/groups/grp-own');
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const edit = page.getByRole('dialog', { name: 'Edit Telukutla Family' });
    await expect(edit.getByLabel('Name')).toHaveValue('Telukutla Family');
    await expect(edit.getByRole('status')).toHaveCount(0);
    await edit.getByLabel('Name').fill('Kondapalli family');
    await expect(edit.getByRole('status')).toContainText('You already have a group with this name.');
  });
});

test.describe('the Properties tab: the Properties list, for this group', () => {
  const panelOf = (page: Page) => page.getByRole('tabpanel');
  const table = (page: Page) => panelOf(page).getByRole('table', { name: 'Properties held by Telukutla Family' });
  const rowOf = (page: Page, title: string) =>
    table(page).getByRole('row').filter({ has: page.getByRole('link', { name: title, exact: true }) });

  test('the tab is the Properties List table, without "Held by", one row per property', async ({ page, world }) => {
    seed(world, [LANDED()], LAND_CARDS());
    await page.goto(`/groups/${FAMILY}?tab=properties`);
    const panel = panelOf(page);
    await expect(table(page).locator('thead th')).toHaveText(
      ['Survey No / LP', 'Type', 'Owner', 'Where', 'Holding', 'Managed by', 'Status', 'Extent',
        'Market estimate', 'Title deed', 'Last activity', '']);
    await expect(table(page).getByRole('columnheader', { name: 'Held by' })).toHaveCount(0);
    await expect(table(page).locator('tbody tr')).toHaveCount(4);
    await expect(table(page).locator('tbody tr a.accent')).toHaveText(['Sy 214/2', 'Sy 214/3', 'Sy 88', 'Flat 4B, Sai Residency']);
    await expect(rowOf(page, 'Sy 214/2').getByRole('link', { name: 'Thota farm' }))
      .toHaveAttribute('href', '/holdings/cp-thota');
    await expect(rowOf(page, 'Sy 214/3')).toContainText('—');
    await expect(rowOf(page, 'Flat 4B, Sai Residency')).toContainText('1,450 sq.ft');
    await expect(rowOf(page, 'Sy 88')).toContainText('1.20 ac');
    await expect(panel.getByText('4 properties · 5.73 ac', { exact: true })).toBeVisible();

    // What the khata list used to draw is gone: no khata rows, no pattadar
    // flags, no parcels to show.
    await expect(panel).not.toContainText(/Khata \(no number|Not a member of this group|Pattadar:|Show parcels|khatas?\b ·/);

    // The fixed disclaimer, and the way to the full list.
    await expect(panel.getByText('Your own record of who shares this land. It does not change the khata.', { exact: true })).toBeVisible();
    await expect(panel.getByRole('link', { name: 'Open these in Properties for map, filters and export' }))
      .toHaveAttribute('href', `/properties?group=${FAMILY}`);
    await expect(panel.getByRole('button', { name: '+ Filter' })).toHaveCount(0);
    await expect(panel.getByRole('button', { name: 'Export' })).toHaveCount(0);
  });

  test('one number: the badge, the facts line, the tile and the rows all count properties', async ({ page, world }) => {
    // The founder's shape: ten khatas on the group, nine of them with no
    // parcels, and one 5-acre property.
    seed(world, [group({ landCount: 10, parcelCount: 1, totalExtent: 5, memberCount: 0 })], [
      cardOf(ID.plot, { ...HELD_HERE, extent: 5 }),
      cardOf(ID.flat),
    ]);
    await page.goto(`/groups/${FAMILY}?tab=properties`);
    await expect(page.getByRole('tab', { name: /^Properties/ })).toHaveText(/Properties\s*1$/);
    await expect(page.getByText('1 member · 1 property', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: '1 property · 5.00 ac. Open them in Properties' })).toHaveText('1 property · 5.00 ac');
    await expect(table(page).locator('tbody tr')).toHaveCount(1);
    // No khata count anywhere (the disclaimer's "the khata" is not a count).
    await expect(page.locator('main')).not.toContainText(/\d+ khatas?\b|khatas\b/i);
  });

  test('a row opens its property, from its name or from anywhere else on the row', async ({ page, world }) => {
    seed(world, [LANDED()], LAND_CARDS());
    await page.goto(`/groups/${FAMILY}?tab=properties`);
    await rowOf(page, 'Sy 214/2').getByRole('link', { name: 'Sy 214/2' }).click();
    await expect(page).toHaveURL(new RegExp(`/properties/${ID.parcel}$`));

    await page.goBack();
    await rowOf(page, 'Sy 88').locator('td').nth(2).click();
    await expect(page).toHaveURL(new RegExp(`/properties/${ID.plot}$`));
  });

  test('the row kebab: Open, Take out of this family, then the property\'s own actions', async ({ page, world }) => {
    seed(world, [LANDED()], LAND_CARDS());
    await page.goto(`/groups/${FAMILY}?tab=properties`);
    await page.getByRole('button', { name: 'Actions for Sy 88' }).click();
    await expect(page.getByRole('menuitem')).toHaveText(
      ['Open', 'Take out of this family', 'Edit details', 'Order a service', 'Share securely']);
    await page.getByRole('menuitem', { name: 'Open' }).click();
    await expect(page).toHaveURL(new RegExp(`/properties/${ID.plot}$`));
  });

  test('Take out of this family names the other parcel on the khata first, then moves both to your own name', async ({ page, world }) => {
    seed(world, [LANDED()], LAND_CARDS());
    await page.goto(`/groups/${FAMILY}?tab=properties`);
    await page.getByRole('button', { name: 'Actions for Sy 214/2' }).click();
    await page.getByRole('menuitem', { name: 'Take out of this family' }).click();

    // The one holder dialog, started on your own name.
    const dialog = page.getByRole('dialog', { name: 'Take out of Telukutla Family' });
    await expect(dialog.getByLabel('Who holds it')).toHaveValue('personal');
    await expect.poll(() => world.calls('holderChange').length).toBeGreaterThan(0);
    expect(world.lastVars('holderChange')).toMatchObject({ recordIds: [ID.parcel], groupId: 'personal' });
    await expect(dialog.getByTestId('holder-siblings')).toHaveText(
      'A khata has one holder, so this other parcel on the same khata moves to your own name too.');
    await expect(dialog).toContainText('Sy 214/3');
    await expect(dialog).toContainText('2 properties will be in your own name.');
    expect(world.calls('setRecordHolder')).toHaveLength(0);

    await dialog.getByRole('button', { name: 'Move 2 properties' }).click();
    await expect.poll(() => world.calls('setRecordHolder').length).toBe(1);
    expect(world.lastVars('setRecordHolder')).toMatchObject({ recordIds: [ID.parcel], groupId: 'personal' });
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText('Sy 214/2 is in your own name again, with 1 other parcel on its khata', { exact: true })).toBeVisible();
  });

  test('Take out, switched to another group in the dialog, says where it went', async ({ page, world }) => {
    const FIRM_ROW = group({ id: FIRM, type: 'partnership', name: 'Reddy & Sons' });
    seed(world, [LANDED(), FIRM_ROW], LAND_CARDS());
    const names = { [FAMILY]: 'Telukutla Family', [FIRM]: 'Reddy & Sons' };
    world.set('holderChange', holderChangeOver(LAND_CARDS(), names));
    world.set('setRecordHolder', holderChangeOver(LAND_CARDS(), names));
    await page.goto(`/groups/${FAMILY}?tab=properties`);
    await page.getByRole('button', { name: 'Actions for Sy 88' }).click();
    await page.getByRole('menuitem', { name: 'Take out of this family' }).click();
    const dialog = page.getByRole('dialog', { name: 'Take out of Telukutla Family' });
    await dialog.getByLabel('Who holds it').selectOption(FIRM);
    await expect.poll(() => world.lastVars('holderChange')?.groupId).toBe(FIRM);
    await dialog.getByRole('button', { name: /^Move/ }).click();
    await expect.poll(() => world.calls('setRecordHolder').length).toBe(1);
    expect(world.lastVars('setRecordHolder')).toMatchObject({ recordIds: [ID.plot], groupId: FIRM });
    await expect(page.getByText('Sy 88 is now held by Reddy & Sons', { exact: true })).toBeVisible();
    await expect(page.getByText(/in your own name again/)).toHaveCount(0);
  });

  test('a click on the open row menu\'s header or padding stays on the page', async ({ page, world }) => {
    seed(world, [LANDED()], LAND_CARDS());
    await page.goto(`/groups/${FAMILY}?tab=properties`);
    const here = page.url();
    await page.getByRole('button', { name: 'Actions for Sy 88' }).click();
    await page.locator('.menuhead').click();
    await page.locator('.menu-list').click({ position: { x: 2, y: 2 } });
    expect(page.url()).toBe(here);
    await expect(page).toHaveURL(new RegExp(`/groups/${FAMILY}\\?tab=properties$`));
  });

  test('a family that holds nothing says so in its own noun, offers one way in, and no disclaimer over nothing', async ({ page, world }) => {
    seed(world, [group({ landCount: 3 })]);
    await page.goto(`/groups/${FAMILY}?tab=properties`);
    const panel = panelOf(page);
    await expect(panel.getByText('Nothing is held by this family yet')).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Add a property' })).toHaveClass(/\bprimary\b/);
    await expect(panel.getByText(/It does not change the khata/)).toHaveCount(0);
    await expect(panel.getByRole('table')).toHaveCount(0);
    await expect(page.getByRole('tab', { name: /^Properties/ })).toHaveText(/Properties\s*0$/);
    await expect(page.getByRole('link', { name: /Open them in Properties$/ })).toHaveCount(0);
  });

  test('@phone the Properties tab scrolls its table inside the card, never the page', async ({ page, world }) => {
    seed(world, [LANDED()], LAND_CARDS());
    await page.goto(`/groups/${FAMILY}?tab=properties`);
    await expect(table(page).locator('tbody tr')).toHaveCount(4);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test.describe('members: shares', () => {
  test('a share is a percentage of the group’s land, never acres per person', async ({ page, world }) => {
    seed(world, [LANDED()], LAND_CARDS());
    world.set('root.members', [
      SELF,
      { ...WIFE, isBeneficiary: true, sharePct: 50, kind: 'heir' },
      { ...SON, isBeneficiary: true, sharePct: 50, kind: 'heir' },
    ]);
    await page.goto(`/groups/${FAMILY}`);
    const panel = page.getByRole('tabpanel');
    // The share rule is standing guidance: behind the Members heading's ⓘ, not a line under it.
    await expect(panel.getByText("A share is of the group's land, not a right to a particular plot.")).toBeHidden();
    await expect(panel.getByRole('button', { name: 'About Members' }))
      .toHaveAccessibleDescription("A share is of the group's land, not a right to a particular plot.");
    await expect(panel.locator('.sechead .note')).toHaveText('You and 2 others · 2 heirs · 100% allocated · 1 not verified');
    const wife = panel.locator('tbody tr').filter({ hasText: 'Lakshmi' });
    await expect(wife).toContainText('50%');
    await expect(wife).toContainText('All properties');
    await expect(wife).not.toContainText('notional');
    // Never turned into land: 50% of 5.70 ac is not printed anywhere.
    await expect(panel).not.toContainText(/\d ac\b/);
  });

  test('a share tied to a parcel the group no longer holds stays, and says so', async ({ page, world }) => {
    seed(world, [LANDED()], LAND_CARDS());
    world.set('root.members', [
      SELF,
      // Sy 88 is held by this group; r-gone moved to another holder.
      { ...WIFE, isBeneficiary: true, sharePct: 50, kind: 'heir', parcelId: ID.plot },
      { ...SON, isBeneficiary: true, sharePct: 25, kind: 'heir', parcelId: 'r-gone' },
    ]);
    await page.goto(`/groups/${FAMILY}`);
    const panel = page.getByRole('tabpanel');
    const son = panel.locator('tbody tr').filter({ hasText: 'Arjun' });
    await expect(son).toContainText('25%');
    await expect(son.getByTestId('share-not-held')).toHaveText('No longer held by this group');
    const wife = panel.locator('tbody tr').filter({ hasText: 'Lakshmi' });
    await expect(wife).toContainText('50%');
    await expect(wife.getByTestId('share-not-held')).toHaveCount(0);
  });

  test('a share on a parcel the group still holds but has archived is not flagged as no longer held', async ({ page, world }) => {
    // The archived shop is held here. The group's list leaves archived records
    // out, but the held check must still count it.
    const land = LAND_CARDS().map((c) => (c.id === ID.shop ? { ...c, ...HELD_HERE } : c));
    seed(world, [LANDED()], land);
    world.set('root.members', [
      SELF,
      { ...WIFE, isBeneficiary: true, sharePct: 50, kind: 'heir', parcelId: ID.shop },
      { ...SON, isBeneficiary: true, sharePct: 25, kind: 'heir', parcelId: 'r-gone' },
    ]);
    await page.goto(`/groups/${FAMILY}`);
    const panel = page.getByRole('tabpanel');
    await expect(panel.locator('tbody tr').filter({ hasText: 'Arjun' }).getByTestId('share-not-held'))
      .toHaveText('No longer held by this group');
    const wife = panel.locator('tbody tr').filter({ hasText: 'Lakshmi' });
    await expect(wife).toContainText('50%');
    await expect(wife.getByTestId('share-not-held')).toHaveCount(0);
  });

  test('an HUF coparcener’s share is notional until partition', async ({ page, world }) => {
    seed(world, [group({ type: 'huf', name: 'Telukutla HUF', myRole: 'Karta' })]);
    world.set('root.members', [SELF, { ...SON, isBeneficiary: true, sharePct: 25, kind: 'coparcener' }]);
    await page.goto(`/groups/${FAMILY}`);
    const son = page.getByRole('tabpanel').locator('tbody tr').filter({ hasText: 'Arjun' });
    await expect(son).toContainText('25%');
    await expect(son).toContainText('All properties · notional until partition');
  });
});

test.describe('group types', () => {
  test('a new group is one of five kinds, and Portfolio / Wallet is not one of them', async ({ page, world }) => {
    seed(world, MANY);
    await page.goto('/groups');
    await page.getByRole('button', { name: 'New family or group' }).click();
    const dialog = page.getByRole('dialog', { name: 'New family or group' });
    const kinds = dialog.locator('.choice > button');
    await expect(kinds).toHaveCount(5);
    for (const label of ['Family', 'HUF', 'Partnership', 'Company or LLP', 'Trust or society']) {
      await expect(kinds.filter({ hasText: new RegExp(`^${label}`) })).toHaveCount(1);
    }
    await expect(dialog).not.toContainText(/portfolio|wallet/i);
  });

  test('the list’s Type filter offers no Portfolio either', async ({ page, world }) => {
    seed(world, MANY);
    await page.goto('/groups');
    await page.getByRole('button', { name: '+ Filter' }).click();
    await expect(page.locator('main')).not.toContainText(/portfolio|wallet/i);
  });
});

test.describe('moving a property between groups', () => {
  const HELD = [
    { ...CARDS[0], id: 'r-own-flat', kind: 'property', classification: 'flat', title: 'Flat 302', passbookId: '', groupId: '' },
    { ...CARDS[0], id: 'r-firm-land', kind: 'parcel', title: 'Sy 77', passbookId: 'pb-firm', groupId: FIRM },
    { ...CARDS[0], id: 'r-firm-shop', kind: 'property', classification: 'shop', title: 'Shop 4', passbookId: '', groupId: FIRM },
    { ...CARDS[0], id: 'r-here', kind: 'parcel', title: 'Sy 1', passbookId: 'pb-here', groupId: FAMILY },
  ];

  /** The resolver's `groups` facet: OR over the ids, `personal` for ''. */
  function properties(world: World) {
    world.set('properties', (vars: Record<string, unknown>) => {
      const want = (vars.groups as string[] | undefined) ?? [];
      const cards = HELD.filter((c) => !want.length || want.includes(c.groupId || 'personal'));
      return {
        shown: cards.length, total: HELD.length, hidden: HELD.length - cards.length, filterSummary: '',
        hiddenPlaces: [], activeCount: want.length, cards, facets: [],
      };
    });
  }

  test('Add a property lists your own name first, then what other groups hold, each saying who holds it', async ({ page, world }) => {
    seed(world, [group({ parcelCount: 1 }), group({ id: FIRM, type: 'partnership', name: 'Reddy & Sons' })]);
    properties(world);
    // One write for both grains (decision memo 06/10/2026): the server moves a
    // parcel's whole khata and answers with every property that moved.
    world.set('setRecordHolder', (vars: Record<string, unknown>) => ({
      groupId: vars.groupId, holderLabel: 'Telukutla Family', siblingCount: 0,
      records: (vars.recordIds as string[]).map((id) => ({
        id, kind: 'property', title: '', passbookId: '', khataNo: '', requested: true,
        fromGroupId: FIRM, fromHolderLabel: 'Reddy & Sons',
      })),
      memberShares: [],
    }));
    await page.goto(`/groups/${FAMILY}?tab=properties`);
    await page.getByRole('button', { name: 'Add a property' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add a property to Telukutla Family' });
    const rows = dialog.locator('.rows.boxed > div');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText('Flat 302');
    await expect(rows.nth(0)).toContainText('In your own name');
    await expect(rows.nth(1)).toContainText('In Reddy & Sons');
    await expect(rows.nth(2)).toContainText('In Reddy & Sons');
    // Never what this group already holds.
    await expect(dialog.getByText('Sy 1', { exact: true })).toHaveCount(0);

    await rows.filter({ hasText: 'Shop 4' }).getByRole('button', { name: 'Move in' }).click();
    await expect.poll(() => world.calls('setRecordHolder').length).toBe(1);
    expect(world.lastVars('setRecordHolder')).toMatchObject({ recordIds: ['r-firm-shop'], groupId: FAMILY });
    await expect(page.getByText('Shop 4 is now held by Telukutla Family')).toBeVisible();

    await page.getByRole('button', { name: 'Add a property' }).click();
    await dialog.locator('.rows.boxed > div').filter({ hasText: 'Sy 77' }).getByRole('button', { name: 'Move in' }).click();
    await expect.poll(() => world.calls('setRecordHolder').length).toBe(2);
    expect(world.lastVars('setRecordHolder')).toMatchObject({ recordIds: ['r-firm-land'], groupId: FAMILY });
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
    await page.goto('/groups');
    await page.getByRole('button', { name: 'New family or group' }).click();
    const dialog = page.getByRole('dialog', { name: 'New family or group' });
    await dialog.getByLabel('Name').fill('Kondapalli Family');
    await dialog.getByRole('button', { name: 'Add the group' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'That group could not be created. Nothing has changed.' })).toBeVisible();
    await expect(dialog.getByLabel('Name')).toHaveValue('Kondapalli Family');
  });

  test('a rename or delete the server refuses on the group page keeps its dialog on screen, and the page', async ({ page, world }) => {
    seed(world);
    world.set('root.updateGroup', World.gqlError('refused'));
    world.set('root.deleteGroup', World.gqlError('refused'));
    await page.goto(`/groups/${FAMILY}`);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const edit = page.getByRole('dialog', { name: 'Edit Telukutla Family' });
    await edit.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'That change could not be saved.' })).toBeVisible();
    await expect(edit).toBeVisible();
    await edit.getByRole('button', { name: 'Cancel' }).click();

    await page.getByRole('button', { name: 'Actions for Telukutla Family', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Delete this family' }).click();
    const del = page.getByRole('dialog', { name: 'Delete Telukutla Family?' });
    await del.getByRole('button', { name: 'Delete this group' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'That group could not be deleted.' })).toBeVisible();
    await expect(del).toBeVisible();
    // A refused delete does not leave for the list.
    await expect(page).toHaveURL(new RegExp(`/groups/${FAMILY}$`));
  });

  test('a delete the server refuses from the list keeps the dialog and the card', async ({ page, world }) => {
    seed(world, MANY);
    world.set('root.deleteGroup', World.gqlError('refused'));
    await page.goto('/groups');
    await page.getByRole('button', { name: 'Actions for Temple Trust' }).click();
    await page.getByRole('menuitem', { name: /^Delete this/ }).click();
    const del = page.getByRole('dialog', { name: 'Delete Temple Trust?' });
    await del.getByRole('button', { name: 'Delete this group' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'That group could not be deleted.' })).toBeVisible();
    await expect(del).toBeVisible();
    await expect(card(page, 'Temple Trust')).toHaveCount(1);
  });

  test('a removal the server refuses keeps the dialog naming who it was about', async ({ page, world }) => {
    seed(world);
    world.set('root.removeMember', World.gqlError('refused'));
    await page.goto(`/groups/${FAMILY}`);
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

// ── Details and roles ───────────────────────────────────────────────────

test.describe('a group\'s details and its members\' roles', () => {
  const CO = 'grp-co';
  const company = (facts: Record<string, string>) => group({
    id: CO, type: 'company', name: 'Rental flats', myRole: 'Director', facts: JSON.stringify(facts),
  });
  const director = member({ id: 'm-self', groupId: CO, name: 'Ravi Kumar', isSelf: true, role: 'Director' });

  test('the Details tab lists the facts, dates day first, and flags required gaps', async ({ page, world }) => {
    seed(world, [company({ country: 'IN', sub_kind: 'Private limited', incorporated_on: '2015-04-01' })]);
    world.set('root.members', [director]);
    await page.goto(`/groups/${CO}?tab=details`);
    const panel = page.getByRole('tabpanel');
    const dd = (k: string) => panel.locator('dl.kv > div').filter({ has: page.locator('dt', { hasText: new RegExp(`^${k}$`) }) }).locator('dd');
    await expect(dd('Type')).toHaveText('Company or LLP');
    await expect(dd('Date of incorporation')).toHaveText('01/04/2015');
    await expect(dd('CIN')).toHaveText('Missing');
    await expect(dd('Registered office')).toHaveText('Missing');
    await expect(dd('Status')).toHaveText('—');
    await panel.getByRole('button', { name: 'Edit details' }).click();
    await expect(page.getByRole('dialog', { name: 'Edit Rental flats' })).toBeVisible();
  });

  test('an edit may save with gaps, and sends only the facts that show', async ({ page, world }) => {
    const rows = liveGroups(world, [company({ country: 'IN', sub_kind: 'Private limited' })]);
    world.set('root.members', [director]);
    await page.goto(`/groups/${CO}?tab=details`);
    await page.getByRole('tabpanel').getByRole('button', { name: 'Edit details' }).click();
    const edit = page.getByRole('dialog', { name: 'Edit Rental flats' });
    await expect(edit.getByText(/^Still missing: CIN/)).toBeVisible();
    await edit.getByLabel('Name').fill('Rental flats, Ongole');
    await edit.getByRole('button', { name: 'Save' }).click();
    await expect.poll(() => world.calls('root.updateGroup').length).toBe(1);
    expect(JSON.parse(String(world.lastVars('root.updateGroup').x))).toEqual({ country: 'IN', sub_kind: 'Private limited' });
    expect(rows[0].name).toBe('Rental flats, Ongole');
  });

  test('a role outside the list is typed through Other and saved as typed', async ({ page, world }) => {
    seed(world, [company({ country: 'IN', sub_kind: 'Private limited' })]);
    world.set('root.members', [director]);
    world.set('root.addMember', { id: 'm-new', inviteToken: '', isMinor: false, guardianContact: '', phone: '', email: '' });
    await page.goto(`/groups/${CO}`);
    await page.getByRole('button', { name: 'Add a member' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add member' });
    await dialog.getByLabel('Full name').fill('Suresh Babu');
    // A new member starts as a Director, who is asked for a DIN.
    await expect(dialog.getByRole('textbox', { name: 'DIN' })).toBeVisible();
    await dialog.getByRole('combobox', { name: 'Role' }).click();
    await page.getByRole('option', { name: 'Other (type it)' }).click();
    await expect(dialog.getByRole('textbox', { name: 'DIN' })).toHaveCount(0);
    await dialog.getByRole('textbox', { name: 'Role name' }).fill('Advisor');
    await dialog.getByRole('button', { name: 'Add', exact: true }).click();
    await expect.poll(() => world.calls('root.addMember').length).toBe(1);
    expect(world.lastVars('root.addMember')).toMatchObject({ name: 'Suresh Babu', role: 'Advisor', relation: '', facts: '{}' });
  });

  test('a stored role the list does not carry opens as Other with its words, and its share shows', async ({ page, world }) => {
    seed(world, [company({})]);
    world.set('root.members', [
      director,
      member({ id: 'm-adv', groupId: CO, name: 'Suresh Babu', role: 'Advisor', sharePct: 10 }),
    ]);
    await page.goto(`/groups/${CO}`);
    // A share outside a family shows in the table, though nobody is an heir.
    await expect(page.getByRole('tabpanel').locator('tbody tr').filter({ hasText: 'Suresh Babu' })).toContainText('10%');
    await page.getByRole('button', { name: 'Actions for Suresh Babu' }).click();
    await page.getByRole('menuitem', { name: 'Edit' }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit member' });
    await expect(dialog.getByRole('combobox', { name: 'Role' })).toHaveText(/Other \(type it\)/);
    await expect(dialog.getByRole('textbox', { name: 'Role name' })).toHaveValue('Advisor');
  });
});
