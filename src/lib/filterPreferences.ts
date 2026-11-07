/** Persisted query strings are data, never redirect destinations. */
export function filterQuery(raw: unknown): string {
  if (typeof raw !== "string" || raw.length > 3000) return "";
  const p = new URLSearchParams(raw.replace(/^\?/, ""));
  for (const k of ["page", "reset", "restore", "returnTo", "state", "as"]) p.delete(k);
  return p.toString();
}
export const filterCookie = (state: string) => "huntFilters_" + state;
