import { describe, expect, test } from 'bun:test';

import type { Order } from './api';
import { openSameJob, serviceKeyOf } from './orderFlow';

const job = (kind: string, serviceKey = '') => ({
  id: `job-${kind}`, kind, serviceKey,
} as Order);

describe('active service request identity', () => {
  test('legacy request names match their catalogue service', () => {
    expect(openSameJob([job('visit')], 'site_visit')?.id).toBe('job-visit');
    expect(openSameJob([job('opinion')], 'title_opinion')?.id).toBe('job-opinion');
  });

  test('the persisted stable key wins over a workflow kind', () => {
    const request = job('other', 'fmb_copy');
    expect(serviceKeyOf(request)).toBe('fmb_copy');
    expect(openSameJob([request], 'fmb_copy')).toBe(request);
    expect(openSameJob([request], 'other')).toBeUndefined();
  });

  test('different active services remain selectable', () => {
    expect(openSameJob([job('survey', 'survey')], 'site_visit')).toBeUndefined();
  });
});
