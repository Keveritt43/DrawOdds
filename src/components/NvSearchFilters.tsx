'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Section } from './FilterRail';

const KINDS = [['deer', 'Antlered mule deer'], ['junior', 'Junior mule deer'], ['bull', 'Antlered elk'], ['spike', 'Spike elk'], ['cow', 'Antlerless elk']] as const;

/** Nevada-only filter, one choice per NDOW bonus-point category; it narrows Nevada results only. */
export function NvSearchFilters() {
  const sp = useSearchParams(), router = useRouter();
  const chosen = (sp.get('nvCat') ?? '').split(',').filter(Boolean);
  const toggle = (k: string) => {
    const next = chosen.includes(k) ? chosen.filter((x) => x !== k) : [...chosen, k];
    const p = new URLSearchParams(sp.toString());
    next.length ? p.set('nvCat', next.join(',')) : p.delete('nvCat');
    p.delete('page');
    router.push(`/hunts?${p}`, { scroll: false });
  };
  return <Section title="Nevada: Hunt Type" value={chosen.length ? KINDS.filter(([k]) => chosen.includes(k)).map(([, l]) => l).join(', ') : 'All'} set={chosen.length > 0} defaultOpen>
    {KINDS.map(([k, label]) => <label key={k}><input type="checkbox" checked={chosen.includes(k)} onChange={() => toggle(k)} /> {label}</label>)}
    <p className="small muted">
      Every Nevada deer and elk tag here is drawn. Each type has its own bonus points; an application gets points² + 1 draw numbers, so zero points can still draw. Junior and spike hunts are for residents only. Odds use your Nevada points in <Link href="/account#hunting-preferences">Account</Link>.
    </p>
  </Section>;
}
