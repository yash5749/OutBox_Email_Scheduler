import { describe, expect, it } from 'vitest';
import { reserveSlot } from './rate-limiter.js';

describe('rate limiter input validation', () => {
  it('rejects a zero hourly cap before connecting to Redis', async () => {
    await expect(reserveSlot('sender', Date.now(), 0, 100)).rejects.toThrow('maxPerHour');
  });

  it('rejects negative spacing before connecting to Redis', async () => {
    await expect(reserveSlot('sender', Date.now(), 10, -1)).rejects.toThrow('minSpacingMs');
  });

  it('rejects an invalid schedule timestamp before connecting to Redis', async () => {
    await expect(reserveSlot('sender', Number.NaN, 10, 100)).rejects.toThrow('scheduledAt');
  });
});
