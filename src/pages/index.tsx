import Head from "next/head";
import { useMemo, useState } from "react";

type CreatePasteResponse = { id: string; url: string };

export default function HomePage() {
  const [content, setContent] = useState("");
  const [ttlSeconds, setTtlSeconds] = useState<string>("");
  const [maxViews, setMaxViews] = useState<string>("");
  const [result, setResult] = useState<CreatePasteResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const payload = useMemo(() => {
    const ttl = ttlSeconds.trim() ? Number(ttlSeconds) : undefined;
    const views = maxViews.trim() ? Number(maxViews) : undefined;
    return {
      content,
      ttl_seconds: ttlSeconds.trim() ? ttl : undefined,
      max_views: maxViews.trim() ? views : undefined
    };
  }, [content, ttlSeconds, maxViews]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const r = await fetch("/api/pastes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await r.json().catch(() => null);
      if (!r.ok) {
        setError((data && data.error) || `Request failed (${r.status})`);
        return;
      }
      setResult(data as CreatePasteResponse);
    } catch (err: any) {
      setError(err?.message ?? "Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Head>
        <title>Pastebin-Lite</title>
      </Head>
      <main style={{ maxWidth: 900, margin: "40px auto", padding: "0 16px", fontFamily: "system-ui" }}>
        <h1 style={{ fontSize: 24, marginBottom: 8 }}>Pastebin-Lite</h1>
        <p style={{ color: "#444", marginTop: 0 }}>
          Create a paste, get a shareable link, and optionally set TTL and/or max views.
        </p>

        <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontWeight: 600 }}>Content</span>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              required
              rows={10}
              style={{
                width: "100%",
                padding: 12,
                border: "1px solid #ddd",
                borderRadius: 8,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                fontSize: 13
              }}
            />
          </label>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontWeight: 600 }}>TTL seconds (optional)</span>
              <input
                value={ttlSeconds}
                onChange={(e) => setTtlSeconds(e.target.value)}
                inputMode="numeric"
                placeholder="e.g. 3600"
                style={{ padding: 10, border: "1px solid #ddd", borderRadius: 8, width: 220 }}
              />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontWeight: 600 }}>Max views (optional)</span>
              <input
                value={maxViews}
                onChange={(e) => setMaxViews(e.target.value)}
                inputMode="numeric"
                placeholder="e.g. 5"
                style={{ padding: 10, border: "1px solid #ddd", borderRadius: 8, width: 220 }}
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              border: "1px solid #222",
              background: loading ? "#ddd" : "#111",
              color: loading ? "#333" : "white",
              width: 180,
              cursor: loading ? "not-allowed" : "pointer"
            }}
          >
            {loading ? "Creating..." : "Create paste"}
          </button>
        </form>

        {error && (
          <p style={{ marginTop: 14, color: "#b00020" }}>
            <strong>Error:</strong> {error}
          </p>
        )}

        {result && (
          <div style={{ marginTop: 14 }}>
            <div>
              <strong>ID:</strong> <code>{result.id}</code>
            </div>
            <div style={{ marginTop: 6 }}>
              <strong>URL:</strong>{" "}
              <a href={result.url} style={{ color: "#0b57d0" }}>
                {result.url}
              </a>
            </div>
          </div>
        )}
      </main>
    </>
  );
}

