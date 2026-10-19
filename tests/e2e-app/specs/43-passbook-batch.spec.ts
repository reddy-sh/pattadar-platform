/**
 * One passbook, several survey numbers, added as one property each.
 *
 * apps/web/src/w360/pages/PropertyActions.tsx `runBatch`: an Andhra/Telangana
 * pattadar passbook lists every survey number of one khata. Choosing "One
 * property per survey number" saves one record per row, then files the
 * passbook ONCE (one upload, one addPaper) and links that one Documents row to
 * every new record with a single linkPapers. It used to call addPaper per
 * record, so Documents showed N passbooks for the one the owner uploaded.
 */
import { test, expect } from '../fixtures/harness';
import type { Page } from '../fixtures/harness';
import type { World } from '../fixtures/harness';

const scanPicker = (page: Page) => page.getByLabel('Read a deed or passbook');

/** A passbook in the reader's own keys (khata as `pattadar_no`, rows in `parcels`). */
const PASSBOOK = {
  doc_type: 'Pattadar Passbook', state: 'Andhra Pradesh', pattadar_no: '1042',
  owner_name: 'Telukutla Venkat Reddy',
  village: 'Chintagunta', mandal: 'Markapur', district: 'Prakasam',
  parcels: [
    { survey_no: '411/1', extent: '1.20', unit: 'acres' },
    { survey_no: '411/2', extent: '0.80', unit: 'acres' },
    { survey_no: '412', extent: '2.00', unit: 'acres' },
  ],
  summary: 'Pattadar passbook for khata 1042 in Chintagunta listing three survey numbers.',
};

const NODE = { id: 'file-passbook-1', name: 'passbook.pdf', sizeBytes: 2_048, mimeType: 'application/pdf' };
const UPLOAD = /\/api\/gateway\/storage\/files\?/;

/** Reader answers with the passbook; storage takes the file; each saveRecord mints its own id. */
function seedBatch(world: World) {
  world.route(/\/api\/gateway\/pattadar\/import-status\//,
    () => ({ json: { state: 'done', fields: PASSBOOK } }));
  world.route(UPLOAD, () => ({ json: NODE }));
  let n = 0;
  world.set('saveRecord', () => `w-record-${++n}`);
  world.set('linkPapers', true);
}

async function readPassbook(page: Page) {
  await page.goto('/properties');
  await page.getByRole('button', { name: 'Add a property', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Add a property' });
  await scanPicker(page).setInputFiles(
    { name: 'passbook.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(2_048) },
    { timeout: 60_000 },
  );
  await expect(drawer.getByText('This document lists 3 survey numbers')).toBeVisible();
  return drawer;
}

async function addEach(drawer: ReturnType<Page['getByRole']>) {
  await drawer.getByRole('button', { name: 'One property per survey number' }).click();
  await expect(drawer.getByText('3 properties, one per survey number')).toBeVisible();
  // The batch refuses to run without a khata; the passbook supplied it.
  const khata = drawer.getByLabel('Khata no');
  if (!(await khata.inputValue()).trim()) await khata.fill('1042');
  await expect(khata).toHaveValue('1042');
  await drawer.getByRole('button', { name: 'Add the property' }).click();
}

test.describe('W02 · one passbook, one property per survey number', () => {
  test('the ⓘ beside "lists 3 survey numbers" opens the University passbook guide in a new tab', async ({ page, world }) => {
    seedBatch(world);
    const drawer = await readPassbook(page);
    const info = drawer.getByRole('link', { name: /About passbooks with several survey numbers/ });
    await expect(info).toHaveAttribute('href', /\/states\/andhra-pradesh\/records\/pattadar-passbook$/);
    await expect(info).toHaveAttribute('target', '_blank');
    // Nothing is written while the question is unanswered.
    expect(world.calls('saveRecord')).toHaveLength(0);
  });

  test('three survey numbers make three properties and ONE passbook linked to all three', async ({ page, world }) => {
    seedBatch(world);
    const drawer = await readPassbook(page);
    await addEach(drawer);

    await expect(drawer.getByText('Added 3 properties under khata 1042')).toBeVisible();
    await expect(drawer.getByText(/Sy 411\/1, Sy 411\/2, Sy 412\. The passbook is added to each of them\./))
      .toBeVisible();

    expect(world.calls('saveRecord').map((c) => (c.vars.input as { title: string }).title))
      .toEqual(['411/1', '411/2', '412']);
    expect(world.restCalls(UPLOAD).filter((c) => c.method === 'POST')).toHaveLength(1);
    expect(world.calls('addPaper')).toHaveLength(1);
    expect(world.lastVars('addPaper')).toMatchObject({ recordId: 'w-record-1', fileRef: NODE.id });
    // No per-survey "Sy …" suffix any more: it is one document for the khata.
    expect(String(world.lastVars('addPaper').subtitle ?? '')).not.toMatch(/Sy /);
    expect(world.calls('linkPapers')).toHaveLength(1);
    expect(world.lastVars('linkPapers')).toEqual({
      paperIds: ['w-paper-new'], recordIds: ['w-record-1', 'w-record-2', 'w-record-3'],
    });
  });

  test('when the link is refused, the three properties stay added and the drawer says the passbook was not', async ({ page, world }) => {
    seedBatch(world);
    world.set('linkPapers', false);
    const drawer = await readPassbook(page);
    await addEach(drawer);

    await expect(drawer.getByText(
      // Filed once on the first survey, so the owner is told to link it, not upload a second copy.
      'All 3 properties were added. The passbook is in Documents on Sy 411/1, but could not be linked to the others. Link it to them from Documents.',
    )).toBeVisible();
    await expect(drawer.getByText('Added 3 properties under khata 1042')).toBeVisible();
    await expect(drawer.getByText(/The passbook is added to each of them/)).toHaveCount(0);
    expect(world.calls('saveRecord')).toHaveLength(3);
    expect(world.calls('addPaper')).toHaveLength(1);
    expect(world.calls('linkPapers')).toHaveLength(1);

    // The button is now a way out, not a second batch.
    await drawer.getByRole('button', { name: 'Done' }).click();
    await expect(drawer).toHaveCount(0);
    expect(world.calls('saveRecord')).toHaveLength(3);
  });
});
