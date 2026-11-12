'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Section, Slider } from './FilterRail';
import { Term } from './Term';

const DEER = [['MULE', 'Mule deer'], ['WHITETAIL', 'Whitetail']] as const;
const KINDS = [['general', 'General licenses'], ['permit', 'Deer and elk permits'], ['antelope', 'Antelope licenses'], ['b', 'B licenses']] as const;

/** Montana-only filters; they narrow Montana results and leave other selected states unchanged. Private-land-only
 * hunts use the shared filter in FilterRail. */
export function MtSearchFilters({ nr = true }: { nr?: boolean }) {
  const sp = useSearchParams(), router = useRouter();
  const chosen = (sp.get('mtLic') ?? '').split(',').filter(Boolean);
  const deer = (sp.get('mtDeer') ?? '').split(',').filter(Boolean);
  const push = (next: string[], key = 'mtLic') => {
    const p = new URLSearchParams(sp.toString());
    next.length ? p.set(key, next.join(',')) : p.delete(key);
    p.delete('page');
    router.push(`/hunts?${p}`, { scroll: false });
  };
  const toggle = (k: string) => push(chosen.includes(k) ? chosen.filter((x) => x !== k) : [...chosen, k]);
  const toggleDeer = (k: string) => push(deer.includes(k) ? deer.filter((x) => x !== k) : [...deer, k], 'mtDeer');
  const species = (sp.get('species') ?? '').toUpperCase();
  const set = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) (v ? p.set(k, v) : p.delete(k));
    p.delete('page');
    router.push(`/hunts?${p}`, { scroll: false });
  };
  const two = sp.get('mtBma2') === '1';
  const minBma = sp.get('mtMinBma') ?? '', minHunt = sp.get('mtMinHuntable') ?? '', hasBma = sp.get('mtHasBma') === '1';
  const bmaLabel = two ? 'Type 1 + 2' : 'Type 1';
  const bmaValue = [minBma && `${minBma}%+ BMA`, minHunt && `${minHunt}%+ public + BMA`, hasBma && 'Has BMA'].filter(Boolean).join(' · ');
  return <>
    <Section title="Montana: License Type" value={chosen.length ? KINDS.filter(([k]) => chosen.includes(k)).map(([, l]) => l).join(', ') : 'All'} set={chosen.length > 0} defaultOpen>
      <p className="small muted">Applies to Montana only. Other selected states are unchanged.</p>
      {KINDS.map(([k, label]) => (
        <label key={k}><input type="checkbox" checked={chosen.includes(k)} onChange={() => toggle(k)} /> {label}</label>
      ))}
      <p className="small muted">
        {nr
          ? 'General deer and elk licenses: a nonresident first has to draw a combination license, at your preference points. Permits, antelope licenses and drawn B licenses use bonus points; antelope and B licenses need no combination license, and some whitetail and elk B licenses are sold over the counter.'
          : 'General deer and elk licenses are over the counter for residents. Permits, antelope licenses and drawn B licenses use bonus points; some whitetail and elk B licenses are sold over the counter.'}{' '}
        Odds use the points and &ldquo;buying a point this year&rdquo; settings in <Link href="/account#hunting-preferences">Account</Link>: in Montana, banked bonus points count only if you buy a point with the application.
      </p>
    </Section>
    <Section title="Montana: Block Management" value={bmaValue ? `${bmaValue} (${bmaLabel})` : two ? 'Any (Type 1 + 2)' : 'Any'} set={!!bmaValue || two}>
      <p className="small muted">Applies to Montana only. Other selected states are unchanged.</p>
      <p className="small" style={{ margin: '0 0 8px' }}>
        <b><Term k="bmaType1">Type 1</Term></b> is counted: you sign yourself in, so it works like public land with the area&apos;s own rules (often
        vehicles on marked roads only, or walk-in only). <b><Term k="bmaType2">Type 2</Term></b> needs the landowner&apos;s or FWP&apos;s permission,
        often a reservation, and isn&apos;t a sure way in, so it&apos;s left out unless you add it.
      </p>
      <label>Block Management (Private Land Open To Hunting)</label>
      <Slider value={Number(minBma || 0)} max={40} step={1} suffix="%" onCommit={(v) => set({ mtMinBma: v ? String(v) : null })} />
      <label>Public + Block Management</label>
      <Slider value={Number(minHunt || 0)} max={100} step={5} suffix="%" onCommit={(v) => set({ mtMinHuntable: v ? String(v) : null })} />
      <div className="checks2" style={{ marginTop: 10 }}>
        <label><input type="checkbox" checked={hasBma} onChange={() => set({ mtHasBma: hasBma ? null : '1' })} /> Has Block Management land</label>
        <label><input type="checkbox" checked={two} onChange={() => set({ mtBma2: two ? null : '1' })} /> Also count Type 2 (permission or reservation needed)</label>
      </div>
      <p className="small muted">2026–27 enrollment from FWP&apos;s maps and guide. Only areas the guide lists for the species count (for elk, a whitetail-and-birds BMA doesn&apos;t). Shading on the map always uses Type 1 only.</p>
    </Section>
    {(species === '' || species === 'DEER') && (
      <Section title="Montana: Mule Deer Or Whitetail" value={deer.length ? DEER.filter(([k]) => deer.includes(k)).map(([, l]) => l).join(', ') : 'Any'} set={deer.length > 0}>
        {DEER.map(([k, label]) => (
          <label key={k}><input type="checkbox" checked={deer.includes(k)} onChange={() => toggleDeer(k)} /> {label}</label>
        ))}
        <p className="small muted">From each license&apos;s own regulations: HD 270&apos;s general license is whitetail only, and its mule deer bucks are permit only. A license allowing both counts as either.</p>
      </Section>
    )}
  </>;
}
