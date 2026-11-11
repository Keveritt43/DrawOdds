// Build data/mt/units.json — Montana hunting district boundaries — from FWP's ArcGIS server.
//
//   NODE_PATH=/opt/npm-tools/node_modules /opt/npm-tools/node_modules/.bin/tsx scripts/mt_build_districts.ts
//
// Needs network access to fwp-gis.mt.gov. The egress allowlist is read when the container starts, so a
// session that began before the host was allowed still gets a 403 at the gateway — run this from a session
// started afterwards.
//
// Output matches Wyoming's data/wy/units.json shape so the shared map and unit pages can read it the same
// way: { units: [{ name, species, bbox, acres, geometry }] }. Public-land shares are NOT set here; they
// need an ownership overlay, which is its own job (see docs/states/mt-onboarding.md).
//
// Two layers, because Montana's species do not share boundaries:
//   11  Deer Elk Lion Hunting Districts  → species "deer-elk"   (deer and elk DO share districts)
//    3  Antelope Hunting Districts       → species "antelope"
// Verified 2026-11-10: maxRecordCount 2000 (so ~170 and ~65 features come back in one page, but the code
// pages anyway), supportsPagination true, geoJSON supported, source SR 3857 — we request outSR 4326
// because MapLibre and the existing unit records use lon/lat.

import { writeFileSync } from 'node:fs';

const BASE = 'https://fwp-gis.mt.gov/arcgis/rest/services/admbnd/huntingDistricts/MapServer';
const LAYERS = [
  { id: 11, species: 'deer-elk', label: 'Deer Elk Lion Hunting Districts' },
  { id: 3, species: 'antelope', label: 'Antelope Hunting Districts' },
];
const PAGE = 1000;

type Ring = number[][];
interface Feature { type: string; properties: Record<string, unknown>; geometry: { type: string; coordinates: Ring[] | Ring[][] } | null }

async function getJson(url: string): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { accept: 'application/json' } });
  } catch (err) {
    // The egress allowlist is read when the container starts, so a session begun before fwp-gis.mt.gov was
    // allowed fails here however the setting now reads. Say so rather than leaving a bare "fetch failed".
    throw new Error(`cannot reach fwp-gis.mt.gov (${err instanceof Error ? err.message : String(err)}). `
      + 'Allow that host under Settings > Capabilities, then run this from a NEW session — the allowlist is '
      + 'applied at container start, so an existing session keeps getting a 403 at the gateway.');
  }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  const body = await res.json();
  // ArcGIS reports failures with HTTP 200 and an { error } body.
  if (body && typeof body === 'object' && 'error' in body) {
    throw new Error(`ArcGIS error for ${url}: ${JSON.stringify((body as { error: unknown }).error)}`);
  }
  return body as Record<string, unknown>;
}

/** Field names drift between layers, so take them from the layer rather than assuming layer 11's. */
async function fieldsOf(id: number): Promise<Set<string>> {
  const meta = await getJson(`${BASE}/${id}?f=json`);
  const fields = (meta.fields as { name: string }[] | undefined) ?? [];
  return new Set(fields.map((f) => f.name));
}

const pick = (have: Set<string>, ...names: string[]) => names.find((n) => have.has(n));

async function fetchLayer(id: number, species: string, label: string) {
  const have = await fieldsOf(id);
  const districtField = pick(have, 'DISTRICT', 'HUNT_DIST', 'HD');
  if (!districtField) throw new Error(`layer ${id} (${label}): no district field in ${[...have].join(', ')}`);
  const acresField = pick(have, 'AREA_AC', 'ACRES');
  const regionField = pick(have, 'REG', 'REGION');
  const yearField = pick(have, 'REGYEAR');
  const outFields = [districtField, acresField, regionField, yearField].filter(Boolean).join(',');

  const units: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const url = `${BASE}/${id}/query?where=1%3D1&outFields=${encodeURIComponent(outFields)}`
      + `&returnGeometry=true&outSR=4326&f=geojson&resultOffset=${offset}&resultRecordCount=${PAGE}`;
    const page = await getJson(url) as unknown as { features?: Feature[]; exceededTransferLimit?: boolean };
    const feats = page.features ?? [];
    for (const f of feats) {
      const name = String(f.properties[districtField] ?? '').trim();
      if (!name) throw new Error(`layer ${id}: a feature has no ${districtField}`);
      if (!f.geometry) throw new Error(`layer ${id}: district ${name} has no geometry`);
      units.push({
        name,
        species,
        region: regionField ? String(f.properties[regionField] ?? '').trim() || null : null,
        regYear: yearField ? String(f.properties[yearField] ?? '').trim() || null : null,
        acres: acresField && f.properties[acresField] != null ? Number(f.properties[acresField]) : null,
        bbox: bboxOf(f.geometry),
        geometry: f.geometry,
      });
    }
    if (feats.length < PAGE && !page.exceededTransferLimit) break;
    if (offset > 20000) throw new Error(`layer ${id}: pagination did not terminate`);
  }

  // A duplicate district name would silently merge two polygons downstream.
  const seen = new Set<string>();
  for (const u of units) {
    const key = String(u.name);
    if (seen.has(key)) throw new Error(`layer ${id}: district ${key} appears twice`);
    seen.add(key);
  }
  if (!units.length) throw new Error(`layer ${id} (${label}): no features returned`);
  return units;
}

function bboxOf(geom: { type: string; coordinates: unknown }): [number, number, number, number] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const walk = (node: unknown): void => {
    if (Array.isArray(node) && typeof node[0] === 'number' && typeof node[1] === 'number') {
      const [x, y] = node as number[];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      return;
    }
    if (Array.isArray(node)) node.forEach(walk);
  };
  walk(geom.coordinates);
  if (!Number.isFinite(minX)) throw new Error('geometry has no coordinates');
  const round = (v: number) => Math.round(v * 1e5) / 1e5;
  return [round(minX), round(minY), round(maxX), round(maxY)];
}

async function main(): Promise<void> {
  const all: Record<string, unknown>[] = [];
  for (const { id, species, label } of LAYERS) {
    const units = await fetchLayer(id, species, label);
    console.error(`layer ${id} ${label}: ${units.length} districts`);
    all.push(...units);
  }

  // Montana lies roughly between -116.1..-104.0 and 44.3..49.0; a district outside that means a projection
  // or outSR mistake, which would put the whole map in the wrong place.
  for (const u of all) {
    const [w, s, e, n] = u.bbox as number[];
    if (w < -117 || e > -103.5 || s < 44 || n > 49.5) {
      throw new Error(`district ${u.species} ${u.name} has an out-of-state bbox ${JSON.stringify(u.bbox)} — check outSR`);
    }
  }

  writeFileSync('data/mt/units.json', `${JSON.stringify({
    source: {
      agency: 'Montana Fish, Wildlife & Parks',
      service: BASE,
      layers: LAYERS.map((l) => `${l.id}: ${l.label}`),
      note: 'Current-season boundaries. Deer and elk share districts; antelope does not. Public-land shares are not set here. Historical boundaries live in the "All Past Years" layers — see docs/states/mt-onboarding.md §4.',
      retrieved: new Date().toISOString().slice(0, 10),
    },
    units: all,
  })}\n`);
  console.error(`wrote data/mt/units.json: ${all.length} districts`);
}

main().catch((err) => { console.error(String(err instanceof Error ? err.message : err)); process.exit(1); });
