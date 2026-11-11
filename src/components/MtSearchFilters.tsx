'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Section } from './FilterRail';

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
  return <>
    <Section title="Montana: License Type" value={chosen.length ? KINDS.filter(([k]) => chosen.includes(k)).map(([, l]) => l).join(', ') : 'All'} set={chosen.length > 0} defaultOpen>
      <p className="small muted">Applies to Montana only. Other selected states are unchanged.</p>
      {KINDS.map(([k, label]) => (
        <label key={k}><input type="checkbox" checked={chosen.includes(k)} onChange={() => toggle(k)} /> {label}</label>
      ))}
      <p className="small muted">
        {nr
          ? 'General deer and elk licenses: a nonresident first has to draw a combination license, at your preference points. Permits, antelope licenses and B licenses use bonus points; antelope needs no combination license.'
          : 'General deer and elk licenses are over the counter for residents. Permits, antelope licenses and B licenses use bonus points.'}{' '}
        Odds use the points and &ldquo;buying a point this year&rdquo; settings in <Link href="/account#hunting-preferences">Account</Link>: in Montana, banked bonus points count only if you buy a point with the application.
      </p>
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
