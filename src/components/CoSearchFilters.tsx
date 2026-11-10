'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Section } from './FilterRail';
import { PointRangeSlider, CHANCES } from './CoFilters';
import { pointRange } from '@/lib/pointRange';

/** State controls retain their URL names; common species, weapon and dates live in FilterRail. */
export function CoSearchFilters({ part }: { part: 'points' | 'state' }) {
  const sp = useSearchParams(), router = useRouter();
  const get = (k: string) => sp.get(k) ?? '';
  const push = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) v === null ? p.delete(k) : p.set(k, v);
    p.delete('page');
    router.push(`/hunts?${p}`, { scroll: false });
  };
  const checks = (key: string, options: readonly (readonly [string, string])[]) => <div className="checks2">{options.map(([v, label]) => {
    const values = get(key).split(',').filter(Boolean);
    return <label key={v}><input type="checkbox" checked={values.includes(v)} onChange={() => { const next = values.includes(v) ? values.filter(x => x !== v) : [...values, v]; push({ [key]: next.length ? next.join(',') : null }); }} /> {label}</label>;
  })}</div>;
  const range = pointRange(get('minPts'), get('maxPts'));
  const note = <p className="small muted">Applies to Colorado only. Other selected states are unchanged.</p>;
  return part === 'points' ? <>
    <Section title="Colorado: Points Needed" value={get('minPts') || get('maxPts') ? `${range.min ?? 0}–${range.max ?? 40}` : 'Any'} set={!!(get('minPts') || get('maxPts'))}>
      {note}<p className="small muted">Last draw, for your Colorado residency.</p><PointRangeSlider min={range.min ?? 0} max={range.max ?? 40} onCommit={(min, max) => push({ minPts: min === 0 ? null : String(min), maxPts: max === 40 ? null : String(max) })} />
    </Section>
    <Section title="Colorado: Draw At My Points" value={get('chance') || 'Any'} set={!!get('chance')}>
      {note}{checks('chance', CHANCES)}
      <label>Odds basis <select aria-label="Colorado odds basis" value={get('odds') || 'proj'} onChange={e => push({ odds: e.target.value === 'last' ? 'last' : null })}><option value="proj">Next draw (projected)</option><option value="last">Last draw (historical)</option></select></label>
    </Section>
  </> : <>
    <Section title="Colorado: Season" value={get('season') || 'Any'} set={!!get('season')}>
      {note}{checks('season', [['1', '1st rifle'], ['2', '2nd rifle'], ['3', '3rd rifle'], ['4', '4th rifle'], ['E', 'Early'], ['L', 'Late'], ['K', 'Youth only']])}
    </Section>
    <Section title="Colorado: Choice & Draw" value={[get('second') && '2nd choice', get('hybrid') && 'Hybrid'].filter(Boolean).join(', ') || 'Any'} set={!!(get('second') || get('hybrid'))}>
      {note}<div className="checks2">{[['second', 'Drew as a 2nd choice'], ['hybrid', 'Has a hybrid draw']].map(([k, label]) => <label key={k}><input type="checkbox" checked={get(k) === '1'} onChange={() => push({ [k]: get(k) === '1' ? null : '1' })} /> {label}</label>)}</div>
    </Section>
    <Section title="Colorado: Overlapping Elk" value={get('otcElk') === '1' ? 'Has OTC elk' : get('otcElk') === '0' ? 'No OTC elk' : 'Any'} set={['0', '1'].includes(get('otcElk'))}>
      {note}<div className="checks2">{[['', 'Any'], ['1', 'Has OTC elk'], ['0', 'No OTC elk']].map(([v, label]) => <label key={v}><input type="radio" name="search-otc" checked={get('otcElk') === v} onChange={() => push({ otcElk: v || null })} /> {label}</label>)}</div><p className="small muted">Deer hunts sharing a Colorado unit and an actual open date with general elk. Unknown dates match neither overlap choice.</p>
    </Section>
  </>;
}
