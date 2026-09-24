"use client";

import { Wrapper, useApp } from "@hygraph/app-sdk-react";
import { useState } from "react";

/**
 * Hygraph App page element — "Re-feed Interakt".
 *
 * Appears under App views in the Content editor once the app is registered and
 * installed. It renders inside an iframe in Hygraph Studio, so:
 *
 *  - it cannot run on localhost (the SDK only initialises inside the platform),
 *    which is why this is served through the tunnel;
 *  - it must not hold the ingestion keys, so the button calls our own
 *    /api/interakt/reindex and the upload happens server-side.
 *
 * The shared secret comes from the app's installation config, which is editable
 * in Hygraph and only visible to project members.
 */

type IndexResult = {
  index: string;
  documents: number;
  indexed: number;
  failed: number;
  deleted: number;
  warning?: string;
  errors: string[];
};

type ReindexResponse = {
  ok: boolean;
  error?: string;
  skipped?: number;
  durationMs?: number;
  indexes?: IndexResult[];
  log?: string[];
};

function ReindexPage() {
  const { installation, showToast } = useApp();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ReindexResponse | null>(null);

  const config = (installation?.config ?? {}) as { reindexSecret?: string; endpoint?: string };
  const endpoint = config.endpoint || "/api/interakt/reindex";
  const secret = config.reindexSecret ?? "";

  async function run() {
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-reindex-secret": secret },
      });
      const json = (await res.json()) as ReindexResponse;
      setResult(json);

      if (json.ok) {
        const total = (json.indexes ?? []).reduce((n, i) => n + i.indexed, 0);
        showToast?.({
          title: "Re-feed complete",
          description: `${total} documents pushed to Interakt.`,
          variantColor: "success",
        });
      } else {
        showToast?.({
          title: "Re-feed failed",
          description: json.error ?? "Unknown error",
          variantColor: "error",
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setResult({ ok: false, error: message });
      showToast?.({ title: "Re-feed failed", description: message, variantColor: "error" });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", padding: 24, maxWidth: 720 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Re-feed Interakt</h1>
      <p style={{ color: "#57534e", marginTop: 8, lineHeight: 1.6 }}>
        Rebuilds both search indexes from the current <strong>published</strong> content: products
        into <code>hygraph-product</code>, guides, journal, FAQs, policies and authors into{" "}
        <code>hygraph-content</code>. Documents are upserted on a stable id, and anything Hygraph no
        longer has is removed, so running it twice is safe.
      </p>

      <button
        type="button"
        onClick={run}
        disabled={running || !secret}
        style={{
          marginTop: 16,
          padding: "10px 18px",
          borderRadius: 6,
          border: "none",
          background: running || !secret ? "#d6d3d1" : "#1c1917",
          color: running || !secret ? "#78716c" : "#fff",
          fontSize: 14,
          cursor: running || !secret ? "not-allowed" : "pointer",
        }}
      >
        {running ? "Re-feeding…" : "Re-feed all content"}
      </button>

      {!secret ? (
        <p style={{ marginTop: 12, fontSize: 13, color: "#b45309" }}>
          No <code>reindexSecret</code> in this app&apos;s configuration. Add it in the app&apos;s
          install settings — it must match <code>INTERAKT_REINDEX_SECRET</code> on the server.
        </p>
      ) : null}

      {result ? (
        <div style={{ marginTop: 24 }}>
          {result.ok ? (
            <>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "#78716c" }}>
                    <th style={{ padding: "6px 0" }}>Index</th>
                    <th>Documents</th>
                    <th>Indexed</th>
                    <th>Failed</th>
                    <th>Removed</th>
                  </tr>
                </thead>
                <tbody>
                  {(result.indexes ?? []).map((i) => (
                    <tr key={i.index} style={{ borderTop: "1px solid #e7e5e4" }}>
                      <td style={{ padding: "6px 0" }}>{i.index}</td>
                      <td>{i.documents}</td>
                      <td>{i.indexed}</td>
                      <td>{i.failed}</td>
                      <td>{i.deleted}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <p style={{ marginTop: 10, fontSize: 13, color: "#57534e" }}>
                Took {Math.round((result.durationMs ?? 0) / 100) / 10}s
                {result.skipped ? ` · ${result.skipped} entries skipped as having no usable text` : ""}
              </p>

              {(result.indexes ?? [])
                .filter((i) => i.warning)
                .map((i) => (
                  <p key={i.index} style={{ marginTop: 6, fontSize: 13, color: "#b45309" }}>
                    {i.index}: {i.warning}
                  </p>
                ))}
            </>
          ) : (
            <p
              style={{
                padding: 12,
                borderRadius: 6,
                background: "#fef2f2",
                color: "#991b1b",
                fontSize: 13,
              }}
            >
              {result.error}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default function Page() {
  return (
    <Wrapper>
      <ReindexPage />
    </Wrapper>
  );
}
