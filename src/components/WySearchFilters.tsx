'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Section } from './FilterRail';

/** Wyoming-only filters; they narrow Wyoming results and leave other selected states unchanged. Private-land-only
 * hunts use the shared filter in FilterRail. */
export function WySearchFilters({ nr = true, savedSpecial = false }: { nr?: boolean; savedSpecial?: boolean }) {
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
  const special = get('wyPool') === 'nrs' ? true : get('wyPool') === 'nr' ? false : savedSpecial;
  const saved = savedSpecial ? 'special' : 'regular';
  return <>
    {(get('species') === '' || get('species').toUpperCase() === 'DEER') && <Section title="Wyoming: Deer Harvest Mix" value={get('wyDeer') || 'Any'} set={!!get('wyDeer')}>
      {note}<p className="small muted">Based on reported harvest, not license eligibility: 60% or more whitetail = Whitetail, 40% or less = Mule Deer; between is Mixed. Only years with both species reported are counted. Unknown mixes do not match.</p>
      <div className="checks2">{([['MULE', 'Mule Deer'], ['WHITETAIL', 'Whitetail'], ['MIXED', 'Mixed']] as const).map(([value, label]) => {
        const selected = get('wyDeer').split(',').filter(Boolean);
        return <label key={value}><input type="checkbox" checked={selected.includes(value)} onChange={() => { const next = selected.includes(value) ? selected.filter(x => x !== value) : [...selected, value]; push({ wyDeer: next.join(',') || null }); }} /> {label}</label>;
      })}</div>
    </Section>}
    <Section title="Wyoming: Nonresident Pool" value={special ? 'Special' : 'Regular'} set={!!get('wyPool')} defaultOpen>
      {nr ? <>
        <div className="seg light" role="group" aria-label="Wyoming nonresident pool">
          {([['nr', 'Regular', false], ['nrs', 'Special', true]] as const).map(([v, label, isSpecial]) => (
            <button key={v} type="button" className="seg-link" aria-pressed={special === isSpecial}
              onClick={() => push({ wyPool: isSpecial === savedSpecial ? null : v })}>{label}</button>
          ))}
        </div>
        <p className="small muted">Odds, points needed and Opportunity follow this pool. For a nonresident full-price deer license, WGFD lists $374 regular or $1,200 special, plus a $15 application fee (fee schedule checked November 12, 2026). Other licenses and requirements have different costs. <a href="https://wgfd.wyo.gov/licenses-applications/license-fee-list">See WGFD prices</a>. Your saved pool is {saved}: <Link href="/account#hunting-preferences">change it in Account</Link>.</p>
      </> : <p className="small muted">Residents draw in the resident pool; regular and special are nonresident pools.</p>}
    </Section>
    <Section title="Wyoming: Points Needed (Nonresident)" value={get('wyMaxPts') ? `${get('wyMaxPts')} or fewer` : 'Any'} set={!!get('wyMaxPts')}>
      {note}<p className="small muted">Preference cutoff in the last draw, in the pool shown above. Hunts where everyone drew count as 0.</p>
      <label>At most <select aria-label="Wyoming maximum points needed" value={get('wyMaxPts')} onChange={e => push({ wyMaxPts: e.target.value || null })}>
        <option value="">Any</option>{Array.from({ length: 21 }, (_, i) => <option key={i} value={String(i)}>{i} points</option>)}
      </select></label>
    </Section>
    <Section title="Wyoming: Wilderness" value={get('wyWild') === 'none' ? 'No wilderness' : get('wyWild') === 'has' ? 'Has wilderness' : 'Any'} set={!!get('wyWild')}>
      {note}
      <p className="small muted">{nr
        ? 'Wyoming bars a nonresident from hunting big game inside federally designated wilderness without a licensed or resident guide (W.S. 23-2-401). The rule follows the wilderness boundary, not the hunt area, so an area that only clips a wilderness is still mostly huntable on your own.'
        : 'Residents need no guide. Shown here because a nonresident in your party would.'}</p>
      <div className="seg light" role="group" aria-label="Wyoming wilderness">
        {([['', 'Any'], ['none', 'No wilderness'], ['has', 'Has wilderness']] as const).map(([v, label]) => (
          <button key={v || 'any'} type="button" className="seg-link" aria-pressed={get('wyWild') === v}
            onClick={() => push({ wyWild: v || null })}>{label}</button>
        ))}
      </div>
    </Section>
    {!coSelected && <Section title="Wyoming: Odds Basis" value={get('odds') === 'last' ? 'Last draw' : 'Next draw'} set={get('odds') === 'last'}>
      <label>Odds <select aria-label="Wyoming odds basis" value={get('odds') || 'proj'} onChange={e => push({ odds: e.target.value === 'last' ? 'last' : null })}><option value="proj">Next draw (projected: antelope, deer)</option><option value="last">Last draw (actual)</option></select></label>
      <p className="small muted">Elk has no validated projection, so it shows the last draw either way.</p>
    </Section>}
  </>;
}
