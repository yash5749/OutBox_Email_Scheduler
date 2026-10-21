import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { closeRateLimiter, reserveSlot } from '../src/rate-limit/rate-limiter.js';

const inspectionRedis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

describe('Redis sender rate-slot allocator', () => {
  afterAll(async () => {
    await closeRateLimiter();
    await inspectionRedis.quit();
  });

  it('atomically enforces a per-hour cap and spacing during concurrent reservations', async () => {
    const senderId = `integration-${randomUUID()}`;
    const start = Date.now();
    const reservations = await Promise.all(
      Array.from({ length: 8 }, () => reserveSlot(senderId, start, 2, 250)),
    );

    const byUtcHour = new Map<number, number>();
    for (const reservation of reservations) {
      const hour = Math.floor(reservation.reservedAt / 3_600_000);
      byUtcHour.set(hour, (byUtcHour.get(hour) ?? 0) + 1);
    }
    expect(Math.max(...byUtcHour.values())).toBeLessThanOrEqual(2);
    expect(reservations).toHaveLength(8);

    const sortedFirstWindow = reservations
      .map(({ reservedAt }) => reservedAt)
      .filter(time => Math.floor(time / 3_600_000) === Math.floor(start / 3_600_000))
      .sort((left, right) => left - right);
    for (let index = 1; index < sortedFirstWindow.length; index++) {
      expect(sortedFirstWindow[index] - sortedFirstWindow[index - 1]).toBeGreaterThanOrEqual(250);
    }
  });

  it('keeps independent sender quotas separate', async () => {
    const firstSender = `integration-${randomUUID()}`;
    const secondSender = `integration-${randomUUID()}`;
    const start = Date.now();
    const [first, second] = await Promise.all([
      reserveSlot(firstSender, start, 1, 0),
      reserveSlot(secondSender, start, 1, 0),
    ]);
    const nextHour = 3_600_000 * (Math.floor(start / 3_600_000) + 1);
    expect(first.reservedAt).toBeLessThan(nextHour);
    expect(second.reservedAt).toBeLessThan(nextHour);
  });

  it('retains rate counters and spacing state for reservations far in the future', async () => {
    const senderId = `integration-${randomUUID()}`;
    const start = Date.now();
    const reservation = await reserveSlot(senderId, start + 3 * 3_600_000, 1, 1000);
    const hourWindow = Math.floor(reservation.reservedAt / 3_600_000) * 3_600_000;
    const counterTtl = await inspectionRedis.pttl(`email-rate:${senderId}:${hourWindow}`);
    const spacingTtl = await inspectionRedis.pttl(`email-rate:${senderId}:next-slot`);

    expect(counterTtl).toBeGreaterThan(3 * 3_600_000);
    expect(spacingTtl).toBeGreaterThan(23 * 3_600_000);
  });
});
