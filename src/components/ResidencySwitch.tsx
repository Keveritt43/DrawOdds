'use client';

import { useTransition } from 'react';
import type { Residency } from '@prisma/client';
import { setResidency } from '@/app/actions';

export function ResidencySwitch({ value, light = false }: { value: Residency; light?: boolean }) {
  const [pending, start] = useTransition();
  const opt = (r: Residency, label: string, short: string) => (
    <button type="button" aria-pressed={value === r} disabled={pending} onClick={() => start(() => setResidency(r))}>
      <span className="lbl-long">{label}</span><span className="lbl-short">{short}</span>
    </button>
  );
  return (
    <div className={`seg ${light ? 'light' : ''}`} role="group" aria-label="Residency for draw odds">
      {opt('RESIDENT', 'Resident', 'Res')}
      {opt('NONRESIDENT', 'Nonresident', 'Nonres')}
    </div>
  );
}
