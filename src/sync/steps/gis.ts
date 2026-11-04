import { area, bbox as turfBbox, featureCollection, intersect, union } from '@turf/turf';
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { db, GMU_LAYER, HUNTING_MAPSERVER, type StepResult } from '../core/context';
import { getJson } from '../core/http';
import { normArea } from '../core/parse';
import { BOUNDARY_CHANGED_2022 } from '../core/math';

type Poly = Feature<Polygon | MultiPolygon, Record<string, unknown>>;
type BBox = [number, number, number, number];
const ACRES_PER_M2 = 1 / 4046.8564224;
// ~50 m in degrees: plenty for unit-scale maps, keeps the payload small
const SIMPLIFY = '0.0005';

/** Pages through an ArcGIS query endpoint as GeoJSON in WGS84. */
async function queryAll(url: string, where = '1=1', outFields = '*', pageSize = 500): Promise<Poly[]> {
  const out: Poly[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const q = new URLSearchParams({
      where,
      outFields,
      outSR: '4326',
      f: 'geojson',
      returnGeometry: 'true',
      maxAllowableOffset: SIMPLIFY,
      geometryPrecision: '5',
      resultOffset: String(offset),
      resultRecordCount: String(pageSize),
    });
    const fc = await getJson<FeatureCollection & { exceededTransferLimit?: boolean; properties?: { exceededTransferLimit?: boolean } }>(
      `${url}?${q}`,
    );
    const feats = (fc.features ?? []).filter((f) => f.geometry && /Polygon/.test(f.geometry.type)) as Poly[];
    out.push(...feats);
    const more = fc.exceededTransferLimit || fc.properties?.exceededTransferLimit;
    if (!more || feats.length === 0) break;
  }
  return out;
}

const bboxOf = (f: Poly) => turfBbox(f) as BBox;
const overlaps = (a: BBox, b: BBox) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
const acres = (f: Poly) => area(f) * ACRES_PER_M2;

function intersectAcres(a: Poly, b: Poly): number {
  try {
    const i = intersect(featureCollection([a, b]));
    return i ? acres(i as Poly) : 0;
  } catch {
    return 0; // invalid ring in source data - treat as no overlap rather than failing the run
  }
}

function merge(feats: Poly[]): Poly {
  if (feats.length === 1) return feats[0];
  try {
    return (union(featureCollection(feats)) as Poly) ?? feats[0];
  } catch {
    return feats[0];
  }
}

export async function syncGis(): Promise<StepResult> {
  const details: string[] = [];

  // ---- units
  // NOTE: the GIS layer's ID field is NOT the Hunt Planner unit ID (e.g. unit 16 = 20 here, 21 there); land.ts sets idfgId
  const unitFeats = await queryAll(GMU_LAYER, '1=1', 'NAME,Elk_Zone');
  if (unitFeats.length < 90) return { rows: 0, status: 'ERROR', details: [`Only ${unitFeats.length} units returned - expected ~99`] };
  const units = unitFeats.map((f) => ({
    name: normArea(f.properties.NAME),
    elkZone: (f.properties.Elk_Zone as string) || null,
    f,
    bbox: bboxOf(f),
  }));

  // ---- Access Yes! properties
  let ay: { id: number; name: string; f: Poly; bbox: BBox; acres: number; active: boolean }[] = [];
  try {
    const feats = await queryAll(`${HUNTING_MAPSERVER}/13/query`, '1=1', 'ID,NAME,ACTIVE');
    const byId = new Map<number, Poly[]>();
    feats.forEach((f, i) => {
      const id = Number(f.properties.ID ?? f.properties.OBJECTID ?? -(i + 1));
      (byId.get(id) ?? byId.set(id, []).get(id)!).push(f);
    });
    ay = [...byId.entries()].map(([id, fs]) => {
      const f = merge(fs);
      return {
        id,
        name: String(fs[0].properties.NAME ?? `Property ${id}`),
        f,
        bbox: bboxOf(f),
        acres: acres(f),
        active: String(fs[0].properties.ACTIVE ?? 'Y').toUpperCase() !== 'N',
      };
    });
  } catch (e) {
    details.push(`Access Yes! layer failed: ${(e as Error).message} - acres left unchanged`);
  }
  const activeAy = ay.filter((p) => p.active);

  const ayIn = (f: Poly, box: BBox) => {
    let total = 0;
    let count = 0;
    for (const p of activeAy) {
      if (!overlaps(box, p.bbox)) continue;
      const a = intersectAcres(f, p.f);
      if (a > Math.max(1, p.acres * 0.01)) {
        total += a;
        count++;
      }
    }
    return { acres: Math.round(total), count };
  };

  for (const u of units) {
    const a = ay.length ? ayIn(u.f, u.bbox) : null;
    const data = {
      elkZone: u.elkZone,
      acres: Math.round(acres(u.f)),
      geometry: u.f.geometry as object,
      bbox: u.bbox,
      boundaryChanged2022: BOUNDARY_CHANGED_2022.has(u.name),
      ...(a ? { accessYesAcres: a.acres, accessYesCount: a.count } : {}),
    };
    await db.unit.upsert({ where: { state_name: { state: 'ID', name: u.name } }, create: { name: u.name, ...data }, update: data });
  }

  for (const p of ay) {
    const inUnits = units.filter((u) => overlaps(u.bbox, p.bbox) && intersectAcres(u.f, p.f) > p.acres * 0.05).map((u) => u.name);
    const data = { name: p.name, acres: Math.round(p.acres), active: p.active, geometry: p.f.geometry as object, units: inUnits };
    await db.accessYesProperty.upsert({ where: { id: p.id }, create: { id: p.id, ...data }, update: data });
  }

  // ---- controlled hunt areas (AreaID = the odds API's AreaID)
  let areaRows = 0;
  try {
    const feats = await queryAll(`${HUNTING_MAPSERVER}/4/query`, '1=1', 'AreaID,HuntArea,BigGame,Year,Area');
    const byArea = new Map<number, Poly[]>();
    for (const f of feats) {
      const id = Number(f.properties.AreaID);
      if (!id) continue;
      (byArea.get(id) ?? byArea.set(id, []).get(id)!).push(f);
    }
    for (const [areaId, fs] of byArea) {
      const newest = Math.max(...fs.map((f) => Number(f.properties.Year) || 0));
      const f = merge(fs.filter((x) => (Number(x.properties.Year) || 0) === newest));
      const box = bboxOf(f);
      const total = acres(f);
      const shares = units
        .filter((u) => overlaps(u.bbox, box))
        .map((u) => ({ unit: u.name, pct: total ? Math.round((intersectAcres(f, u.f) / total) * 1000) / 10 : 0 }))
        .filter((s) => s.pct >= 1)
        .sort((a, b) => b.pct - a.pct);
      const a = ay.length ? ayIn(f, box) : null;
      const data = {
        name: normArea(fs[0].properties.HuntArea),
        bigGame: (fs[0].properties.BigGame as string) || null,
        description: (fs[0].properties.Area as string)?.slice(0, 4000) || null,
        geometry: f.geometry as object,
        bbox: box,
        acres: Math.round(total),
        units: shares,
        ...(a ? { accessYesAcres: a.acres, accessYesCount: a.count } : {}),
      };
      await db.huntArea.upsert({ where: { areaId }, create: { areaId, ...data }, update: data });
      areaRows++;
    }
    if (areaRows < 100) details.push(`Only ${areaRows} controlled hunt areas - expected several hundred`);
  } catch (e) {
    details.push(`Controlled hunt area layer failed: ${(e as Error).message}`);
  }

  return { rows: units.length + ay.length + areaRows, details };
}
