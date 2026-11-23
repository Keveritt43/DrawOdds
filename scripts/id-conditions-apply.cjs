/** Apply only a reviewed candidate plan whose generated files and existing targets are unchanged. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const [buildArg,expected]=process.argv.slice(2);if(!buildArg||!/^[a-f0-9]{64}$/.test(expected||''))throw Error('Usage: node scripts/id-conditions-apply.cjs <build directory> <review plan sha256>');
const base=process.cwd(),dir=path.resolve(buildArg),planFile=path.join(dir,'review-plan.json'),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');if(hash(planFile)!==expected)throw Error('Review plan digest changed');
const plan=JSON.parse(fs.readFileSync(planFile,'utf8'));if(!Array.isArray(plan.outputs)||plan.outputs.length!==306)throw Error('Unexpected candidate output count');
const allowed=/^(data\/id-(?:conditions|fire|fire-grid|fire-provenance|visual-meta)\.json|public\/idaho-drought-\d{8}\.json|public\/idaho-(?:fire|visual)\/[A-Za-z0-9-]+\.(?:png|json))$/;
for(const o of plan.outputs){if(!allowed.test(o.file))throw Error(`Unexpected output ${o.file}`);const src=path.join(dir,o.file),target=path.join(base,o.file),current=fs.existsSync(target)?hash(target):null;if(hash(src)!==o.sha256||current!==o.baseSha256)throw Error(`Source or target changed: ${o.file}`);}
for(const o of plan.outputs){const target=path.join(base,o.file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(dir,o.file),target);}
console.log(`Applied ${plan.outputs.length} reviewed files; verify tests and diff before committing.`);
