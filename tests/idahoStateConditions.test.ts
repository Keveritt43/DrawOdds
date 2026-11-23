import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync,readdirSync } from 'node:fs';

test('state drought overlay contains the dated unit polygons in severity order',()=>{
 const all=JSON.parse(readFileSync('public/idaho-drought-20261117.json','utf8'));
 const files=readdirSync('public/idaho-visual').filter(n=>n.endsWith('.json'));assert.equal(files.length,100);
 const count=files.reduce((n,f)=>n+JSON.parse(readFileSync(`public/idaho-visual/${f}`,'utf8')).drought.features.length,0);
 assert.equal(all.type,'FeatureCollection');assert.equal(all.features.length,count);
 const levels=all.features.map((f:{properties:{level:number}})=>f.properties.level);
 assert.ok(levels.every((v:number,i:number)=>v>=0&&v<=4&&(i===0||levels[i-1]<=v)));
});
