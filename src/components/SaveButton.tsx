'use client';

import { useState, useTransition } from 'react';
import { toggleSaved } from '@/app/actions';

export function SaveButton({ huntId, saved, signedIn }: { huntId: number; saved: boolean; signedIn: boolean }) {
  const [on, setOn] = useState(saved);
  const [msg, setMsg] = useState('');
  const [pending, start] = useTransition();
  if (!signedIn) return <a className="btn" href="/login">Sign in to save</a>;
  return (
    <span>
      <button
        className={`btn ${on ? '' : 'primary'}`}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await toggleSaved(huntId);
            if ('error' in r && r.error) setMsg(r.error);
            else setOn(!!r.saved);
          })
        }
      >
        {on ? 'Saved' : 'Save hunt'}
      </button>
      {msg && <span className="small muted"> {msg}</span>}
    </span>
  );
}
