import { NextResponse } from "next/server";
import { reindexAll } from "@/interakt/reindex";

/**
 * Full re-feed of both Interakt indexes, triggered from the Hygraph app.
 *
 * Runs on the server because the ingestion keys must never reach a browser —
 * which is also why the Hygraph app page calls this rather than Interakt.
 *
 * Auth is a shared secret. Anyone who can open the app inside Hygraph Studio is
 * already a trusted project member, so the secret exists to stop the tunnel
 * being a public "rebuild my index" button, not to authenticate individuals.
 */

export const runtime = "nodejs";
// The whole backfill runs inline; 267 documents takes tens of seconds.
export const maxDuration = 300;

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

export async function POST(request: Request) {
  const secret = process.env.INTERAKT_REINDEX_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "INTERAKT_REINDEX_SECRET is not configured on the server" },
      { status: 500 },
    );
  }

  const provided =
    request.headers.get("x-reindex-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (provided !== secret) return unauthorized();

  const lines: string[] = [];

  try {
    const result = await reindexAll({
      log: (line) => {
        lines.push(line);
        console.log(`[reindex] ${line}`);
      },
    });
    return NextResponse.json({ ok: true, ...result, log: lines });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[reindex] failed:", message);
    return NextResponse.json({ ok: false, error: message, log: lines }, { status: 500 });
  }
}

/** Lets the app page show whether the server is configured before you press the button. */
export async function GET() {
  const configured = Boolean(
    process.env.INTERAKT_BASE_URL &&
      process.env.INTERAKT_PRODUCTS_INDEX_ID &&
      process.env.INTERAKT_CONTENT_INDEX_ID &&
      process.env.INTERAKT_PRODUCTS_INGESTION_KEY &&
      process.env.INTERAKT_CONTENT_INGESTION_KEY &&
      process.env.INTERAKT_REINDEX_SECRET,
  );
  return NextResponse.json({ ok: true, configured });
}
