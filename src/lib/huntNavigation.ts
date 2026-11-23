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

/** Only a local individual-hunt URL can be used as a return from a unit page. */
export function validHuntReturn(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 12000 || !/^\/hunts\/[^/?#]+(?:\?|$)/.test(value) || /[\\\x00-\x1f\x7f]/.test(value)) return null;
  try {
    const url = new URL(value, BASE);
    if (url.origin !== BASE || !/^\/hunts\/[^/]+$/.test(url.pathname) || url.hash || /[\/\\\x00-\x1f\x7f]/.test(decodeURIComponent(url.pathname.slice(7)))) return null;
    const finder = url.searchParams.get(FINDER_RETURN);
    if (finder !== null && !validFinderReturn(finder)) return null;
    return url.pathname + url.search;
  } catch { return null; }
}

/** Link to an Idaho unit and carry the exact hunt and finder context for the return journey. */
export function idahoUnitResearchHref(unit: string, hunt: unknown): string {
  const back = validHuntReturn(hunt);
  const q = new URLSearchParams();
  if (back) {
    q.set('returnHunt', back);
    const residency = new URL(back, BASE).searchParams.get('as');
    if (residency === 'nr' || residency === 'res') q.set('as', residency);
  }
  return `/units/${encodeURIComponent(unit)}${q.size ? `?${q}` : ''}`;
}
