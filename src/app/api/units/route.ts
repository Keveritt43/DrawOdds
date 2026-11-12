import { matchesCoMapFilters } from '@/lib/coMapFilters';
import { getCoScoringContext } from '@/lib/coScoringContext';
import { getPoints } from '@/lib/points';
import { tableOdds, poolFor, type OddsTable } from '@/lib/coHunt';
import { coLandUnit } from "@/lib/coLand";
import { withCoScores } from '@/lib/coScores';
import { db } from '@/lib/db';
import { stateConfig } from '@/lib/states';
import { classesFor, pointsClasses } from '@/lib/mapMetrics';
import { unitObjective, OBJ_NUM } from '@/lib/elkObjectives';
import { getPointsStore } from '@/lib/points';
import { readMtPoints } from '@/lib/mtPoints';
import { mtPersonal } from '@/lib/mtHunt';
import { mtBmaDistrict } from '@/lib/mtBma';

// rendered per request (the DB isn't reachable at build time on Railway); browsers cache it for 10 minutes (the map requests a versioned URL)
export const dynamic = 'force-dynamic';

const ALL = 'All Weapons Combined';
/** Under this many hunter-seasons in the window, a unit's success rate is noise (3 of 5 hunters = 60%). */
const MIN_HUNTERS = 50;

/** Fields the map can color by. Breaks are computed from the live data on every request. */
const SHADED = [
  'publicPct', 'huntablePct', 'genSuccessDeer', 'genSuccessElk', 'huntersSqMiDeer', 'huntersSqMiElk', 'bestResOdds', 'bestNrOdds',
  'ctlOddsResDeer', 'ctlOddsNrDeer', 'ctlSuccessDeer', 'ctlOddsResElk', 'ctlOddsNrElk', 'ctlSuccessElk',
  'ctlOddsResPronghorn', 'ctlOddsNrPronghorn', 'ctlSuccessPronghorn',
  'ctlOddsResMoose', 'ctlOddsNrMoose', 'ctlSuccessMoose', 'ctlOddsResBighorn', 'ctlOddsNrBighorn', 'ctlSuccessBighorn',
  'ctlOddsResGoat', 'ctlOddsNrGoat', 'ctlSuccessGoat',
  ...['Deer', 'Elk', 'Pronghorn', 'Moose', 'Bighorn', 'Goat'].flatMap((sp) => [`ctlFillRes${sp}`, `ctlFillNr${sp}`]),
  'objBull', 'objCow',
  ...['Deer','Elk','Pronghorn'].flatMap(sp=>[`ctlQuality${sp}`,`ctlPressure${sp}`,...['Res','Nr'].flatMap(pool=>[`ctlPoints${pool}${sp}`,`ctlCreep${pool}${sp}`])]),
];
const SP_KEY: Record<string, string> = { DEER: 'Deer', ELK: 'Elk', PRONGHORN: 'Pronghorn', MOOSE: 'Moose', BIGHORN: 'Bighorn', GOAT: 'Goat' };

/** Unit boundaries + per-unit metrics for the map, as one GeoJSON FeatureCollection (plus class breaks). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const statsOnly = url.searchParams.has("stats");
  const state = stateConfig(url.searchParams.get('state')).code;
  const methods = (url.searchParams.get('method') ?? '').split(',').filter(Boolean);
  const seasons = (url.searchParams.get('season') ?? '').split(',').filter(Boolean);
  const [units, allSums, general] = await Promise.all([
    db.unit.findMany({ where: { state, geometry: { not: undefined }, ...(state === 'CO' ? { NOT: [{ name: { startsWith: 'S' } }, { name: { startsWith: 'G' } }] } : {}) } }),
    db.huntSummary.findMany({
      where: { state },
      select: { species: true, type: true, unit: true, units: true, weapon: true, tagCode: true, success5: true, resOdds5: true, nrOdds5: true, deerType: true, antlerClass: true, youthOnly: true, hunters5: true, harvest5: true, resTagAndFill: true, nrTagAndFill: true, smallSample: true, harvestYears: true },
    }),
    db.generalHarvest.findMany({ where: { state, takeMethod: ALL }, select: { species: true, unit: true, year: true, hunters: true, harvest: true } }),
  ]);
  const sums = state === 'CO' ? allSums.filter(s => matchesCoMapFilters(s.tagCode, methods, seasons)) : allSums;
  let coPoints: Awaited<ReturnType<typeof getPoints>> | null = null;
  const by = new Map<string, Record<string, number | string | null>>();
  const bump = (u: string, k: string, v: number | null, mode: 'max' | 'count' = 'max') => {
    const m = by.get(u) ?? by.set(u, {}).get(u)!;
    if (mode === 'count') m[k] = ((m[k] as number) ?? 0) + 1;
    else if (v !== null && (m[k] === undefined || m[k] === null || v > (m[k] as number))) m[k] = v;
  };
  const ctlPool = new Map<string, { hunters: number; harvest: number }>();
  for (const s of sums) {
    if (s.type === 'GENERAL' && s.unit && s.weapon === 'ANY' && s.species === 'DEER' && s.deerType) {
      (by.get(s.unit) ?? by.set(s.unit, {}).get(s.unit)!).deerType = s.deerType;
    }
    if (s.type === 'CONTROLLED')
      for (const u of s.units) {
        bump(u, 'controlled', null, 'count');
        // leftover antlerless / youth tags sit at 100% almost everywhere and would paint every unit the same
        if ((s.antlerClass === 'ANTLERED' || (s.species === 'GOAT' && s.antlerClass === 'EITHER')) && !s.youthOnly) {
          if (['DEER', 'ELK', 'PRONGHORN'].includes(s.species)) {
            bump(u, 'bestResOdds', s.resOdds5);
            bump(u, 'bestNrOdds', s.nrOdds5);
          }
          // per species: best buck/bull odds, and pooled success of those hunts (harvest / hunters, 5 years)
          const sp = SP_KEY[s.species];
          bump(u, `ctlOddsRes${sp}`, s.resOdds5);
          bump(u, `ctlOddsNr${sp}`, s.nrOdds5);
          bump(u, `ctlCount${sp}`, null, 'count');
          // draw x fill: the chance a single application ends with an animal (small samples left out)
          if (!s.smallSample) {
            bump(u, `ctlFillRes${sp}`, s.resTagAndFill);
            bump(u, `ctlFillNr${sp}`, s.nrTagAndFill);
          }
          if (s.hunters5) {
            const k = `${s.species}|${u}`;
            const p = ctlPool.get(k) ?? ctlPool.set(k, { hunters: 0, harvest: 0 }).get(k)!;
            p.hunters += s.hunters5;
            p.harvest += s.harvest5 ?? 0;
          }
        }
      }
  }
  for (const [k, p] of ctlPool) {
    const [species, unit] = k.split('|');
    // moose / sheep / goat hunts have 1-10 tags: 10 hunter-seasons is a real sample for them
    const min = ['MOOSE', 'BIGHORN', 'GOAT'].includes(species) ? 10 : MIN_HUNTERS;
    (by.get(unit) ?? by.set(unit, {}).get(unit)!)[`ctlSuccess${SP_KEY[species]}`] = p.hunters >= min ? (p.harvest / p.hunters) * 100 : null;
  }

  // General season, all weapons, last 5 seasons of data. Units redrawn in 2022 only count 2022+ (the old
  // numbers describe a different piece of ground).
  const unitInfo = new Map(units.map((u) => [u.name, u]));
  const lastYear = { DEER: 0, ELK: 0 } as Record<string, number>;
  for (const g of general) lastYear[g.species] = Math.max(lastYear[g.species], g.year);
  const agg = new Map<string, { hunters: number; harvest: number; years: Set<number> }>();
  for (const g of general) {
    const u = unitInfo.get(g.unit);
    const from = Math.max(lastYear[g.species] - 4, u?.boundaryChanged2022 ? 2022 : 0);
    if (g.year < from || g.hunters === null) continue;
    const k = `${g.species}|${g.unit}`;
    const a = agg.get(k) ?? agg.set(k, { hunters: 0, harvest: 0, years: new Set() }).get(k)!;
    a.hunters += g.hunters;
    a.harvest += g.harvest ?? 0;
    a.years.add(g.year);
  }
  for (const [k, a] of agg) {
    const [species, unit] = k.split('|');
    const sp = species === 'DEER' ? 'Deer' : 'Elk';
    const m = by.get(unit) ?? by.set(unit, {}).get(unit)!;
    const perYear = a.hunters / a.years.size;
    const acres = unitInfo.get(unit)?.acres;
    m[`genHunters${sp}`] = Math.round(perYear);
    m[`genYears${sp}`] = a.years.size;
    m[`genSuccess${sp}`] = a.hunters >= MIN_HUNTERS ? (a.harvest / a.hunters) * 100 : null;
    m[`genSuccessRaw${sp}`] = a.hunters ? (a.harvest / a.hunters) * 100 : null;
    m[`huntersSqMi${sp}`] = acres ? perYear / (acres / 640) : null;
  }

  if (state === 'CO') {
    const [points,context]=await Promise.all([getPoints('CO'),getCoScoringContext()]);
    coPoints = points;
    by.clear(); // Colorado metrics below use only selected weapons and seasons.
    for(const u of units) for(const sp of ['Deer','Elk','Pronghorn']) for(const pool of ['Res','Nr']) {
      const m=by.get(u.name) ?? by.set(u.name,{}).get(u.name)!;
      m[`ctlOdds${pool}${sp}`]=null; m[`ctlFill${pool}${sp}`]=null;
    }

    const rows=(await db.huntSummary.findMany({where:{state:'CO',species:{in:['DEER','ELK','PRONGHORN']},type:'CONTROLLED',antlerClass:'ANTLERED',youthOnly:false,privateOnly:false}})).filter(r=>matchesCoMapFilters(r.tagCode,methods,seasons)).map(r=>withCoScores(r,context));
    for (const r of rows) for(const u of r.units) {
      const m=by.get(u) ?? by.set(u,{}).get(u)!, sp=SP_KEY[r.species];
      const put=(key:string,v:number|null,low=false)=>{ if(v!==null&&Number.isFinite(v)) m[key]=m[key]==null?v:low?Math.min(Number(m[key]),v):Math.max(Number(m[key]),v); };
      const level=points[r.species==='PRONGHORN'?'PRONGHORN':r.species==='ELK'?'ELK':'DEER'];
      for(const nr of [false,true]) {
        const pool=nr?'Nr':'Res';
        const odds=tableOdds(r.oddsByPts as unknown as OddsTable,'proj',poolFor(nr,points.youth),level);
        put(`ctlOdds${pool}${sp}`,odds);
        put(`ctlFill${pool}${sp}`,!r.smallSample && odds!==null && r.success5!==null ? odds*r.success5 : null);
      }
      put(`ctlQuality${sp}`,r.scoreQuality);
      put(`ctlPressure${sp}`,r.huntersSqMi,true);
      for(const [pool,pts,creep] of [['Res',r.ptsRes,r.creepRes],['Nr',r.ptsNr,r.creepNr]] as const) {
        put(`ctlPoints${pool}${sp}`,pts,true); put(`ctlCreep${pool}${sp}`,creep,true);
      }
    }

    for (const species of ['DEER','ELK','PRONGHORN']) for (const u of units) {
      const hs = rows.filter(r => r.species === species && r.units.includes(u.name));
      const m = by.get(u.name)!;
      const measured = hs.filter(r => r.hunters5 !== null && r.harvest5 !== null);
      const hunters = measured.reduce((n, r) => n + r.hunters5!, 0);
      const harvest = measured.reduce((n, r) => n + r.harvest5!, 0);
      m['ctlCount' + SP_KEY[species]] = hs.length;
      m.controlled = Number(m.controlled ?? 0) + hs.length;
      m['ctlSuccess' + SP_KEY[species]] = hunters >= MIN_HUNTERS ? harvest / hunters * 100 : null;
    }
    for (const species of ['DEER','ELK']) for (const u of units) {
      const hs = sums.filter(s => s.species===species && s.type==='GENERAL' && s.units.includes(u.name) && s.hunters5!==null && s.harvest5!==null);
      const hunters = hs.reduce((n,s)=>n+s.hunters5!,0), harvest=hs.reduce((n,s)=>n+s.harvest5!,0);
      const years=Math.max(0,...hs.map(s=>Math.min(5,s.harvestYears)));
      const sp=SP_KEY[species], land=coLandUnit(u.name), m=by.get(u.name) ?? by.set(u.name,{}).get(u.name)!;
      m[`genSuccess${sp}`]=hunters>=MIN_HUNTERS?harvest/hunters*100:null;
      m[`genSuccessRaw${sp}`]=hunters?harvest/hunters*100:null;
      // Multi-unit code totals cannot establish a unit-specific hunter count or density.
      const exact=hs.filter(s=>s.units.length===1);
      const perYear=exact.reduce((n,s)=>n+s.hunters5!/Math.min(5,s.harvestYears || 1),0);
      m[`genHunters${sp}`]=exact.length?Math.round(perYear):null;
      m[`huntersSqMi${sp}`]=exact.length&&land?perYear/(land.acres/640):null;
      m[`genYears${sp}`]=years;
    }
  }
  if (state === 'MT') {
    // Montana: everything from its own HuntSummary rows (no generalHarvest table), with odds at the hunter's
    // saved Montana points. Deer/elk districts ("261") and antelope districts ("A320") sit side by side; the map
    // shows one set at a time. Drawn-licence odds are the licence's own draw (a nonresident permit as if the
    // combination is drawn, as the cards show); draw and fill multiplies in the combination draw.
    const pts = readMtPoints((await getPointsStore()).store as Record<string, unknown>);
    by.clear();
    const rows = await db.huntSummary.findMany({ where: { state: 'MT' } });
    const pool = new Map<string, { hunters: number; harvest: number }>();
    for (const r of rows) {
      const sp = SP_KEY[r.species];
      if (r.type === 'GENERAL') {
        // general licences only: an over-the-counter B licence is bought too, but it isn't the district's general season
        if (r.units.length !== 1 || (r.pointOdds as { kind?: string } | null)?.kind !== 'general') continue;
        const m = by.get(r.units[0]) ?? by.set(r.units[0], {}).get(r.units[0])!;
        m[`genSuccess${sp}`] = r.success5 !== null && (r.hunters5 ?? 0) >= MIN_HUNTERS ? r.success5 * 100 : null;
        m[`genSuccessRaw${sp}`] = r.success5 !== null ? r.success5 * 100 : null;
        m[`genHunters${sp}`] = r.hunters5 !== null && r.harvestYears ? Math.round(r.hunters5 / r.harvestYears) : null;
        m[`genYears${sp}`] = r.harvestYears;
        m[`huntersSqMi${sp}`] = r.huntersSqMi;
        continue;
      }
      // licences that let you take a buck or bull: antlered or either-sex. Most Montana elk permits are
      // "Brow-tined Bull or Antlerless Elk" (either sex), so antlered-only would leave 3 districts shaded.
      // Antlerless B licences are left out: they'd paint every district at 100%.
      const adult = r.antlerClass === 'ANTLERED' || r.antlerClass === 'EITHER';
      for (const u of r.units) {
        const m = by.get(u) ?? by.set(u, {}).get(u)!;
        m.controlled = Number(m.controlled ?? 0) + 1;
        if (!adult || r.youthOnly || r.privateOnly) continue;
        m[`ctlCount${sp}`] = Number(m[`ctlCount${sp}`] ?? 0) + 1;
        const put = (k: string, v: number | null, low = false) => { if (v !== null && Number.isFinite(v)) m[k] = m[k] == null ? v : low ? Math.min(Number(m[k]), v) : Math.max(Number(m[k]), v); };
        for (const nr of [false, true]) {
          const p = mtPersonal(r, { ...pts, res: nr ? 'NONRESIDENT' : 'RESIDENT' }, nr);
          put(`ctlOdds${nr ? 'Nr' : 'Res'}${sp}`, p.parts ? p.parts.permit : p.odds);
          put(`ctlFill${nr ? 'Nr' : 'Res'}${sp}`, !r.smallSample && p.odds !== null && r.success5 !== null ? p.odds * r.success5 : null);
        }
        put(`ctlQuality${sp}`, r.scoreQuality);
        put(`ctlPressure${sp}`, r.huntersSqMi, true);
        if (r.hunters5 && r.harvest5 !== null) {
          const k = `${sp}|${u}`;
          const a = pool.get(k) ?? pool.set(k, { hunters: 0, harvest: 0 }).get(k)!;
          a.hunters += r.hunters5;
          a.harvest += r.harvest5;
        }
      }
    }
    for (const [k, a] of pool) {
      const [sp, u] = k.split('|');
      by.get(u)![`ctlSuccess${sp}`] = a.hunters >= MIN_HUNTERS ? (a.harvest / a.hunters) * 100 : null;
    }
    // Block Management Type 1 (sign yourself in) is Montana's walk-in access, in the slot Idaho uses for Access Yes!
    for (const u of units) {
      const b = mtBmaDistrict(u.name).find((x) => x.species === (/^A\d/.test(u.name) ? 'PRONGHORN' : 'DEER'));
      const m = by.get(u.name) ?? by.set(u.name, {}).get(u.name)!;
      m.accessYesAcres = b ? b.bma.t1 : 0;
      m.accessYesPct = b ? b.bma.t1Pct : null;
      m.huntablePct = u.publicPct !== null ? Math.min(100, u.publicPct + (b?.bma.t1Pct ?? 0)) : null;
    }
  }
  if (state === "CO")
    for (const u of units) {
      const land = coLandUnit(u.name);
      if (land) {
        u.publicPct = land.publicPct;
        u.privatePct = land.privatePct;
        u.acres = land.acres;
      }
    }
  const features = units
    .filter((u) => u.geometry)
    .map((u) => {
      const ayPct = u.acres ? Math.min(100, ((u.accessYesAcres ?? 0) / u.acres) * 100) : null;
      return {
        type: "Feature" as const,
        id: u.name,
        geometry: u.geometry,
        properties: {
          name: u.name,
          elkZone: u.elkZone,
          acres: u.acres,
          publicPct: u.publicPct,
          privatePct: u.privatePct,
          accessYesAcres: u.accessYesAcres ?? 0,
          accessYesPct: state === "CO" ? null : ayPct,
          huntablePct: u.publicPct !== null ? Math.min(100, u.publicPct + (ayPct ?? 0)) : null,
          wildernessPct: u.wildernessPct,
          boundaryChanged2022: u.boundaryChanged2022,
          ...(by.get(u.name) ?? {}),
          // elk population vs IDFG objective, by elk zone: 0 below, 1 within, 2 above
          objBull:
            state !== "ID"
              ? null
              : (() => { const s = unitObjective(u.name).bull; return s ? OBJ_NUM[s] : null; })(),
          objCow:
            state !== "ID"
              ? null
              : (() => { const s = unitObjective(u.name).cow; return s ? OBJ_NUM[s] : null; })(),
        } as Record<string, unknown>,
      };
    });

  const classes = Object.fromEntries(
    SHADED.map((f) => {
      const values = features.map(x => x.properties[f]).filter((v): v is number => typeof v === 'number');
      return [f, coPoints && /^ctlPoints/.test(f) ? pointsClasses(values, coPoints[f.endsWith('Pronghorn') ? 'PRONGHORN' : f.endsWith('Elk') ? 'ELK' : 'DEER']) : classesFor(f, values)];
    }),
  );
  if (statsOnly) {
    const missing = Object.fromEntries(SHADED.map((f) => [f, features.filter((x) => typeof x.properties[f] !== 'number').length]));
    return Response.json({ units: features.length, years: lastYear, classes, missing });
  }
  return Response.json(
    { type: 'FeatureCollection', features, classes, years: lastYear },
    // Colorado and Montana shade by the hunter's own points, so their answers are personal
    { headers: { 'Cache-Control': state === 'CO' || state === 'MT' ? 'private, no-store' : 'public, max-age=600' } },
  );
}
