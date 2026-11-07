'use client';

import { useEffect, useState, useTransition } from 'react';
import { toggleSaved, toggleSavedUnit } from '@/app/actions';

type Props = { saved: boolean; signedIn: boolean; label?: boolean } & ({ kind: 'hunt'; id: number } | { kind: 'unit'; id: string });

/** Signed-in favorites belong to the account; guests save in their own browser. */
export function Star(p: Props) {
  const [on, setOn] = useState(p.saved);
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  useEffect(() => setOn(p.saved), [p.saved]);
  const what = p.kind === 'hunt' ? 'hunt' : `unit ${p.id}`;
  return (
    <>
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
        setError('');
        setOn(next); // optimistic
        start(async () => {
          try {
            const r = p.kind === 'hunt' ? await toggleSaved(p.id) : await toggleSavedUnit(p.id);
            if ('saved' in r) setOn(!!r.saved);
            else { setOn(!next); setError(r.error); }
          } catch { setOn(!next); setError('Could not save this favorite. Please try again.'); }
        });
      }}
    >
      {on ? '★' : '☆'}{p.label && <span className="star-l">{on ? 'Saved' : 'Save'}</span>}
    </button>
    {error && <span className="small" role="alert">{error}</span>}
    </>
  );
}
