import type { NextApiRequest, NextApiResponse } from "next";

export default function healthz(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  return res.status(200).json({ ok: true });
}
