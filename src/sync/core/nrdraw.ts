/**
 * Idaho nonresident general-season tag draw (began with the 2026 season).
 * Pure parsing of the text rows pulled from IDFG's PDFs - no I/O, unit tested.
 *
 *  - "nonresident-draw-data-and-descriptions_<year>-draw.pdf": per tag, # of tags and applied / drew / % for
 *    1st-5th choice. Elk rows are "<Zone> A|B", deer rows are RD<unit> (Regular Deer) or WD<unit> (White-tailed).
 *  - "seasons-rules-big-game-supplemental-proclamation-<year>.pdf": next year's hunt codes and quotas
 *    (ELK1..ELK47 per zone A/B tag, RD/WD per unit).
 */

export type NrKind = 'ELK' | 'RD' | 'WD';

export interface NrDrawRow {
  kind: NrKind;
  code: string; // "ELK:McCall:A", "RD01", "WD08A"
  zone: string | null;
  tag: 'A' | 'B' | null;
  unit: string | null; // deer: "1", "4A"
  tags: number;
  applied: number[]; // 1st..5th choice
  drew: number[];
}

/** "RD04A" -> "4A", "WD10" -> "10". */
export function deerUnit(code: string): string | null {
  const m = code.toUpperCase().match(/^(?:RD|WD)0*(\d{1,3}[A-Z]?)$/);
  return m ? m[1] : null;
}

const toNum = (t: string) => Number(t.replace(/[,%]/g, ''));
const isNum = (t: string) => /^\d[\d,]*(\.\d+)?%?$/.test(t);

/** Numbers after a row label: tags, then (applied, drew, pct) per choice. Percent tokens are skipped. */
function choices(tokens: string[]): { tags: number; applied: number[]; drew: number[] } | null {
  const nums: { v: number; pct: boolean }[] = [];
  for (const t of tokens) {
    if (t === '%') continue;
    if (!isNum(t)) break;
    nums.push({ v: toNum(t), pct: t.endsWith('%') || /\.\d+$/.test(t) });
  }
  if (!nums.length || nums[0].pct) return null;
  const tags = nums[0].v;
  const counts = nums.slice(1).filter((n) => !n.pct).map((n) => n.v);
  const applied: number[] = [];
  const drew: number[] = [];
  for (let i = 0; i + 1 < counts.length && applied.length < 5; i += 2) {
    applied.push(counts[i]);
    drew.push(counts[i + 1]);
  }
  return applied.length ? { tags, applied, drew } : null;
}

/** Parses the draw-results rows. `zones` = known elk zone names (longest first is not required). */
export function parseDrawLines(lines: string[], zones: string[]): NrDrawRow[] {
  const out = new Map<string, NrDrawRow>();
  const byLen = zones.slice().sort((a, b) => b.length - a.length);
  for (const raw of lines) {
    const line = raw.replace(/\s+/g, ' ').trim();
    const deer = line.match(/^(RD|WD)\s?(\d{1,3}[A-Z]?)\s+(.*)$/i);
    if (deer) {
      const kind = deer[1].toUpperCase() as NrKind;
      const [, n, suffix] = deer[2].toUpperCase().match(/^(\d+)([A-Z]?)$/)!;
      const code = `${kind}${n.padStart(2, '0')}${suffix}`; // "RD1" -> "RD01", "RD04A" stays
      const c = choices(deer[3].split(' '));
      if (c && !out.has(code)) out.set(code, { kind, code, zone: null, tag: null, unit: deerUnit(code), ...c });
      continue;
    }
    const zone = byLen.find((z) => line.toLowerCase().startsWith(`${z.toLowerCase()} `));
    if (!zone) continue;
    const m = line.slice(zone.length).trim().match(/^(?:Zone\s+)?(A|B)(?:\s+Tag)?\s+(.*)$/i);
    if (!m) continue;
    const tag = m[1].toUpperCase() as 'A' | 'B';
    const c = choices(m[2].split(' '));
    const code = `ELK:${zone}:${tag}`;
    if (c && !out.has(code)) out.set(code, { kind: 'ELK', code, zone, tag, unit: null, ...c });
  }
  return [...out.values()];
}

/** Hunt codes and quotas from the supplemental proclamation: "ELK21 304", "RD39 1,093", "ELK3 55 c". First wins. */
export function parseQuotaLines(lines: string[]): Map<string, { quota: number; capped: boolean }> {
  const out = new Map<string, { quota: number; capped: boolean }>();
  for (const raw of lines) {
    const t = raw.replace(/\s+/g, ' ').trim().split(' ');
    for (let i = 0; i < t.length - 1; i++) {
      const code = t[i].toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (!/^(ELK\d{1,2}|RD\d{2,3}[A-Z]?|WD\d{2,3}[A-Z]?)$/.test(code)) continue;
      // the quota is the next number on the line (skipping a zone/unit description is not needed: codes sit beside quotas)
      const j = t.slice(i + 1, i + 4).findIndex(isNum);
      if (j < 0) continue;
      const quota = toNum(t[i + 1 + j]);
      const capped = /^\(?c\)?$/i.test(t[i + 2 + j] ?? '');
      if (!out.has(code)) out.set(code, { quota, capped });
    }
  }
  return out;
}

/** First-choice odds, capped at 100%. */
export function firstChoiceOdds(r: Pick<NrDrawRow, 'applied' | 'drew'>): number | null {
  const a = r.applied[0];
  return a ? Math.min(1, (r.drew[0] ?? 0) / a) : null;
}
