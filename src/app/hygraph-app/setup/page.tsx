"use client";

import { Wrapper, useApp } from "@hygraph/app-sdk-react";
import { useState } from "react";

/**
 * Setup URL for the Hygraph app.
 *
 * Hygraph opens this once, on install, to collect the app's configuration. The
 * value it stores here is what the reindex page later reads from
 * `installation.config`.
 */
function Setup() {
  const { installation, updateInstallation } = useApp();
  const existing = (installation?.config ?? {}) as { reindexSecret?: string; endpoint?: string };

  const [secret, setSecret] = useState(existing.reindexSecret ?? "");
  const [endpoint, setEndpoint] = useState(existing.endpoint ?? "/api/interakt/reindex");
  const [saved, setSaved] = useState(false);

  async function save() {
    await updateInstallation?.({
      status: "COMPLETED",
      config: { reindexSecret: secret, endpoint },
    });
    setSaved(true);
  }

  const label = { display: "block", fontSize: 13, color: "#57534e", marginBottom: 4 } as const;
  const input = {
    width: "100%",
    padding: "8px 10px",
    borderRadius: 6,
    border: "1px solid #d6d3d1",
    fontSize: 14,
    marginBottom: 14,
  } as const;

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", padding: 24, maxWidth: 560 }}>
      <h1 style={{ fontSize: 18, fontWeight: 600, marginTop: 0 }}>Connect the re-feed endpoint</h1>

      <label style={label} htmlFor="secret">
        Reindex secret — must match INTERAKT_REINDEX_SECRET on the server
      </label>
      <input id="secret" style={input} value={secret} onChange={(e) => setSecret(e.target.value)} />

      <label style={label} htmlFor="endpoint">
        Endpoint (relative is fine — the app is served from the same site)
      </label>
      <input id="endpoint" style={input} value={endpoint} onChange={(e) => setEndpoint(e.target.value)} />

      <button
        type="button"
        onClick={save}
        disabled={!secret}
        style={{
          padding: "9px 16px",
          borderRadius: 6,
          border: "none",
          background: secret ? "#1c1917" : "#d6d3d1",
          color: secret ? "#fff" : "#78716c",
          fontSize: 14,
          cursor: secret ? "pointer" : "not-allowed",
        }}
      >
        Save
      </button>

      {saved ? (
        <p style={{ marginTop: 12, fontSize: 13, color: "#15803d" }}>
          Saved. Open “Re-feed Interakt” under App views in the Content editor.
        </p>
      ) : null}
    </div>
  );
}

export default function Page() {
  return (
    <Wrapper>
      <Setup />
    </Wrapper>
  );
}
