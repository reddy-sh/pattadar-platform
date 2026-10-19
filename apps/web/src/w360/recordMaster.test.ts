import { describe, expect, test } from 'bun:test';
import type { RecordField } from './api';
import {
  acquisitionInput, acquisitionSourceLine, clearedTitleKeys, conflictText, editableIn, inputKind, modeLabel, partiesChanged, partyLabels,
  shareText, shownIn, sourceMarker, sourceTag, sourceTitle, checksInOrder, checkedLine, isTitleCheck, claimChoiceNames,
} from './recordMaster';

const src = (source: string, label = '') => ({ source, label, sourceRef: '', documentId: '', setAt: '', confidence: '' });
const field = (key: string, group: string, value: string): RecordField => ({
  key, group, label: key, value, display: value, important: false, howToFill: '', source: null, conflicts: [],
});

describe('record master words', () => {
  test('source markers say who set the value', () => {
    expect(sourceMarker(null)).toBe('');
    expect(sourceMarker(src('manual', 'You entered'))).toBe('you entered');
    expect(sourceMarker(src('legacy'))).toBe('entered before sources were kept');
    expect(sourceMarker(src('deed_reading', 'Deed 1576/1989'))).toBe('from deed 1576/1989');
    expect(sourceMarker(src('public_record', 'Public record'))).toBe('from public record');
    expect(sourceMarker(src('passbook_reading', 'Passbook 399'))).toBe('from passbook 399');
    expect(sourceMarker(src('public_record'))).toBe('from public record');
  });

  test('mode labels read the legacy purchase as a sale', () => {
    expect(modeLabel('purchase')).toBe('Sale');
    expect(modeLabel('govt_grant')).toBe('Government grant');
    expect(modeLabel('')).toBe('');
    expect(modeLabel('nonsense')).toBe('');
  });

  test('a card shows only set fields, and drawers skip pin, parties and title', () => {
    const fields = [
      field('village', 'identity', 'Katragunta'), field('lp_no', 'identity', ''),
      field('geo', 'physical', '15.7,79.2'), field('extent', 'physical', '2.80'),
      field('doc_no', 'title', '1576/1989'),
    ];
    expect(shownIn(fields, 'identity').map((f) => f.key)).toEqual(['village']);
    expect(shownIn(fields, 'physical').map((f) => f.key)).toEqual(['extent']);
    expect(editableIn(fields, 'identity').map((f) => f.key)).toEqual(['village', 'lp_no']);
    expect(editableIn(fields, 'physical').map((f) => f.key)).toEqual(['extent']);
    expect(editableIn(fields, 'title')).toEqual([]);
  });

  test('parties, shares, conflicts and input kinds', () => {
    const p = { name: 'Ravi', parentage: 'S/o Venkaiah', role: 'seller', relationship: '', shareNum: 0, shareDen: 0, isGpa: false };
    expect(shareText(p)).toBe('');
    expect(shareText({ ...p, shareNum: 1, shareDen: 2 })).toBe('1/2');
    expect(conflictText('Deed 1576/1989', '2.80 ac')).toBe('Deed 1576/1989 says 2.80 ac');
    expect(conflictText('', 'x')).toBe('Another source says x');
    expect(inputKind('reg_date')).toBe('date');
    expect(inputKind('ec_date')).toBe('date');
    expect(inputKind('door_no')).toBe('text');
  });

  test('the acquisition source line names the public record by RID and schedule', () => {
    const pr = { ...src('public_record', 'Public record'), sourceRef: 'pr:1576_1989_1204:1' };
    expect(acquisitionSourceLine({ docNo: '', source: pr })).toBe('From public record · RID 1576_1989_1204 · schedule 1');
    expect(acquisitionSourceLine({ docNo: '', source: { ...pr, sourceRef: 'pr:77' } })).toBe('From public record · RID 77');
    expect(acquisitionSourceLine({ docNo: '', source: src('public_record') })).toBe('From public record');
    expect(acquisitionSourceLine({ docNo: '4412/1998', source: src('deed_reading', 'Deed 4412/1998') })).toBe('From deed 4412/1998');
    expect(acquisitionSourceLine({ docNo: '', source: src('manual', 'You entered') })).toBe('You entered');
    expect(acquisitionSourceLine({ docNo: '', source: null })).toBe('');
  });

  test('the drawer is dirty on any party field, and on a row added or taken out', () => {
    const a = [{ name: 'Ravi', parentage: 'S/o Venkaiah', relationship: '', role: 'seller' }];
    expect(partiesChanged(a, [{ ...a[0] }])).toBe(false);
    expect(partiesChanged(a, [{ ...a[0], name: ' Ravi ' }])).toBe(false);
    expect(partiesChanged(a, [{ ...a[0], parentage: 'S/o Ramaiah' }])).toBe(true);
    expect(partiesChanged(a, [{ ...a[0], relationship: 'father' }])).toBe(true);
    expect(partiesChanged(a, [])).toBe(true);
    expect(partiesChanged(a, [...a, { name: 'Sita' }])).toBe(true);
    // A blank row the owner opened and left is not a change.
    expect(partiesChanged(a, [...a, { name: '  ' }])).toBe(false);
  });

  test('not registered sends no document number, date or office', () => {
    const v = {
      mode: 'sale', registered: 'no', docNo: '12/2001', regDate: '2001-02-03', execDate: '2001-01-30', sro: 'Ongole',
      consideration: '50000', govtValue: '', stampDuty: 'x', proofNo: ' ',
    };
    const out = acquisitionInput(v, [{ name: ' Ravi ', parentage: '', relationship: '', role: 'seller' }, { name: '' }]);
    expect(out).toEqual({
      mode: 'sale', registered: 'no', docNo: '', regDate: '', sro: '', execDate: '2001-01-30',
      consideration: 50000, govtValue: 0, stampDuty: 0, proofNo: '',
      fromParties: [{ name: 'Ravi', parentage: '', relationship: '', role: 'seller' }],
    });
    expect(acquisitionInput({ ...v, registered: 'yes' }, [])).toMatchObject({ docNo: '12/2001', regDate: '2001-02-03', sro: 'Ongole' });
    expect(acquisitionInput({ ...v, mode: 'inheritance' }, [{ name: 'Ramaiah', role: '' }]).fromParties)
      .toEqual([{ name: 'Ramaiah', parentage: '', relationship: '', role: 'deceased' }]);
  });
});

describe('clearedTitleKeys', () => {
  const draft = {
    mode: 'sale', registered: 'yes', docNo: '4412/1998', regDate: '1998-03-12', execDate: '1998-03-10', sro: 'Ongole',
    consideration: '250000', govtValue: '', stampDuty: '9000', proofNo: '',
  };
  test('names only the boxes the owner emptied, by their title key', () => {
    expect(clearedTitleKeys(draft, draft)).toEqual([]);
    expect(clearedTitleKeys(draft, { ...draft, sro: ' ', consideration: '', govtValue: '' }))
      .toEqual(['sro', 'consideration']);
  });
  test('Registered No leaves the document boxes to the server', () => {
    expect(clearedTitleKeys(draft, { ...draft, registered: 'no', docNo: '', regDate: '', stampDuty: '' }))
      .toEqual(['stamp_duty']);
  });
});

describe('the Overview cards', () => {
  test('a source is a short tag with its full words beside it', () => {
    expect(sourceTag(null)).toBe('');
    expect(sourceTag(src('deed_reading', 'Deed 1576/1989'))).toBe('Deed');
    expect(sourceTag(src('manual'))).toBe('You');
    expect(sourceTag(src('something_new'))).toBe('Source');
    expect(sourceTitle(src('deed_reading', 'Deed 1576/1989'))).toBe('From deed 1576/1989');
    expect(sourceTitle(src('manual', 'You entered'))).toBe('You entered');
    expect(sourceTitle(src('legacy'))).toBe('Entered before sources were kept');
    expect(sourceTitle({ ...src('public_record', 'Public record'), sourceRef: 'pr:4412_1998_1204:3' }))
      .toBe('From public record · RID 4412_1998_1204 · schedule 3');
  });

  test('the compliance check lists what needs doing first, passed last', () => {
    const c = (key: string, status: string) => ({ key, label: key, status, detail: '', action: 'none', fieldKey: '', serviceKind: '' });
    expect(checksInOrder([c('a', 'pass'), c('b', 'unknown'), c('c', 'fail'), c('d', 'warn'), c('e', 'fail')]).map((x) => x.key))
      .toEqual(['c', 'e', 'd', 'b', 'a']);
  });

  test('the check time is said in India time, DD/MM/YYYY HH:MM', () => {
    expect(checkedLine('2026-10-12T08:35:00+00:00')).toBe('Checked 12/10/2026 14:05');
    expect(checkedLine('2026-10-12T20:00:00')).toBe('Checked 13/10/2026 01:30');
    expect(checkedLine('')).toBe('');
  });

  test('a title check opens Title and the deed upload', () => {
    const fields = [field('doc_no', 'title', ''), field('lp_no', 'identity', '')];
    const k = (key: string, fieldKey: string) => ({ key, fieldKey });
    expect(isTitleCheck(k('deed', ''), fields)).toBe(true);
    expect(isTitleCheck(k('x', 'doc_no'), fields)).toBe(true);
    expect(isTitleCheck(k('lp', 'lp_no'), fields)).toBe(false);
  });

  test('parties are named by the mode, else by the earlier side\'s role, never "From … / Held by"', () => {
    expect(partyLabels('sale', 1, 2)).toEqual(['Seller', 'Buyers']);
    expect(partyLabels('', 1, 1, 'seller')).toEqual(['Seller', 'Buyer']);
    expect(partyLabels('other', 1, 1, 'Donor')).toEqual(['Donor', 'Donee']);
    expect(partyLabels('', 1, 1)).toEqual(['Earlier owner', 'Owner']);
  });

  test("a conflict's choices name the field and the source, starting with the words shown", () => {
    expect(claimChoiceNames('Extent', src('deed_reading', 'Deed 4412/1998')))
      .toEqual({ use: 'Use this: extent from the deed', keep: 'Keep mine: your extent' });
    expect(claimChoiceNames('Village', src('public_record')).use).toBe('Use this: village from the public record');
    expect(claimChoiceNames('Village', null).use).toBe('Use this: village from the other source');
  });
});
