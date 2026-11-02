import { BOUNDARY_CHANGED_2022 } from '@/sync/core/math';

/** Unit -> year IDFG last redrew its boundary. Add new years here when IDFG changes units again. */
export const BOUNDARY_CHANGES: Record<string, number> = Object.fromEntries([...BOUNDARY_CHANGED_2022].map((u) => [u, 2022]));

/**
 * Units among `units` whose boundary changed this year or last year - the only changes worth calling out.
 * Older changes are still handled silently in the numbers (stats only use years after the change).
 */
export function recentBoundaryChanges(units: string[], now = new Date().getFullYear()): { units: string[]; year: number } | null {
  const hit = units.filter((u) => (BOUNDARY_CHANGES[u] ?? 0) >= now - 1);
  return hit.length ? { units: hit, year: Math.max(...hit.map((u) => BOUNDARY_CHANGES[u])) } : null;
}
