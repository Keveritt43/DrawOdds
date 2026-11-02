/**
 * Turns IDFG's nonresident general tag PDFs into the data files the "nrdraw" sync step reads
 * (IDFG's file server refuses automated downloads, so these are committed to the repo):
 *
 *   pdftotext -layout nonresident-draw-data-and-descriptions_2026-draw.pdf draw.txt
 *   npx tsx scripts/nr-pdf-to-json.ts draw draw.txt 2026 > data/nr-draw-2026.json
 *   pdftotext -layout seasons-rules-big-game-supplemental-proclamation-2027.pdf supp.txt
 *   npx tsx scripts/nr-pdf-to-json.ts quotas supp.txt 2027 > data/nr-quotas-2027.json
 */
import { readFileSync } from 'node:fs';
import { parseDrawLines, parseQuotaLines } from '../src/sync/core/nrdraw';
import { loadElkZones } from '../src/sync/core/datafiles';

const [kind, file, year] = process.argv.slice(2);
const lines = readFileSync(file, 'utf8').split('\n');
if (kind === 'draw') {
  const rows = parseDrawLines(lines, loadElkZones().zones.map((z) => z.zone));
  const n = (k: string) => rows.filter((r) => r.kind === k).length;
  console.error(`${n('ELK')} elk, ${n('RD')} regular deer, ${n('WD')} white-tailed deer rows`);
  console.log(JSON.stringify({ year: Number(year), source: file.split('/').pop(), rows }, null, 1));
} else if (kind === 'quotas') {
  const q = parseQuotaLines(lines);
  console.error(`${[...q.keys()].filter((c) => c.startsWith('ELK')).length} elk codes, ${[...q.keys()].filter((c) => !c.startsWith('ELK')).length} deer codes`);
  console.log(JSON.stringify({ year: Number(year), source: file.split('/').pop(), quotas: Object.fromEntries(q) }, null, 1));
} else {
  console.error('usage: nr-pdf-to-json.ts draw|quotas <pdftotext -layout output> <year>');
  process.exit(1);
}
