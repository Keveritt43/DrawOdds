'use client';

import { useEffect, useState } from 'react';
import { useStateConfig } from "./StateContext";
import { useSearchParams } from "next/navigation";

/**
 * "Back To Filtering" that returns to the list as you left it (filters, sort, scroll). Coming from Filtering it
 * goes back in history; otherwise it links to the remembered filter query, or plain /hunts.
 */
export function BackLink() {
  const state = useStateConfig().code;
  const [href, setHref] = useState('/hunts');
  const [fromList, setFromList] = useState(false);
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("lastHuntsQuery_" + state);
      if (saved !== null) setHref(`/hunts${saved}`);
    } catch {
      /* storage blocked: plain link */
    }
    try {
      const r = document.referrer ? new URL(document.referrer) : null;
      setFromList(!!r && r.origin === location.origin && r.pathname === '/hunts' && history.length > 1);
    } catch { /* ignore */ }
  }, [state]);
  return (
    <a href={href} onClick={(e) => { if (fromList) { e.preventDefault(); history.back(); } }}>← Back To Filtering</a>
  );
}

export const LAST_HUNTS_COOKIE = "lastHunts";
let pendingSave: Promise<unknown> = Promise.resolve();

/**
 * Put on Filtering: remembers its query so hunt pages can link back to it, and (in a cookie, 30 days) so that
 * coming back to Find A Hunt from anywhere brings the same filters back. `?reset=1` forgets them.
 */
export function RememberQuery({ state = "ID", owner = null }: { state?: string; owner?: string|null }) {
  const params = useSearchParams();
  const [saveError, setSaveError] = useState(false);
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    const persist = (query: string) => {
      pendingSave = pendingSave
        .catch(() => {})
        .then(async () => {
          const r = await fetch("/api/filters", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ state, query, owner }),
            keepalive: true,
          });
          if (!r.ok) throw Error("Save failed");
          setSaveError(false);
        })
        .catch(() => setSaveError(true));
    };
    if (p.has("reset")) {
      persist("antler=ANTLERED");
      document.cookie = `${LAST_HUNTS_COOKIE}=; path=/; max-age=0; samesite=lax`;
      try {
        sessionStorage.removeItem("lastHuntsQuery_" + state);
      } catch {
        /* ignore */
      }
      history.replaceState(null, "", "/hunts");
      return;
    }
    p.delete("page");
    if (!p.has("antler")) p.set("antler", "ANTLERED");
    const q = p.toString();
    persist(q);
    try {
      sessionStorage.setItem("lastHuntsQuery_" + state, location.search);
    } catch {
      /* ignore */
    }
    document.cookie = `${LAST_HUNTS_COOKIE}=${encodeURIComponent(q)}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
  }, [params, state, owner]);
  return saveError ? <p role="status" className="small muted">Filters could not be saved. Check your connection and change a filter to retry.</p> : null;
}
