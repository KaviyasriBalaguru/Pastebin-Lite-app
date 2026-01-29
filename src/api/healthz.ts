import type { NextApiRequest, NextApiResponse } from "next";
import { getPasteDb } from "@/lib/db";

export default async function healthz(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  try {
    const db = getPasteDb();
    await db.healthCheck();
    return res.status(200).json({ ok: true });
  } catch {
    return res.status(503).json({ ok: false });
  }
}

