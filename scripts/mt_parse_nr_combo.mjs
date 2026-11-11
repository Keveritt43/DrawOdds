// Parse Montana's "NR Combination Preference Point Statistics" report into data/mt/nr-combo.json.
//
// The PDF is only reachable from a browser (the workspace shell gets a proxy refusal for myfwp.mt.gov).
// Extract its text with pdf.js in a tab on myfwp.mt.gov, one line per visual row, ordered by y then x —
// see docs/states/mt-onboarding.md §8 — then:
//
//   node scripts/mt_parse_nr_combo.mjs <lines.txt> data/mt/nr-combo.json
//
// Every check below throws rather than skipping a row. The report is small enough that a silent
// miss would go unnoticed, and FWP's layout has already changed titles four times in nine years.

import { readFileSync, writeFileSync } from 'node:fs';

// pdf.js splits digits inside a glyph run often enough that it matters: the 2026 file prints
// 9,721 as "9,7 21" and 8,146 as "8,1 46". Strip spaces inside a number, then the commas.
// Totals are checked afterwards, which is what actually catches a bad repair.
const num = (s) => {
  const cleaned = String(s).replace(/(?<=[\d,])\s+(?=\d)/g, '').replace(/,/g, '');
  if (!/^\d+$/.test(cleaned)) throw new Error(`not a whole number: ${JSON.stringify(s)}`);
  return Number(cleaned);
};

// "2.2 – 3 PP", "1 PP", ".2 - .75 PP" — en dash or hyphen, leading-dot decimals.
function parseBand(label) {
  const t = label.replace(/\s*PP$/, '').trim();
  const m = /^([\d.]+)\s*[–-]\s*([\d.]+)$/.exec(t);
  if (m) return { min: Number(m[1]), max: Number(m[2]) };
  if (!/^[\d.]+$/.test(t)) throw new Error(`unparsed point band: ${JSON.stringify(label)}`);
  return { min: Number(t), max: Number(t) };
}

const LICENSE_HEADINGS = [
  { match: /General Big Game\/Elk Combo/i, key: 'biggame-elk', name: 'Big Game / Elk Combination' },
  { match: /General Deer Combo/i, key: 'deer', name: 'General Deer Combination' },
];

export function parseNrCombo(lines) {
  const sections = [];
  let heading = null;
  let current = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const h = LICENSE_HEADINGS.find((x) => x.match.test(line));
    if (h) { heading = h; continue; }

    // "2026 Regular (Total apps 29,892)" / "2026 (Total apps 13,213)" / "2026 NR Landowner Priority Pool (133 apps)"
    const sec = /^(\d{4})\s*(.*?)\s*\(\s*(?:Total apps\s*)?([\d,\s]+?)\s*(?:apps)?\s*\)$/i.exec(line);
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

    // "2 PP 75.77% Draw (9,609 apps, 7,281 successful)" / "0 PP 100% Draw (44 apps)"
    const lvl = /^(.*?PP)\s+([\d.]+)%\s*Draw\s*\(\s*([\d,\s]+?)\s*apps(?:\s*,\s*([\d,\s]+?)\s*successful)?\s*\)$/i.exec(line);
    if (lvl) {
      if (!current) throw new Error(`level row before any section: ${line}`);
      const { min, max } = parseBand(lvl[1]);
      const apps = num(lvl[3]);
      const pct = Number(lvl[2]);
      let drawn;
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
      const level = { label: lvl[1].replace(/\s*PP$/, '').trim(), min, max, apps, drawn, pct: apps === 0 ? null : pct };
      if (drawnDerived) level.drawnDerived = true;
      current.levels.push(level);
      continue;
    }

    throw new Error(`unrecognised line: ${JSON.stringify(line)}`);
  }

  if (!sections.length) throw new Error('no sections parsed');

  for (const s of sections) {
    const sum = s.levels.reduce((a, l) => a + l.apps, 0);
    if (sum !== s.totalApps) {
      throw new Error(`${s.licenseKey} ${s.year}: level applicants sum to ${sum}, report says ${s.totalApps}`);
    }
    for (const l of s.levels) {
      if (l.drawn > l.apps) throw new Error(`${s.licenseKey} ${s.year} ${l.label}: drawn ${l.drawn} > apps ${l.apps}`);
      if (l.apps > 0 && Math.abs((l.drawn / l.apps) * 100 - l.pct) > 0.01) {
        throw new Error(`${s.licenseKey} ${s.year} ${l.label}: ${l.drawn}/${l.apps} is not ${l.pct}%`);
      }
    }
    // 75% of the licenses go by points, 25% at random among zero-point applicants. Verified exact in
    // 2025 and 2026 for both licenses; a regular pool that misses it means the rules changed.
    if (s.pool === 'regular') {
      const zero = s.levels.find((l) => l.min === 0 && l.max === 0);
      const drawn = s.levels.reduce((a, l) => a + l.drawn, 0);
      if (!zero) throw new Error(`${s.licenseKey} ${s.year}: no zero-point level`);
      const randomShare = zero.drawn / drawn;
      if (Math.abs(randomShare - 0.25) > 0.005) {
        throw new Error(`${s.licenseKey} ${s.year}: random share ${(randomShare * 100).toFixed(2)}%, expected 25%`);
      }
    }
  }

  return sections;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/^.*\//, ''))) {
  const [, , inPath, outPath] = process.argv;
  if (!inPath) {
    console.error('usage: node scripts/mt_parse_nr_combo.mjs <lines.txt> [out.json]');
    process.exit(1);
  }
  const sections = parseNrCombo(readFileSync(inPath, 'utf8').split('\n'));
  const out = JSON.stringify(sections, null, 2);
  if (outPath) writeFileSync(outPath, `${out}\n`);
  else console.log(out);
  console.error(`parsed ${sections.length} sections, all checks passed`);
}
