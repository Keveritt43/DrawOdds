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
  const { residency } = await getResidency(sp.as);
  const draw = await getDraw(sp.draw);
  const rf = residencyFields(residency);
  const rows = await db.huntSummary.findMany({ where: buildWhere(f, residency, draw), orderBy: buildOrder(f, residency), take: 2000 });
  const res = residency === 'NONRESIDENT' ? 'NR' : 'Res';
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
      `${origin}/hunts/${encodeURIComponent(r.id)}`,
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
