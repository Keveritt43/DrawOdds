'use client';

import { METRIC_FIELDS, classesFor, type Classes } from './mapMetrics';

type Feature = { type: 'Feature'; geometry: { type: string; coordinates: unknown }; properties: Record<string, unknown> & { name: string } };
export interface UnitData {
  fc: { type: 'FeatureCollection'; features: Feature[] };
  classes: Record<string, Classes>;
  missing: Record<string, number>;
  /** one label point per unit (the middle of its largest piece), so a unit's number shows once */
  labels: { type: 'FeatureCollection'; features: { type: 'Feature'; geometry: { type: 'Point'; coordinates: [number, number] }; properties: { name: string } }[] };
}

type Ring = [number, number][];
/** Area-weighted centroid of a ring (shoelace), with its absolute area. */
function ringCentroid(r: Ring): { c: [number, number]; a: number } {
  let a = 0, x = 0, y = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const f = r[j][0] * r[i][1] - r[i][0] * r[j][1];
    a += f; x += (r[j][0] + r[i][0]) * f; y += (r[j][1] + r[i][1]) * f;
  }
  if (!a) return { c: r[0], a: 0 };
  return { c: [x / (3 * a), y / (3 * a)], a: Math.abs(a / 2) };
}
export function labelPoints(fc: UnitData['fc']): UnitData['labels'] {
  const features = fc.features.map((f) => {
    const polys = (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates) as Ring[][];
    const best = polys.map((p) => ringCentroid(p[0])).sort((a, b) => b.a - a.a)[0];
    return { type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: best?.c ?? [0, 0] }, properties: { name: f.properties.name } };
  });
  return { type: 'FeatureCollection', features };
}

const cached: Record<string, Promise<UnitData> | null> = {};

/**
 * Unit boundaries + the per-unit numbers every map shades by, fetched once per page.
 * (Versioned URL: an hour-cached response from before a deploy must not be reused.)
 */
export function loadUnits(state = 'ID', pointsKey = '', filters = ''): Promise<UnitData> {
  const cacheKey = state + pointsKey + filters;
  cached[cacheKey] ??= fetch(state === 'ID' ? '/api/units?v=11' : `/api/units?v=12&state=${state}&pointsKey=${encodeURIComponent(pointsKey)}&${filters}`)
    .then((r) => {
      if (!r.ok) throw new Error(`units ${r.status}`);
      return r.json();
    })
    .then((fc) => {
      const vals = (k: string) => fc.features.map((f: Feature) => f.properties[k]).filter((x: unknown): x is number => typeof x === 'number');
      // breaks normally come from the server; compute them here if they're missing
      const classes: Record<string, Classes> = { ...(fc.classes ?? {}) };
      const missing: Record<string, number> = {};
      for (const k of METRIC_FIELDS) {
        if (!classes[k]?.idx) classes[k] = classesFor(k, vals(k));
        missing[k] = fc.features.length - vals(k).length;
      }
      return { fc, classes, missing, labels: labelPoints(fc) };
    })
    .catch((e) => {
      cached[cacheKey] = null; // let the next map retry
      throw e;
    });
  return cached[cacheKey]!;
}
