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

/** Put on Filtering: remembers its query so hunt pages can link back to it. */
export function RememberQuery() {
  useEffect(() => {
    try { sessionStorage.setItem('lastHuntsQuery', location.search); } catch { /* ignore */ }
  });
  return null;
}
