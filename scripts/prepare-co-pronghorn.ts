/** Download and inspect CPW pronghorn reports locally. Never connects to a database. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { PRONGHORN_REPORT_CATALOG, REGS, resolvePdf } from '../src/sync/co/manifest';
import { pdfItems } from '../src/sync/core/pdf';
import { parseRecap } from '../src/sync/co/recap';
import { parseHarvestByCode, parseHarvestByUnit, harvestYear } from '../src/sync/co/harvest';
import { parsePopulation } from '../src/sync/co/population';
import { parseDrawnOut, parseOtcSales } from '../src/sync/co/supplemental';
import { parseRegs } from '../src/sync/co/regs';
import population2022 from '../data/co-pronghorn-population-2022.json';

async function main() {
  await mkdir('out/pronghorn', { recursive: true });
  const entries = [...PRONGHORN_REPORT_CATALOG, {species:'PRONGHORN' as const,kind:'regs',year:REGS[0].year,url:REGS[0].url,label:'W-2 regulations'}];
  const result: unknown[] = [];
  let cursor = 0;
  async function worker() {
    while (cursor < entries.length) {
      const entry = entries[cursor++];
      const path = `out/pronghorn/${entry.kind}-${entry.year}.json`;
      try {
        let pages;
        try { pages = JSON.parse(await readFile(path, 'utf8')); }
        catch {
          const url = await resolvePdf(entry.url, async (u, headers) => {
            const r = await fetch(u, {headers}); if (!r.ok) throw Error(`HTTP ${r.status}: ${u}`); return r.text();
          });
          if (!url) throw Error('No PDF found');
          const response = await fetch(url); if (!response.ok) throw Error(`PDF HTTP ${response.status}`);
          pages = await pdfItems(new Uint8Array(await response.arrayBuffer()));
          await writeFile(path, JSON.stringify(pages));
        }
        let data: unknown, count = 0, notes: string[] = [];
        if (entry.kind === 'draw' || entry.kind === 'secondary') {
          const parsed = parseRecap(pages);
          if (parsed.year !== entry.year || parsed.species !== entry.species) throw Error('Species/year mismatch');
          const bad = parsed.hunts.filter(h => h.problems.length);
          notes = bad.map(h => `${h.code}: ${h.problems.join('; ')}`);
          data = parsed; count = parsed.hunts.length;
        } else if (entry.kind === 'harvest') {
          if (harvestYear(pages) !== entry.year) throw Error('Harvest year mismatch');
          const byCode = parseHarvestByCode(pages);
          const byUnit = parseHarvestByUnit(pages);
          data = { byCode, byUnit }; count = byCode.length;
          notes = [`legacy unit rows ${Object.values(byUnit.totals).reduce((n,v)=>n+(v?.length ?? 0),0)}`];
        } else if (entry.kind === 'population') {
          let p = parsePopulation(pages);
          if (entry.year === 2022 && !p.herds.length) p = population2022;
          data = p; count = p.herds.length;
          notes = [`report year ${p.year}, species ${p.species}, sum ${p.herds.reduce((n,h)=>n+h.estimate,0)}, printed ${p.total}`];
        } else if (entry.kind === 'drawn-out') { data = parseDrawnOut(pages); count = (data as unknown[]).length; }
        else if (entry.kind === 'otc-sales') { data = parseOtcSales(pages); count = (data as unknown[]).length; }
        else { const r = parseRegs(pages); data = r; count = Object.keys(r.codes).filter(x=>x.startsWith('A')).length; }
        result.push({...entry,count,notes,data});
        console.log(`${entry.kind} ${entry.year}: ${count} ${notes.join(' | ')}`);
      } catch (error) { result.push({...entry,error:String(error)}); console.error(`${entry.kind} ${entry.year}: ${error}`); }
    }
  }
  await Promise.all(Array.from({length:4},()=>worker()));
  await writeFile('out/pronghorn/staged.json', JSON.stringify(result));
  if (result.some((x) => (x as {error?: string}).error)) process.exitCode = 1;
}
main().catch(e => { console.error(e); process.exitCode = 1; });
