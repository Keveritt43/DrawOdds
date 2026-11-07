'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState, type ComponentProps } from 'react';
import { FINDER_RETURN, FINDER_SESSION, finderHref, validFinderReturn, withFinderReturn } from '@/lib/huntNavigation';
import { useStateConfig } from './StateContext';

function remember(href: string, header: string) {
  try { sessionStorage.setItem(FINDER_SESSION, JSON.stringify({ href, header })); } catch { /* Links work without storage. */ }
}

/** Mounted beside the results, regardless of which settings panels are open. */
export function RememberFinderNavigation() {
  const query = useSearchParams().toString();
  const header = useStateConfig().code;
  useEffect(() => { remember(finderHref(query, header), header); }, [query, header]);
  return null;
}

type Props = Omit<ComponentProps<typeof Link>, 'href'> & { href: string };

/** Carry the exact finder URL through detail links and subsequent research links. */
export function HuntLink({ href, ...props }: Props) {
  const path = usePathname();
  const params = useSearchParams();
  const header = useStateConfig().code;
  const back = path === '/hunts' ? finderHref(params.toString(), header) : validFinderReturn(params.get(FINDER_RETURN));
  return <Link {...props} href={withFinderReturn(href, back)} />;
}

export function FindHuntsLink({ fallback = '/hunts', state, ...props }: Omit<Props, 'href'> & { fallback?: string; state?: string }) {
  const path = usePathname();
  const params = useSearchParams();
  const header = useStateConfig().code;
  const explicit = path === '/hunts' ? finderHref(params.toString(), header) : validFinderReturn(params.get(FINDER_RETURN));
  const [saved, setSaved] = useState<{ href: string; header: string } | null>(null);
  useEffect(() => {
    try {
      const record = JSON.parse(sessionStorage.getItem(FINDER_SESSION) ?? 'null');
      const href = record?.header === header ? validFinderReturn(record.href) : null;
      setSaved(href ? { href, header } : null);
    } catch { setSaved(null); }
  }, [path, params, header]);
  return <Link {...props} href={explicit ?? (saved?.header === header ? saved.href : null) ?? (state ? `/hunts?states=${encodeURIComponent(state)}` : fallback)} />;
}
