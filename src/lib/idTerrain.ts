import terrain from '../../data/id-terrain.json';

export type IdahoTerrain = { publicAcres: number; remoteAcres: number; highAcres: number; remoteHighAcres: number };
const units = terrain.units as Record<string, IdahoTerrain>;
/** Unit-level screening context, never an assertion that a partial hunt area contains these acres. */
export const idTerrainUnit = (unit: string): IdahoTerrain | null => units[unit] ?? null;
export const idTerrainBest = (unitNames: string[], high: boolean): number | null => {
  const values = unitNames.map(idTerrainUnit).filter((x): x is IdahoTerrain => x !== null).map(x => high ? x.remoteHighAcres : x.remoteAcres);
  return values.length ? Math.max(...values) : null;
};
/** Non-Idaho hunts are unaffected by Idaho-only settings. Unknown and private-only hunts cannot pass. */
export function matchesIdTerrain(hunt: { state: string; species: string; units: string[]; privateOnly?: boolean | null }, min: string, high: string): boolean {
  if (hunt.state !== 'ID' || (!min && high !== '1')) return true;
  if (!['DEER', 'ELK'].includes(hunt.species) || hunt.privateOnly) return false;
  const acres = idTerrainBest(hunt.units, high === '1');
  const requested = Number(min);
  const threshold = Number.isFinite(requested) && requested > 0 ? requested : 1;
  return acres !== null && acres >= threshold;
}
