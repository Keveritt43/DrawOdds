'use client';
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { idConditionsUnit } from '@/lib/idConditions';
import meta from '../../data/id-visual-meta.json';

export const FIRE_BANDS = [
 {id:'4', label:'2026 · this year', color:'#db302f'},
 {id:'3', label:'2022–2025 · 1–4 years', color:'#f18b1c'},
 {id:'2', label:'2016–2021 · 5–10 years', color:'#2ca759'},
 {id:'1', label:'2010–2015 · 11–16 years', color:'#edcc38'},
] as const;
type FireSummary={ageBands:Record<string,{percent:number|null;acres:number}>};
const byUnit=meta.units as unknown as Record<string,FireSummary>;
const tipStyle={background:'#fff',color:'#202020',border:'1px solid #aaa',borderRadius:4};
/** Charts use their stated denominators and observation dates; unavailable values are not plotted as zero. */
export function IdahoConditionsCharts({unit}:{unit:string}) {
 const fire=byUnit[unit],x=idConditionsUnit(unit);
 const snow=x?.snow ? Object.entries(x.snow.history).sort(([a],[b])=>Number(a)-Number(b)).map(([year,v])=>({year:year,percent:v.percent, inches:v.swe})) : [];
 const snowMax=Math.max(100,...snow.map(v=>v.percent??0));
 const drought=x ? [...Object.entries(x.drought).filter(([year])=>year!=='current').sort(([a],[b])=>Number(a)-Number(b)).map(([year,value])=>({year:year,percent:value})),{year:'Nov 2026',percent:x.drought.current}] : [];
 return <div style={{marginTop:18}}>
  <h3>Conditions over time</h3>
  <section aria-label="Wildfire age as a percentage of the unit">
   <b>Mapped fire age · share of unit</b>
   <p className="small muted">Most recent mapped fire per cell; 2010–2026 records, whole unit including private land. Sampled at about 100 m; older or unrecorded fires are not included.</p>
   {fire ? <div style={{display:'grid',gap:7}}>{FIRE_BANDS.map(({id,label,color})=>{const row=fire.ageBands[id];return <div key={id} style={{display:'grid',gridTemplateColumns:'minmax(140px, 1fr) 2fr minmax(46px,auto)',alignItems:'center',gap:8}}><span className="small">{label}</span><span style={{height:12,background:'rgba(128,128,128,.22)',borderRadius:5,overflow:'hidden'}}><span style={{display:'block',width:`${row?.percent??0}%`,height:'100%',background:color}} /></span><span className="small">{row?.percent===null||!row?'—':`${row.percent}%`}</span></div>})}</div> : <p>Not available.</p>}
  </section>
  <section aria-label="Snow compared with historical median" style={{marginTop:20}}><b>April 1 snow · % of station median</b>
   <p className="small muted">{x?.snow ? `${x.snow.station}; water in the snow, not snow depth. The dashed line is the station’s 1991–2020 median for April 1. Missing years are not shown.`:'No nearby station in this snapshot.'}</p>
   {snow.some(v=>v.percent!==null) && <div style={{width:'100%',height:225}}><ResponsiveContainer width="100%" height={200}><BarChart data={snow} margin={{top:8,right:8,left:0,bottom:0}}><CartesianGrid stroke="rgba(128,128,128,.2)" vertical={false}/><XAxis dataKey="year" tick={{fontSize:11}} tickLine={false} tickFormatter={v=>`’${String(v).slice(-2)}`}/><YAxis domain={[0,Math.ceil(snowMax/50)*50]} width={45} tick={{fontSize:11}} tickFormatter={v=>`${v}%`}/><Tooltip contentStyle={tipStyle} formatter={(v:unknown)=>[`${v}% of median`,'April 1 SWE']}/><ReferenceLine y={100} stroke="#777" strokeDasharray="4 3"/><Bar dataKey="percent" fill="#4395cf" name="% of median" /></BarChart></ResponsiveContainer><div className="small muted" style={{textAlign:"center"}}>Year</div></div>}
  </section>
  <section aria-label="Drought history in the unit" style={{marginTop:20}}><b>Moderate or worse drought · % of unit</b>
   <p className="small muted">Last Tuesday of September in each year, plus November 17, 2026. These are weekly snapshots, not annual averages or forecasts.</p>
   {x && <div style={{width:'100%',height:225}}><ResponsiveContainer width="100%" height={200}><BarChart data={drought} margin={{top:8,right:8,left:0,bottom:0}}><CartesianGrid stroke="rgba(128,128,128,.2)" vertical={false}/><XAxis dataKey="year" tick={{fontSize:10}} tickLine={false} tickFormatter={v=>String(v).startsWith("Nov") ? "Nov ’26" : `’${String(v).slice(-2)}`}/><YAxis domain={[0,100]} width={45} tick={{fontSize:11}} tickFormatter={v=>`${v}%`}/><Tooltip contentStyle={tipStyle} formatter={(v:unknown)=>[`${v}% of unit`,'D1 or worse']}/><Bar dataKey="percent" fill="#d77936" name="D1 or worse" /></BarChart></ResponsiveContainer><div className="small muted" style={{textAlign:"center"}}>Year</div></div>}
  </section>
 </div>;
}
