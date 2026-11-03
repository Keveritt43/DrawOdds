'use client';

import { classBreaks } from './breaks';
import { METRIC_FIELDS, type Classes } from './mapMetrics';

type Feature = { type: 'Feature'; geometry: { type: string; coordinates: unknown }; properties: Record<string, unknown> & { name: string } };
export interface UnitData {
  fc: { type: 'FeatureCollection'; features: Feature[] };
  classes: Record<string, Classes>;
  missing: Record<string, number>;
}

let cached: Promise<UnitData> | null = null;

/**
 * Unit boundaries + the per-unit numbers every map shades by, fetched once per page.
 * (Versioned URL: an hour-cached response from before a deploy must not be reused.)
 */
export function loadUnits(): Promise<UnitData> {
  cached ??= fetch('/api/units?v=4')
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
        if (!classes[k]) classes[k] = classBreaks(vals(k));
        missing[k] = fc.features.length - vals(k).length;
      }
      return { fc, classes, missing };
    })
    .catch((e) => {
      cached = null; // let the next map retry
      throw e;
    });
  return cached;
}
