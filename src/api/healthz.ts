import type { NextApiRequest, NextApiResponse } from "next";

export default function healthz(req: NextApiRequest, res: NextApiResponse) {
  // For robustness with platform health checks, always report ok: true
  // regardless of HTTP method. This keeps the endpoint fast and
  // deterministic and avoids coupling to infrastructure behavior.
  res.status(200).json({ ok: true });
}
