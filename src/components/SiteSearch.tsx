'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * One box for what hunters type: a unit ("39", "36A", "unit 49") opens its unit page; anything else (a hunt
 * number "1016", a tag code "ELK34", an area or zone name) searches every hunt.
 */
export function SiteSearch({ onDone }: { onDone?: () => void }) {
  const [q, setQ] = useState('');
  const router = useRouter();
  return (
    <form
      className="site-search"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const v = q.trim();
        if (!v) return;
        const unit = v.match(/^(?:unit\s*)?(\d{1,2}[a-z]?)$/i);
        router.push(unit ? `/units/${encodeURIComponent(unit[1].toUpperCase())}` : `/hunts?q=${encodeURIComponent(v)}`);
        setQ('');
        onDone?.();
      }}
    >
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Unit, hunt #, tag" aria-label="Search units, hunt numbers or tag codes" />
    </form>
  );
}
