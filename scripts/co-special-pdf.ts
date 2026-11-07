
import { readFileSync } from 'node:fs';
import type { Item } from '../src/sync/co/recap';

export const SPECIAL_CODE = /^[MSG][MFEP](?:\d{3}|[SG]\d{2})[A-Z0-9]\d[A-Z]$|^C[MEF]S\d{2}[A-Z0-9]\d[A-Z]$/;
const integer = /^\d[\d,]*$/;
const n = (s: string) => Number(s.replaceAll(',', ''));
export const readItems = (name: string): Item[][] => JSON.parse(readFileSync('out/special/'+name+'.json','utf8'));
const at = (p: Item[], y: number, left=0, right=1000, tolerance=2.7) => p.filter(i=>Math.abs(i.y-y)<tolerance&&i.x>=left&&i.x<right).sort((a,b)=>a.x-b.x);
const line = (items: Item[]) => items.map(i=>i.s.trim()).join(' ');
const nums = (items: Item[]) => items.map(i=>i.s.trim()).filter(s=>integer.test(s)).map(n);
export type DrawRow = { year:number; quota:number|null; issued:number|null; apps:number[]; drew:number[]; shared?:string[]; page:number };

export function drawRows(pages: Item[][], year: number, reportSpecies: string) {
  const matches = new Map<string, DrawRow>();
  const header = pages.flat().find(i=>i.s.includes(' Post Draw Report'));
  if (header?.s.trim() !== year+' Primary '+reportSpecies+' Post Draw Report') throw Error('Draw header mismatch: '+header?.s);
  const printedCount = pages.flatMap(p=>p.filter(i=>i.s.trim()==='Total Hunt Codes').map(i=>nums(at(p,i.y,i.x+30,200))[0]))[0];
  let group: {codes:Item[]; quota:number|null; page:number; apps?:number[]; drew?:number[]; appsAll?:number; issued:(number|null)[]} | null = null;
  function finish(){
    if(!group)return;
    const g=group;
    for(const [i,c] of g.codes.entries()){
      const code=c.s.trim();
      if(matches.has(code))throw Error('Repeated code '+code);
      if(!g.apps||!g.drew||g.apps.length!==6||g.drew.length!==6||g.apps.slice(0,4).reduce((a,b)=>a+b,0)!==g.appsAll||
        g.drew.some((d,i)=>d>g.apps![i]) || g.quota===null || g.issued[i]===null) throw Error('Unbalanced recap '+JSON.stringify({year,code,...g,codes:undefined}));
      if(g.codes.length===1 && g.drew.reduce((a,b)=>a+b,0)>g.issued[i]!) throw Error('First-choice draws exceed all issues '+code);
      matches.set(code,{year,quota:g.quota,issued:g.issued[i],apps:g.apps.slice(0,4),drew:g.drew.slice(0,4),...(g.codes.length>1?{shared:g.codes.map(c=>c.s.trim())}:{}),page:g.page});
    }
  }
  for(const [i,p] of pages.entries()){
    const codes=p.filter(q=>q.x<150&&SPECIAL_CODE.test(q.s.trim()));
    if(codes.length){
      finish();
      const orig=p.find(q=>q.s.trim()==='Original'&&q.x>440&&q.x<510);
      const quota=orig?p.filter(q=>q.y>orig.y+4&&q.y<orig.y+21&&q.x>455&&q.x<500).find(q=>integer.test(q.s.trim())):null;
      group={codes,quota:quota?n(quota.s):null,page:i+1,issued:codes.map(c=>nums(at(p,c.y,0,c.x))[0]??null)};
    }
    if(!group)continue;
    for(const total of p.filter(q=>q.s.trim()==='Total Choice 1')){
      if(total.x>180&&total.x<240) group.appsAll=nums(at(p,total.y,total.x+25,330))[0];
      else if(total.x>45&&total.x<120) group.apps=nums(at(p,total.y,155,420));
      else if(total.x>430&&total.x<505) group.drew=nums(at(p,total.y,542,800));
    }
  }
  finish();
  if(printedCount!==undefined && printedCount!==matches.size) throw Error('Recap has '+matches.size+' codes; expected '+printedCount);
  if(!matches.size)throw Error('No codes');
  return matches;
}

export type HarvestRow = {year:number; hunters:number; harvest:number; days:number|null; basis:'code'};
export function harvestRows(pages:Item[][],year:number){
  const map=new Map<string,HarvestRow>();
  const title=pages[0].slice(0,20).map(i=>i.s.trim()).join(' ');
  if(!title.includes(String(year))||!/by Hunt Code/i.test(title))return map;
  for(const p of pages) for(const c of p.filter(i=>SPECIAL_CODE.test(i.s.trim()))){
    const code=c.s.trim(), [male,female,harvest,days,hunters,pct]=at(p,c.y,c.x+10).map(i=>i.s.trim());
    if([male,female,harvest,hunters].some(v=>!integer.test(v??''))||
      n(male)+n(female)!==n(harvest)||n(harvest)>n(hunters)||
      Math.abs(Number(pct?.replace('%',''))-(n(hunters)?n(harvest)/n(hunters)*100:0))>.51||
      !pct?.endsWith('%')||map.has(code))throw Error('Invalid harvest '+JSON.stringify({year,code,male,female,harvest,days,hunters,pct}));
    map.set(code,{year,harvest:n(harvest),hunters:n(hunters),days:Number.isFinite(Number(days))?Math.round(Number(days)*n(hunters)):null,basis:'code'});
  }
  return map;
}

const DATE = /([A-Za-z]{3,9})\.?\s*(\d{1,2})\s*[–−-]\s*(?:([A-Za-z]{3,9})\.?\s*)?(\d{1,2})(?!\d)/g;
const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
export function spans(text:string){
  return [...text.matchAll(DATE)].flatMap(([,a,d,b,e])=>{
    const ma=MONTHS.indexOf(a.slice(0,3).toLowerCase())+1,mb=b?MONTHS.indexOf(b.slice(0,3).toLowerCase())+1:ma;
    if(!ma||!mb)return [];
    const iso=(m:number,day:string)=>String(m>=7?2026:2027)+'-'+String(m).padStart(2,'0')+'-'+day.padStart(2,'0');
    const open=iso(ma,d),close=iso(mb,e);
    return open<=close && [open,close].every(s=>Number.isFinite(Date.parse(s))&&new Date(s).toISOString().startsWith(s))?[{open,close}]:[];
  });
}
type Span = ReturnType<typeof spans>[number];
type BrochureRow = { code:string; page:number; dates:Span[]; units:string[]; printed:string };
export function brochure(pages:Item[][], moose:boolean){
  const result:BrochureRow[]=[];
  for(const [page,p] of pages.entries()){
    if(moose ? page<67||page>70 : page<10||page>13)continue;
    const found=p.flatMap(i=>{
      const s=i.s.trim();
      if(!/^[MCGS]-[MFE]-[SG]?\d{2,3}-/.test(s))return [];
      const next=line(at(p,i.y,i.x,i.x+42,1.3)).replace(/[\s-]/g,'');
      const code=/^[MCGS][MFE][SG]?\d{2,3}[A-Z0-9]\d[A-Z]/.exec(next)?.[0];
      return code&&SPECIAL_CODE.test(code)?[{...i,code}]:[];
    });
    for(const c of found){
      const late=moose&&c.code[5]==='L', choice=moose&&c.code.endsWith('X');
      let unitLo:number,unitHi:number,dateLo:number,dateHi:number;
      if(moose&&page===67){unitLo=c.x-185;unitHi=c.x-138;dateLo=c.x-138;dateHi=c.x;}
      else if(moose&&page===70){unitLo=c.x>400?315:20;unitHi=unitLo+38;dateLo=unitHi;dateHi=c.x-28;}
      else if(moose){const col=c.x<200?0:c.x<400?1:2;unitLo=[39,232,424][col];dateLo=(page===68||c.y<410?[97,288,481]:[107,299,490])[col]-2;unitHi=dateLo;dateHi=c.x;}
      else {unitLo=c.x<300?19:314;dateLo=(page===12?(c.x<300?94:397):(c.x<300?108:402))-2;unitHi=dateLo;dateHi=c.x-30;}
      const col=found.filter(k=>Math.abs(k.x-c.x)<15).sort((a,b)=>a.y-b.y);
      const datesOn=(y:number)=>spans(line(at(p,y,dateLo,dateHi,1.6)));
      const dateYs=[...new Set(p.filter(q=>q.x>=dateLo&&q.x<dateHi&&Math.abs(q.y-c.y)<(late?21:10)).map(q=>Math.round(q.y)))];
      const rank=dateYs.map(y=>({y,d:datesOn(y),dist:Math.abs(y-c.y)})).filter(x=>x.d.length).sort((a,b)=>a.dist-b.dist);
      const own=rank.filter(x=>!col.some(k=>k!==c&&Math.abs(k.y-x.y)+.5<x.dist));
      let dates=late ? [...new Map(own.flatMap(x=>x.d).map(d=>[d.open,d])).values()].sort((a,b)=>a.open.localeCompare(b.open)) : own[0]?.d??[];
      if(choice&&dates.length===1&&page===70)dates=[];
      const nearUnits=at(p,c.y,unitLo,unitHi,2.8);
      let printed=line(nearUnits);
      if(moose&&!/\b\d{1,3}\b/.test(printed.replace(/1\/4/g,'')) || moose&&/Except within/.test(printed)){
        const prev=col.filter(k=>k.y<c.y).at(-1)?.y??c.y-15;
        const candidates=p.filter(k=>k.y>Math.max(prev+2,c.y-12)&&k.y<c.y+8&&k.x>=unitLo&&k.x<unitHi&&/^\d{1,3}(?:,|$)/.test(k.s.trim()));
        if(candidates.length)printed=line(at(p,candidates.sort((a,b)=>Math.abs(a.y-c.y)-Math.abs(b.y-c.y))[0].y,unitLo,unitHi));
      }
      const clean=printed.split(/Except|mile|See|only|south|north|within/i)[0].replace(/■|^New\s*/g,'').trim();
      const units=moose ? ([...(/^(\d{1,3}(?:\s*[, &]+\s*\d{1,3})*)\b/.exec(clean)?.[1] ?? '').matchAll(/\d{1,3}/g)].map(m=>String(Number(m[0])))) :
        [...new Set([...clean.matchAll(/\b([SG])0?(\d{1,2})\b/g)].map(m=>m[1]+m[2].padStart(2,'0')))];
      result.push({code:c.code,page:page+1,dates,units,printed});
    }
  }
  return result;
}
