'use client';
import { useSearchParams } from 'next/navigation';
import { useFinderRouter } from './FinderBusy';
import Link from 'next/link';
import { Section } from './FilterRail';

const KINDS = [['draw', 'Public draw'], ['private', 'Private-land draw (landowner code)'], ['otc', 'Over the counter (private land)']] as const;
const DEER = [['MULE', 'Mule deer legal'], ['WHITETAIL', 'White-tailed deer legal']] as const;
const FEES = [['S', 'Standard'], ['Q', 'Quality'], ['HD', 'High-demand']] as const;
const WHO = [['mobility', 'Mobility-impaired hunts'], ['military', 'Military-only hunts (McGregor Range)']] as const;

/** New Mexico-only filters: they narrow New Mexico results and leave other selected states unchanged. */
export function NmSearchFilters() {
  const sp = useSearchParams(), router = useFinderRouter();
  const list = (k: string) => (sp.get(k) ?? '').split(',').filter(Boolean);
  const toggle = (key: string, k: string) => {
    const cur = list(key);
    const next = cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k];
    const p = new URLSearchParams(sp.toString());
    next.length ? p.set(key, next.join(',')) : p.delete(key);
    p.delete('page');
    router.push(`/hunts?${p}`, { scroll: false });
  };
  const box = (key: string, opts: readonly (readonly [string, string])[]) => opts.map(([k, label]) =>
    <label key={k}><input type="checkbox" checked={list(key).includes(k)} onChange={() => toggle(key, k)} /> {label}</label>);
  const summary = (key: string, opts: readonly (readonly [string, string])[]) => {
    const c = list(key);
    return c.length ? opts.filter(([k]) => c.includes(k)).map(([, l]) => l.replace(/ \(.*\)$/, '')).join(', ') : 'All';
  };
  return <>
    <Section title="New Mexico: Hunt Type" value={summary('nmLic', KINDS)} set={list('nmLic').length > 0} defaultOpen>
      {box('nmLic', KINDS)}
      <p className="small muted">New Mexico has no points: every application gets a random number, so a first-timer&apos;s odds are the same as anyone&apos;s in their pool. Odds are for your pool (residents, nonresidents, or with an outfitter), set in <Link href="/account#hunting-preferences">Account</Link>. Private-land hunts show only when private-land-only hunts are shown.</p>
    </Section>
    <Section title="New Mexico: Deer" value={summary('nmDeer', DEER)} set={list('nmDeer').length > 0}>
      {box('nmDeer', DEER)}
      <p className="small muted">From the bag limit: FAMD is mule deer only, FAWTD and ESWTD white-tailed only, FAD either species.</p>
    </Section>
    <Section title="New Mexico: License Price" value={summary('nmFee', FEES)} set={list('nmFee').length > 0}>
      {box('nmFee', FEES)}
      <p className="small muted">Quality and high-demand licenses cost nonresidents more ($623 deer, $998 elk, vs $398 and $773 standard).</p>
    </Section>
    <Section title="New Mexico: Special Hunts" value={summary('nmWho', WHO)} set={list('nmWho').length > 0}>
      {box('nmWho', WHO)}
      <p className="small muted">Hidden unless picked: only mobility-impaired hunters, or active military, can apply for these.</p>
    </Section>
  </>;
}
