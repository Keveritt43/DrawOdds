'use client';
import { useSearchParams } from 'next/navigation';
import { useFinderRouter } from './FinderBusy';
import Link from 'next/link';
import { Section } from './FilterRail';

const KINDS = [['controlled', 'Controlled hunts (preference points)'], ['general', 'General season (over the counter)']] as const;
const SERIES = [['100', 'Buck deer (100 series)'], ['200', 'Elk (200 series)'], ['600', 'Antlerless deer (600 series)']] as const;

/** Oregon-only filters: they narrow Oregon results and leave other selected states unchanged. */
export function OrSearchFilters({ nr }: { nr: boolean }) {
  const sp = useSearchParams(), router = useFinderRouter();
  const list = (k: string) => (sp.get(k) ?? '').split(',').filter(Boolean);
  const push = (p: URLSearchParams) => { p.delete('page'); router.push(`/hunts?${p}`, { scroll: false }); };
  const toggle = (key: string, k: string) => {
    const cur = list(key);
    const next = cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k];
    const p = new URLSearchParams(sp.toString());
    next.length ? p.set(key, next.join(',')) : p.delete(key);
    push(p);
  };
  const setOne = (key: string, v: string | null) => {
    const p = new URLSearchParams(sp.toString());
    v ? p.set(key, v) : p.delete(key);
    push(p);
  };
  const box = (key: string, opts: readonly (readonly [string, string])[]) => opts.map(([k, label]) =>
    <label key={k}><input type="checkbox" checked={list(key).includes(k)} onChange={() => toggle(key, k)} /> {label}</label>);
  const summary = (key: string, opts: readonly (readonly [string, string])[]) => {
    const c = list(key);
    return c.length ? opts.filter(([k]) => c.includes(k)).map(([, l]) => l.replace(/ \(.*\)$/, '')).join(', ') : 'All';
  };
  const ptsVal = (k: string) => sp.get(k) ?? '';
  return <>
    <Section title="Oregon: Hunt Type" value={summary('orLic', KINDS)} set={list('orLic').length > 0} defaultOpen>
      {box('orLic', KINDS)}
      <p className="small muted">Controlled hunts: 75% of the tags go to the most preference points, the rest at random, with the same random number. {nr ? 'Nonresidents can draw at most 5% of a hunt\'s tags, so small hunts have none. ' : ''}Set points in <Link href="/account#hunting-preferences">Account</Link>.</p>
    </Section>
    <Section title="Oregon: Hunt Series" value={summary('orSeries', SERIES)} set={list('orSeries').length > 0}>{box('orSeries', SERIES)}</Section>
    <Section title="Oregon: Limited Access" value={sp.get('orLimited') === 'hide' ? 'Hidden' : 'Shown'} set={sp.get('orLimited') === 'hide'}>
      <label><input type="checkbox" checked={sp.get('orLimited') === 'hide'} onChange={(e) => setOne('orLimited', e.target.checked ? 'hide' : null)} /> Hide hunts where private lands limit access</label>
      <p className="small muted">ODFW marks these with &quot;*&quot;: don&apos;t apply unless you have a place to hunt. Hunts on private land only are under Private-Land-Only Hunts.</p>
    </Section>
    <Section title="Oregon: Points Needed" value={ptsVal('orMinPts') || ptsVal('orMaxPts') ? `${ptsVal('orMinPts') || 0}–${ptsVal('orMaxPts') || 'any'}` : 'Any'} set={!!(ptsVal('orMinPts') || ptsVal('orMaxPts'))}>
      <label>At least <input type="number" min={0} max={30} defaultValue={ptsVal('orMinPts')} onBlur={(e) => setOne('orMinPts', e.target.value || null)} style={{ width: 60 }} /></label>
      <label>At most <input type="number" min={0} max={30} defaultValue={ptsVal('orMaxPts')} onBlur={(e) => setOne('orMaxPts', e.target.value || null)} style={{ width: 60 }} /></label>
      <p className="small muted">The fewest points that drew in the 2026 preference phase, for your residency. Hunts nobody drew by points (undersubscribed or random only) are left out when this is set.</p>
    </Section>
  </>;
}
