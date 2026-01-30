import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { PasteDb, PasteRow, CreatePasteRow } from "./db";

type GlobalCache = typeof globalThis & {
  __pastebin_sqlite__?: Database.Database;
};

function getSqlitePath(): string {
  const p = process.env.SQLITE_DB_PATH?.trim();
  if (p) return path.isAbsolute(p) ? p : path.join(process.cwd(), p);
  return path.join(process.cwd(), ".data", "pastebin.sqlite");
}

function getSqliteDb(): Database.Database {
  const g = globalThis as GlobalCache;
  if (g.__pastebin_sqlite__) return g.__pastebin_sqlite__;

  const sqlitePath = getSqlitePath();
  fs.mkdirSync(path.dirname(sqlitePath), { recursive: true });
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

export function createSqlitePasteDb(): PasteDb {
  const db = getSqliteDb();

  return {
    async createPaste(row: CreatePasteRow) {
      const stmt = db.prepare(
        `INSERT INTO pastes (id, content, created_at_ms, expires_at_ms, remaining_views)
         VALUES (@id, @content, @created_at_ms, @expires_at_ms, @remaining_views)`
      );
      stmt.run(row);
    },

    async consumePasteById(id: string, now_ms: number): Promise<PasteRow | null> {
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
    },
  };
}
