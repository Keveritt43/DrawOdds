/** Wyoming area codes end in a numeric license type; general and region licenses have no numbered type. */
export function wyTagType(row: {type:string; tagCode:string|null}): string | null {
  if (row.type === 'GENERAL' || /^(?:[A-Z]+)?R-[A-Z]+$/i.test(row.tagCode ?? '')) return 'general';
  return /-(\d)$/.exec(row.tagCode ?? '')?.[1] ?? null;
}
export function matchesWyTagType(row: {type:string; tagCode:string|null}, selected:string[]): boolean {
  return !selected.length || selected.includes(wyTagType(row) ?? '');
}
