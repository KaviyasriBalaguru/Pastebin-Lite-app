import type { NextApiRequest, NextApiResponse } from "next";
import { getPasteDb } from "@/lib/db";
import { createPaste, validateCreatePasteInput, ValidationError } from "@/lib/pasteService";
import { nowMsFromHeaders } from "@/lib/time";

export const config = {
  api: { bodyParser: { sizeLimit: "1mb" } },
};

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
    const body = req.body ?? {};
    const validated = validateCreatePasteInput(body);
    const now_ms = nowMsFromHeaders(req.headers);
    const db = await getPasteDb();
    const { id } = await createPaste(db, validated, now_ms);
    const url = `${getBaseUrl(req)}/p/${id}`;
    return res.status(201).json({ id, url });
  } catch (err: any) {
    if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
    
    // Log error for debugging
    console.error("Paste creation error:", err);
    
    // Check if it's a database configuration error
    const errMessage = err?.message || "";
    if (errMessage.includes("Upstash Redis") || errMessage.includes("not configured")) {
      return res.status(500).json({ 
        error: "database_not_configured",
        message: "Upstash Redis is not configured. Please set DB_DRIVER=upstash, UPSTASH_REDIS_REST_URL, and UPSTASH_REDIS_REST_TOKEN environment variables in Vercel."
      });
    }
    
    // Return generic error in production, detailed in development
    const errorMessage = process.env.NODE_ENV === "development" 
      ? errMessage || "internal_error"
      : "internal_error";
    
    return res.status(500).json({ error: errorMessage });
  }
}

