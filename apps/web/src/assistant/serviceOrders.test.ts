import { describe, expect, it, test } from 'bun:test';
import type { ServiceOffer } from '../w360/api';
import SERVER_CATALOGUE from '../../../../tests/e2e-app/fixtures/catalogue.json';
import { defaultHoldingName, lookAlikes } from './proposals';
import { isServiceProposal, matchOffers, ordersFromResults, parseServiceProposal, resultsFromOrders, serviceOrderKey } from './serviceOrders';
import type { ProposalItem } from './types';

// The server's own synonyms, as generated for the sealed suite (catalogue-dump.py).
const SERVER = new Map(SERVER_CATALOGUE.offers.map((o) => [o.key, o]));

const offer = (key: string, label: string, required = false): ServiceOffer => ({
  ...(SERVER.get(key) as ServiceOffer),
  key, label, price: 1000, group: 'Records', blurb: '', days: 7, shelves: [],
  fields: required ? [{ name: 'x', label: 'X', kind: 'text', required: true, options: [], help: '' }] : [],
});

const CATALOGUE = [
  offer('ec', 'Encumbrance Certificate'),
  offer('patta_copy', 'Certified patta copy'),
  offer('deed_copy', 'Certified sale deed copy'),
  offer('fmb_copy', 'FMB / survey map copy'),
  offer('survey', 'Boundary re-survey', true),
  offer('revenue_extract', '1-B / Adangal extract'),
  offer('title_opinion', 'Title opinion'),
];

test('matchOffers picks the offer each request names', () => {
  expect(matchOffers(['EC'], CATALOGUE)).toEqual(['ec']);
  expect(matchOffers(['encumbrance certificate for 30 years', 'patta copy'], CATALOGUE)).toEqual(['ec', 'patta_copy']);
  expect(matchOffers(['survey map'], CATALOGUE)).toEqual(['fmb_copy']);
  expect(matchOffers(['adangal'], CATALOGUE)).toEqual(['revenue_extract']);
  expect(matchOffers(['a lawyer to argue my case'], CATALOGUE.filter((o) => o.key !== 'title_opinion'))).toEqual([]);
});

test('"certified copy" only breaks a tie: the specific record it names wins', () => {
  expect(matchOffers(['certified copy of EC'], CATALOGUE)).toEqual(['ec']);
  expect(matchOffers(['certified copy of the patta'], CATALOGUE)).toEqual(['patta_copy']);
  expect(matchOffers(['certified copy of FMB'], CATALOGUE)).toEqual(['fmb_copy']);
  expect(matchOffers(['title deed check'], CATALOGUE)).toEqual(['title_opinion']);
  expect(matchOffers(['certified copy of the sale deed'], CATALOGUE)).toEqual(['deed_copy']);
  expect(matchOffers(['certified copy'], CATALOGUE)).toEqual(['deed_copy']);
});

test('parseServiceProposal reads an event and a stored row with its outcome', () => {
  const event = {
    type: 'service_proposal', id: 'sp-1', status: 'draft',
    records: [{ record_id: 'rec-1', title: 'Sy 12' }, { record_id: 'rec-1', title: 'dup' }],
    requested: ['EC', ''], note: 'for the bank',
  };
  expect(isServiceProposal(event)).toBe(true);
  expect(parseServiceProposal(event)).toEqual({
    id: 'sp-1', status: 'draft', records: [{ record_id: 'rec-1', title: 'Sy 12' }], requested: ['EC'], note: 'for the bank', results: [],
  });
  const stored = parseServiceProposal({
    id: 'sp-2', kind: 'service', status: 'ordered', draft: { records: [{ record_id: 'r', title: 'T' }], requested: ['EC'] },
    results: [{ record_id: 'r', kinds: ['ec'], batch_id: 'sb-1', batch_ref: 'SB-1', orders: [{ id: 'wr-1', ref: 'PT-1', kind: 'ec', title: 'EC' }] }],
  });
  expect(stored?.status).toBe('ordered');
  expect(stored?.results[0].orders[0].id).toBe('wr-1');
  expect(isServiceProposal({ type: 'proposal', id: 'p' })).toBe(false);
});

test('serviceOrderKey is asst:<id>:<recordId>:<kind>, order-free and bounded', () => {
  expect(serviceOrderKey('sp-1', 'rec-1', ['ec'])).toBe('asst:sp-1:rec-1:ec');
  expect(serviceOrderKey('sp-1', 'rec-1', ['patta_copy', 'ec'])).toBe('asst:sp-1:rec-1:ec+patta_copy');
  expect(serviceOrderKey('x'.repeat(36), 'r'.repeat(40), Array.from({ length: 12 }, (_, i) => `service_${i}`)).length).toBeLessThanOrEqual(128);
});

const deed = (index: number, over: Partial<ProposalItem> = {}): ProposalItem => ({
  index, rid: `r${index}`, s_no: 1, kind: 'property', title: 'Plot 96A, RAMANAYYAPETA', village: 'RAMANAYYAPETA', mandal: '', district: 'Guntur',
  survey_no: '41/6', extent: 100, extent_unit: 'sq.yd', doc_no: '', sro: '', reg_date: '', consideration: null, market_value: null,
  txn_class: '', exec_date: '', plot_no: '', house_no: '', land_class: '',
  boundary_north: '', boundary_south: '', boundary_east: '', boundary_west: '', seller_name: 'X',
  buyer_name: 'CHINTALAPUDI RANGA SUBBA REDDY S/O VENKAIAH', source_ref: '', buyer_matches_user: null, record_id: null, error: null, ...over,
});

test('lookAlikes flags the same plot in the same village, not neighbours in one layout', () => {
  const same = lookAlikes([deed(0), deed(1, { title: 'PLOT NO. 96A' }), deed(2, { title: 'Plot 91B, RAMANAYYAPETA' })]);
  expect([...same.entries()]).toEqual([[1, 0]]);
  const farms = lookAlikes([deed(0, { title: '', kind: 'parcel' }), deed(1, { title: '', kind: 'parcel' })]);
  expect(farms.get(1)).toBe(0);
  expect(lookAlikes([deed(0), deed(1, { village: 'Other' })]).size).toBe(0);
});

test('defaultHoldingName is the most common party and the main place', () => {
  expect(defaultHoldingName([deed(0), deed(1)], 'managed')).toBe('Chintalapudi Ranga Subba Reddy — Ramanayyapeta (managed)');
  expect(defaultHoldingName([deed(0), deed(1)], 'owned')).toBe('Chintalapudi Ranga Subba Reddy — Ramanayyapeta');
});

describe('stored outcome (C4 rows)', () => {
  it('flattens to the rows the service stores and rebuilds the same refs on reload', () => {
    const rows = ordersFromResults([
      { record_id: 'rec-1', kinds: ['ec', 'patta_copy'], batch_id: 'b1', batch_ref: 'SB-1', error: null,
        orders: [{ id: 'wr-1', ref: 'SR-11', kind: 'ec', title: 'Encumbrance certificate' }, { id: 'wr-2', ref: 'SR-12', kind: 'patta_copy', title: 'Patta copy' }] },
      { record_id: 'rec-2', kinds: ['ec'], batch_id: null, batch_ref: null, orders: [], error: 'Not placed' },
      { record_id: 'rec-3', kinds: ['ec'], batch_id: 'b3', batch_ref: 'SB-3', orders: [], error: null },
    ]);
    expect(rows.map((row) => row.index)).toEqual([0, 1, 2, 3]);
    expect(rows[0]).toEqual({ index: 0, record_id: 'rec-1', service: 'Encumbrance certificate', order_id: 'wr-1', order_ref: 'SR-11', error: null });
    const back = resultsFromOrders(rows);
    expect(back.map((result) => result.record_id)).toEqual(['rec-1', 'rec-2', 'rec-3']);
    expect(back[0].orders.map((order) => order.id)).toEqual(['wr-1', 'wr-2']);
    expect(back[1].error).toBe('Not placed');
    expect(back[2].batch_ref).toBe('SB-3');
    const parsed = parseServiceProposal({ type: 'service_proposal', id: 'p', status: 'partial', records: [], requested: [], orders: rows });
    expect(parsed?.results).toHaveLength(3);
  });
});
