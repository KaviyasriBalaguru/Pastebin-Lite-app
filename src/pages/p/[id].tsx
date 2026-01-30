import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import Head from "next/head";
import { getPasteDb } from "@/lib/db";
import { consumePaste } from "@/lib/pasteService";
import { nowMsFromHeaders } from "@/lib/time";

export const getServerSideProps: GetServerSideProps<{
  id: string;
  content: string;
  remaining_views: number | null;
  expires_at: string | null;
}> = async (ctx) => {
  try {
    const id = ctx.params?.id;
    if (typeof id !== "string") return { notFound: true };

    const now_ms = nowMsFromHeaders(ctx.req.headers as any);
    const db = await getPasteDb();
    const result = await consumePaste(db, id, now_ms);
    if (!result) return { notFound: true };

    return {
      props: {
        id,
        ...result
      }
    };
  } catch (err: any) {
    const errMessage = err?.message || "";
    const isUpstashAuth =
      err?.name === "UpstashError" ||
      errMessage.includes("WRONGPASS") ||
      errMessage.includes("invalid or missing auth token") ||
      errMessage.includes("http_unauthorized");

    // Log all errors (Vercel logs are visible in dashboard)
    console.error("Paste view error:", errMessage || err);

    // If it's an Upstash auth error, we still return 404 to avoid exposing internals
    // but the error is logged in Vercel Function Logs for debugging
    return { notFound: true };
  }
};

export default function PasteViewPage({
  id,
  content,
  remaining_views,
  expires_at
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <>
      <Head>
        <title>Paste {id}</title>
        <meta name="robots" content="noindex" />
      </Head>
      <main style={{ maxWidth: 900, margin: "40px auto", padding: "0 16px", fontFamily: "system-ui" }}>
        <h1 style={{ fontSize: 20, marginBottom: 12 }}>Paste</h1>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 12, color: "#444" }}>
          <div>
            <strong>ID:</strong> <code>{id}</code>
          </div>
          <div>
            <strong>Remaining views:</strong> {remaining_views === null ? "∞" : remaining_views}
          </div>
          <div>
            <strong>Expires at:</strong> {expires_at ?? "never"}
          </div>
        </div>
        <pre
          style={{
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            padding: 16,
            border: "1px solid #ddd",
            borderRadius: 8,
            background: "#fafafa",
            fontSize: 14,
            lineHeight: 1.4
          }}
        >
          {content}
        </pre>
      </main>
    </>
  );
}

