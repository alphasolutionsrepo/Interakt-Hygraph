"use client";

import { useEffect } from "react";

/**
 * Mounts an Interakt drop-in widget.
 *
 * The bundle is a vanilla IIFE served from the Interakt instance itself — there
 * is no npm package and no web component. It registers `window.SearchDropinUI`
 * and `window.ChatDropinUI`, each with `init(config)` / `destroy(containerId)`.
 *
 * The published docs show a `<script data-token data-container>` attribute API.
 * That does not exist in the shipped bundle; the canonical snippet (from
 * `GET /api/v1/embed-snippet`) is a script tag plus an `init()` call, which is
 * what this does.
 *
 * Only `containerId` and `accessToken` are required. `apiBaseUrl` defaults to the
 * origin of the script tag, so it is passed explicitly only when they differ.
 */

type WidgetKind = "search" | "chat";

type DropinApi = {
  init: (config: Record<string, unknown>) => void;
  destroy: (containerId: string) => void;
};

declare global {
  interface Window {
    SearchDropinUI?: DropinApi;
    ChatDropinUI?: DropinApi;
  }
}

const GLOBALS: Record<WidgetKind, "SearchDropinUI" | "ChatDropinUI"> = {
  search: "SearchDropinUI",
  chat: "ChatDropinUI",
};

const BUNDLE_PATH = "/embed/v1/widgets.js";

/**
 * One shared load promise: both widgets come from the same bundle, and loading
 * it twice registers the globals twice. Rejections are not cached, so a failed
 * load can be retried by a later mount.
 */
let bundlePromise: Promise<void> | null = null;

function loadBundle(baseUrl: string): Promise<void> {
  if (bundlePromise) return bundlePromise;

  bundlePromise = new Promise<void>((resolve, reject) => {
    const src = `${baseUrl.replace(/\/$/, "")}${BUNDLE_PATH}`;
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);

    if (existing) {
      // A listener added after the script already loaded never fires, which
      // leaves the widget hanging forever — so check for the global first.
      if (window.SearchDropinUI || window.ChatDropinUI) {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Interakt widget bundle failed")));
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.addEventListener("load", () => resolve());
    script.addEventListener("error", () => reject(new Error("Interakt widget bundle failed")));
    document.head.appendChild(script);
  }).catch((error) => {
    bundlePromise = null;
    throw error;
  });

  return bundlePromise;
}

export function DropinWidget({
  kind,
  containerId,
  accessToken,
  baseUrl,
  config,
}: {
  kind: WidgetKind;
  containerId: string;
  accessToken?: string;
  baseUrl?: string;
  config?: Record<string, unknown>;
}) {
  useEffect(() => {
    if (!accessToken || !baseUrl) return;

    let cancelled = false;

    loadBundle(baseUrl)
      .then(() => {
        if (cancelled) return;
        const api = window[GLOBALS[kind]];
        if (!api) throw new Error(`window.${GLOBALS[kind]} was not registered`);
        api.init({ containerId, accessToken, apiBaseUrl: baseUrl, ...config });
      })
      .catch((error) => {
        // A missing chat widget should never take the page down with it.
        console.error("Interakt widget:", error instanceof Error ? error.message : error);
      });

    return () => {
      cancelled = true;
      try {
        window[GLOBALS[kind]]?.destroy(containerId);
      } catch {
        // destroy throws if init never completed; nothing to clean up.
      }
    };
    // config is an inline object literal at every call site; stringify to avoid
    // tearing the widget down and rebuilding it on every render.
  }, [kind, containerId, accessToken, baseUrl, JSON.stringify(config ?? {})]);

  return <div id={containerId} />;
}
