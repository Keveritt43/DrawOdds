import { db, thisYear, type StepResult } from '../core/context';
import { getBytes } from '../core/http';
import { pdfLines } from '../core/pdf';
import { parseDrawLines, parseQuotaLines, type NrDrawRow } from '../core/nrdraw';
import { syntheticId } from './hunts';
import { latestDataFile, loadElkZones } from '../core/datafiles';

const BASE = 'https://idfg.idaho.gov/sites/default/files/';
const DRAW_URL = (y: number) => (process.env.NR_DRAW_URL || `${BASE}nonresident-draw-data-and-descriptions_{year}-draw.pdf`).replace('{year}', String(y));
const QUOTA_URL = (y: number) => (process.env.NR_QUOTA_URL || `${BASE}seasons-rules-big-game-supplemental-proclamation-{year}.pdf`).replace('{year}', String(y));

/** Pipe a PDF's text rows to the log (first `n` matching rows) so parsing can be checked against the PDF. */
function sample(label: string, lines: string[], re: RegExp, n = 12) {
  const hits = lines.filter((l) => re.test(l)).slice(0, n);
  console.log(`[nrdraw] ${label}: ${hits.length ? '' : 'NO MATCHING ROWS'}`);
  for (const l of hits) console.log(`  | ${l.slice(0, 200)}`);
}

/**
 * Nonresident general-season deer and elk tag draw (Idaho, 2026+): latest draw results + newest quotas.
 * Creates one Hunt (source "nrtag") per tag so tags show up in Filtering, unit pages and the map.
 */
export async function syncNrDraw(): Promise<StepResult> {
  const details: string[] = [];
  const { quotaYear: fileQuotaYear, zones } = loadElkZones();
  const zoneNames = zones.map((z) => z.zone);

  // --- draw results: a committed data file (scripts/nr-pdf-to-json.ts) wins; otherwise try IDFG directly
  //     (IDFG's file server has refused automated downloads, so the data file is the normal path)
  let drawYear = 0;
  let rows: NrDrawRow[] = [];
  const drawFile = latestDataFile<{ rows: NrDrawRow[] }>('nr-draw');
  if (drawFile) {
    drawYear = drawFile.year;
    rows = drawFile.data.rows;
    details.push(`Draw results from data/nr-draw-${drawYear}.json`);
  }
  for (const y of drawFile ? [] : [thisYear() + 1, thisYear(), thisYear() - 1]) {
    const bytes = await getBytes(DRAW_URL(y));
    if (!bytes) continue;
    const lines = (await pdfLines(bytes)).flat();
    console.log(`[nrdraw] ${DRAW_URL(y)}: ${lines.length} text rows`);
    sample('elk rows', lines, new RegExp(`^(${zoneNames.join('|')}) `, 'i'), 8);
    sample('deer rows', lines, /^(RD|WD)\s?\d/i, 8);
    rows = parseDrawLines(lines, zoneNames);
    drawYear = y;
    break;
  }
  const n = (k: string) => rows.filter((r) => r.kind === k).length;
  details.push(`Draw ${drawYear || 'not found'}: ${n('ELK')} elk zone tags, ${n('RD')} regular deer units, ${n('WD')} white-tailed deer units`);
  if (drawYear && (n('ELK') < 30 || n('RD') < 50 || n('WD') < 30)) {
    return { rows: rows.length, status: 'ERROR', details: [...details, 'Too few rows parsed - kept the existing nonresident draw data'] };
  }
  if (!drawYear) details.push('No draw results yet (add data/nr-draw-<year>.json) - tags are listed with quotas only');
  for (const r of rows.slice(0, 3)) details.push(`  ${r.code}: ${r.tags} tags, 1st choice ${r.drew[0]}/${r.applied[0]}`);

  // --- quotas: newest supplemental proclamation (next year's codes and quotas)
  let quotaYear = 0;
  let quotas = new Map<string, { quota: number; capped: boolean }>();
  const quotaFile = latestDataFile<{ quotas: Record<string, { quota: number; capped: boolean }> }>('nr-quotas');
  if (quotaFile) {
    quotaYear = quotaFile.year;
    quotas = new Map(Object.entries(quotaFile.data.quotas));
    details.push(`Quotas from data/nr-quotas-${quotaYear}.json`);
  }
  for (const y of quotaFile ? [] : [thisYear() + 1, thisYear()]) {
    const bytes = await getBytes(QUOTA_URL(y));
    if (!bytes) continue;
    const lines = (await pdfLines(bytes)).flat();
    console.log(`[nrdraw] ${QUOTA_URL(y)}: ${lines.length} text rows`);
    sample('quota rows', lines, /\b(ELK\d{1,2}|RD\d{2}|WD\d{2})/, 12);
    quotas = parseQuotaLines(lines);
    quotaYear = y;
    break;
  }
  // elk zone quotas also ship in data/nr-elk-zones.json (from the same proclamation) as a fallback
  if (!quotaYear || quotaYear === fileQuotaYear) {
    for (const z of zones) for (const t of z.tags) if (!quotas.has(t.code)) quotas.set(t.code, { quota: t.quota, capped: t.capped });
    quotaYear ||= fileQuotaYear;
  }
  const elkQ = [...quotas.keys()].filter((c) => c.startsWith('ELK')).length;
  const deerQ = quotas.size - elkQ;
  details.push(`Quotas ${quotaYear}: ${elkQ} elk codes, ${deerQ} deer codes`);
  for (const z of zones.slice(0, 2)) for (const t of z.tags) details.push(`  ${t.code} (${z.zone} ${t.tag}): parsed ${quotas.get(t.code)?.quota ?? '-'}, proclamation table ${t.quota}`);

  // --- tags: every elk zone A/B and deer RD/WD unit that has a draw row or a quota
  type Tag = { key: string; code: string; species: 'DEER' | 'ELK'; name: string; units: string[]; draw?: NrDrawRow };
  const tags = new Map<string, Tag>();
  for (const z of zones) {
    for (const t of z.tags) {
      const key = `ELK:${z.zone}:${t.tag}`;
      tags.set(key, { key, code: t.code, species: 'ELK', name: `${z.zone} Zone Elk ${t.tag} Tag`, units: z.units });
    }
  }
  const deerName = (code: string, unit: string) => `Unit ${unit} ${code.startsWith('RD') ? 'Regular Deer' : 'White-tailed Deer'} Tag`;
  for (const code of [...quotas.keys()].filter((c) => /^(RD|WD)/.test(c))) {
    const unit = code.replace(/^(RD|WD)0*/, '');
    tags.set(code, { key: code, code, species: 'DEER', name: deerName(code, unit), units: [unit] });
  }
  for (const r of rows) {
    const t = tags.get(r.code);
    if (t) t.draw = r;
    else if (r.kind === 'ELK') details.push(`Draw row ${r.code} has no zone in data/nr-elk-zones.json`);
    else tags.set(r.code, { key: r.code, code: r.code, species: 'DEER', name: deerName(r.code, r.unit!), units: [r.unit!], draw: r });
  }

  // this season's hunts (same rule as the summary step)
  const yc = new Map<number, number>();
  for (const h of await db.hunt.findMany({ where: { source: { in: ['regs', 'huntlist'] } }, select: { year: true } })) yc.set(h.year, (yc.get(h.year) ?? 0) + 1);
  const season = [...yc.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? thisYear();

  await db.$transaction(
    async (tx) => {
      for (const r of rows) {
        const data = { year: drawYear, species: (r.kind === 'ELK' ? 'ELK' : 'DEER') as 'ELK' | 'DEER', kind: r.kind, code: r.code, zone: r.zone, tag: r.tag, unit: r.unit, tags: r.tags, applied: r.applied, drew: r.drew };
        await tx.nrDraw.upsert({ where: { id: `${drawYear}|${r.code}` }, create: { id: `${drawYear}|${r.code}`, ...data }, update: data });
      }
      for (const [code, q] of quotas) {
        await tx.nrQuota.upsert({ where: { id: `${quotaYear}|${code}` }, create: { id: `${quotaYear}|${code}`, year: quotaYear, code, ...q }, update: q });
      }
      const ids: number[] = [];
      for (const t of tags.values()) {
        const idfgId = syntheticId(`nrtag|${t.key}`);
        ids.push(idfgId);
        const data = {
          year: season,
          species: t.species,
          type: 'GENERAL' as const,
          huntNumber: null,
          source: 'nrtag',
          name: t.name,
          takeMethod: 'Nonresident general tag',
          weapon: 'ANY' as const,
          antlerClass: 'EITHER' as const,
          sexText: 'See the seasons for this tag',
          openDate: null,
          closeDate: null,
          tags: quotas.get(t.code)?.quota ?? t.draw?.tags ?? null,
          youthOnly: false,
          units: t.units,
          rawText: `nrtag|${t.key}|${t.code}`,
        };
        await tx.hunt.upsert({ where: { idfgId }, create: { idfgId, ...data }, update: data });
      }
      await tx.hunt.deleteMany({ where: { state: 'ID', source: 'nrtag', idfgId: { notIn: ids }, saved: { none: {} } } });
    },
    { timeout: 180_000 },
  );
  details.push(`${tags.size} nonresident general tags (season ${season})`);
  return { rows: tags.size, details };
}
