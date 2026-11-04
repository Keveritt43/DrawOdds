'use client';

import { useState, useTransition } from 'react';
import { setResidency } from '@/app/actions';

/**
 * First visit: every odds number depends on residency, so ask once instead of quietly assuming "resident".
 * Answering (or closing, which keeps resident) sets the cookie and the bar never shows again.
 */
export function ResidencyPrompt() {
  const [gone, setGone] = useState(false);
  const [pending, start] = useTransition();
  if (gone) return null;
  const pick = (r: 'RESIDENT' | 'NONRESIDENT') => start(async () => { await setResidency(r); setGone(true); });
  return (
    <div className="res-prompt" role="region" aria-label="Choose your residency">
      <span><b>Applying as an Idaho resident or a nonresident?</b> Draw odds, tags and deadlines differ.</span>
      <span className="res-prompt-btns">
        <button type="button" className="btn primary" disabled={pending} onClick={() => pick('NONRESIDENT')}>Nonresident</button>
        <button type="button" className="btn" disabled={pending} onClick={() => pick('RESIDENT')}>Resident</button>
        <button type="button" className="res-prompt-x" aria-label="Close (keep resident)" disabled={pending} onClick={() => pick('RESIDENT')}>×</button>
      </span>
    </div>
  );
}
