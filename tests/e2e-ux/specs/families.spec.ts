/**
 * Families & Groups — typed group cards with roles, in-page group detail
 * (member table: masked Aadhaar, DD/MM dates), PersonDialog (AI scan panel +
 * minor→guardian logic), verification-invite channels, notifier editor.
 */
import { expect, fmtLocalDate, gql, openApp, test, uxCheck } from '../helpers/fixtures';

interface GroupsData {
  groups: { id: string; type: string; name: string; myRole: string; memberCount: number }[];
}
interface MembersData {
  members: {
    id: string;
    name: string;
    dob: string | null;
    status: string | null;
    aadhaarMasked: string | null;
    isSelf: boolean;
    isBeneficiary: boolean;
  }[];
}

const GROUPS_QUERY = 'query { groups { id type name myRole memberCount } }';
const MEMBERS_QUERY =
  'query($gid: String!) { members(groupId: $gid) { id name dob status aadhaarMasked isSelf isBeneficiary } }';

test('group cards render with roles; detail opens with the member table', async ({ page, request }) => {
  const d = await gql<GroupsData>(request, GROUPS_QUERY);
  test.skip(d.groups.length === 0, 'no groups in the dataset');

  await openApp(page, '/app/groups');
  await expect(page.getByRole('heading', { name: 'Families & Groups' })).toBeVisible();
  await expect(page.getByText('Sample data')).toHaveCount(0);

  const roleTags = page.getByText(/^Your role: /);
  // Each card + the selected detail header shows "Your role:".
  expect(await roleTags.count()).toBeGreaterThanOrEqual(d.groups.length);

  for (const g of d.groups)
    await expect.soft(page.getByText(g.name).first(), `card for "${g.name}"`).toBeVisible();

  // Open the LAST group's detail via its card (selection ring + detail swap).
  const target = d.groups[d.groups.length - 1];
  await page.locator('.MuiCard-root').filter({ hasText: target.name }).first().click();
  await expect(page.getByRole('heading', { level: 2, name: target.name })).toBeVisible();
  for (const tab of ['Members', 'Land', 'Invitations', 'Activity'])
    await expect.soft(page.getByRole('tab', { name: tab }), `group tab ${tab}`).toBeVisible();

  // Member table: masked Aadhaar + DD/MM dates, never a raw Aadhaar number.
  const members = (await gql<MembersData>(request, MEMBERS_QUERY, { gid: target.id })).members;
  await expect
    .poll(() => page.locator('tbody tr').count(), { message: 'member rows match GraphQL' })
    .toBe(Math.max(members.length, 1)); // empty state renders one placeholder row

  const bodyText = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  expect(bodyText, 'no unmasked 12-digit Aadhaar may ever render').not.toMatch(/\b\d{4} \d{4} \d{4}\b/);
  for (const m of members.filter((x) => x.aadhaarMasked)) {
    expect
      .soft(m.aadhaarMasked!, `Aadhaar for ${m.name} is masked (XXXX…)`)
      .toMatch(/X{4}/i);
    await expect.soft(page.getByText(m.aadhaarMasked!).first()).toBeVisible();
  }
  for (const m of members.filter((x) => x.dob))
    await expect
      .soft(page.getByText(fmtLocalDate(m.dob!)).first(), `DOB for ${m.name} shown DD/MM/YYYY`)
      .toBeVisible();

  await uxCheck(page, 'families:detail');
});

test('PersonDialog: AI scan panel + minor DOB arms the guardian requirement', async ({ page, request }) => {
  const d = await gql<GroupsData>(request, GROUPS_QUERY);
  test.skip(d.groups.length === 0, 'no groups in the dataset');
  await openApp(page, '/app/groups');

  // Wait for the LIVE group detail — the page paints sample groups first and
  // GroupDetail remounts (keyed by group id) on the sample→live swap, which
  // swallows a too-early click.
  await expect(page.getByRole('heading', { level: 2, name: d.groups[0].name })).toBeVisible();
  await expect(page.locator('tbody tr').first()).toBeVisible();
  const addBtn = page.getByRole('button', { name: 'Add member' });
  await addBtn.click();
  const dialog = page.getByRole('dialog');
  if (!(await dialog.getByText('Add person').isVisible().catch(() => false))) {
    await dialog.waitFor({ state: 'visible', timeout: 3_000 }).catch(async () => addBtn.click());
  }
  await expect(dialog.getByText('Add person')).toBeVisible();
  await expect(dialog.getByText('Scan Aadhaar / ID (AI)')).toBeVisible();

  // Minor DOB → helper text; heir + minor → guardian fields.
  await dialog.getByLabel('Date of birth').fill('2016-01-01');
  await expect(dialog.getByText('Under 18 — a guardian is required for an heir')).toBeVisible();
  await dialog.getByText('Is a beneficiary / heir', { exact: false }).click();
  await expect(dialog.getByText('Minor — guardian required', { exact: false })).toBeVisible();
  await expect(dialog.getByLabel('Guardian name')).toBeVisible();
  await expect(dialog.getByLabel('Guardian contact')).toBeVisible();
  await uxCheck(page, 'families:person-dialog');

  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
});

test('verification invite offers Copy / WhatsApp / SMS / Email', async ({ page, request }) => {
  const d = await gql<GroupsData>(request, GROUPS_QUERY);
  test.skip(d.groups.length === 0, 'no groups in the dataset');

  // Find a group with a pending heir (invite link only exists for those).
  let found = false;
  for (const g of d.groups) {
    const members = (await gql<MembersData>(request, MEMBERS_QUERY, { gid: g.id })).members;
    if (!members.some((m) => m.isBeneficiary && m.status === 'pending')) continue;
    found = true;
    await openApp(page, '/app/groups');
    await page.locator('.MuiCard-root').filter({ hasText: g.name }).first().click();
    await expect(page.getByRole('heading', { level: 2, name: g.name })).toBeVisible();

    // Open the pending member's row menu → Copy invite link → invite dialog.
    let opened = false;
    const menus = page.getByRole('button', { name: 'Member actions' });
    const count = await menus.count();
    for (let i = 0; i < count; i++) {
      await menus.nth(i).click();
      const link = page.getByRole('menuitem', { name: 'Copy invite link' });
      if (await link.count()) {
        await link.click();
        opened = true;
        break;
      }
      await page.keyboard.press('Escape');
    }
    expect(opened, 'a pending heir must expose "Copy invite link"').toBe(true);

    const dialog = page.getByRole('dialog').filter({ hasText: 'Verification invite' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Copy' })).toBeVisible();
    // Share channels are the ONLY allowed external links — present, not clicked.
    await expect(dialog.getByRole('link', { name: 'WhatsApp' })).toBeVisible();
    await expect(dialog.getByRole('link', { name: 'SMS' })).toBeVisible();
    await expect(dialog.getByRole('link', { name: 'Email' })).toBeVisible();
    await uxCheck(page, 'families:invite-dialog');
    await dialog.getByRole('button', { name: 'Done' }).click();
    break;
  }
  test.skip(!found, 'no pending heir in the dataset — invite dialog not reachable');
});

test('family inactivity notifier editor renders', async ({ page, request }) => {
  const d = await gql<GroupsData>(request, GROUPS_QUERY);
  const family = d.groups.find((g) => g.type === 'family');
  test.skip(!family, 'no family-typed group in the dataset');

  await openApp(page, '/app/groups');
  await page.locator('.MuiCard-root').filter({ hasText: family!.name }).first().click();
  await expect(page.getByText('Inactivity safeguard', { exact: false }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Configure notifiers' }).click();

  const dialog = page.getByRole('dialog').filter({ hasText: 'Notifier priority' });
  await expect(dialog).toBeVisible();
  await uxCheck(page, 'families:notifier-editor');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
});
