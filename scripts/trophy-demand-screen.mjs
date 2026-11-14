// Exploratory screen only. The owner reviews any proposed additions before they become scoring rules.
// A one-SD screen is descriptive, not a statistical significance test or a measure of trophy size.
import { readFileSync } from 'node:fs';

for (const state of ['wa','ut','mt','wy']) {
  const data = JSON.parse(readFileSync(`data/${state}/hunts.json`, 'utf8'));
  const waCounts=state==='wa' ? Object.fromEntries(['DEER','ELK'].map(sp=>[sp,JSON.parse(readFileSync(`out/trophy-demand/wa-${sp.toLowerCase()}-2025-official.json`,'utf8')).rows])) : null;
  const waHistory=state==='wa' ? JSON.parse(readFileSync('data/wa/source/permit-tables-2021-2026.json','utf8')).rows.filter(r=>r.year===2025) : [];
  const normal=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const historicalDay=s=>{
    const m=/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z.]*\s+(\d{1,2})/i.exec(s||'');
    if(!m)return null;
    const month=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(m[1].toLowerCase());
    return Math.round((Date.UTC(2001,month,Number(m[2]))-Date.UTC(2001,0,1))/86400000);
  };
  const daysApart=(a,b)=>{if(a===null||b===null)return null;const d=Math.abs(a-b);return Math.min(d,365-d);};
  const waMatch=h=>{
    if(h.units.length!==1 || !/^\d{3}$/.test(h.units[0]))return null;
    const matches=waHistory.filter(r=>r.name && r.area && r.species.toUpperCase()===h.species && r.category===h.huntCategory &&
      normal(r.tag)===normal(h.tagRequired) && normal(h.name).startsWith(normal(r.name)) &&
      new RegExp(`^GMU\\s*${h.units[0]}$`,'i').test(r.area.trim()) &&
      normal(waCounts?.[h.species]?.[String(r.choice)]?.name)===normal(r.name));
    if(matches.length===1)return matches[0];
    // Multiple seasons in one unit need a stable number and nearby start date as well as the
    // complete identity above. Otherwise the observation is unknown, not another hunt's count.
    const stable=matches.filter(r=>String(r.choice)===String(h.tagCode));
    const current=h.openDate ? historicalDay(new Date(`${h.openDate}T00:00:00Z`).toLocaleString('en-US',{month:'short',day:'numeric',timeZone:'UTC'})) : null;
    const distance=stable.length===1 ? daysApart(current,historicalDay(stable[0].dates)) : null;
    return stable.length===1 && distance!==null && distance<=10 ? stable[0] : null;
  };
  const groups = new Map();
  for (const original of data.hunts) {
    // WDFW's individual-hunt report uses its reported total applicants; do not mix it with
    // pamphlet-derived summaries whose count population or year can differ.
    const matched=state==='wa' ? waMatch(original) : null;
    const official=matched ? waCounts?.[original.species]?.[String(matched.choice)] : null;
    if(state==='wa' && (!official || original.oddsLastYear!==2025))continue;
    const h=state==='wa' ? {...original,appsLast:official.applicants,sourceCode:String(matched.choice)} : original;
    const deerText=`${h.deerType||''} ${h.description||''} ${h.takeMethod||''} ${h.name||''}`;
    if (!['DEER','ELK'].includes(h.species) || h.type !== 'CONTROLLED' || !['ANTLERED','EITHER'].includes(h.antlerClass) || h.youthOnly || h.privateOnly || h.units.length !== 1 || !Number.isFinite(h.appsLast) || !Number.isInteger(h.oddsLastYear) || (h.species==='DEER' && /white.?tail/i.test(deerText) && !/mule/i.test(deerText))) continue;
    if (['ut','mt'].includes(state) && (!Number.isFinite(h.resAppsLast) || !Number.isFinite(h.nrAppsLast))) continue;
    if (state==='wa' && !/^\d{3}$/.test(h.units[0])) continue; // permit-area codes are not GMUs
    const category = h.huntCategory || h.description;
    if (!category || /disabil|youth|master hunter|65\+|65 years/i.test(category)) continue;
    const key = `${h.species}|${h.oddsLastYear}|eligible controlled hunts`;
    const group = groups.get(key) || [];
    group.push(h); groups.set(key, group);
  }
  for (const [key, rows] of groups) {
    // Small comparison groups are too unstable for this screening threshold.
    if (rows.length < 20) continue;
    const mean = rows.reduce((sum,h)=>sum+h.appsLast,0)/rows.length;
    const sd = Math.sqrt(rows.reduce((sum,h)=>sum+(h.appsLast-mean)**2,0)/rows.length);
    const candidates = rows.filter(h=>h.appsLast > mean+sd)
      .sort((a,b)=>b.appsLast-a.appsLast)
      .map(h=>({unit:h.units[0],hunt:h.name,code:h.tagCode,...(h.sourceCode && h.sourceCode!==h.tagCode ? {sourceCode:h.sourceCode} : {}),applications:h.appsLast}));
    console.log(JSON.stringify({state:state.toUpperCase(),group:key,n:rows.length,mean,sd,threshold:mean+sd,candidates}));
  }
}

// Wyoming's bundled reports expose resident first-choice applicants and nonresident preference-pool
// applicants separately; the latter combines regular and special pools. Do not add them to each other
// or to random-pool applications. Preference-point cutoffs are screened separately, never as odds.
{
  const data=JSON.parse(readFileSync('data/wy/hunts.json','utf8'));
  const groups=new Map();
  for (const h of data.hunts) {
    if (!['DEER','ELK'].includes(h.species) || h.type!=='CONTROLLED' || h.antlerClass==='ANTLERLESS' || h.privateOnly || h.youthOnly || h.units.length!==1 || /WHITE.?TAIL/i.test(h.description||'')) continue;
    const key=`${h.species}|${h.oddsLastYear}|eligible controlled hunts`;
    const group=groups.get(key)||[];group.push(h);groups.set(key,group);
  }
  for (const [group,rows] of groups) for (const measure of ['resAppsLast','nrAppsLast','observedPrefCutoff']) {
    const value=h=>{
      if(measure!=='observedPrefCutoff')return h[measure];
      const levels=(h.pointOdds?.pools?.regular?.pref?.rows || []).filter(r=>Number.isFinite(r[3]) && r[3]>=0 && r[1]>0).map(r=>r[3]);
      return levels.length ? Math.min(...levels) : null;
    };
    const present=rows.filter(h=>Number.isFinite(value(h)));
    if (present.length<20) continue;
    const mean=present.reduce((n,h)=>n+value(h),0)/present.length;
    const sd=Math.sqrt(present.reduce((n,h)=>n+(value(h)-mean)**2,0)/present.length);
    const candidates=present.filter(h=>value(h)>mean+sd).sort((a,b)=>value(b)-value(a))
      .map(h=>({unit:h.units[0],hunt:h.name,code:h.tagCode,value:value(h)}));
    console.log(JSON.stringify({state:'WY',group,measure,n:present.length,mean,sd,threshold:mean+sd,candidates}));
  }
}

// Colorado reports are read-only local research artifacts from trophy-co-recap.ts. The three-digit
// code is a hunt-code component, not a verified complete unit list. Shared pools cannot be attributed
// to an individual code and are left out. Adult resident and nonresident point cutoffs stay separate.
for (const species of ['deer','elk']) {
  let data;
  try { data=JSON.parse(readFileSync(`out/trophy-demand/co-${species}-2026.json`,'utf8')); }
  catch { continue; }
  let summaries;
  try { summaries=JSON.parse(readFileSync(`out/trophy-demand/co-${species}-hunt-units.json`,'utf8')); }
  catch { continue; }
  const byCode=new Map(summaries.filter(h=>h.Code && h.Units).map(h=>[h.Code,h]));
  const groups=new Map();
  for (const h of data.hunts) {
    if (h.problems.length || (h.sharedCodes?.length ?? 0)>1 || !/^[DE][ME]\d{3}[A-Z0-9]\d[A-Z]$/.test(h.code) || h.code.slice(2,5)==='999') continue;
    const summary=byCode.get(h.code);
    // Only attribute a count to a unit where the current hunt summary identifies exactly one unit.
    if (!summary || summary.Units.trim().split(/\s+/).length!==1) continue;
    h.unit=summary.Units.trim();
    const key='eligible controlled hunts';
    const group=groups.get(key)||[]; group.push(h); groups.set(key,group);
  }
  for (const [group,rows] of groups) for (const measure of ['applications','res_points','nr_points']) {
    const value=h=>{
      if (measure==='applications') return h.apps?.[0]?.[0];
      const pool=measure==='res_points'?'res':'nr', c=h.cutoff?.[pool];
      if (!c || !(h.preTotals?.[0]?.[pool==='res'?0:1]>0)) return null;
      if (Number.isFinite(c.points)) return c.points;
      // Later-choice/leftover means first-choice applicants in this pool all drew; none drawn stays unknown.
      return c.choice>1 || c.leftover ? 0 : null;
    };
    const present=rows.filter(h=>Number.isFinite(value(h)));
    if (present.length<20) continue;
    const mean=present.reduce((n,h)=>n+value(h),0)/present.length;
    const sd=Math.sqrt(present.reduce((n,h)=>n+(value(h)-mean)**2,0)/present.length);
    const candidates=present.filter(h=>value(h)>mean+sd).sort((a,b)=>value(b)-value(a))
      .map(h=>({code:h.code,unit:h.unit,value:value(h)}));
    console.log(JSON.stringify({state:'CO',species:species.toUpperCase(),year:data.year,group,measure,n:present.length,mean,sd,threshold:mean+sd,candidates}));
  }
}

// Read-only Idaho public CSV exports, filtered to adult antlered controlled hunts. These exports
// do not contain all season restrictions, so every resulting candidate still needs hunt-level review.
for (const species of ['deer','elk']) {
  let rows;
  try { rows=JSON.parse(readFileSync(`out/trophy-demand/id-${species}-2026.json`,'utf8')); }
  catch { continue; }
  const groups=new Map();
  for (const h of rows) {
    if (h.Type!=='Controlled' || !h.Units || /\s/.test(h.Units.trim()) || h['All 1st-choice applicants']==='' || h['Draw year']==='' || /white.?tail/i.test(h['Deer type']||'')) continue;
    const apps=Number(h['All 1st-choice applicants']);
    if (!Number.isFinite(apps)) continue;
    const key=`${h['Draw year']}|eligible controlled hunts`;
    const group=groups.get(key)||[];group.push({...h,apps});groups.set(key,group);
  }
  for (const [group,items] of groups) {
    if (items.length<20) continue;
    const mean=items.reduce((sum,h)=>sum+h.apps,0)/items.length;
    const sd=Math.sqrt(items.reduce((sum,h)=>sum+(h.apps-mean)**2,0)/items.length);
    const candidates=items.filter(h=>h.apps>mean+sd).sort((a,b)=>b.apps-a.apps)
      .map(h=>({unit:h.Units,hunt:h['Hunt / tag'],applications:h.apps}));
    console.log(JSON.stringify({state:'ID',species:species.toUpperCase(),group,n:items.length,mean,sd,threshold:mean+sd,candidates}));
  }
}
