import { idTerrainUnit } from '@/lib/idTerrain';

const squareMiles = (acres: number) => acres > 0 && acres < 64 ? '<0.1' : (Math.round(acres / 64) / 10).toLocaleString();

/** Unit context, not hunt-boundary acreage or a promise of legal access. */
export function IdahoTerrainNote({ units }: { units: string[] }) {
  const values = units.map(u => ({ unit: u, data: idTerrainUnit(u) })).filter(x => x.data);
  if (!values.length) return <p className="small muted">Remote public land: not measured for these units.</p>;
  return <details className="small muted" style={{ marginTop: 8 }}><summary>Remote public land · unit context</summary>
    {values.map(({unit, data}) => <p key={unit}>Unit {unit}: about {squareMiles(data!.remoteAcres)} sq mi more than 1 mile from mapped roads and motorized trails; {squareMiles(data!.remoteHighAcres)} sq mi also above 9,000 ft.</p>)}
    <p>Screening estimate, downloaded November 2026, from IDFG boundaries, BLM surface management, USGS elevation and mapped roads, and Forest Service and BLM routes. Route coverage is incomplete; some mapped roads are closed or private. This is not a measure of hunter pressure, legal access, or the acres inside a partial-unit hunt. Check current maps and regulations.</p>
  </details>;
}
