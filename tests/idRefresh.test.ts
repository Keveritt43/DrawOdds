import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

test('reviewed refresh refuses changed targets before copying any output',()=>{
 const root=mkdtempSync(join(tmpdir(),'drawodds-refresh-test-'));const build=join(root,'build');
 const hash=(s:string|Buffer)=>createHash('sha256').update(s).digest('hex');
 try {
  const files=['data/id-conditions.json','data/id-fire.json','data/id-fire-grid.json','data/id-fire-provenance.json','data/id-visual-meta.json','public/idaho-drought-20261117.json'];
  for(let i=1;i<=100;i++)files.push(`public/idaho-fire/${i}.png`,`public/idaho-visual/${i}.png`,`public/idaho-visual/${i}.json`);
  const outputs=files.map(file=>{const dest=join(build,file);mkdirSync(dirname(dest),{recursive:true});writeFileSync(dest,'reviewed');return {file,sha256:hash('reviewed'),baseSha256:null};});
  const body=JSON.stringify({outputs});writeFileSync(join(build,'review-plan.json'),body);
  const changed=join(root,files[200]);mkdirSync(dirname(changed),{recursive:true});writeFileSync(changed,'user work');
  const result=spawnSync(process.execPath,[resolve('scripts/id-conditions-apply.cjs'),build,hash(body)],{cwd:root,encoding:'utf8'});
  assert.notEqual(result.status,0);assert.match(result.stderr,/Source or target changed/);assert.equal(readFileSync(changed,'utf8'),'user work');
  assert.throws(()=>readFileSync(join(root,files[0])));
 } finally {if(resolve(root).startsWith(resolve(tmpdir())+require('node:path').sep))rmSync(root,{recursive:true,force:true});}
});
