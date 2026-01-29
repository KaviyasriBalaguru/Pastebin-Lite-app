import { nanoid } from "nanoid";
import type { PasteDb, PasteRow } from "@/lib/db";

export type CreatePasteInput = {
  content: unknown;
  ttl_seconds?: unknown;
  max_views?: unknown;
};

export type CreatePasteValidated = {
  content: string;
  ttl_seconds: number | null;
  max_views: number | null;
};

export type PasteResponse = {
  content: string;
  remaining_views: number | null;
  expires_at: string | null;
};

export class ValidationError extends Error {
  statusCode = 400 as const;
}

function toPositiveIntOrNull(v: unknown, fieldName: string): number | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== "number" || !Number.isFinite(v)) throw new ValidationError(`${fieldName} must be a number`);
  if (!Number.isInteger(v)) throw new ValidationError(`${fieldName} must be an integer`);
  if (v < 1) throw new ValidationError(`${fieldName} must be >= 1`);
  return v;
}

export function validateCreatePasteInput(input: CreatePasteInput): CreatePasteValidated {
  if (typeof input !== "object" || input === null) throw new ValidationError("Body must be a JSON object");

  const content = (input as any).content;
  if (typeof content !== "string") throw new ValidationError("content must be a string");
  if (content.trim().length === 0) throw new ValidationError("content must be non-empty");

  const ttl_seconds = toPositiveIntOrNull((input as any).ttl_seconds, "ttl_seconds");
  const max_views = toPositiveIntOrNull((input as any).max_views, "max_views");

  return {
    content,
    ttl_seconds,
    max_views
  };
}

export type CreatePasteResult = { id: string };

export async function createPaste(
  db: PasteDb,
  input: CreatePasteValidated,
  now_ms: number
): Promise<CreatePasteResult> {
  const id = nanoid(10);
  const expires_at_ms = input.ttl_seconds === null ? null : now_ms + input.ttl_seconds * 1000;
  const row: PasteRow = {
    id,
    content: input.content,
    created_at_ms: now_ms,
    expires_at_ms,
    remaining_views: input.max_views === null ? null : input.max_views
  };
  await db.createPaste(row);
  return { id };
}

export async function consumePaste(
  db: PasteDb,
  id: string,
  now_ms: number
): Promise<PasteResponse | null> {
  if (!id || typeof id !== "string") return null;

  const row = await db.consumePasteById(id, now_ms);
  if (!row) return null;

  return {
    content: row.content,
    remaining_views: row.remaining_views,
    expires_at: row.expires_at_ms === null ? null : new Date(row.expires_at_ms).toISOString()
  };
}

