import { expect, test } from 'bun:test';
import { buyerMatchesUser, parseProposal, recordInputFor, exactHolding } from './proposals';

const item = {
  index: 0, rid: 'AP0808-1', s_no: 1, kind: 'property', title: 'Plot 14', village: 'Kondapur', mandal: '', district: '',
  survey_no: '214/2', extent: 200, extent_unit: 'sq.yd', doc_no: '1234/2019', sro: 'Kukatpally', reg_date: '2019-03-12',
  consideration: 2400000, market_value: 1850000, boundary_north: 'Road', boundary_south: '', boundary_east: '', boundary_west: '',
  seller_name: 'K. Narayana', buyer_name: 'R. Ramaiah', source_ref: 'pr:AP0808-1:1', buyer_matches_user: null,
  record_id: null, error: null,
};

test('parseProposal merges stored results onto the draft', () => {
  const parsed = parseProposal({ id: 'p1', status: 'partial', draft: { stake: 'owned', items: [item] }, results: [{ index: 0, record_id: 'rec-9', error: null }] });
  expect(parsed?.status).toBe('partial');
  expect(parsed?.stake).toBe('owned');
  expect(parsed?.items[0].record_id).toBe('rec-9');
});

test('parseProposal rejects a proposal with no usable items', () => {
  expect(parseProposal({ id: 'p1', items: [{ title: 'no rid' }] })).toBeNull();
  expect(parseProposal({ items: [item] })).toBeNull();
});

test('buyer name matching is fuzzy and unknown without a profile name', () => {
  expect(buyerMatchesUser('R. Ramaiah S/o Venkaiah', 'Ramaiahh Reddy')).toBe(true);
  expect(buyerMatchesUser('K. Narayana', 'Shankar Reddy Telukutla')).toBe(false);
  expect(buyerMatchesUser('K. Narayana', '')).toBeNull();
});

test('Watching drops the parties and the price; Mine keeps the whole deed', () => {
  const parsed = parseProposal({ id: 'p1', items: [item] })!;
  const watch = recordInputFor(parsed.items[0], 'watch');
  expect(watch.sellerName).toBeUndefined();
  expect(watch.buyerName).toBeUndefined();
  expect(watch.ownerName).toBeUndefined();
  expect(watch.purchasePrice).toBeUndefined();
  expect(watch.docNo).toBe('1234/2019');
  expect(watch.sourceRef).toBe('pr:AP0808-1:1');
  const mine = recordInputFor(parsed.items[0], 'owned');
  expect(mine.sellerName).toBe('K. Narayana');
  expect(mine.buyerName).toBe('R. Ramaiah');
  expect(mine.origin).toBe('assistant');
  expect(mine.regDate).toBe('2019-03-12');
});


test('exactHolding reuses only a holding of exactly these records', () => {
  const holdings = [
    { id: 'cp-big', name: 'Big', members: [{ recordId: 'a' }, { recordId: 'b' }, { recordId: 'c' }] },
    { id: 'cp-ab', name: 'AB', members: [{ recordId: 'b' }, { recordId: 'a' }] },
  ];
  expect(exactHolding(holdings, ['a', 'b'])).toEqual({ id: 'cp-ab', name: 'AB' });
  expect(exactHolding(holdings, ['b', 'a', 'a'])).toEqual({ id: 'cp-ab', name: 'AB' });
  expect(exactHolding(holdings, ['a', 'b', 'c'])).toEqual({ id: 'cp-big', name: 'Big' });
  expect(exactHolding(holdings, ['a', 'c']), 'a subset of a holding is not it').toBeNull();
  expect(exactHolding(holdings, ['a', 'b', 'c', 'd']), 'nor is a superset').toBeNull();
  expect(exactHolding([holdings[1]], ['a'])).toBeNull();
});

test('parseProposal keeps the stake each item was saved with', () => {
  const parsed = parseProposal({
    id: 'p-1', status: 'saved', stake: null, items: [item, { ...item, index: 1 }],
    results: [{ index: 0, record_id: 'rec-0', error: null, stake: 'managed' }, { index: 1, record_id: null, error: 'Not added', stake: 'boss' }],
  });
  expect(parsed?.items[0].saved_stake).toBe('managed');
  expect(parsed?.items[1].saved_stake).toBeUndefined();
  // A stored row comes back from the service with saved_stake on its items.
  const stored = parseProposal({ id: 'p-2', status: 'saved', stake: 'owned', items: [{ ...item, record_id: 'rec-0', saved_stake: 'watch' }] });
  expect(stored?.items[0].saved_stake).toBe('watch');
});

test('the registry value travels as the government value, with the mode and cleaned numbers', () => {
  const parsed = parseProposal({ id: 'p1', items: [{ ...item, txn_class: 'gift', plot_no: '()', house_no: '10-104', exec_date: '2019-03-10' }] })!;
  const mine = recordInputFor(parsed.items[0], 'owned');
  expect(mine.govtValue).toBe(1850000);
  expect('marketValue' in mine).toBe(false);
  expect(mine.acquisitionMode).toBe('gift');
  expect(mine.execDate).toBe('2019-03-10');
  expect(mine.plotNo).toBeUndefined();
  expect(mine.doorNo).toBe('10-104');
  const lease = recordInputFor(parseProposal({ id: 'p2', items: [{ ...item, txn_class: 'LEASE', govt_value: 99 }] })!.items[0], 'owned');
  expect(lease.acquisitionMode).toBeUndefined();
  expect(lease.govtValue).toBe(99);
  // Same map as services/api record_master.TXN_MODES.
  const settled = recordInputFor(parseProposal({ id: 'p3', items: [{ ...item, txn_class: 'SETTLEMENT' }] })!.items[0], 'owned');
  expect(settled.acquisitionMode).toBe('settlement');
});

test('no computed classification is sent; plot and door numbers go only with a property', () => {
  const withNos = { ...item, plot_no: '14', house_no: '2-31' };
  const prop = recordInputFor(parseProposal({ id: 'p4', items: [withNos] })!.items[0], 'owned');
  expect('classification' in prop).toBe(false);
  expect(prop.plotNo).toBe('14');
  expect(prop.doorNo).toBe('2-31');
  const parcel = recordInputFor(parseProposal({ id: 'p5', items: [{ ...withNos, kind: 'parcel', extent_unit: 'ac' }] })!.items[0], 'owned');
  expect('classification' in parcel).toBe(false);
  expect('plotNo' in parcel).toBe(false);
  expect('doorNo' in parcel).toBe(false);
});
