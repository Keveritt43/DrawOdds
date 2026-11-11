'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Section } from './FilterRail';

const KINDS = [['general', 'General licenses'], ['permit', 'Permits'], ['b', 'B licenses']] as const;

/** Montana-only filters; they narrow Montana results and leave other selected states unchanged. Private-land-only
 * hunts use the shared filter in FilterRail. */
export function MtSearchFilters({ nr = true }: { nr?: boolean }) {
  const sp = useSearchParams(), router = useRouter();
  const chosen = (sp.get('mtLic') ?? '').split(',').filter(Boolean);
  const push = (next: string[]) => {
    const p = new URLSearchParams(sp.toString());
    next.length ? p.set('mtLic', next.join(',')) : p.delete('mtLic');
    p.delete('page');
    router.push(`/hunts?${p}`, { scroll: false });
  };
  const toggle = (k: string) => push(chosen.includes(k) ? chosen.filter((x) => x !== k) : [...chosen, k]);
  return <>
    <Section title="Montana: License Type" value={chosen.length ? KINDS.filter(([k]) => chosen.includes(k)).map(([, l]) => l).join(', ') : 'All'} set={chosen.length > 0} defaultOpen>
      <p className="small muted">Applies to Montana only. Other selected states are unchanged.</p>
      {KINDS.map(([k, label]) => (
        <label key={k}><input type="checkbox" checked={chosen.includes(k)} onChange={() => toggle(k)} /> {label}</label>
      ))}
      <p className="small muted">
        {nr
          ? 'General licenses: a nonresident first has to draw a combination license, at your preference points. Permits and B licenses use bonus points.'
          : 'General licenses are over the counter for residents. Permits and B licenses use bonus points.'}{' '}
        Odds use the points and &ldquo;buying a point this year&rdquo; settings in <Link href="/account#hunting-preferences">Account</Link>: in Montana, banked bonus points count only if you buy a point with the application.
      </p>
    </Section>
  </>;
}
