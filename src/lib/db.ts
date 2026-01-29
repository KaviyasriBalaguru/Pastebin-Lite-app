import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { Redis } from "@upstash/redis";

export type PasteRow = {
  id: string;
  content: string;
  created_at_ms: number;
  expires_at_ms: number | null;
  remaining_views: number | null;
};

export type CreatePasteRow = PasteRow;

export interface PasteDb {
  createPaste(row: CreatePasteRow): Promise<void>;
  /**
   * Returns the paste AFTER consuming one view (if view-limited), or null if unavailable.
   * Unavailable includes: not found, expired (now_ms >= expires_at_ms), or views exceeded.
   */
  consumePasteById(id: string, now_ms: number): Promise<PasteRow | null>;
  healthCheck(): Promise<void>;
}

function getDriver(): "sqlite" | "upstash" {
  const driver = (process.env.DB_DRIVER || "").toLowerCase();
  if (driver === "upstash") return "upstash";
  if (driver === "sqlite") return "sqlite";

  // On Vercel (or any serverless), prefer Upstash if env vars exist
  const isServerless = process.env.VERCEL === "1" || process.env.AWS_LAMBDA_FUNCTION_NAME;
  if (isServerless) {
    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
      return "upstash";
    }
    // On serverless without Upstash configured, throw a clear error
    throw new Error(
      "Serverless environment detected but Upstash Redis not configured. " +
      "Please set DB_DRIVER=upstash and UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN environment variables."
    );
  }

  // Auto-pick: if Upstash env vars exist, prefer it; otherwise SQLite (for local dev).
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) return "upstash";
  return "sqlite";
}

function ensureDirExists(filePath: string) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

function getSqlitePath(): string {
  const p = process.env.SQLITE_DB_PATH?.trim();
  if (p) return path.isAbsolute(p) ? p : path.join(process.cwd(), p);
  return path.join(process.cwd(), ".data", "pastebin.sqlite");
}

type GlobalCache = typeof globalThis & {
  __pastebin_sqlite__?: Database.Database;
  __pastebin_upstash__?: Redis;
};

function getSqliteDb(): Database.Database {
  const g = globalThis as GlobalCache;
  if (g.__pastebin_sqlite__) return g.__pastebin_sqlite__;

  const sqlitePath = getSqlitePath();
  ensureDirExists(sqlitePath);
  const db = new Database(sqlitePath);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS pastes (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      created_at_ms INTEGER NOT NULL,
      expires_at_ms INTEGER NULL,
      remaining_views INTEGER NULL
    );
  `);

  g.__pastebin_sqlite__ = db;
  return db;
}

function createSqliteAdapter(): PasteDb {
  const db = getSqliteDb();

  return {
    async createPaste(row) {
      const stmt = db.prepare(
        `INSERT INTO pastes (id, content, created_at_ms, expires_at_ms, remaining_views)
         VALUES (@id, @content, @created_at_ms, @expires_at_ms, @remaining_views)`
      );
      stmt.run(row);
    },

    async consumePasteById(id, now_ms) {
      const tx = db.transaction((pasteId: string, now: number) => {
        const row = db
          .prepare(
            `SELECT id, content, created_at_ms, expires_at_ms, remaining_views
             FROM pastes
             WHERE id = ?`
          )
          .get(pasteId) as PasteRow | undefined;

        if (!row) return null;

        if (row.expires_at_ms !== null && now >= row.expires_at_ms) {
          db.prepare(`DELETE FROM pastes WHERE id = ?`).run(pasteId);
          return null;
        }

        if (row.remaining_views !== null) {
          if (row.remaining_views <= 0) {
            db.prepare(`DELETE FROM pastes WHERE id = ?`).run(pasteId);
            return null;
          }
          const nextViews = row.remaining_views - 1;
          db.prepare(`UPDATE pastes SET remaining_views = ? WHERE id = ?`).run(nextViews, pasteId);
          return { ...row, remaining_views: nextViews };
        }

        return row;
      });

      return tx(id, now_ms);
    },

    async healthCheck() {
      db.prepare("SELECT 1").get();
    }
  };
}

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
 *   - content
 *   - created_at_ms (string)
 *   - expires_at_ms (string or empty)
 *   - remaining_views (string or empty)
 */
function createUpstashAdapter(): PasteDb {
  const redis = getUpstashRedis();

  // Atomic consume script:
  // - If missing => return nil
  // - If expired (now >= expires_at_ms) => DEL; return nil
  // - If view-limited:
  //     if remaining_views <= 0 => DEL; return nil
  //     else decrement by 1 (never negative) and return fields
  // - Else return fields (no decrement)
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
    async createPaste(row) {
      const key = `paste:${row.id}`;
      const payload: Record<string, string> = {
        content: row.content,
        created_at_ms: String(row.created_at_ms),
        expires_at_ms: row.expires_at_ms === null ? "" : String(row.expires_at_ms),
        remaining_views: row.remaining_views === null ? "" : String(row.remaining_views)
      };
      await redis.hset(key, payload);
      // Optional key TTL in Redis (for storage hygiene). Expiry logic still uses expires_at_ms.
      if (row.expires_at_ms !== null) {
        const ttlSeconds = Math.max(1, Math.ceil((row.expires_at_ms - row.created_at_ms) / 1000));
        await redis.expire(key, ttlSeconds);
      }
    },

    async consumePasteById(id, now_ms) {
      const key = `paste:${id}`;

      // Upstash eval typing differs across versions; keep the call permissive.
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
        remaining_views
      };
    },

    async healthCheck() {
      await (redis as any).ping?.();
      // If ping is unavailable, do a trivial command.
      await redis.set("healthz:probe", "1", { ex: 5 });
    }
  };
}

export function getPasteDb(): PasteDb {
  const driver = getDriver();
  if (driver === "upstash") return createUpstashAdapter();
  return createSqliteAdapter();
}

