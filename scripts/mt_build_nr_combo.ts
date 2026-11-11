// Build data/mt/nr-combo.json from the extracted report text in data/mt/nr-combo-text/.
//
//   NODE_PATH=/opt/npm-tools/node_modules /opt/npm-tools/node_modules/.bin/tsx scripts/mt_build_nr_combo.ts
//
// Each FWP report restates the previous year, so most draws appear in two files. That overlap is the
// cross-check: this script fails if two reports state the same draw differently. (They have not yet, for
// 2021-2026 — but FWP's older tabular report for 2021 does disagree with the 2022 restatement, so the
// check earns its keep. See docs/states/mt-onboarding.md §3.1.)

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { parseNrCombo, type ParsedLevel, type ParsedSection } from './mt_parse_nr_combo';

const TEXT_DIR = 'data/mt/nr-combo-text';
const OUT = 'data/mt/nr-combo.json';

const LICENSE_META: Record<string, { name: string; shortName: string; pool: string; reportName: string; note?: string }> = {
  'biggame-elk': {
    name: 'Big Game / Elk Combination',
    shortName: 'Big Game / Elk',
    pool: 'regular',
    reportName: 'General Big Game/Elk Combo Primary Drawing Stats',
    note: 'One drawing issues both the Big Game (deer + elk) and Elk Combination licenses. FWP reported them as two licenses through 2021 and as one drawing from 2022; the 2021 numbers here are FWP’s own restatement of that draw as a single pool.',
  },
  deer: {
    name: 'General Deer Combination',
    shortName: 'Deer',
    pool: 'regular',
    reportName: 'General Deer Combo Primary Drawing Stats',
    note: 'In December 2025 the Fish and Wildlife Commission withheld about 2,500 nonresident general deer licenses for the 2026-2027 seasons. Licenses drawn fell from 10,440 in 2025 to 8,226 in 2026.',
  },
  'biggame-elk-landowner': {
    name: 'Big Game / Elk Combination — Nonresident Landowner Priority Pool',
    shortName: 'Landowner pool',
    pool: 'landowner',
    reportName: 'NR Landowner Priority Pool',
    note: 'A separate pool for nonresident landowners. Everyone who applied drew, at every point level with applicants, in every year reported.',
  },
};

const sigOf = (s: ParsedSection) =>
  JSON.stringify({
    total: s.totalApps,
    levels: s.levels.map((l) => [l.min, l.max, l.apps, l.drawn]).sort(),
  });

function build(): void {
  const files = readdirSync(TEXT_DIR).filter((f) => f.endsWith('.txt')).sort();
  if (!files.length) throw new Error(`no report text in ${TEXT_DIR}`);

  const seen = new Map<string, { sig: string; section: ParsedSection; sources: string[] }>();
  for (const file of files) {
    for (const section of parseNrCombo(readFileSync(`${TEXT_DIR}/${file}`, 'utf8').split('\n'))) {
      const key = `${section.licenseKey}:${section.year}`;
      const sig = sigOf(section);
      const prior = seen.get(key);
      if (!prior) { seen.set(key, { sig, section, sources: [file] }); continue; }
      if (prior.sig !== sig) {
        throw new Error(`${key}: ${prior.sources.join(', ')} and ${file} state this draw differently`);
      }
      prior.sources.push(file);
    }
  }

  const licenses = Object.keys(LICENSE_META).map((key) => {
    const years: Record<string, unknown> = {};
    for (const [k, v] of [...seen.entries()].sort()) {
      if (!k.startsWith(`${key}:`)) continue;
      const { section, sources } = v;
      // Lowest points last, matching how FWP prints them.
      const levels = section.levels.slice().sort((a, b) => b.min - a.min).map((l: ParsedLevel) => ({
        label: l.label, min: l.min, max: l.max, apps: l.apps, drawn: l.drawn,
        ...(l.drawnDerived ? { drawnDerived: true } : {}),
        ...(l.inferred ? { inferred: true } : {}),
        pct: l.pct,
      }));
      years[String(section.year)] = {
        totalApps: section.totalApps,
        ...(section.totalMismatch ? { totalMismatch: section.totalMismatch } : {}),
        sources,
        levels,
      };
    }
    if (!Object.keys(years).length) throw new Error(`no sections found for ${key}`);
    return { key, ...LICENSE_META[key], years };
  });

  const out = {
    source: {
      agency: 'Montana Fish, Wildlife & Parks',
      listing: 'https://myfwp.mt.gov/fwpPub/drawingStatistics',
      file: (id: number) => `https://myfwp.mt.gov/getRepositoryFile?objectID=${id}`,
      objectIds: { '2022-biggame': 106434, '2022-deer': 106435, 2023: 108844, 2024: 110887, 2025: 112967, 2026: 116132 },
      retrieved: '2026-11-10',
      note: 'Built by scripts/mt_build_nr_combo.ts from the report text in data/mt/nr-combo-text/. Each report restates the previous year; where two reports cover the same draw they agree exactly, and the build fails if they ever stop agreeing.',
    },
    pointsCap: 3,
    licenses,
  };
  // The `file` helper above is for humans reading the script, not for the JSON.
  delete (out.source as { file?: unknown }).file;

  writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);
  const draws = [...seen.keys()].length;
  console.error(`wrote ${OUT}: ${licenses.length} licenses, ${draws} draws from ${files.length} reports`);
}

build();
