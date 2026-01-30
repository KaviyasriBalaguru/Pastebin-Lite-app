import { Redis } from "@upstash/redis";
import type { PasteDb, PasteRow, CreatePasteRow } from "./db";

type GlobalCache = typeof globalThis & {
  __pastebin_upstash__?: Redis;
};

function getUpstashRedis(): Redis {
  const g = globalThis as GlobalCache;
  if (g.__pastebin_upstash__) return g.__pastebin_upstash__;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    throw new Error(
      "Upstash Redis configuration missing. Please set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN environment variables."
    );
  }

  const client = new Redis({ url, token });
  g.__pastebin_upstash__ = client;
  return client;
}

/**
 * Redis model:
 * - key: paste:{id} (hash)
 *   - content, created_at_ms, expires_at_ms, remaining_views
 */
export function createUpstashPasteDb(): PasteDb {
  const redis = getUpstashRedis();

  const lua = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
if redis.call("EXISTS", key) == 0 then
  return nil
end

local content = redis.call("HGET", key, "content")
local created_at_ms = redis.call("HGET", key, "created_at_ms")
local expires_at_ms_raw = redis.call("HGET", key, "expires_at_ms")
local remaining_views_raw = redis.call("HGET", key, "remaining_views")

local expires_at_ms = nil
if expires_at_ms_raw and expires_at_ms_raw ~= "" then
  expires_at_ms = tonumber(expires_at_ms_raw)
end

if expires_at_ms and now >= expires_at_ms then
  redis.call("DEL", key)
  return nil
end

local remaining_views = nil
if remaining_views_raw and remaining_views_raw ~= "" then
  remaining_views = tonumber(remaining_views_raw)
end

if remaining_views ~= nil then
  if remaining_views <= 0 then
    redis.call("DEL", key)
    return nil
  end
  local nextViews = remaining_views - 1
  if nextViews < 0 then
    nextViews = 0
  end
  redis.call("HSET", key, "remaining_views", tostring(nextViews))
  remaining_views = nextViews
end

return { content, created_at_ms, expires_at_ms_raw, remaining_views ~= nil and tostring(remaining_views) or "" }
`;

  return {
    async createPaste(row: CreatePasteRow) {
      const key = `paste:${row.id}`;
      const payload: Record<string, string> = {
        content: row.content,
        created_at_ms: String(row.created_at_ms),
        expires_at_ms: row.expires_at_ms === null ? "" : String(row.expires_at_ms),
        remaining_views: row.remaining_views === null ? "" : String(row.remaining_views),
      };
      await redis.hset(key, payload);
      if (row.expires_at_ms !== null) {
        const ttlSeconds = Math.max(1, Math.ceil((row.expires_at_ms - row.created_at_ms) / 1000));
        await redis.expire(key, ttlSeconds);
      }
    },

    async consumePasteById(id: string, now_ms: number): Promise<PasteRow | null> {
      const key = `paste:${id}`;
      const res = (await (redis as any).eval(lua, [key], [String(now_ms)])) as
        | [string, string, string, string]
        | null;
      if (!res) return null;

      const [content, created_at_ms_s, expires_at_ms_s, remaining_views_s] = res;
      const created_at_ms = Number(created_at_ms_s);
      const expires_at_ms = expires_at_ms_s ? Number(expires_at_ms_s) : null;
      const remaining_views = remaining_views_s ? Number(remaining_views_s) : null;

      if (!Number.isFinite(created_at_ms)) return null;
      if (expires_at_ms !== null && !Number.isFinite(expires_at_ms)) return null;
      if (remaining_views !== null && (!Number.isFinite(remaining_views) || remaining_views < 0)) return null;

      return {
        id,
        content,
        created_at_ms,
        expires_at_ms,
        remaining_views,
      };
    },

    async healthCheck() {
      await (redis as any).ping?.();
      await redis.set("healthz:probe", "1", { ex: 5 });
    },
  };
}
