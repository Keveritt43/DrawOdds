'use client';

import { useEffect, useRef, useTransition } from 'react';
import { enabledStates } from '@/lib/states';
import { setStateCode } from '@/app/actions';
import { useStateConfig } from './StateContext';
import { useRouter, usePathname } from 'next/navigation';

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
        <p className="small muted">More states are on the way.</p>
      </div>
    </details>
  );
}
