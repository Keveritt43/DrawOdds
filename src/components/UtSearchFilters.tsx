'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Section } from './FilterRail';

const KINDS = [['le', 'Limited-entry (bonus points)'], ['general', 'General buck deer (preference points)'], ['otc', 'General elk (over the counter)'], ['cwmu', 'CWMU (private land)']] as const;

/** Utah-only filters; they narrow Utah results and leave other selected states unchanged. CWMU hunts are
 *  private-land-only, so the shared filter hides them until "Private-Land-Only Hunts" is shown. */
export function UtSearchFilters({ nr = true }: { nr?: boolean }) {
  const sp = useSearchParams(), router = useRouter();
  const chosen = (sp.get('utLic') ?? '').split(',').filter(Boolean);
  const toggle = (k: string) => {
    const next = chosen.includes(k) ? chosen.filter((x) => x !== k) : [...chosen, k];
    const p = new URLSearchParams(sp.toString());
    next.length ? p.set('utLic', next.join(',')) : p.delete('utLic');
    p.delete('page');
    router.push(`/hunts?${p}`, { scroll: false });
  };
  return <Section title="Utah: Hunt Type" value={chosen.length ? KINDS.filter(([k]) => chosen.includes(k)).map(([, l]) => l.replace(/ \(.*\)$/, '')).join(', ') : 'All'} set={chosen.length > 0} defaultOpen>
    {KINDS.map(([k, label]) => <label key={k}><input type="checkbox" checked={chosen.includes(k)} onChange={() => toggle(k)} /> {label}</label>)}
    <p className="small muted">
      Limited-entry: half the permits go to the most bonus points, the rest are drawn with points + 1 chances each, so zero points can still draw. General buck deer is a strict preference-point line, unit by unit.
      {nr ? ' CWMU permits in the public draw are for residents only.' : ''} Odds use your Utah points in <Link href="/account#hunting-preferences">Account</Link>.
    </p>
  </Section>;
}
