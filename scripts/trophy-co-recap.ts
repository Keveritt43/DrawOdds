/** Read-only research: parse official reports locally; never imports a sync runner or writes the database. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { DRAW_RECAPS, resolvePdf } from '../src/sync/co/manifest';
import { pdfItems } from '../src/sync/core/pdf';
import { parseRecap } from '../src/sync/co/recap';

async function main() {
  mkdirSync('out/trophy-demand', {recursive:true});
  for (const report of DRAW_RECAPS.filter(x=>x.year === 2026)) {
    const getText = async (url:string, headers?:Record<string,string>) => {
      const response = await fetch(url,{headers});
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
      return response.text();
    };
    const url = await resolvePdf(report.url,getText);
    if (!url) throw new Error(`Cannot resolve ${report.url}`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    const parsed = parseRecap(await pdfItems(new Uint8Array(await response.arrayBuffer())));
    if (parsed.year !== report.year || parsed.species !== report.species) throw new Error('Unexpected report identity');
    const data = {source:report.url, year:parsed.year, species:parsed.species,
      hunts:parsed.hunts.map(h=>({code:h.code,sharedCodes:h.sharedCodes,apps:h.apps,cutoff:h.cutoff,preTotals:h.preTotals,problems:h.problems}))};
    writeFileSync(`out/trophy-demand/co-${report.species.toLowerCase()}-${report.year}.json`,JSON.stringify(data,null,2));
    console.log(`${report.species}: ${data.hunts.length} codes, ${data.hunts.filter(h=>h.problems.length).length} with parser warnings`);
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
