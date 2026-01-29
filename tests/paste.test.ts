import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";

type Started = { baseUrl: string; proc: ReturnType<typeof spawn> };

async function getFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      srv.close(() => {
        if (addr && typeof addr === "object") resolve(addr.port);
        else reject(new Error("Failed to get free port"));
      });
    });
  });
}

async function waitForHealthy(baseUrl: string, timeoutMs = 60_000) {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const r = await fetch(`${baseUrl}/api/healthz`);
      if (r.ok) {
        const j = await r.json();
        if (j && j.ok === true) return;
      }
    } catch {
      // ignore until ready
    }
    if (Date.now() - start > timeoutMs) throw new Error("Timed out waiting for server");
    await new Promise((r) => setTimeout(r, 250));
  }
}

async function startNextDev(): Promise<Started> {
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const sqlitePath = path.join(process.cwd(), ".data", `test-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`);

  const nextBin = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
  const proc = spawn(process.execPath, [nextBin, "dev", "-p", String(port)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      TEST_MODE: "1",
      DB_DRIVER: "sqlite",
      SQLITE_DB_PATH: sqlitePath
    },
    stdio: "pipe"
  });

  let combined = "";
  proc.stdout?.on("data", (d) => (combined += d.toString()));
  proc.stderr?.on("data", (d) => (combined += d.toString()));

  await waitForHealthy(baseUrl);

  // If it exits early, surface logs.
  if (proc.exitCode !== null) {
    throw new Error(`Next server exited early (${proc.exitCode}). Logs:\n${combined}`);
  }

  return { baseUrl, proc };
}

async function httpJson<T>(url: string, init?: RequestInit): Promise<{ status: number; json: T }> {
  const r = await fetch(url, init);
  const status = r.status;
  const json = (await r.json()) as T;
  return { status, json };
}

describe("Pastebin-Lite E2E", () => {
  let started: Started;

  beforeAll(async () => {
    started = await startNextDev();
  }, 60_000);

  afterAll(async () => {
    if (!started?.proc) return;
    started.proc.kill();
  });

  it("health check returns 200 and JSON", async () => {
    const { status, json } = await httpJson<{ ok: boolean }>(`${started.baseUrl}/api/healthz`);
    expect(status).toBe(200);
    expect(json.ok).toBe(true);
  });

  it("creates a paste and returns id + url", async () => {
    const { status, json } = await httpJson<{ id: string; url: string; error?: string }>(`${started.baseUrl}/api/pastes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "hello world" })
    });
    expect(status).toBe(201);
    expect(typeof json.id).toBe("string");
    expect(json.id.length).toBeGreaterThan(3);
    expect(json.url).toBe(`${started.baseUrl}/p/${json.id}`);
  });

  it("retrieves the original content (and decrements views when configured)", async () => {
    const now = 1_700_000_000_000;
    const created = await httpJson<{ id: string; url: string }>(`${started.baseUrl}/api/pastes`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-now-ms": String(now) },
      body: JSON.stringify({ content: "content-a", max_views: 2 })
    });
    expect(created.status).toBe(201);

    const id = created.json.id;
    const r1 = await httpJson<{ content: string; remaining_views: number | null; expires_at: string | null }>(
      `${started.baseUrl}/api/pastes/${id}`,
      { headers: { "x-test-now-ms": String(now) } }
    );
    expect(r1.status).toBe(200);
    expect(r1.json.content).toBe("content-a");
    expect(r1.json.remaining_views).toBe(1);

    const r2 = await httpJson<{ content: string; remaining_views: number | null; expires_at: string | null }>(
      `${started.baseUrl}/api/pastes/${id}`,
      { headers: { "x-test-now-ms": String(now) } }
    );
    expect(r2.status).toBe(200);
    expect(r2.json.remaining_views).toBe(0);

    const r3 = await fetch(`${started.baseUrl}/api/pastes/${id}`, { headers: { "x-test-now-ms": String(now) } });
    expect(r3.status).toBe(404);
  });

  it("ttl expiry works using x-test-now-ms (expires when now >= expires_at)", async () => {
    const now = 1_700_000_000_000;
    const created = await httpJson<{ id: string }>(`${started.baseUrl}/api/pastes`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-now-ms": String(now) },
      body: JSON.stringify({ content: "ttl-test", ttl_seconds: 10 })
    });
    expect(created.status).toBe(201);
    const id = created.json.id;

    const ok1 = await fetch(`${started.baseUrl}/api/pastes/${id}`, {
      headers: { "x-test-now-ms": String(now + 9_999) }
    });
    expect(ok1.status).toBe(200);

    const expired = await fetch(`${started.baseUrl}/api/pastes/${id}`, {
      headers: { "x-test-now-ms": String(now + 10_000) }
    });
    expect(expired.status).toBe(404);
  });

  it("combined ttl + view limit stops at first violation", async () => {
    const now = 1_700_000_000_000;
    const created = await httpJson<{ id: string }>(`${started.baseUrl}/api/pastes`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-now-ms": String(now) },
      body: JSON.stringify({ content: "combo", ttl_seconds: 5, max_views: 2 })
    });
    expect(created.status).toBe(201);
    const id = created.json.id;

    const first = await httpJson<{ remaining_views: number | null }>(`${started.baseUrl}/api/pastes/${id}`, {
      headers: { "x-test-now-ms": String(now) }
    });
    expect(first.status).toBe(200);
    expect(first.json.remaining_views).toBe(1);

    // TTL violation should 404 even if views remain.
    const ttlFail = await fetch(`${started.baseUrl}/api/pastes/${id}`, { headers: { "x-test-now-ms": String(now + 6_000) } });
    expect(ttlFail.status).toBe(404);
  });

  it("invalid inputs return 4xx with JSON error", async () => {
    const bad1 = await httpJson<{ error: string }>(`${started.baseUrl}/api/pastes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "" })
    });
    expect(bad1.status).toBe(400);
    expect(typeof bad1.json.error).toBe("string");

    const bad2 = await httpJson<{ error: string }>(`${started.baseUrl}/api/pastes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "x", ttl_seconds: 0 })
    });
    expect(bad2.status).toBe(400);

    const bad3 = await httpJson<{ error: string }>(`${started.baseUrl}/api/pastes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "x", max_views: 0 })
    });
    expect(bad3.status).toBe(400);
  });

  it("missing pastes return 404 (JSON)", async () => {
    const r = await httpJson<{ error: string }>(`${started.baseUrl}/api/pastes/does-not-exist`);
    expect(r.status).toBe(404);
    expect(r.json.error).toBeDefined();
  });

  it("HTML view renders safely and consumes views", async () => {
    const now = 1_700_000_000_000;
    const created = await httpJson<{ id: string }>(`${started.baseUrl}/api/pastes`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-now-ms": String(now) },
      body: JSON.stringify({ content: "<script>alert(1)</script>", max_views: 1 })
    });
    expect(created.status).toBe(201);
    const id = created.json.id;

    const page = await fetch(`${started.baseUrl}/p/${id}`, { headers: { "x-test-now-ms": String(now) } });
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");

    const gone = await fetch(`${started.baseUrl}/p/${id}`, { headers: { "x-test-now-ms": String(now) } });
    expect(gone.status).toBe(404);
  });

  it("never returns negative remaining views", async () => {
    const now = 1_700_000_000_000;
    const created = await httpJson<{ id: string }>(`${started.baseUrl}/api/pastes`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-now-ms": String(now) },
      body: JSON.stringify({ content: "nv", max_views: 1 })
    });
    expect(created.status).toBe(201);
    const id = created.json.id;

    const r1 = await httpJson<{ remaining_views: number | null }>(`${started.baseUrl}/api/pastes/${id}`, {
      headers: { "x-test-now-ms": String(now) }
    });
    expect(r1.status).toBe(200);
    expect(r1.json.remaining_views).toBe(0);

    const r2 = await fetch(`${started.baseUrl}/api/pastes/${id}`, { headers: { "x-test-now-ms": String(now) } });
    expect(r2.status).toBe(404);
  });
});

