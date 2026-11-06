const fs=require('fs');const entries=JSON.parse(fs.readFileSync('out/pronghorn/staged.json'));
if(entries.length!==38)throw Error('Expected 38 sources');
for(const e of entries){
 if(e.error)throw Error(`${e.kind} ${e.year}: ${e.error}`);
 if(e.kind==='draw'||e.kind==='secondary'){
  const bad=e.data.hunts.filter(h=>h.problems.length);
  if(bad.some(h=>!(e.kind==='draw'&&e.year===2022&&h.code==='AP99999P'&&h.problems.length===1&&h.problems[0]==='pre nr: point rows add to 23198, Total Choice 1 says 23199')))throw Error(`unexpected invalid ${e.year} ${e.kind}`);
 } else if(e.kind==='population' && (e.data.herds.length!==28||e.data.year!==e.year||e.data.species!=='PRONGHORN'))throw Error(`population ${e.year}`);
 else if(e.kind==='regs')e.data.codes=Object.fromEntries(Object.entries(e.data.codes).filter(([k])=>k.startsWith('A')));
 if(!e.count && e.kind!=='harvest')throw Error(`empty ${e.kind} ${e.year}`);
}
entries.sort((a,b)=>a.kind.localeCompare(b.kind)||a.year-b.year);fs.writeFileSync('data/co-pronghorn-import.json',JSON.stringify(entries));console.log('bytes',fs.statSync('data/co-pronghorn-import.json').size);

