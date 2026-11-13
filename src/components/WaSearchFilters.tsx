'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Section } from './FilterRail';

const KINDS = [['special', 'Special permits (weighted points)'], ['multi', 'Multi-season tags (weighted points)'], ['general', 'General season (over the counter)']] as const;
const CATS = [['Quality Deer', 'Quality deer'], ['Buck Deer', 'Buck deer'], ['Antlerless Deer', 'Antlerless deer'], ['Second Deer', 'Second deer'],
  ['Quality Elk', 'Quality elk'], ['Bull Elk', 'Bull elk'], ['Antlerless Elk', 'Antlerless elk'],
  ['Deer - Youth', 'Youth deer (under 16)'], ['Elk - Youth', 'Youth elk (under 16)'],
  ['Deer - 65 Years or Over', '65+ deer'], ['Elk - 65 and Over', '65+ elk'],
  ['Deer - Hunters with Disabilities', 'Hunters with disabilities deer'], ['Elk - Hunters with Disabilities', 'Hunters with disabilities elk'],
  ['Deer - Master Hunter', 'Master Hunter deer'], ['Elk - Master Hunter', 'Master Hunter elk']] as const;
const WEAPONS = [['ANY', 'Modern firearm'], ['ARCHERY', 'Archery'], ['MUZZLELOADER', 'Muzzleloader']] as const;
const SIDES = [['EAST', 'Eastern'], ['WEST', 'Western']] as const;

/** Washington-only filters: they narrow Washington results and leave other selected states unchanged. */
export function WaSearchFilters() {
  const sp = useSearchParams(), router = useRouter();
  const list = (k: string) => (sp.get(k) ?? '').split(',').filter(Boolean);
  const toggle = (key: string, k: string) => {
    const cur = list(key);
    const next = cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k];
    const p = new URLSearchParams(sp.toString());
    next.length ? p.set(key, next.join(',')) : p.delete(key);
    p.delete('page');
    router.push(`/hunts?${p}`, { scroll: false });
  };
  const setOne = (key: string, v: string | null) => {
    const p = new URLSearchParams(sp.toString());
    v ? p.set(key, v) : p.delete(key);
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
    <Section title="Washington: License" value={summary('waLic', KINDS)} set={list('waLic').length > 0} defaultOpen>
      {box('waLic', KINDS)}
      <p className="small muted">Special permits and multi-season tags are one weighted drawing per category: your entries are your points plus this year&apos;s, squared. Odds are estimates (WDFW stopped publishing results by points after 2020). Set points in <Link href="/account#hunting-preferences">Account</Link>.</p>
    </Section>
    <Section title="Washington: Permit Category" value={summary('waCat', CATS)} set={list('waCat').length > 0}>{box('waCat', CATS)}</Section>
    <Section title="Washington: Weapon" value={summary('waWeapon', WEAPONS)} set={list('waWeapon').length > 0}>{box('waWeapon', WEAPONS)}</Section>
    <Section title="Washington: Elk Tag Area" value={summary('waSide', SIDES)} set={list('waSide').length > 0}>
      {box('waSide', SIDES)}
      <p className="small muted">A general elk tag is Eastern or Western Washington; you pick one when you buy it.</p>
    </Section>
    <Section title="Washington: My Tag" value={sp.get('waMyTag') === '1' ? 'Only hunts it can apply for' : 'All'} set={sp.get('waMyTag') === '1'}>
      <label><input type="checkbox" checked={sp.get('waMyTag') === '1'} onChange={(e) => setOne('waMyTag', e.target.checked ? '1' : null)} /> Only special permits my saved tag can apply for</label>
      <p className="small muted">Uses the deer and elk tags saved in <Link href="/account#hunting-preferences">Account</Link>. Hunts whose tag cell we can&apos;t read stay in.</p>
    </Section>
  </>;
}
