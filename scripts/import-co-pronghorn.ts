/** One-time insert-only import of the reviewed local CPW pronghorn snapshot. No network or agency sync. */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { db } from '../src/sync/core/context';
import { recapRow, buildCoSummaries } from '../src/sync/co';
import type { RecapHunt } from '../src/sync/co/recap';
import type { Prisma } from '@prisma/client';

const EXPECTED = '2b2a46f4cc39c379f85cc0fba221aea4be5a650c5aa9cface62f1f49204dccbb';
type Entry = { species: string; year: number; kind: string; url: string; count: number; data: any };
async function main() {
  const bytes = await readFile('data/co-pronghorn-import.json');
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (hash !== EXPECTED) throw Error('Snapshot hash does not match the reviewed input');
  const entries = JSON.parse(bytes.toString()) as Entry[];
  if (entries.length !== 38 || entries.some(e=>e.species !== 'PRONGHORN')) throw Error('Unexpected catalog');
  const draws: Prisma.DrawRecapCreateManyInput[] = [];
  const reports: Prisma.StateReportCreateManyInput[] = [];
  const add = (e: Entry, kind: string, data: object, id = `CO|${kind}|PRONGHORN|${e.year}`) => reports.push({id,state:'CO',species:'PRONGHORN',kind,year:e.year,source:e.url,data});
  for (const e of entries) {
    if (e.kind === 'draw') {
      if (e.data.year !== e.year || e.data.species !== e.species || e.data.hunts.length !== e.count) throw Error('Invalid primary recap');
      for (const h of e.data.hunts as RecapHunt[]) {
        if (h.problems.length) {
          if (!(e.year === 2022 && h.code === 'AP99999P' && h.problems.length === 1 && h.problems[0] === 'pre nr: point rows add to 23198, Total Choice 1 says 23199')) throw Error(`Unreviewed discrepancy: ${h.code}`);
          add(e, 'draw-exception', h); continue;
        }
        draws.push(recapRow(h, 'PRONGHORN'));
      }
      add(e, 'draw-parser', {parserVersion:2,codes:e.count,sourceException:e.year === 2022 ? 'AP99999P' : null});
    } else if (e.kind === 'secondary') {
      if (e.data.hunts.length !== e.count || e.data.hunts.some((h: RecapHunt)=>h.problems.length)) throw Error('Invalid secondary recap');
      add(e, 'secondary', {hunts:e.data.hunts,parserVersion:2});
    } else if (e.kind === 'drawn-out' || e.kind === 'otc-sales') add(e, e.kind, {rows:e.data});
    else if (e.kind === 'harvest') {
      if (e.data.byCode.length) add(e, 'harvest-code', e.data.byCode);
      else add(e, 'harvest-unit', {...e.data.byUnit,parserVersion:3});
    } else if (e.kind === 'population') {
      if (e.data.year !== e.year || e.data.species !== 'PRONGHORN' || e.data.herds.length !== 28) throw Error('Invalid population report');
      add(e, 'population', e.data);
    } else if (e.kind === 'regs') add(e, 'pronghorn-regs', e.data);
    else throw Error(`Unexpected kind ${e.kind}`);
  }
  reports.push({id:'CO|pronghorn-import|snapshot',state:'CO',species:'PRONGHORN',kind:'pronghorn-import',year:2026,source:'reviewed local CPW snapshot',data:{sha256:hash}});
  console.log(JSON.stringify({hash, reports:reports.length, drawRows:draws.length, writeScope:'new CO PRONGHORN rows only', apply:process.argv.includes('--apply')}));
  if (!process.argv.includes('--apply')) return;
  const foreignDigest = async () => JSON.stringify(await db.$queryRaw`SELECT md5(COALESCE(jsonb_agg(to_jsonb(s) ORDER BY id)::text,'[]')) AS digest FROM "HuntSummary" s WHERE state <> 'CO' OR species <> 'PRONGHORN'`);
  const before = await foreignDigest();
  const [existingDraws,existingReports,existingSummaries] = await Promise.all([
    db.drawRecap.count({where:{state:'CO',species:'PRONGHORN'}}),
    db.stateReport.count({where:{state:'CO',species:'PRONGHORN'}}),
    db.huntSummary.count({where:{state:'CO',species:'PRONGHORN'}}),
  ]);
  if (existingSummaries) throw Error('Colorado pronghorn summaries already exist; refusing to overwrite');
  if (existingDraws || existingReports) {
    const marker = await db.stateReport.findUnique({where:{id:'CO|pronghorn-import|snapshot'}});
    if (existingDraws !== draws.length || existingReports !== reports.length || (marker?.data as {sha256?:string})?.sha256 !== hash)
      throw Error('Existing Colorado pronghorn rows do not match this reviewed import; refusing to overwrite');
    console.log('Resuming summary creation for the previously imported snapshot.');
  } else {
    await db.$transaction(async tx => {
      await tx.drawRecap.createMany({data:draws});
      await tx.stateReport.createMany({data:reports});
    }, {timeout:180000});
  }
  const result = await buildCoSummaries('PRONGHORN');
  if (result.status === 'ERROR' || result.rows < 250) throw Error(`Summary generation failed: ${JSON.stringify(result)}`);
  if (before !== await foreignDigest()) throw Error('Non-pronghorn summaries changed during import; investigate');
  console.log('[PRONGHORN_IMPORT_SUCCESS]',JSON.stringify({rows:result.rows,details:result.details,foreignSummariesUnchanged:true}));
}
main().catch(e=>{console.error('[PRONGHORN_IMPORT_FAILED]',e);process.exitCode=1}).finally(()=>db.$disconnect());
