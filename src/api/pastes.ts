import type { NextApiRequest, NextApiResponse } from "next";
import { getPasteDb } from "@/lib/db";
import { createPaste, validateCreatePasteInput, ValidationError } from "@/lib/pasteService";
import { nowMsFromHeaders } from "@/lib/time";

function getBaseUrl(req: NextApiRequest): string {
  const proto = (req.headers["x-forwarded-proto"] as string | undefined) ?? "http";
  const host = req.headers["x-forwarded-host"] ?? req.headers.host;
  return `${proto}://${host}`;
}

export default async function pastes(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  try {
    const validated = validateCreatePasteInput(req.body);
    const now_ms = nowMsFromHeaders(req.headers);
    const db = getPasteDb();
    const { id } = await createPaste(db, validated, now_ms);
    const url = `${getBaseUrl(req)}/p/${id}`;
    return res.status(201).json({ id, url });
  } catch (err: any) {
    if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
    
    // Log error for debugging (only in development)
    if (process.env.NODE_ENV === "development") {
      console.error("Paste creation error:", err);
    }
    
    // Return a more helpful error message in development, generic in production
    const errorMessage = process.env.NODE_ENV === "development" 
      ? err?.message || "internal_error"
      : "internal_error";
    
    return res.status(500).json({ error: errorMessage });
  }
}

