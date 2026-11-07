const BASE = 'https://drawodds.invalid';
export const FINDER_RETURN = 'returnTo';
export const FINDER_SESSION = 'drawodds.finder';

/** The only accepted return destination is the local finder. */
export function validFinderReturn(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 6000 || !/^\/hunts(?:\?|$)/.test(value) || /[\\\x00-\x1f\x7f]/.test(value)) return null;
  const url = new URL(value, BASE);
  if (url.origin !== BASE || url.pathname !== '/hunts' || url.hash) return null;
  if (url.searchParams.has(FINDER_RETURN)) return null;
  return url.pathname + url.search;
}

export function finderHref(query: string, state: string): string {
  const p = new URLSearchParams(query);
  p.delete(FINDER_RETURN);
  p.delete('reset');
  if (!p.has('states')) {
    if (!p.has('state')) p.set('state', state);
    // A return is a complete search, not an overlay on asynchronously saved defaults.
    p.set('restore', '1');
  }
  return `/hunts${p.size ? `?${p}` : ''}`;
}

export function withFinderReturn(href: string, returnTo: unknown): string {
  const back = validFinderReturn(returnTo);
  if (!back || !/^\/(?:hunts|units|compare)(?:\/|\?|#|$)/.test(href)) return href;
  const url = new URL(href, BASE);
  if (url.origin !== BASE || url.pathname === '/hunts') return href;
  url.searchParams.set(FINDER_RETURN, back);
  return url.pathname + url.search + url.hash;
}
