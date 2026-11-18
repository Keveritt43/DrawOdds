'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useId, useMemo, useSyncExternalStore, useTransition } from 'react';

// Which finder controls are waiting on a search. Several controls can be pending at once.
const pending = new Set<string>();
const listeners = new Set<() => void>();
const notify = () => { for (const l of listeners) l(); };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const busy = () => pending.size > 0;

/** useRouter for Find Hunts controls: push/replace run in a transition, so the page can show it is searching. */
export function useFinderRouter() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const id = useId();
  useEffect(() => {
    if (isPending) pending.add(id); else pending.delete(id);
    notify();
    return () => { if (pending.delete(id)) notify(); };
  }, [isPending, id]);
  return useMemo(() => ({
    ...router,
    push: (href: string, options?: Parameters<typeof router.push>[1]) => startTransition(() => router.push(href, options)),
    replace: (href: string, options?: Parameters<typeof router.replace>[1]) => startTransition(() => router.replace(href, options)),
  }), [router]);
}

/** Shown while any finder control is waiting on a new search; dims the stale results underneath. */
export function FinderBusy() {
  const on = useSyncExternalStore(subscribe, busy, () => false);
  useEffect(() => {
    document.documentElement.toggleAttribute('data-finder-busy', on);
    return () => document.documentElement.removeAttribute('data-finder-busy');
  }, [on]);
  return on ? <div className="finder-busy" role="status" aria-live="polite"><span className="finder-spinner" aria-hidden="true" />Updating results…</div> : null;
}
