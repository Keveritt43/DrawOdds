'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Section } from './FilterRail';

/** Wyoming-only filters; they narrow Wyoming results and leave other selected states unchanged. */
export function WySearchFilters() {
  const sp = useSearchParams(), router = useRouter();
  const get = (k: string) => sp.get(k) ?? '';
  const push = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) v === null ? p.delete(k) : p.set(k, v);
    p.delete('page');
    router.push(`/hunts?${p}`, { scroll: false });
  };
  const note = <p className="small muted">Applies to Wyoming only. Other selected states are unchanged.</p>;
  const coSelected = (sp.get('states') ?? '').toUpperCase().split(',').includes('CO');
  return <>
    <Section title="Wyoming: Points Needed (Nonresident)" value={get('wyMaxPts') ? `${get('wyMaxPts')} or fewer` : 'Any'} set={!!get('wyMaxPts')}>
      {note}<p className="small muted">Regular-pool preference cutoff in the last draw.</p>
      <label>At most <select aria-label="Wyoming maximum points needed" value={get('wyMaxPts')} onChange={e => push({ wyMaxPts: e.target.value || null })}>
        <option value="">Any</option>{Array.from({ length: 21 }, (_, i) => <option key={i} value={String(i)}>{i} points</option>)}
      </select></label>
    </Section>
    <Section title="Wyoming: Private Land" value={get('wyPriv') === '1' ? 'Included' : 'Excluded'} set={get('wyPriv') === '1'}>
      {note}<label><input type="checkbox" checked={get('wyPriv') === '1'} onChange={() => push({ wyPriv: get('wyPriv') === '1' ? null : '1' })} /> Include licenses valid only on private land</label>
    </Section>
    {!coSelected && <Section title="Wyoming: Odds Basis" value={get('odds') === 'last' ? 'Last draw' : 'Next draw'} set={get('odds') === 'last'}>
      <label>Odds <select aria-label="Wyoming odds basis" value={get('odds') || 'proj'} onChange={e => push({ odds: e.target.value === 'last' ? 'last' : null })}><option value="proj">Next draw (projected: antelope, deer)</option><option value="last">Last draw (actual)</option></select></label>
      <p className="small muted">Elk has no validated projection, so it shows the last draw either way.</p>
    </Section>}
  </>;
}
