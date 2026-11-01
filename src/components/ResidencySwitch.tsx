'use client';

import { useTransition } from 'react';
import type { Residency } from '@prisma/client';
import { setResidency } from '@/app/actions';

export function ResidencySwitch({ value }: { value: Residency }) {
  const [pending, start] = useTransition();
  const opt = (r: Residency, label: string) => (
    <button type="button" aria-pressed={value === r} disabled={pending} onClick={() => start(() => setResidency(r))}>
      {label}
    </button>
  );
  return (
    <div className="seg" role="group" aria-label="Residency for draw odds">
      {opt('RESIDENT', 'Resident')}
      {opt('NONRESIDENT', 'Nonresident')}
    </div>
  );
}
