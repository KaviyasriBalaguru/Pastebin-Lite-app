type HeadersLike =
  | Record<string, string | string[] | undefined>
  | { get(name: string): string | null };

function getHeaderValue(headers: HeadersLike | undefined, name: string): string | undefined {
  if (!headers) return undefined;
  const lower = name.toLowerCase();

  // Fetch Headers
  if (typeof (headers as any).get === "function") {
    const v = (headers as any).get(name) ?? (headers as any).get(lower);
    return typeof v === "string" ? v : undefined;
  }

  // Node/Next headers object
  const obj = headers as Record<string, string | string[] | undefined>;
  const raw = obj[lower] ?? obj[name];
  if (Array.isArray(raw)) return raw[0];
  return raw;
}

export function nowMsFromHeaders(headers: HeadersLike | undefined): number {
  const isTestMode = process.env.TEST_MODE === "1";
  if (!isTestMode) return Date.now();

  const raw = getHeaderValue(headers, "x-test-now-ms");
  if (!raw) return Date.now();

  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return Date.now();
  return Math.floor(n);
}

