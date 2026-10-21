import { describe, expect, it } from 'vitest';
import { shouldKeepJob, shouldRecreateJob } from './reconcile.js';

describe('queue reconciliation policy', () => {
  it.each(['waiting', 'waiting-children', 'delayed', 'active', 'paused', 'prioritized'])(
    'keeps a %s job already owned by BullMQ',
    (state) => {
      expect(shouldKeepJob(state)).toBe(true);
      expect(shouldRecreateJob(state)).toBe(false);
    },
  );

  it.each(['completed', 'failed', 'unknown', undefined])(
    'recreates a scheduled database row whose queue state is %s',
    (state) => {
      expect(shouldKeepJob(state)).toBe(false);
      expect(shouldRecreateJob(state)).toBe(true);
    },
  );
});
