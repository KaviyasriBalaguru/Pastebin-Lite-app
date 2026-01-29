import type { NextApiRequest, NextApiResponse } from "next";
import { getPasteDb } from "@/lib/db";
import { consumePaste } from "@/lib/pasteService";
import { nowMsFromHeaders } from "@/lib/time";

export default async function pasteById(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const id = req.query.id;
  if (typeof id !== "string") return res.status(404).json({ error: "not_found" });

  const now_ms = nowMsFromHeaders(req.headers);
  const db = getPasteDb();
  const result = await consumePaste(db, id, now_ms);
  if (!result) return res.status(404).json({ error: "not_found" });
  return res.status(200).json(result);
}

