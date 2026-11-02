'use client';

import { useRouter, useSearchParams } from 'next/navigation';

const SORTS: [string, string][] = [
  ['best', 'Best Chance (Odds x Success)'],
  ['odds', 'Draw Odds'],
  ['success', 'Harvest Success'],
  ['big', 'Trophy Potential'],
  ['public', 'Public Land'],
  ['open', 'Season Opens'],
  ['alpha', 'Alphabetical'],
];

export function SortSelect({ value }: { value: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  return (
    <select
      aria-label="Sort results"
      value={value}
      onChange={(e) => {
        const p = new URLSearchParams(sp.toString());
        if (e.target.value === 'best') p.delete('sort');
        else p.set('sort', e.target.value);
        router.push(`/hunts${p.size ? `?${p}` : ''}`, { scroll: false });
      }}
    >
      {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}
