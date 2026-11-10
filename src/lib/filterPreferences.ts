/** Persisted query strings are data, never redirect destinations. */
export function filterQuery(raw: unknown): string {
  if (typeof raw !== "string" || raw.length > 3000) return "";
  const p = new URLSearchParams(raw.replace(/^\?/, ""));
  for (const k of ["page", "reset", "restore", "returnTo", "state", "as", "editPreset"]) p.delete(k);
  return p.toString();
}
export const filterCookie = (state: string) => "huntFilters_" + state;

/**
 * Whether a /hunts request should reopen the filters saved for this visitor.
 *
 * Only a bare /hunts does. A URL that names anything of its own is already a complete search - a homepage tile, a
 * bookmark, a link somebody shared - and merging saved filters into it silently narrows results the hunter never
 * asked to narrow (a shared link then shows the recipient something different from what the sender saw). The
 * finder's own "resume" paths say so explicitly with restore=1 (see finderHref), and reset=1 clears instead.
 */
export function restoresSavedFilters(sp: Record<string, string | string[] | undefined>): boolean {
  if (sp.restore === "1" || sp.reset) return false;
  return !Object.keys(sp).some((k) => sp[k] !== undefined);
}
