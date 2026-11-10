'use client';

import { useEffect, useRef, useTransition } from 'react';
import { enabledStates } from '@/lib/states';
import { setStateCode } from '@/app/actions';
import { useStateConfig } from './StateContext';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';

/** The state name beside the logo doubles as the state picker. */
export function StateSwitch() {
  const cur = useStateConfig();
  const router = useRouter();
  const path = usePathname();
  const [pending, start] = useTransition();
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) ref.current.open = false; };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);
  // listed states, plus the current one when it's reached by link and not listed yet (a preview)
  const states = enabledStates().some((s) => s.code === cur.code) ? enabledStates() : [...enabledStates(), cur];
  return (
    <details ref={ref} className="state-switch">
      <summary aria-label={`State: ${cur.name}. Change state`}>{cur.name} <span aria-hidden="true">▾</span></summary>
      <div className="state-menu card" role="menu">
        {states.map((s) => (
          <button key={s.code} type="button" role="menuitemradio" aria-checked={s.code === cur.code} disabled={pending}
            onClick={() => start(async () => { await setStateCode(s.code); if (ref.current) ref.current.open = false; if (path === '/hunts') router.push(`/hunts?states=${s.code}&sort=opp&minScore=0`); else if (path === '/') router.push('/'); })}>
            {s.name}{s.code === cur.code ? ' ✓' : ''}
          </button>
        ))}
        {/* Read on its own under a list of live states, "More states are on the way" made Colorado and Wyoming
            look unavailable. Say what this menu does instead, and where to search several states at once. */}
        <p className="small muted">Switches states. To search several at once, choose them on the <Link href="/">home page</Link>. More states on the way.</p>
      </div>
    </details>
  );
}
