'use client';

import { useEffect, useState, useTransition } from 'react';
import { usePathname } from 'next/navigation';
import { toggleSaved, toggleSavedUnit } from '@/app/actions';

type Props = { saved: boolean; signedIn: boolean; label?: boolean } & ({ kind: 'hunt'; id: number } | { kind: 'unit'; id: string });

/** Favorite star for a hunt or a unit. Signed out, it links to sign-in. */
export function Star(p: Props) {
  const [on, setOn] = useState(p.saved);
  const [pending, start] = useTransition();
  const path = usePathname();
  useEffect(() => setOn(p.saved), [p.saved]);
  const what = p.kind === 'hunt' ? 'hunt' : `unit ${p.id}`;
  if (!p.signedIn) {
    return (
      <a className="star" href={`/login?next=${encodeURIComponent(path)}`} title={`Sign in to save this ${what}`} aria-label={`Sign in to save this ${what}`}>
        ☆{p.label && <span className="star-l">Save</span>}
      </a>
    );
  }
  return (
    <button
      type="button"
      className={`star ${on ? 'on' : ''}`}
      aria-pressed={on}
      disabled={pending}
      title={on ? `Remove ${what} from your favorites` : `Add ${what} to your favorites`}
      aria-label={on ? `Remove ${what} from favorites` : `Save ${what} to favorites`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const next = !on;
        setOn(next); // optimistic
        start(async () => {
          const r = p.kind === 'hunt' ? await toggleSaved(p.id) : await toggleSavedUnit(p.id);
          if ('error' in r && r.error) setOn(!next);
          else setOn(!!r.saved);
        });
      }}
    >
      {on ? '★' : '☆'}{p.label && <span className="star-l">{on ? 'Saved' : 'Save'}</span>}
    </button>
  );
}
