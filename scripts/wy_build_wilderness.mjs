#!/usr/bin/env node
/**
 * Build data/wy/wilderness.json: how much of each Wyoming hunt area is federally designated wilderness.
 *
 * Why: W.S. 23-2-401(a) bars nonresidents from hunting big or trophy game on any federally designated
 * wilderness area in Wyoming unless a licensed professional guide or a resident guide goes with them
 * (at least one guide per two nonresident hunters). The unit and hunt pages warn nonresidents where it applies.
 *
 * Usage: node scripts/wy_build_wilderness.mjs <units.geojson|data/wy/units.json> <wilderness.geojson> [out]
 *   wilderness.geojson: Wilderness Connect "Wilderness Areas in the United States" (services1.arcgis.com/
 *   ERdCHt0sNM6dENSD/.../Wilderness_Areas_in_the_United_States/FeatureServer/0), STATE LIKE '%WY%', outSR=4326.
 *
 * Method: both layers are projected to EPSG:5070 (NAD83 Conus Albers, equal area) and integrated on horizontal
 * scanlines DY metres apart: on each line, the inside-intervals of the hunt area are intersected with the union of
 * the wilderness intervals. No polygon library is needed and the result does not depend on raster cell alignment.
 * Checks (the build stops if any fails): every Wyoming-only wilderness integrates to within 1.5% of its published
 * acreage; every hunt area integrates to within 2% (3.5% under 200 mi², the same tolerance as
 * wy_build_areas.py) of the acreage stored in data/wy/units.json, whose map geometry is generalized.
 */

export const DY = 30; // metres between scanlines
/**
 * Overlaps smaller than this (per wilderness) are boundary slivers, not wilderness inside the hunt area: the map
 * geometry of hunt areas is generalized, and many WGFD boundaries follow a wilderness boundary, so a shared edge
 * shows up as a thin strip. In the Nov 2026 build every sliver was <= 526 acres and every real overlap >= 3,961.
 */
export const SLIVER_ACRES = 1000;

// ---- EPSG:5070 (Snyder, ellipsoidal Albers; GRS80) ----
const A = 6378137, F = 1 / 298.257222101, E2 = 2 * F - F * F, E = Math.sqrt(E2);
const RAD = Math.PI / 180;
const q = (s) => (1 - E2) * (s / (1 - E2 * s * s) - (1 / (2 * E)) * Math.log((1 - E * s) / (1 + E * s)));
const m = (p) => Math.cos(p) / Math.sqrt(1 - E2 * Math.sin(p) ** 2);
const [P1, P2, P0, L0] = [29.5 * RAD, 45.5 * RAD, 23 * RAD, -96 * RAD];
const N = (m(P1) ** 2 - m(P2) ** 2) / (q(Math.sin(P2)) - q(Math.sin(P1)));
const C = m(P1) ** 2 + N * q(Math.sin(P1));
const R0 = (A * Math.sqrt(C - N * q(Math.sin(P0)))) / N;
export function albers(lon, lat) {
  const r = (A * Math.sqrt(C - N * q(Math.sin(lat * RAD)))) / N;
  const t = N * (lon * RAD - L0);
  return [r * Math.sin(t), R0 - r * Math.cos(t)];
}

const ringsOf = (g) => (!g ? [] : g.type === 'Polygon' ? g.coordinates : g.type === 'MultiPolygon' ? g.coordinates.flat() : []);

/** Even-odd crossings of every scanline (row index -> sorted x list) for one (multi)polygon. */
function crossings(geom) {
  const rows = new Map();
  for (const ring of ringsOf(geom)) {
    const pts = ring.map(([x, y]) => albers(x, y));
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
      if (y1 === y2) continue;
      const lo = Math.min(y1, y2), hi = Math.max(y1, y2);
      for (let r = Math.ceil(lo / DY - 0.5); (r + 0.5) * DY < hi; r++) {
        const yc = (r + 0.5) * DY;
        if (yc < lo) continue;
        const x = x1 + ((yc - y1) * (x2 - x1)) / (y2 - y1);
        (rows.get(r) ?? rows.set(r, []).get(r)).push(x);
      }
    }
  }
  const out = new Map();
  for (const [r, xs] of rows) {
    xs.sort((a, b) => a - b);
    const iv = [];
    for (let i = 0; i + 1 < xs.length; i += 2) if (xs[i + 1] > xs[i]) iv.push([xs[i], xs[i + 1]]);
    if (iv.length) out.set(r, iv);
  }
  return out;
}

const len = (iv) => iv.reduce((s, [a, b]) => s + b - a, 0);
function union(lists) {
  const all = lists.flat().sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const [a, b] of all) {
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}
function intersect(p, q2) {
  const out = [];
  let i = 0, j = 0;
  while (i < p.length && j < q2.length) {
    const a = Math.max(p[i][0], q2[j][0]), b = Math.min(p[i][1], q2[j][1]);
    if (b > a) out.push([a, b]);
    if (p[i][1] < q2[j][1]) i++; else j++;
  }
  return out;
}

const ACRE = 4046.8564224;

/**
 * units: [{ name, geometry }] (EPSG:4326); wild: GeoJSON features with properties.NAME/STATE/Acreage.
 * Returns { areas: { [unit]: { acres, wildAcres, pct, wilderness: [{ name, acres }] } }, wilderness: [...] }.
 */
export function computeWilderness(units, wild) {
  const W = wild.map((f) => ({ name: f.properties.NAME, state: f.properties.STATE, published: f.properties.Acreage, rows: crossings(f.geometry) }));
  const wilderness = W.map((w) => {
    let a = 0;
    for (const iv of w.rows.values()) a += len(iv);
    return { name: w.name, state: w.state, publishedAcres: w.published, acres: Math.round((a * DY) / ACRE) };
  });
  const areas = {};
  for (const u of units) {
    if (!u.geometry) continue;
    const rows = crossings(u.geometry);
    let area = 0, inWild = 0;
    const per = new Map();
    for (const [r, iv] of rows) {
      area += len(iv);
      const hits = [];
      for (const w of W) {
        const wi = w.rows.get(r);
        if (!wi) continue;
        const x = intersect(iv, wi);
        if (!x.length) continue;
        hits.push(x);
        per.set(w.name, (per.get(w.name) ?? 0) + len(x));
      }
      if (hits.length) inWild += len(union(hits));
    }
    const acres = (area * DY) / ACRE, wildAcres = (inWild * DY) / ACRE;
    areas[u.name] = {
      acres: Math.round(acres),
      wildAcres: Math.round(wildAcres),
      pct: acres > 0 ? Math.round((1000 * wildAcres) / acres) / 10 : null,
      wilderness: [...per].map(([name, a]) => ({ name, acres: Math.round((a * DY) / ACRE) })).filter((x) => x.acres > 0).sort((a, b) => b.acres - a.acres),
    };
  }
  return { areas, wilderness };
}

export function check(result, storedAcres) {
  const errs = [];
  for (const w of result.wilderness) {
    if (w.state !== 'WY') continue; // MT/WY and CO/WY acreages include the other state
    const d = Math.abs(w.acres - w.publishedAcres) / w.publishedAcres;
    if (d > 0.015) errs.push(`${w.name}: ${w.acres} ac vs published ${w.publishedAcres} (${(d * 100).toFixed(1)}%)`);
  }
  for (const [name, a] of Object.entries(result.areas)) {
    const s = storedAcres[name];
    if (!s) continue;
    const d = Math.abs(a.acres - s) / s;
    if (d > (s < 128000 ? 0.035 : 0.02)) errs.push(`${name}: ${a.acres} ac vs stored ${s} (${(d * 100).toFixed(1)}%)`);
  }
  return errs;
}

/** The data/wy/wilderness.json document from a computeWilderness result. */
export function toOutput(res, retrieved) {
  const areas = {}, slivers = {};
  for (const [name, a] of Object.entries(res.areas).sort(([x], [y]) => x.localeCompare(y, 'en', { numeric: true }))) {
    const keep = a.wilderness.filter((w) => w.acres >= SLIVER_ACRES), drop = a.wilderness.filter((w) => w.acres < SLIVER_ACRES);
    if (drop.length) slivers[name] = drop;
    if (!keep.length) continue;
    const wild = keep.reduce((t, w) => t + w.acres, 0);
    areas[name] = { pct: Math.round((1000 * wild) / a.acres) / 10, wildAcres: wild, acres: a.acres, wilderness: keep };
  }
  return {
    source: 'Wilderness Connect (wilderness.net), Wilderness Areas in the United States, features with STATE containing WY',
    sourceUrl: 'https://services1.arcgis.com/ERdCHt0sNM6dENSD/arcgis/rest/services/Wilderness_Areas_in_the_United_States/FeatureServer/0',
    retrieved,
    method: `Hunt-area map boundaries (data/wy/units.json) and wilderness boundaries projected to EPSG:5070 and integrated on scanlines every ${DY} m; overlaps under ${SLIVER_ACRES} acres per wilderness are boundary slivers and are listed under slivers, not counted.`,
    rule: 'W.S. 23-2-401(a): a nonresident may not hunt big or trophy game on a federally designated wilderness area in Wyoming without a licensed professional guide or a resident guide; one guide per two nonresident hunters.',
    wilderness: res.wilderness,
    areas,
    slivers,
  };
}

// ---- CLI ----
const isMain = typeof process !== 'undefined' && process.argv?.[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop());
if (isMain) {
  const fs = await import('node:fs');
  const [unitsPath, wildPath, out = 'data/wy/wilderness.json'] = process.argv.slice(2);
  if (!unitsPath || !wildPath) {
    console.error('Usage: node scripts/wy_build_wilderness.mjs <units> <wilderness.geojson> [out]');
    process.exit(2);
  }
  const u = JSON.parse(fs.readFileSync(unitsPath, 'utf8'));
  const units = u.units ?? u.features.map((f) => ({ name: String(f.properties.name).replace(/^WY:/, ''), geometry: f.geometry }));
  const wild = JSON.parse(fs.readFileSync(wildPath, 'utf8')).features;
  const stored = Object.fromEntries((JSON.parse(fs.readFileSync('data/wy/units.json', 'utf8')).units).map((x) => [x.name, x.acres]));
  const res = computeWilderness(units.filter((x) => !x.name.includes('R-')), wild);
  const errs = check(res, stored);
  if (errs.length) {
    console.error('Checks failed:\n' + errs.join('\n'));
    process.exit(1);
  }
  const doc = toOutput(res, new Date().toISOString().slice(0, 10));
  fs.writeFileSync(out, JSON.stringify(doc, null, 1) + '\n');
  console.log(`${Object.keys(doc.areas).length} of ${units.length} hunt areas contain designated wilderness -> ${out}`);
}
