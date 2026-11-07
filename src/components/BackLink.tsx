'use client';

import { FindHuntsLink, RememberFinderNavigation } from '@/components/HuntNavigation';
import { useEffect, useState } from 'react';
import { useSearchParams } from "next/navigation";

export function BackLink({ state }: { state?: string } = {}) {
  return <FindHuntsLink state={state}>← Back To Filtering</FindHuntsLink>;
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
      history.replaceState(null, "", "/hunts");
      return;
    }
    p.delete("page");
    if (!p.has("antler")) p.set("antler", "ANTLERED");
    const q = p.toString();
    persist(q);
    document.cookie = `${LAST_HUNTS_COOKIE}=${encodeURIComponent(q)}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
  }, [params, state, owner]);
  return <><RememberFinderNavigation />{saveError ? <p role="status" className="small muted">Filters could not be saved. Check your connection and change a filter to retry.</p> : null}</>;
}
