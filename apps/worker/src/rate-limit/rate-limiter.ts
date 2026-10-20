import { redisWorker } from '@reachinbox/api/config/redis.js';

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
  redis.call("PEXPIRE", counterKey, 3600000 * 2)
  return true, windowStart
end

local windowStart = getHourWindow(candidate)
local success, nextWindow = checkAndReserve(windowStart)

while not success do
  candidate = nextWindow
  windowStart = getHourWindow(candidate)
  success, nextWindow = checkAndReserve(windowStart)
end

local newNextSlot = candidate + minSpacingMs
redis.call("SET", nextSlotKey, newNextSlot, "PX", 3600000 * 24)

local limitReached = false
local counterKey = "email-rate:" .. senderId .. ":" .. windowStart
local count = tonumber(redis.call("GET", counterKey) or "0")
if count >= maxPerHour then
  limitReached = true
end

return {candidate, limitReached and 1 or 0}
`;

const shaCache = new Map<string, string>();

async function loadScript(): Promise<string> {
  if (shaCache.has('reserveSlot')) return shaCache.get('reserveSlot')!;
  const sha = await redisWorker.script('LOAD', RESERVE_SLOT_SCRIPT) as string;
  shaCache.set('reserveSlot', sha);
  return sha;
}

export async function reserveSlot(
  senderId: string,
  scheduledAt: number,
  maxPerHour: number,
  minSpacingMs: number
): Promise<{ reservedAt: number; limitReached: boolean }> {
  const now = Date.now();
  const sha = await loadScript();

  try {
    const result = await redisWorker.evalsha(
      sha,
      1,
      senderId,
      now.toString(),
      minSpacingMs.toString(),
      maxPerHour.toString(),
      scheduledAt.toString()
    ) as [number, number];

    return { reservedAt: result[0], limitReached: result[1] === 1 };
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

export const rateLimiter = { reserveSlot, releaseSlot };