'use client';
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ReferenceLine, ErrorBar } from 'recharts';
import { Frame, HarvestChart, SuccessChart } from './Charts';
import { myOdds, POOL_LABEL, type PointOdds, type PoolOdds, type CoPool, type HarvestYear } from '@/lib/coHunt';
const grid = 'rgba(128,128,128,.2)';
const colors = {res:'#2a78d6',nr:'#eb6834'};
export function CoCreepChart({po}:{po:PointOdds}) {
  const rows = [...po.history.map(h=>({year:h.year, res:po.pools.res?.history.find(x=>x.year===h.year)?.eff ?? null,nr:po.pools.nr?.history.find(x=>x.year===h.year)?.eff ?? null})),
    {year:po.projYear,res:po.pools.res?.proj?.eff ?? null,nr:po.pools.nr?.proj?.eff ?? null}].sort((a,b)=>a.year-b.year).map(r=>({...r,
      resRange:r.year===po.projYear&&po.pools.res?.proj?[r.res!-po.pools.res.proj.lo,po.pools.res.proj.hi-r.res!]:[0,0],
      nrRange:r.year===po.projYear&&po.pools.nr?.proj?[r.nr!-po.pools.nr.proj.lo,po.pools.nr.proj.hi-r.nr!]:[0,0]}));
  return <div><Frame title="Point creep"><LineChart data={rows} margin={{top:5,right:16,left:0,bottom:0}}><CartesianGrid stroke={grid} vertical={false}/><XAxis dataKey="year" tickLine={false} tickFormatter={y=>y===po.projYear?`${y}*`:String(y)}/><YAxis width={44} tickLine={false} domain={[0,'auto']} allowDecimals={false}/><Tooltip formatter={(v: unknown,n:string)=>[typeof v==='number'?v.toFixed(1):String(v),n]}/><Legend/>{(['res','nr'] as const).map(k=><Line key={k} name={k==='res'?'Resident':'Nonresident'} dataKey={k} stroke={colors[k]} strokeWidth={2.5} strokeDasharray={k==='nr'?'6 4':undefined} dot={{r:3}}><ErrorBar dataKey={`${k}Range`} width={5} strokeWidth={2}/></Line>)}</LineChart></Frame><p className="small muted">*{po.projYear} conservative scenario range. Effective points: 6 points with 60% drawing = 6.4. Missing years stay blank.</p></div>;
}
export function CoOddsPointsChart({P,po,pool,mode,myPoints}:{P:PoolOdds|undefined;po:PointOdds;pool:CoPool;mode:'proj'|'last';myPoints:number|null}) {
  const max=Math.min(40,Math.max(3,...(P?.levels.map(x=>x[0])??[]),myPoints??0)+(mode==='proj'?2:0));
  const data=Array.from({length:max+1},(_,points)=>({points,odds:mode==='last'&&!P?.levels.some(l=>l[0]===points)?null:myOdds(P,points,mode,po.year,pool)?.odds??null}));
  return <div><Frame title="Draw odds at each point level"><LineChart data={data} margin={{top:5,right:10,left:0,bottom:0}}><CartesianGrid stroke={grid} vertical={false}/><XAxis dataKey="points" tickLine={false}/><YAxis width={44} tickLine={false} domain={[0,1]} tickFormatter={v=>`${Math.round(v*100)}%`}/><Tooltip formatter={(v:unknown)=>[typeof v==='number'?`${(v*100).toFixed(1)}%`:'No applicants','Draw odds']} labelFormatter={v=>`${v} preference points`}/><Legend/><Line name={`${POOL_LABEL[pool]} odds`} dataKey="odds" stroke={colors.res} strokeWidth={2.5} dot={{r:3}}/>{myPoints!==null&&<ReferenceLine x={myPoints} stroke="#5b6168" strokeDasharray="4 4"/>}</LineChart></Frame><p className="small muted">{mode==='proj'?`${po.projYear} projected`:`${po.year} actual`} · {POOL_LABEL[pool]} · first choice. {myPoints!==null ? `Dashed line: your ${myPoints} points. ` : ''}Blank actual levels have no reported applicants.</p></div>;
}
export function CoHarvestCharts({rows}:{rows:HarvestYear[]}) {
  const data=rows.slice().sort((a,b)=>a.year-b.year).map(r=>({...r,success:r.hunters>0&&r.harvest<=r.hunters?r.harvest/r.hunters:null}));
  return <><SuccessChart data={data}/><HarvestChart data={data}/></>;
}
