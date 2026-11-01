import { db, ODDS_BASE, SPECIES, FIRST_ODDS_YEAR, yearsToFetch, type StepOptions, type StepResult } from '../core/context';
import { getJson } from '../core/http';
import { normArea, num } from '../core/parse';

interface OddsApiRow {
  Yr: number | string;
  CHunt: number | string;
  CHuntArea: string;
  AreaID: number | string | null;
  Draw: number | string;
  PermitTotal?: number | string | null;
  SuccChoice1?: number | string | null;
  SuccChoice2?: number | string | null;
  ApplChoice1?: number | string | null;
  ApplChoice2?: number | string | null;
  ResApp?: number | string | null;
  NonResApp?: number | string | null;
  ResPermit?: number | string | null;
  NonResPermit?: number | string | null;
}

export async function syncOdds(opts: StepOptions): Promise<StepResult> {
  const details: string[] = [];
  let rows = 0;
  for (const { code, species } of SPECIES) {
    const have = new Set(
      (await db.drawOdds.findMany({ where: { species }, select: { year: true }, distinct: ['year'] })).map((r) => r.year),
    );
    for (const year of yearsToFetch(FIRST_ODDS_YEAR, have, opts.full)) {
      for (const draw of [1, 2]) {
        let json: { response?: string; rows?: OddsApiRow[] };
        try {
          json = await getJson(`${ODDS_BASE}?biggame=${code}&yr=${year}&draw=${draw}`);
        } catch (e) {
          details.push(`${species} ${year} draw ${draw}: ${(e as Error).message} - kept existing rows`);
          continue;
        }
        const data = (json.rows ?? []).map((r) => {
          const huntNumber = num(r.CHunt)!;
          return {
            id: `${species}|${year}|${draw}|${huntNumber}`,
            species,
            year,
            draw,
            huntNumber,
            areaName: normArea(r.CHuntArea),
            areaId: num(r.AreaID),
            permits: num(r.PermitTotal),
            resPermits: num(r.ResPermit),
            nrPermits: num(r.NonResPermit),
            apps1: num(r.ApplChoice1),
            apps2: num(r.ApplChoice2),
            resApps: num(r.ResApp),
            nrApps: num(r.NonResApp),
            drew1: num(r.SuccChoice1),
            drew2: num(r.SuccChoice2),
          };
        }).filter((r) => r.huntNumber !== null);
        // IDFG sometimes lists the same hunt twice in one year (e.g. a hunt split across areas). Merge those
        // rows: keep the first row's area, add up permits and applicants.
        const merged = new Map<string, (typeof data)[number]>();
        let dupes = 0;
        for (const r of data) {
          const prev = merged.get(r.id);
          if (!prev) {
            merged.set(r.id, r);
            continue;
          }
          dupes++;
          const keys = ['permits', 'resPermits', 'nrPermits', 'apps1', 'apps2', 'resApps', 'nrApps', 'drew1', 'drew2'] as const;
          if (keys.every((k) => r[k] === prev[k])) continue; // exact repeat: don't double count
          for (const k of keys) if (r[k] !== null) prev[k] = (prev[k] ?? 0) + r[k]!;
        }
        if (dupes) details.push(`${species} ${year} draw ${draw}: merged ${dupes} duplicate hunt rows`);
        const rowsOut = [...merged.values()];
        if (!rowsOut.length) continue; // "No hunts were returned" is normal for years/draws that don't exist
        await db.$transaction([
          db.drawOdds.deleteMany({ where: { species, year, draw } }),
          db.drawOdds.createMany({ data: rowsOut }),
        ]);
        rows += rowsOut.length;
      }
    }
  }
  if (!rows) return { rows, status: 'ERROR', details: ['No odds rows loaded at all', ...details] };
  return { rows, details };
}
