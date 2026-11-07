/** Read cached official CPW recaps; write a supplemental point-level snapshot. Never connects to a database. */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { drawRows, SPECIAL_CODE } from './co-special-pdf';
import type { Item } from '../src/sync/co/recap';
import hunts from '../data/co-special-import.json';

const cache = process.argv[2];
if (!cache) throw Error('Pass the directory containing the cached official recap JSON files.');
const output: Record<string, { year: number; levels: number[][]; unassigned?: number[] }[]> = {};
for (const species of ['MOOSE', 'BIGHORN', 'GOAT']) {
  const expected = hunts.filter(h => h.species === species);
  for (const year of [...new Set(expected.flatMap(h => h.draws.map(d => d.year)))].sort()) {
    const pages: Item[][] = JSON.parse(readFileSync(join(cache, species + '-draw-' + year + '.json'), 'utf8'));
    const totals = drawRows(pages, year, species === 'BIGHORN' ? 'SHEEP' : species);
    let codes: string[] = [], levels = new Map<string, number[]>();
    const finish = () => {
      if (!codes.length) return;
      for (const code of codes) {
        const total = totals.get(code)!;
        const rows = [...levels.values()];
        const unassigned: number[] = [];
        for (let pool = 0; pool < 4; pool++) {
          const apps = total.apps[pool] - rows.reduce((n,r) => n+r[2+pool],0);
          const drew = total.drew[pool] - rows.reduce((n,r) => n+r[6+pool],0);
          if (apps < 0 || drew < 0 || drew > apps || rows.some(r => r[6+pool] > r[2+pool])) throw Error('Invalid point table: ' + code + ' ' + year);
          unassigned[pool] = apps; unassigned[pool+4] = drew;
        }
        // Preserve CPW's unassigned totals; never invent a point level to force reconciliation.
        if (expected.some(h => h.code === code)) (output[code] ??= []).push({ year, levels: rows, ...(unassigned.some(Boolean) ? {unassigned} : {}) });
      }
    };
    for (const page of pages) {
      const next = page.filter(i => i.x < 150 && SPECIAL_CODE.test(i.s.trim())).map(i => i.s.trim());
      if (next.length) { finish(); codes = next; levels = new Map(); }
      if (!codes.length) continue;
      // The preference and weighted-point columns identify first-choice rows on either side,
      // including continuation pages. Choices 2–4 have no point-level rows.
      for (const [side, x, weightedX, dataLo, dataHi] of [[0,118,153,175,310],[1,497,533,552,686]]) {
        for (const pref of page.filter(i => Math.abs(i.x - x) < 5 && /^[0-3]$/.test(i.s.trim()))) {
          const near = page.filter(i => Math.abs(i.y - pref.y) < 1.3).sort((a,b) => a.x - b.x);
          const w = near.find(i => Math.abs(i.x - weightedX) < 5 && /^\d+$/.test(i.s.trim()));
          if (!w) continue;
          const cells = near.filter(i => i.x >= dataLo && i.x < dataHi && /^(?:\d[\d,]*|-)$/.test(i.s.trim()));
          if (cells.length !== 4) throw Error('Expected four applicant pools: ' + codes[0] + ' ' + year);
          const p = Number(pref.s), weight = Number(w.s), key = p + ':' + weight;
          const row = levels.get(key) ?? [p, weight, 0, 0, 0, 0, 0, 0, 0, 0];
          if (row.slice(2 + side * 4, 6 + side * 4).some(Boolean)) throw Error('Repeated point row: ' + key);
          cells.forEach((cell,i) => { row[2 + side * 4 + i] = cell.s.trim() === '-' ? 0 : Number(cell.s.replaceAll(',', '')); });
          levels.set(key, row);
        }
      }
    }
    finish();
  }
}
for (const h of hunts.filter(h => h.species !== 'DESERT')) {
  if (output[h.code]?.length !== h.draws.length) throw Error('Missing point history: ' + h.code);
  output[h.code].sort((a,b) => b.year - a.year);
}
writeFileSync('data/co-special-points.json', JSON.stringify(output) + '\n');
console.log('Validated point-level histories for ' + Object.keys(output).length + ' hunts; ' + Object.values(output).flat().filter(d=>d.unassigned).length + ' tables retain unassigned CPW totals.');
