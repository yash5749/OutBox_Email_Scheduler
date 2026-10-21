import 'dotenv/config';
import Redis from 'ioredis';

const env = {
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
};

let redisWorker: Redis | null = null;

function getRedis(): Redis {
  if (!redisWorker) {
    redisWorker = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      lazyConnect: true,
      retryStrategy: (times) => {
        return Math.min(times * 200, 30000);
      },
      connectionName: `reachinbox-rate-limiter-${process.pid}`,
    });
  }
  return redisWorker;
}

const RESERVE_SLOT_SCRIPT = `
local senderId = KEYS[1]
local now = tonumber(ARGV[1])
local minSpacingMs = tonumber(ARGV[2])
local maxPerHour = tonumber(ARGV[3])
local scheduledAt = tonumber(ARGV[4])

local nextSlotKey = "email-rate:" .. senderId .. ":next-slot"
local nextSlot = tonumber(redis.call("GET", nextSlotKey) or "0")
local candidate = math.max(scheduledAt, nextSlot, now)

local function getHourWindow(ts)
  return math.floor(ts / 3600000) * 3600000
end

local function checkAndReserve(windowStart)
  local counterKey = "email-rate:" .. senderId .. ":" .. windowStart
  local count = tonumber(redis.call("GET", counterKey) or "0")
  if count >= maxPerHour then
    return false, windowStart + 3600000
  end
  redis.call("INCR", counterKey)
  -- Keep future-hour counters until at least one hour after their UTC window.
  local counterTtl = math.max(3600000, windowStart + 7200000 - now)
  redis.call("PEXPIRE", counterKey, counterTtl)
  return true, windowStart
end

local windowStart = getHourWindow(candidate)
local success, nextWindow = checkAndReserve(windowStart)
local limitReached = 0
local limitWindow = 0

while not success do
  limitReached = 1
  limitWindow = windowStart
  candidate = nextWindow
  windowStart = getHourWindow(candidate)
  success, nextWindow = checkAndReserve(windowStart)
end

local newNextSlot = candidate + minSpacingMs
local nextSlotTtl = math.max(86400000, newNextSlot - now + 86400000)
redis.call("SET", nextSlotKey, newNextSlot, "PX", nextSlotTtl)

return {candidate, limitReached, limitWindow}
`;

const shaCache = new Map<string, string>();

async function loadScript(): Promise<string> {
  if (shaCache.has('reserveSlot')) return shaCache.get('reserveSlot')!;
  const sha = await getRedis().script('LOAD', RESERVE_SLOT_SCRIPT) as string;
  shaCache.set('reserveSlot', sha);
  return sha;
}

export async function reserveSlot(
  senderId: string,
  scheduledAt: number,
  maxPerHour: number,
  minSpacingMs: number
): Promise<{ reservedAt: number; limitReached: boolean; limitWindow: number | null }> {
  if (!Number.isSafeInteger(maxPerHour) || maxPerHour < 1) {
    throw new Error('maxPerHour must be a positive safe integer');
  }
  if (!Number.isSafeInteger(minSpacingMs) || minSpacingMs < 0) {
    throw new Error('minSpacingMs must be a non-negative safe integer');
  }
  if (!Number.isFinite(scheduledAt)) {
    throw new Error('scheduledAt must be a finite timestamp');
  }

  const now = Date.now();
  const sha = await loadScript();

  try {
    const result = await getRedis().evalsha(
      sha,
      1,
      senderId,
      now.toString(),
      minSpacingMs.toString(),
      maxPerHour.toString(),
      scheduledAt.toString()
    ) as [number, number, number];

    return {
      reservedAt: result[0],
      limitReached: result[1] === 1,
      limitWindow: result[2] > 0 ? result[2] : null,
    };
  } catch (err) {
    if ((err as Error).message.includes('NOSCRIPT')) {
      shaCache.delete('reserveSlot');
      return reserveSlot(senderId, scheduledAt, maxPerHour, minSpacingMs);
    }
    throw err;
  }
}

export async function releaseSlot(senderId: string, reservedAt: number): Promise<void> {
  // No explicit release needed; counter expires naturally
  // Next-slot is managed by the script
}

export async function closeRateLimiter(): Promise<void> {
  if (redisWorker && redisWorker.status !== 'end') await redisWorker.quit();
  redisWorker = null;
  shaCache.clear();
}

export const rateLimiter = { reserveSlot, releaseSlot, close: closeRateLimiter };
