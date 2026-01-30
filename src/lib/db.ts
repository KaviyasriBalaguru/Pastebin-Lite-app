import { createUpstashPasteDb } from "./db-upstash";

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
  consumePasteById(id: string, now_ms: number): Promise<PasteRow | null>;
  healthCheck(): Promise<void>;
}

function getDriver(): "sqlite" | "upstash" {
  const driver = (process.env.DB_DRIVER || "").toLowerCase();
  if (driver === "upstash") return "upstash";
  if (driver === "sqlite") return "sqlite";

  const isServerless = process.env.VERCEL === "1" || process.env.AWS_LAMBDA_FUNCTION_NAME;
  if (isServerless) {
    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
      return "upstash";
    }
    throw new Error(
      "Serverless environment detected but Upstash Redis not configured. " +
        "Please set DB_DRIVER=upstash and UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN environment variables."
    );
  }

  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) return "upstash";
  return "sqlite";
}

/**
 * Returns the database adapter. On Vercel/serverless only Upstash is used;
 * better-sqlite3 is never loaded there, avoiding native module errors.
 */
export async function getPasteDb(): Promise<PasteDb> {
  const driver = getDriver();
  if (driver === "upstash") return createUpstashPasteDb();
  const { createSqlitePasteDb } = await import("./db-sqlite");
  return createSqlitePasteDb();
}
