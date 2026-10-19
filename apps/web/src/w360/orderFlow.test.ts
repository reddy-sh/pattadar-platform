import { describe, expect, test } from 'bun:test';

import type { Order, ServiceOffer } from './api';
import { openSameJob, serviceKeyOf } from './orderFlow';

const job = (kind: string, serviceKey = '') => ({
  id: `job-${kind}`, kind, serviceKey,
} as Order);

// Only what the identity rules read: the catalogue's legacy aliases.
const OFFERS = [
  { key: 'site_visit', aliases: ['visit'] },
  { key: 'title_opinion', aliases: ['opinion'] },
  { key: 'survey', aliases: [] },
] as unknown as ServiceOffer[];

describe('active service order identity', () => {
  test('legacy kinds match their catalogue service through its aliases', () => {
    expect(openSameJob([job('visit')], 'site_visit', OFFERS)?.id).toBe('job-visit');
    expect(openSameJob([job('opinion')], 'title_opinion', OFFERS)?.id).toBe('job-opinion');
    expect(openSameJob([job('site_visit', 'site_visit')], 'visit', OFFERS)?.id).toBe('job-site_visit');
    expect(serviceKeyOf(job('visit'), OFFERS)).toBe('site_visit');
  });

  test('the persisted stable key wins over a workflow kind', () => {
    const request = job('other', 'fmb_copy');
    expect(serviceKeyOf(request)).toBe('fmb_copy');
    expect(openSameJob([request], 'fmb_copy')).toBe(request);
    expect(openSameJob([request], 'other')).toBeUndefined();
  });

  test('different active services remain selectable', () => {
    expect(openSameJob([job('survey', 'survey')], 'site_visit', OFFERS)).toBeUndefined();
  });
});
