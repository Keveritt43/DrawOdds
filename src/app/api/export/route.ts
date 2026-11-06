import { getCoScoringContext } from '@/lib/coScoringContext';
import { withCoScores } from '@/lib/coScores';
import { getState } from '@/lib/residency';
import { withCoLand } from '@/lib/coLand';
import { getPoints } from '@/lib/points';
import { poolFor,tableOdds,type OddsTable } from '@/lib/coHunt';
import { matchesCoSeason } from '@/lib/coHunt';
import { pointRange } from '@/lib/pointRange';
import { chanceOf } from '@/lib/coOdds';
import { matchesHuntSeason } from "@/lib/huntSeasonFilter";
import { migrationUnits } from '@/lib/migrations';
import { db } from '@/lib/db';
import { getResidency, getDraw } from '@/lib/residency';
import { parseFilters, buildWhere, buildOrder, residencyFields } from '@/lib/finder';
import { antlerLabel, WEAPON, SPECIES_LABEL } from '@/lib/format';

export const dynamic = 'force-dynamic';

const cell = (v: unknown) => {
  if (v === null || v === undefined) return '';
  const s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const r3 = (v: number | null) => (v === null ? null : Math.round(v * 1000) / 10); // 0-1 ratio -> percent, 1 decimal

/** The Filtering results as a CSV (same filters and sort), for spreadsheets. */
export async function GET(req: Request) {
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const f = parseFilters(sp);
  if((await getState()).code==='CO'){
    const pts=await getPoints('CO'),pool=poolFor(pts.res==='NONRESIDENT',pts.youth),range=pointRange(sp.minPts,sp.maxPts);
    const all=await db.huntSummary.findMany({where:{state:'CO',species:sp.species==='PRONGHORN'?'PRONGHORN':sp.species==='ELK'?'ELK':'DEER'}});
    const context=await getCoScoringContext();
    const rows=all.map(r=>withCoScores(r,context)).filter(r=>matchesHuntSeason(r,{...f,weapon:[]})).filter(r=>!sp.unit||r.units.includes(sp.unit)).filter(r=>!sp.type||r.type===sp.type).filter(r=>sp.priv==='1'||!r.privateOnly).filter(r=>!sp.minPublic||(r.publicPct!==null&&r.publicPct>=Number(sp.minPublic))).filter(r=>!sp.minSucc||(r.success5!==null&&r.success5>=Number(sp.minSucc)/100)).filter(r=>{const p=pts.res==='NONRESIDENT'?r.ptsNr:r.ptsRes;return (range.min===null||(p!==null&&p>=range.min))&&(range.max===null||(p!==null&&p<=range.max))}).filter(r=>!sp.method||sp.method.split(',').includes(r.tagCode?.slice(-1)??'')).filter(r=>matchesCoSeason(r.tagCode??'',sp.season?sp.season.split(','):[])).filter(r=>sp.second!=='1'||r.secondChoice).filter(r=>sp.hybrid!=='1'||r.hybrid);
    const mode=sp.odds==='last'?'last':'proj';const lines=[['Code','Hunt','Units','Draw odds at saved points','Harvest success','Hunters/year','Hunters/mi2','Public ownership %','Private ownership %','Quality','Elbow room score','General elk pressure status','Elk hunter-seasons/year'],...rows.map(r=>[r.tagCode,r.name,r.units.join(', '),tableOdds(r.oddsByPts as unknown as OddsTable,mode,pool,pts[r.species==='PRONGHORN'?'PRONGHORN':r.species==='ELK'?'ELK':'DEER']),r.success5,r.coPressure?.status==='missing'?null:r.harvestYears&&r.hunters5!==null?r.coPressure?.totalHuntersPerYear ?? r.hunters5/Math.min(5,r.harvestYears):null,r.huntersSqMi,r.publicPct,r.privatePct,r.scoreQuality,r.scoreCrowd,r.coPressure?.status,r.coPressure?.elkHuntersPerYear])];return new Response(lines.map(row=>row.map(cell).join(',')).join('\n')+'\n',{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="drawodds-colorado.csv"','Cache-Control':'private, no-store'}});
  }
  const { residency } = await getResidency(sp.as);
  const draw = await getDraw(sp.draw);
  const rf = residencyFields(residency);
  const candidates = await db.huntSummary.findMany({ where: buildWhere(f, residency, draw, f.migration ? await migrationUnits() : {}), orderBy: buildOrder(f, residency), take: 2000 });
  const rows = candidates.filter((r) => matchesHuntSeason(r, f));
  const res = residency === "NONRESIDENT" ? "NR" : "Res";
  const head = [
    'Species', 'Type', 'Hunt / tag', 'Code', 'Area', 'Units', 'Weapon', 'Sex', 'Open', 'Close', 'Tags',
    `${res} odds latest %`, 'Draw year', `${res} odds 5-yr %`, `${res} 1st-choice applicants`, 'All 1st-choice applicants', 'NR tags drawn latest', '2nd-choice tags latest',
    'Success latest %', 'Harvest year', 'Success 5-yr %', 'Hunters 5-yr', 'Harvest 5-yr', 'Hunters per sq mi', `Draw and fill ${res} %`,
    'Trophy share %', 'Avg antler spread / horn length (in.)', 'Deer type', 'Public land %', 'Access Yes! %', 'Small sample', 'Link',
  ];
  // behind Railway's proxy req.url is the internal address: build links from the public host
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  const origin = host ? `${req.headers.get('x-forwarded-proto') ?? 'https'}://${host}` : new URL(req.url).origin;
  const lines = [head.join(',')];
  for (const r of rows) {
    lines.push([
      SPECIES_LABEL[r.species], r.nrTag ? 'NR general tag' : r.type === 'CONTROLLED' ? 'Controlled' : 'General',
      r.nrTag ? r.name : r.huntNumber ?? r.name, r.nrTag ? r.tagCode : r.huntNumber, r.areaName, r.units.join(' '), WEAPON[r.weapon], antlerLabel(r.species, r.antlerClass),
      r.openDate, r.closeDate, r.nrTag ? r.quota : r.tags,
      r3(r[rf.oddsLast]), r.oddsLastYear, r3(r[rf.odds5]), r[rf.appsLast], r.appsLast, r.nrPermitsLast, r.secondDrewLast,
      r3(r.successLast), r.harvestLastYear, r3(r.success5), r.hunters5, r.harvest5, r.huntersSqMi === null ? null : Math.round(r.huntersSqMi * 100) / 100, r3(r[rf.tagAndFill]),
      r3(r.bigPct5), r.avgSize5 === null ? null : Math.round(r.avgSize5 * 10) / 10, r.deerType, r.publicPct === null ? null : Math.round(r.publicPct), r.accessYesPct === null ? null : Math.round(r.accessYesPct * 10) / 10, r.smallSample ? 'yes' : '',
      `${origin}/hunts/${encodeURIComponent(r.slug ?? r.id)}`,
    ].map(cell).join(','));
  }
  return new Response(lines.join('\n') + '\n', {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="drawodds-idaho-${res.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
