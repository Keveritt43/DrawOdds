// Parse Montana's nonresident combination preference-point reports into data/mt/nr-combo.json.
//
// The PDFs are only reachable from a browser (the workspace shell gets a proxy refusal for myfwp.mt.gov).
// Extract each one's text with pdf.js in a tab on myfwp.mt.gov, one line per visual row ordered by y then x
// (see docs/states/mt-onboarding.md §8), save it under data/mt/nr-combo-text/, then:
//
//   NODE_PATH=/opt/npm-tools/node_modules /opt/npm-tools/node_modules/.bin/tsx \
//     scripts/mt_parse_nr_combo.ts data/mt/nr-combo-text/2026.txt
//
// Each report restates the previous year, so the files overlap; that redundancy is the cross-check, because
// FWP sometimes restates a year with different numbers (see docs/states/mt-onboarding.md §3.1).
//
// FWP's layout drifts every year. Everything below is driven by the fixtures in data/mt/nr-combo-text/, and
// an unrecognised line is an error rather than a skipped row. Quirks handled, all real:
//   - point bands written either way round: "2.2 – 3 PP", "3-2.2 PP", "3 - 1.2 PP"
//   - en dash or hyphen, and leading-dot decimals (".2 - .75 PP")
//   - pdf.js splitting digits inside a number: "9,7 21" (9,721), "2,01 8" (2,018), "1 .8" (1.8), "53. 6" (53.6)
//   - successes written as ", 7,281 successful" or "/ 9,098 combos available" or "/2,507 available"
//   - the word "Draw" missing altogether (2023 deer, 0 PP)
//   - a whole band omitted from the report (2022 big game has no 0%-band), inferred from the printed total

import { readFileSync, writeFileSync } from 'node:fs';

export interface ParsedLevel {
  label: string;
  min: number;
  max: number;
  apps: number;
  drawn: number;
  /** FWP prints no success count where everyone drew; `drawn` is then the applicant count. */
  drawnDerived?: boolean;
  /** The band is absent from the report and was reconstructed from the printed total. */
  inferred?: boolean;
  /** null where nobody applied at that level — unknown, not 0%. */
  pct: number | null;
}

export interface ParsedSection {
  licenseKey: string;
  licenseName: string;
  pool: 'regular' | 'landowner';
  year: number;
  totalApps: number;
  levels: ParsedLevel[];
  /** Printed total minus the sum of the printed bands, where FWP's own arithmetic does not close. */
  totalMismatch?: number;
}

/** A single numeric token, with any whitespace pdf.js injected into it removed. */
function num(s: string): number {
  const cleaned = s.replace(/\s+/g, '').replace(/,/g, '');
  // Leading-dot decimals are how FWP writes a party's fractional points: ".2", ".75".
  if (!/^(\d+(\.\d+)?|\.\d+)$/.test(cleaned)) throw new Error(`not a number: ${JSON.stringify(s)}`);
  return Number(cleaned);
}

/** "2.2 – 3", "3-1.2", ".2 - 1 .8", "1" → {min, max}, in either printed order. */
function parseBand(label: string): { min: number; max: number } {
  const parts = label.split(/\s*[–-]\s*/).filter((p) => p.trim() !== '');
  if (parts.length === 1) { const v = num(parts[0]); return { min: v, max: v }; }
  if (parts.length !== 2) throw new Error(`unparsed point band: ${JSON.stringify(label)}`);
  const a = num(parts[0]);
  const b = num(parts[1]);
  return { min: Math.min(a, b), max: Math.max(a, b) };
}

const LICENSE_HEADINGS = [
  { match: /Big Game\/Elk Combo/i, key: 'biggame-elk', name: 'Big Game / Elk Combination' },
  { match: /Deer Combo/i, key: 'deer', name: 'General Deer Combination' },
];

// "2022 (Total apps 30,947)" / "2024 Regular (Total apps 29,518)" / "2026 NR Landowner Priority Pool (133 apps)"
const SECTION = /^(\d{4})\s*(.*?)\s*\(\s*(?:Total apps\s*)?([\d,\s]+?)\s*(?:apps)?\s*\)$/i;
// "2 PP 75.77% Draw (9,609 apps, 7,281 successful)" and every variant listed at the top of this file.
const LEVEL = /^([\d.\s–-]*?)\s*PP\s+([\d.\s]+?)\s*%\s*(?:Draw)?\s*\(\s*([\d,\s]+?)\s*apps\s*(?:[,/]\s*([\d,\s]+?)\s*(?:combos\s+)?(?:successful|available)\s*)?\)$/i;

export function parseNrCombo(lines: string[]): ParsedSection[] {
  const sections: ParsedSection[] = [];
  let heading: (typeof LICENSE_HEADINGS)[number] | null = null;
  let current: ParsedSection | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    // A heading can carry a year ("2023 Deer Combo Drawing Stats"); the section lines below set the year.
    const h = LICENSE_HEADINGS.find((x) => x.match.test(line));
    if (h && /Drawing Stats/i.test(line)) { heading = h; continue; }

    const sec = SECTION.exec(line);
    if (sec) {
      if (!heading) throw new Error(`section before any license heading: ${line}`);
      const landowner = /landowner/i.test(sec[2]);
      current = {
        licenseKey: landowner ? `${heading.key}-landowner` : heading.key,
        licenseName: landowner ? `${heading.name} — Nonresident Landowner Priority Pool` : heading.name,
        pool: landowner ? 'landowner' : 'regular',
        year: Number(sec[1]),
        totalApps: num(sec[3]),
        levels: [],
      };
      sections.push(current);
      continue;
    }

    const lvl = LEVEL.exec(line);
    if (lvl) {
      if (!current) throw new Error(`level row before any section: ${line}`);
      const { min, max } = parseBand(lvl[1]);
      const apps = num(lvl[3]);
      const pct = num(lvl[2]);
      let drawn: number;
      let drawnDerived = false;
      if (lvl[4] !== undefined) {
        drawn = num(lvl[4]);
      } else if (pct === 100) {
        drawn = apps; // FWP prints no success count on a level where everyone drew
        drawnDerived = true;
      } else if (pct === 0) {
        drawn = 0;
      } else {
        throw new Error(`level has no success count and is neither 0% nor 100%: ${line}`);
      }
      // FWP prints the percentage to anywhere from zero to two decimals ("17%", "73.6 %", "75.77%"), so the
      // tolerance has to follow the printed precision: half of the last place it was rounded to. A flat
      // tolerance would either reject 2022's whole-number rounding or wave through a genuinely wrong row.
      if (apps > 0) {
        const decimals = (lvl[2].replace(/\s+/g, '').split('.')[1] ?? '').length;
        const tol = 0.5 * 10 ** -decimals + 1e-9;
        if (Math.abs((drawn / apps) * 100 - pct) > tol) {
          throw new Error(`${current.licenseKey} ${current.year}: ${drawn}/${apps} is not ${pct}% (±${tol})`);
        }
      }
      const label = min === max ? String(min) : `${min} – ${max}`;
      const level: ParsedLevel = { label, min, max, apps, drawn, pct: apps === 0 ? null : pct };
      if (drawnDerived) level.drawnDerived = true;
      current.levels.push(level);
      continue;
    }

    throw new Error(`unrecognised line: ${JSON.stringify(line)}`);
  }

  if (!sections.length) throw new Error('no sections parsed');
  for (const s of sections) reconcile(s);
  return sections;
}

function reconcile(s: ParsedSection): void {
  const where = `${s.licenseKey} ${s.year}`;
  for (const l of s.levels) {
    if (l.drawn > l.apps) throw new Error(`${where} ${l.label}: drawn ${l.drawn} > apps ${l.apps}`);
  }

  const sum = s.levels.reduce((a, l) => a + l.apps, 0);
  const gap = s.totalApps - sum;
  const cutoff = s.levels.find((l) => l.min > 0 && l.pct != null && l.pct > 0 && l.pct < 100);
  const hasDeadBand = s.levels.some((l) => l.pct === 0 && l.min > 0);

  // 2022 big game prints no 0% band at all. Everyone between zero and the cutoff drew nothing, so the
  // applicants the printed total does not account for are exactly that band. Bounded at 60% of the total
  // so the reconstruction cannot quietly swallow a whole missing row: the real gap is 39% (12,188 of
  // 30,947), and anything larger means the parse lost something rather than FWP omitting a band.
  if (gap > 0 && cutoff && !hasDeadBand && gap <= s.totalApps * 0.6) {
    s.levels.push({ label: `0 – ${cutoff.min}`, min: 0.2, max: cutoff.min - 0.2, apps: gap, drawn: 0, pct: 0, inferred: true });
  } else if (gap !== 0) {
    // FWP's own arithmetic does not always close (2023 big game is 90 applicants short, 2021 deer is 1).
    // Record it rather than silently accepting it, and fail if it is big enough to mean a missed row.
    if (Math.abs(gap) / s.totalApps > 0.01) {
      throw new Error(`${where}: level applicants sum to ${sum}, report says ${s.totalApps}`);
    }
    s.totalMismatch = gap;
  }

  // The counts have to reconcile before the allocation rule means anything: a section missing a row would
  // otherwise surface as a bogus "the rules changed" error.
  // 75% of the licenses go by points; the other 25% are drawn at random among ZERO-point applicants only.
  // Verified for every regular section 2021-2026. A section that misses it means the rules changed.
  if (s.pool === 'regular') {
    const zero = s.levels.find((l) => l.min === 0 && l.max === 0);
    const drawn = s.levels.reduce((a, l) => a + l.drawn, 0);
    if (!zero) throw new Error(`${where}: no zero-point level`);
    const randomShare = zero.drawn / drawn;
    if (Math.abs(randomShare - 0.25) > 0.005) {
      throw new Error(`${where}: random share ${(randomShare * 100).toFixed(2)}%, expected 25%`);
    }
  }
}

const invokedDirectly = process.argv[1]?.endsWith('mt_parse_nr_combo.ts');
if (invokedDirectly) {
  const [, , ...paths] = process.argv;
  if (!paths.length) {
    console.error('usage: tsx scripts/mt_parse_nr_combo.ts <lines.txt> [more.txt ...]');
    process.exit(1);
  }
  const all: ParsedSection[] = [];
  for (const p of paths) all.push(...parseNrCombo(readFileSync(p, 'utf8').split('\n')));
  console.log(JSON.stringify(all, null, 2));
  console.error(`parsed ${all.length} sections from ${paths.length} files, all checks passed`);
}

export { reconcile as _reconcile };
export function writeJson(path: string, sections: ParsedSection[]): void {
  writeFileSync(path, `${JSON.stringify(sections, null, 2)}\n`);
}
