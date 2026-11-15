/** Review-only hunt-level exception; never assign a multi-unit hunt count to individual units. */
import demand from '../../data/trophy-demand-review-2026.json';
export interface HuntDemandCandidate {
  state: string;
  species: string;
  code: string;
  year: number | null;
  applications: number | null;
  units: string[];
  /** A validated join must establish absence; an unresolved crosswalk is unknown. */
  sourceCoverage: 'absent' | 'present' | 'unknown';
}
export function unlistedExceptionalHunt(h: HuntDemandCandidate): boolean {
  if (h.sourceCoverage !== 'absent' || !h.units.length || !Number.isInteger(h.applications) || h.applications === null || h.applications < 0) return false;
  const a = [...new Set(h.units)].sort().join('\u0000');
  return demand.candidates.some(r => r.state === h.state && r.species === h.species && r.code === h.code &&
    r.year === h.year && r.apps === h.applications && [...new Set(r.units)].sort().join('\u0000') === a);
}
