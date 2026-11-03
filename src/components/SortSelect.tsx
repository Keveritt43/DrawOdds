'use client';

import { useRouter, useSearchParams } from 'next/navigation';

const SORTS: [string, string][] = [
  ['score', 'DrawOdds Score (Quality)'],
  ['opp', 'DrawOdds Opportunity'],
  ['best', 'Best Chance (Odds x Success)'],
  ['odds', 'Draw Odds'],
  ['success', 'Harvest Success'],
  ['big', 'Trophy Potential'],
  ['harvest', 'Most Harvest (5-yr Total)'],
  ['hunters', 'Most Hunters (5-yr Total)'],
  ['huntersLow', 'Fewest Hunters (5-yr Total)'],
  ['densityLow', 'Fewest Hunters Per Sq Mi'],
  ['apps', 'Most Applicants (Res + NR)'],
  ['appsLow', 'Fewest Applicants (Res + NR)'],
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
