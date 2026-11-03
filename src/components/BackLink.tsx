'use client';

import { useEffect, useState } from 'react';

/**
 * "Back To Filtering" that returns to the list as you left it (filters, sort, scroll). Coming from Filtering it
 * goes back in history; otherwise it links to the remembered filter query, or plain /hunts.
 */
export function BackLink() {
  const [href, setHref] = useState('/hunts');
  const [fromList, setFromList] = useState(false);
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('lastHuntsQuery');
      if (saved !== null) setHref(`/hunts${saved}`);
    } catch { /* storage blocked: plain link */ }
    try {
      const r = document.referrer ? new URL(document.referrer) : null;
      setFromList(!!r && r.origin === location.origin && r.pathname === '/hunts' && history.length > 1);
    } catch { /* ignore */ }
  }, []);
  return (
    <a href={href} onClick={(e) => { if (fromList) { e.preventDefault(); history.back(); } }}>← Back To Filtering</a>
  );
}

export const LAST_HUNTS_COOKIE = 'lastHunts';

/**
 * Put on Filtering: remembers its query so hunt pages can link back to it, and (in a cookie, 30 days) so that
 * coming back to Find A Hunt from anywhere brings the same filters back. `?reset=1` forgets them.
 */
export function RememberQuery() {
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    if (p.has('reset')) {
      document.cookie = `${LAST_HUNTS_COOKIE}=; path=/; max-age=0; samesite=lax`;
      try { sessionStorage.removeItem('lastHuntsQuery'); } catch { /* ignore */ }
      history.replaceState(null, '', '/hunts');
      return;
    }
    p.delete('page');
    const q = p.toString();
    try { sessionStorage.setItem('lastHuntsQuery', location.search); } catch { /* ignore */ }
    document.cookie = `${LAST_HUNTS_COOKIE}=${encodeURIComponent(q)}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
  });
  return null;
}
