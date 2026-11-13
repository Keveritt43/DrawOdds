'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { setStateCode } from '@/app/actions';
import { useStateConfig } from './StateContext';

/**
 * Keeps the site's state (header picker, Planner, What Changed, How The Draw Works) in step with the state whose
 * pages the visitor is on. Before this, a hunter who reached Washington through Find Hunts saw "Idaho" in the
 * header, and the menu pages opened Idaho's versions. Rendered by single-state pages: a hunt page, a unit page,
 * and Find Hunts when exactly one state is selected.
 */
export function SyncState({ code }: { code: string }) {
  const cur = useStateConfig();
  const router = useRouter();
  const done = useRef(false);
  useEffect(() => {
    if (done.current || !code || cur.code === code.toUpperCase()) return;
    done.current = true;
    setStateCode(code).then(() => router.refresh());
  }, [code, cur.code, router]);
  return null;
}
