'use client';
import { useSearchParams } from 'next/navigation';
import { useFinderRouter } from './FinderBusy';
import Link from 'next/link';
import { Section } from './FilterRail';
import { AZ_LICENSES } from '@/lib/azHunt';

const DEER = [['MULE', 'Mule deer only'], ['WHITETAIL', 'Whitetail only'], ['MIXED', 'Either (any antlered deer)']] as const;

/** Arizona-only filters: AZGFD hunt type and deer species. They narrow Arizona results only. */
export function AzSearchFilters() {
  const sp = useSearchParams(), router = useFinderRouter();
  const list = (k: string) => (sp.get(k) ?? '').split(',').filter(Boolean);
  const lic = list('azLic'), deer = list('azDeer');
  const toggle = (key: string, chosen: string[], v: string) => {
    const next = chosen.includes(v) ? chosen.filter((x) => x !== v) : [...chosen, v];
    const p = new URLSearchParams(sp.toString());
    next.length ? p.set(key, next.join(',')) : p.delete(key);
    p.delete('page');
    router.push(`/hunts?${p}`, { scroll: false });
  };
  return <>
    <Section title="Arizona: Hunt Type" value={lic.length ? AZ_LICENSES.filter((l) => lic.includes(l.value)).map((l) => l.label).join(', ') : 'All'} set={lic.length > 0} defaultOpen>
      {AZ_LICENSES.map((l) => <label key={l.value}><input type="checkbox" checked={lic.includes(l.value)} onChange={() => toggle('azLic', lic, l.value)} /> {l.label}</label>)}
      <p className="small muted">
        Every Arizona deer and elk hunt here is drawn. CHAMP hunts need AZGFD&apos;s Challenged Hunter Access/Mobility Permit and only show when picked. Odds use your Arizona bonus, loyalty and hunter education points in <Link href="/account#hunting-preferences">Account</Link>.
      </p>
    </Section>
    <Section title="Arizona: Deer" value={deer.length ? DEER.filter(([k]) => deer.includes(k)).map(([, l]) => l).join(', ') : 'All'} set={deer.length > 0}>
      {DEER.map(([k, label]) => <label key={k}><input type="checkbox" checked={deer.includes(k)} onChange={() => toggle('azDeer', deer, k)} /> {label}</label>)}
    </Section>
  </>;
}
