'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { decodeCode } from '@/lib/coHunt';
import { drawOf } from '@/lib/species';
import { unitKey } from '@/lib/states';
import { useStateConfig } from './StateContext';

/**
 * One box for what hunters type: a unit ("39", "36A", "unit 49") opens its unit page; anything else (a hunt
 * number "1016", a tag code "ELK34", an area or zone name) searches every hunt.
 */
export function SiteSearch({ onDone }: { onDone?: () => void }) {
  const [q, setQ] = useState('');
  const router = useRouter();
  const state = useStateConfig().code;
  return (
    <form
      className="site-search"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const v = q.trim();
        if (!v) return;
        const species = ({ moose: 'MOOSE', sheep: 'BIGHORN', bighorn: 'BIGHORN', 'bighorn sheep': 'BIGHORN', goat: 'GOAT', 'mountain goat': 'GOAT' } as Record<string, string>)[v.toLowerCase()];
        const code = v.toUpperCase().replace(/-/g, '');
        const hunt = decodeCode(code);
        const unit = v.match(state === 'CO' ? /^(?:unit\s*)?(\d{1,3}|[SG]\d{1,2})$/i : /^(?:unit\s*)?(\d{1,2}[a-z]?)$/i);
        if (species) router.push(`/hunts?states=CO,ID&draw=msg&species=${species}`);
        else if (hunt && hunt.sex !== 'P' && drawOf(hunt.species) === 'MSG') router.push(`/hunts?states=CO&draw=msg&species=${hunt.species}&q=${code}&priv=1`);
        else if (unit) router.push(`/units/${encodeURIComponent(unitKey(state, unit[1].toUpperCase().replace(/^([SG])(\d)$/, (_, prefix, digit) => prefix + '0' + digit)))}`);
        else router.push(`/hunts?q=${encodeURIComponent(v)}`);
        setQ('');
        onDone?.();
      }}
    >
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Unit, hunt #, tag" aria-label="Search units, hunt numbers or tag codes" />
    </form>
  );
}
