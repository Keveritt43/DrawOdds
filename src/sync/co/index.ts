/**
 * Colorado sync steps (state "CO"). Each writes only Colorado rows.
 *   co-gmu      CPW game management unit boundaries -> Unit
 *   co-draw     CPW Draw Recap PDFs (src/sync/co/manifest.ts) -> DrawRecap, one row per hunt code and year
 *   co-summary  DrawRecap -> Hunt + HuntSummary rows with point odds (src/lib/coOdds.ts)
 */
import type { Prisma, Species } from '@prisma/client';
import { db, type StepOptions, type StepResult } from '../core/context';
import { get, getBytes, getJson } from '../core/http';
import { pdfItems } from '../core/pdf';
import { syntheticId } from '../steps/hunts';
import { parseRecap, type RecapHunt, type Pool } from './recap';
import { DRAW_RECAPS, originalPdfUrl, CO_GMU_LAYER } from './manifest';
import { effective, hybridRate, project, trendNext, calibrate, DEFAULT_CALIBRATION, type PoolYear, type Calibration, type CutoffInfo } from '../../lib/coOdds';
import { decodeCode, huntTitle, seasonLabel, isPrivateOnly, oddsTable, CO_POOLS, type CoPool, type PointOdds, type PoolOdds } from '../../lib/coHunt';

const STATE = 'CO';

// ------------------------------------------------------------------ units

type Ring = number[][];
type Geom = { type: 'Polygon'; coordinates: Ring[] } | { type: 'MultiPolygon'; coordinates: Ring[][] };
function bboxOf(g: Geom): [number, number, number, number] {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  const rings = g.type === 'Polygon' ? g.coordinates : g.coordinates.flat();
  for (const r of rings) for (const [x, y] of r) {
    b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y);
  }
  return b.map((v) => Math.round(v * 1e5) / 1e5) as [number, number, number, number];
}

export async function syncCoGmus(opts: StepOptions): Promise<StepResult> {
  if (!opts.full && (await db.unit.count({ where: { state: STATE } })) >= 150) return { rows: 0 };
  const q = new URLSearchParams({ where: '1=1', outFields: 'GMUID,DEERDAU,ELKDAU,AcresGISCa', outSR: '4326', maxAllowableOffset: '0.001', geometryPrecision: '5', f: 'geojson' });
  const fc = await getJson<{ features: { properties: Record<string, string | number | null>; geometry: Geom | null }[] }>(`${CO_GMU_LAYER}?${q}`);
  const details: string[] = [];
  if (fc.features.length < 150) details.push(`Only ${fc.features.length} GMUs returned`);
  let rows = 0;
  for (const f of fc.features) {
    const name = String(f.properties.GMUID ?? '').trim();
    if (!name || !f.geometry) continue;
    const data = {
      acres: f.properties.AcresGISCa ? Math.round(Number(f.properties.AcresGISCa)) : null,
      geometry: f.geometry as object,
      bbox: bboxOf(f.geometry),
      herds: { DEER: f.properties.DEERDAU ?? null, ELK: f.properties.ELKDAU ?? null },
    };
    await db.unit.upsert({ where: { state_name: { state: STATE, name } }, create: { state: STATE, name, ...data }, update: data });
    rows++;
  }
  return { rows, details };
}

// ------------------------------------------------------------------ draw reports

const recapId = (species: string, year: number, code: string) => `${STATE}|${species}|${year}|${code}`;

export async function syncCoDraw(opts: StepOptions): Promise<StepResult> {
  const details: string[] = [];
  let rows = 0;
  for (const r of DRAW_RECAPS) {
    const have = await db.drawRecap.count({ where: { state: STATE, species: r.species, year: r.year } });
    if (have && !opts.full) continue;
    const pdfUrl = originalPdfUrl(await get(r.url));
    if (!pdfUrl) { details.push(`${r.species} ${r.year}: no PDF link on ${r.url}`); continue; }
    const bytes = await getBytes(pdfUrl);
    if (!bytes) { details.push(`${r.species} ${r.year}: PDF not found`); continue; }
    const parsed = parseRecap(await pdfItems(bytes));
    if (parsed.year !== r.year || parsed.species !== r.species) {
      details.push(`${r.url}: the report says ${parsed.species} ${parsed.year}, expected ${r.species} ${r.year}; skipped`);
      continue;
    }
    const bad = parsed.hunts.filter((h) => h.problems.length);
    if (bad.length) details.push(`${r.species} ${r.year}: ${bad.length} of ${parsed.hunts.length} hunt codes failed the row-total check: ${bad.slice(0, 5).map((h) => `${h.code} (${h.problems[0]})`).join('; ')}`);
    const data = parsed.hunts.filter((h) => !h.problems.length).map((h) => recapRow(h, r.species));
    await db.$transaction([
      db.drawRecap.deleteMany({ where: { state: STATE, species: r.species, year: r.year } }),
      db.drawRecap.createMany({ data }),
    ]);
    rows += data.length;
    console.log(`[co-draw] ${r.species} ${r.year}: ${data.length} hunt codes`);
  }
  return { rows, details };
}

function recapRow(h: RecapHunt, species: Species): Prisma.DrawRecapCreateManyInput {
  return {
    id: recapId(species, h.year, h.code), state: STATE, species, year: h.year, code: h.code, list: h.list,
    quota: h.quota, generalQuota: h.generalQuota, lppUnres: h.lppUnres, lppRes: h.lppRes,
    youthPrefPct: h.youthPrefPct, youthPref: h.youthPref, nrCapPct: h.nrCapPct, nrCap: h.nrCap, hybridPct: h.hybridPct, hybridCap: h.hybridCap,
    apps: h.apps.map((a) => a[0]), lppApps: h.apps.map((a) => a[1]), drawnTotal: h.drawnTotal, balance: h.balance,
    drawn: h.drawn, cutoff: h.cutoff as object, pre: h.pre, post: h.post, preTotals: h.preTotals, postTotals: h.postTotals,
  };
}

// ------------------------------------------------------------------ summaries

type RecapRow = Awaited<ReturnType<typeof db.drawRecap.findMany>>[number];
const poolYear = (r: RecapRow, pool: Pool): PoolYear => ({
  year: r.year,
  pre: ((r.pre as unknown as Record<string, Record<string, number>>)[pool] ?? {}) as Record<number, number>,
  post: ((r.post as unknown as Record<string, Record<string, number>>)[pool] ?? {}) as Record<number, number>,
  cut: ((r.cutoff as unknown as Record<string, CutoffInfo>)[pool] ?? null),
});

/** How far cutoffs moved from one draw to the next, across every hunt code (adult pools). */
function measureCalibration(byCode: Map<string, RecapRow[]>, pool: 'res' | 'nr'): Calibration {
  const pairs: { last: number; next: number }[] = [];
  for (const rows of byCode.values()) {
    for (let i = 1; i < rows.length; i++) {
      if (rows[i].year !== rows[i - 1].year + 1) continue;
      const last = effective(poolYear(rows[i - 1], pool));
      const next = effective(poolYear(rows[i], pool));
      if (last !== null && next !== null) pairs.push({ last, next });
    }
  }
  // too few pairs for a band (elk's first year, say): fall back to the deer measurement
  const c = calibrate(pairs);
  const d = DEFAULT_CALIBRATION[pool];
  return { ...c, q: c.q.map((q, i) => (c.n[i] >= 50 ? q : d.q[i])) };
}

export async function buildCoSummaries(): Promise<StepResult> {
  const details: string[] = [];
  const all = await db.drawRecap.findMany({ where: { state: STATE }, orderBy: [{ code: 'asc' }, { year: 'asc' }] });
  if (!all.length) return { rows: 0, status: 'CHECK', details: ['No Colorado draw reports loaded yet (run co-draw)'] };
  const out: Prisma.HuntSummaryCreateManyInput[] = [];
  const hunts: Prisma.HuntCreateInput[] = [];

  for (const species of ['DEER', 'ELK'] as const) {
    const rows = all.filter((r) => r.species === species);
    if (!rows.length) continue;
    const latest = Math.max(...rows.map((r) => r.year));
    const byCode = new Map<string, RecapRow[]>();
    for (const r of rows) (byCode.get(r.code) ?? byCode.set(r.code, []).get(r.code)!).push(r);
    const cal = { res: measureCalibration(byCode, 'res'), nr: measureCalibration(byCode, 'nr') };
    details.push(`${species} calibration (pairs per band) res ${cal.res.n.join('/')} · nr ${cal.nr.n.join('/')}`);

    for (const [code, hist] of byCode) {
      const last = hist[hist.length - 1];
      const d = decodeCode(code);
      if (last.year !== latest || !d || d.sex === 'P') continue; // not offered in the latest draw, or the point-only code
      const pools: Partial<Record<CoPool, PoolOdds>> = {};
      for (const pool of CO_POOLS) {
        const ys = hist.map((h) => poolYear(h, pool));
        const ly = ys[ys.length - 1];
        const levels = Object.keys(ly.pre).map(Number).sort((a, b) => a - b).map((p) => [p, ly.pre[p] ?? 0, ly.post[p] ?? 0] as [number, number, number]);
        const eff = effective(ly);
        if (!levels.length && eff === null) continue;
        const adult = pool === 'nr' || pool === 'ynr' ? cal.nr : cal.res;
        const c = ly.cut;
        pools[pool] = {
          levels,
          cut: c ? { text: c.text, points: c.points, pct: c.points !== null && c.appsAtLevel ? (c.drawnAtLevel ?? 0) / c.appsAtLevel : null } : null,
          eff,
          proj: project(ys, adult),
          hybrid: Math.round(hybridRate(ly) * 1000) / 1000,
          history: ys.map((y) => ({ year: y.year, eff: effective(y), text: y.cut?.text ?? null })),
        };
      }
      const po: PointOdds = {
        year: latest, projYear: latest + 1, pools,
        history: hist.map((h) => ({ year: h.year, quota: h.quota, nrCapPct: h.nrCapPct, hybridCap: h.hybridCap, apps1: h.apps[0] ?? null })),
        nrCapPct: last.nrCapPct, nrCap: last.nrCap, hybridCap: last.hybridCap, list: last.list, apps: last.apps,
      };
      const res = pools.res, nr = pools.nr;
      const ptsOf = (p?: PoolOdds) => (p?.eff === null || p?.eff === undefined ? null : Math.floor(p.eff + 1e-9));
      const pctOf = (p?: PoolOdds) => (p?.eff === null || p?.eff === undefined ? null : Math.round((1 - (p.eff - Math.floor(p.eff + 1e-9))) * 100) / 100);
      const creep = (p?: PoolOdds) => trendNext((p?.history ?? []).filter((h) => h.eff !== null) as { year: number; eff: number }[])?.slope ?? null;
      const cuts = [res?.cut, nr?.cut].filter(Boolean) as { text: string }[];
      const idfgId = syntheticId(`${STATE}|${code}`);
      const name = huntTitle(code);
      const weapon = d.method === 'A' ? 'ARCHERY' : d.method === 'M' ? 'MUZZLELOADER' : d.method === 'R' ? 'ANY' : 'OTHER';
      const antlerClass = d.sex === 'M' ? 'ANTLERED' : d.sex === 'F' ? 'ANTLERLESS' : 'EITHER';
      hunts.push({
        idfgId, state: STATE, year: latest + 1, species, type: 'CONTROLLED', code, source: 'co-draw', name, takeMethod: seasonLabel(code),
        weapon, antlerClass, sexText: antlerClass === 'ANTLERED' ? 'Antlered' : antlerClass === 'ANTLERLESS' ? 'Antlerless' : 'Either sex',
        tags: last.quota, units: [d.unit], youthOnly: d.type === 'K',
      });
      out.push({
        id: `${STATE}:${code}`, state: STATE, slug: `co-${code.toLowerCase()}`, huntId: idfgId, species, type: 'CONTROLLED', name,
        unit: d.unit, units: [d.unit], weapon, takeMethod: seasonLabel(code), antlerClass, months: [], seasonDays: [],
        tags: last.quota, youthOnly: d.type === 'K', tagCode: code,
        oddsYears: hist.length, oddsLastYear: latest, permitsLast: last.quota, appsLast: last.apps[0] ?? null,
        permitsPrev: hist.length > 1 && hist[hist.length - 2].year === latest - 1 ? hist[hist.length - 2].quota : null,
        ptsRes: ptsOf(res), ptsNr: ptsOf(nr), ptsResPct: pctOf(res), ptsNrPct: pctOf(nr), effRes: res?.eff ?? null, effNr: nr?.eff ?? null,
        projRes: res?.proj?.eff ?? null, projNr: nr?.proj?.eff ?? null, creepRes: creep(res), creepNr: creep(nr),
        secondChoice: cuts.some((c) => /choice [2-4]|leftover/i.test(c.text)),
        hybrid: (res?.hybrid ?? 0) > 0 || (nr?.hybrid ?? 0) > 0,
        privateOnly: isPrivateOnly(code),
        pointOdds: po as object,
        oddsByPts: oddsTable(po) as object,
      });
    }
  }

  // synthetic ids must not land on an Idaho hunt (FNV hash: unlikely, but checked)
  const clash = await db.hunt.findMany({ where: { idfgId: { in: hunts.map((h) => h.idfgId) }, state: { not: STATE } }, select: { idfgId: true } });
  if (clash.length) return { rows: 0, status: 'ERROR', details: [`Hunt id collision with another state: ${clash.map((c) => c.idfgId).join(', ')}`] };

  await db.$transaction(
    async (tx) => {
      for (const h of hunts) await tx.hunt.upsert({ where: { idfgId: h.idfgId }, create: h, update: h });
      await tx.hunt.deleteMany({ where: { state: STATE, idfgId: { notIn: hunts.map((h) => h.idfgId) }, saved: { none: {} } } });
      await tx.huntSummary.deleteMany({ where: { state: STATE } });
      await tx.huntSummary.createMany({ data: out });
    },
    { timeout: 180_000 },
  );
  return { rows: out.length, details };
}
