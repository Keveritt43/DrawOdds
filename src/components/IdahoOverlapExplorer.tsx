'use client';
import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import grids from '../../data/id-fire-grid.json';
import { idConditionsUnit } from '@/lib/idConditions';
import { onStyleReady } from '@/lib/basemap';
import { FIRE_PERIODS, type IdahoFirePeriod } from '@/lib/idFire';
import { idTerrainCategory, type OverlapOptions } from '@/lib/idFireMask';
import { FIRE_BANDS } from './IdahoConditionsCharts';
import { readExplorerView, writeExplorerView, type ExplorerView } from '@/lib/idExplorerView';
import visualMeta from '../../data/id-visual-meta.json';

type Grid={corners:number[][];width:number;height:number;pngSha256:string};
type Pixels={data:Uint8ClampedArray;width:number;height:number};
type Weather={drought:GeoJSON.FeatureCollection;station:{longitude:number;latitude:number}|null};
const gridByUnit=grids as Record<string,Grid>;
const EMPTY:GeoJSON.FeatureCollection={type:'FeatureCollection',features:[]};
const snowLegend=[['0.04–0.20','#80a5c0'],['0.20–0.39','#5f7eb5'],['0.39–0.98','#4448ab'],['0.98–2','#462ca7'],['2–3.9','#501490'],['3.9–5.9','#8722a4'],['5.9–9.8','#9b3394'],['9.8–20','#bd589a'],['20–30','#bd7290'],['30–39','#c38e96'],['39–79','#b39e99']];
const droughtLegend=[['D0 · Abnormally dry','#ffff00'],['D1 · Moderate','#fcd37f'],['D2 · Severe','#ffaa00'],['D3 · Extreme','#e60000'],['D4 · Exceptional','#730000']];
const terrainColors:Record<number,string>={1:'#35d5f0',2:'#bc85ff',3:'#397fff',4:'#ff72ba',5:'#5de4c0',6:'#e7afff',7:'#ffffff',8:'#35d5f0'};
const terrainLabels:Record<number,string>={1:'Remote',2:'Above 9,000 ft',3:'Remote + above 9,000 ft',4:'Steep',5:'Remote + steep',6:'Above 9,000 ft + steep',7:'All three conditions',8:'Selected fire period'};

/** One unit at a time. Fire, drought and a real station are independent dated overlays. */
export function IdahoOverlapExplorer({unit,sharedMap,open,onOpenChange}:{unit:string;sharedMap:maplibregl.Map|null;open:boolean;onOpenChange:(open:boolean)=>void}) {
 const grid=gridByUnit[unit],map=useRef<maplibregl.Map|null>(null);
 const [ready,setReady]=useState(false),[pixels,setPixels]=useState<Pixels|null>(null),[weather,setWeather]=useState<Weather|null>(null),[error,setError]=useState(''),[matched,setMatched]=useState<number|null>(null);
 const [showFire,setShowFire]=useState(true),[showDrought,setShowDrought]=useState(false),[showSnow,setShowSnow]=useState(false),[showSnowpack,setShowSnowpack]=useState(false);
 const [snowTime,setSnowTime]=useState<string|null>(null),[snowError,setSnowError]=useState(false);
 const [options,setOptions]=useState<OverlapOptions>({remote:false,high:false,steep:false,fire:'none',matchAll:false});
 const [saved,setSaved]=useState(false),[message,setMessage]=useState(''),[shareLink,setShareLink]=useState('');
 const applyView=(v:ExplorerView)=>{setShowFire(v.fire);setShowDrought(v.drought);setShowSnowpack(v.snowpack);setShowSnow(v.station);setOptions(v.terrain);};
 const view:ExplorerView={fire:showFire,drought:showDrought,snowpack:showSnowpack,station:showSnow,terrain:options};
 useEffect(()=>{const v=readExplorerView(window.location.search);if(v){applyView(v);onOpenChange(true);}else if(window.location.hash==='#terrain-overlap')onOpenChange(true);try{setSaved(!!localStorage.getItem('id-explorer:'+unit));}catch{setSaved(false);}},[unit,onOpenChange]);
 const saveView=()=>{try{localStorage.setItem('id-explorer:'+unit,writeExplorerView(view));setSaved(true);setMessage('View saved on this device.');}catch{setMessage('Could not save on this device.');}};
 const loadView=()=>{try{const v=readExplorerView(localStorage.getItem('id-explorer:'+unit)??'');if(!v)throw Error();applyView(v);setMessage('Saved view restored.');}catch{setMessage('Saved view is unavailable.');}};
 const shareView=async()=>{const u=new URL(window.location.href);const current=new URLSearchParams(writeExplorerView(view));for(const [key,value] of current)u.searchParams.set(key,value);u.hash='terrain-overlap';const link=u.toString();setShareLink(link);try{await navigator.clipboard.writeText(link);setMessage('Link copied.');}catch{setMessage('Copy the link below to share this view.');}};
 const hasTerrain=options.remote||options.high||options.steep||options.fire!=='none';
 const snow=idConditionsUnit(unit)?.snow;
 useEffect(()=>{
  if(!open||!grid||!sharedMap)return;
  setMatched(null);setError('');let cancelled=false;
  const m=sharedMap;
  map.current=m;
  const onError=(e:maplibregl.ErrorEvent)=>{const id=(e as {sourceId?:string}).sourceId;if(id==='noaa-snow')setSnowError(true);if(id==='wildfire')setError('The wildfire map layer is unavailable.');};
  onStyleReady(m,()=>{
   if(cancelled)return;
   m.addSource('noaa-snow',{type:'raster',tiles:['https://mapservices.weather.noaa.gov/raster/rest/services/snow/NOHRSC_Snow_Analysis/MapServer/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=256,256&format=png32&transparent=true&f=image&layers=show:7'],tileSize:256,attribution:'Snow: NOAA NOHRSC'});
   m.addLayer({id:'noaa-snow-layer',type:'raster',source:'noaa-snow',layout:{visibility:'none'},paint:{'raster-opacity':0.78,'raster-fade-duration':0}},'units-line');
   m.on('error',onError);
   m.addSource('drought',{type:'geojson',data:EMPTY});
   m.addLayer({id:'drought-fill',type:'fill',source:'drought',layout:{visibility:'none'},paint:{'fill-color':['match',['get','level'],0,'#ffff00',1,'#fcd37f',2,'#ffaa00',3,'#e60000',4,'#730000','#999'],'fill-opacity':0.38}},'units-line');
   m.addLayer({id:'drought-outline',type:'line',source:'drought',layout:{visibility:'none'},paint:{'line-color':['match',['get','level'],0,'#c7a900',1,'#df9d2a',2,'#e87900',3,'#c10000',4,'#730000','#999'],'line-width':1.2,'line-opacity':0.8}},'units-line');
   m.addSource('wildfire',{type:'image',url:`/idaho-visual/${encodeURIComponent(unit)}.png`,coordinates:grid.corners as [[number,number],[number,number],[number,number],[number,number]]});
   m.addLayer({id:'wildfire-fill',type:'raster',source:'wildfire',paint:{'raster-opacity':0.85,'raster-fade-duration':0}},'units-line');
   m.addSource('snow-station',{type:'geojson',data:EMPTY});
   m.addLayer({id:'snow-station-circle',type:'circle',source:'snow-station',layout:{visibility:'none'},paint:{'circle-radius':8,'circle-color':['case',['==',['get','percent'],-1],'#777',['<',['get','percent'],80],'#ef7d25',['<=',['get','percent'],120],'#7bbbe0','#1461a5'],'circle-stroke-color':'#fff','circle-stroke-width':2}});
   m.addLayer({id:'snow-station-label',type:'symbol',source:'snow-station',layout:{visibility:'none','text-field':['get','label'],'text-font':['Noto Sans Regular'],'text-size':12,'text-offset':[0,1.3],'text-anchor':'top','text-allow-overlap':true},paint:{'text-color':'#fff','text-halo-color':'#222','text-halo-width':2}});
   setReady(true);
  });
  const img=new Image();img.onload=()=>{if(cancelled)return;try {const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const ctx=c.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('Canvas unavailable');ctx.drawImage(img,0,0);setPixels({data:ctx.getImageData(0,0,c.width,c.height).data,width:c.width,height:c.height});} catch {setError('Could not read this unit’s terrain data.');}};
  img.onerror=()=>{if(!cancelled)setError('Could not load this unit’s terrain data.');};img.src=`/idaho-fire/${encodeURIComponent(unit)}.png`;
  void fetch(`/idaho-visual/${encodeURIComponent(unit)}.json`).then(r=>{if(!r.ok)throw Error('Map data unavailable');return r.json() as Promise<Weather>;}).then(data=>{if(!cancelled)setWeather(data);}).catch(()=>{if(!cancelled)setError('Drought and snow station map data are unavailable.');});
  return ()=>{cancelled=true;setReady(false);setPixels(null);setWeather(null);map.current=null;m.off('error',onError);for(const id of ['qualifying','snow-station-label','snow-station-circle','wildfire-fill','drought-outline','drought-fill','noaa-snow-layer'])if(m.getLayer(id))m.removeLayer(id);for(const id of ['qualifying','snow-station','wildfire','drought','noaa-snow'])if(m.getSource(id))m.removeSource(id);};
 },[open,unit,grid,sharedMap]);
 useEffect(()=>{
  const m=map.current;if(!ready||!m)return;
  m.setLayoutProperty('wildfire-fill','visibility',showFire?'visible':'none');
  m.setLayoutProperty('noaa-snow-layer','visibility',showSnowpack?'visible':'none');
  for(const id of ['drought-fill','drought-outline'])m.setLayoutProperty(id,'visibility',showDrought?'visible':'none');
  for(const id of ['snow-station-circle','snow-station-label'])m.setLayoutProperty(id,'visibility',showSnow?'visible':'none');
  m.setPaintProperty('drought-fill','fill-opacity',showFire?0.28:0.48);
 },[ready,showFire,showDrought,showSnow,showSnowpack]);
 useEffect(()=>{
  if(!showSnowpack)return;let cancelled=false;setSnowTime(null);setSnowError(false);
  const url='https://mapservices.weather.noaa.gov/raster/rest/services/snow/NOHRSC_Snow_Analysis/MapServer/6/query?where=1%3D1&outFields=idp_validtime&returnGeometry=false&f=json';
  void fetch(url,{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('NOAA unavailable');return r.json();}).then(data=>{const ms=data?.features?.[0]?.attributes?.idp_validtime;if(typeof ms!=='number'||!Number.isFinite(ms))throw Error('No valid time');if(!cancelled)setSnowTime(new Date(ms).toUTCString());}).catch(()=>{if(!cancelled)setSnowError(true);});
  return ()=>{cancelled=true;};
 },[showSnowpack]);
 useEffect(()=>{
  const m=map.current;if(!ready||!m||!weather)return;
  (m.getSource('drought') as maplibregl.GeoJSONSource).setData(weather.drought);
  const station=weather.station,reading=snow?.current;
  const point:GeoJSON.FeatureCollection=station && snow ? {type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Point',coordinates:[station.longitude,station.latitude]},properties:{label:`${snow.station} · ${reading?.percent==null?'median unavailable':`${reading.percent}% of median`}`,percent:reading?.percent??-1}}]} : EMPTY;
  (m.getSource('snow-station') as maplibregl.GeoJSONSource).setData(point);
 },[ready,weather,snow]);
 useEffect(()=>{
  const m=map.current;if(!ready||!m||!weather?.station||!showSnow||!grid)return;
  const s=weather.station;m.fitBounds([[Math.min(grid.corners[3][0],s.longitude),Math.min(grid.corners[3][1],s.latitude)],[Math.max(grid.corners[1][0],s.longitude),Math.max(grid.corners[1][1],s.latitude)]],{padding:36,duration:400});
 },[ready,weather,showSnow,grid]);
 useEffect(()=>{
  const m=map.current;if(!ready||!pixels||!grid||!m)return;
  const existing=m.getLayer('qualifying');if(!hasTerrain){if(existing)m.setLayoutProperty('qualifying','visibility','none');setMatched(null);return;}
  const canvas=document.createElement('canvas');canvas.width=pixels.width;canvas.height=pixels.height;const ctx=canvas.getContext('2d');if(!ctx){setError('Could not draw this unit’s terrain data.');return;}
  const result=ctx.createImageData(pixels.width,pixels.height);let count=0;
  for(let i=0;i<pixels.data.length;i+=4){const category=idTerrainCategory(pixels.data[i],pixels.data[i+1],pixels.data[i+2],options);if(!category)continue;count++;const color=terrainColors[category];result.data[i]=parseInt(color.slice(1,3),16);result.data[i+1]=parseInt(color.slice(3,5),16);result.data[i+2]=parseInt(color.slice(5,7),16);result.data[i+3]=180;}
  setMatched(count);ctx.putImageData(result,0,0);const url=canvas.toDataURL('image/png');
  const source=m.getSource('qualifying') as maplibregl.ImageSource|undefined;
  if(source){source.updateImage({url,coordinates:grid.corners as [[number,number],[number,number],[number,number],[number,number]]});m.setLayoutProperty('qualifying','visibility','visible');}
  else {m.addSource('qualifying',{type:'image',url,coordinates:grid.corners as [[number,number],[number,number],[number,number],[number,number]]});m.addLayer({id:'qualifying',type:'raster',source:'qualifying',paint:{'raster-opacity':0.9,'raster-fade-duration':0,'raster-resampling':'nearest'}},'units-line');}
 },[ready,pixels,grid,options,hasTerrain]);
 if(!grid)return <p className="small muted">The overlap map is not available for Unit {unit}.</p>;
 const selected=(options.remote?1:0)|(options.high?2:0)|(options.steep?4:0);
 const visibleCategories=selected ? Object.keys(terrainColors).map(Number).filter(n=>n<8 && (n&selected)===n && (!options.matchAll || n===selected)) : options.fire!=='none'?[8]:[];
 return <details id="terrain-overlap" open={open} onToggle={e=>onOpenChange(e.currentTarget.open)} style={{margin:'16px 0'}}>
  <summary className="explore-summary"><b>Explore terrain, wildfire and conditions</b></summary>
  <p className="small muted">Choose map layers and terrain conditions for Unit {unit}. Dates and sources appear beside each layer. NOAA snowpack is a separate current-service layer.</p>
  <div style={{display:'flex',gap:8,flexWrap:'wrap',margin:'10px 0'}}><button type="button" className="btn small" onClick={saveView}>Save view</button>{saved && <button type="button" className="btn small" onClick={loadView}>Restore saved view</button>}<button type="button" className="btn small" onClick={shareView}>Share view</button></div>
  <p className="small muted">Save one view per unit on this device, or share a link to its layer and terrain settings. Map position is not saved.</p>
  {message && <p className="small" role="status">{message}</p>}{shareLink && <label className="small">Share link <input readOnly value={shareLink} onFocus={e=>e.currentTarget.select()} style={{width:'100%'}} /></label>}
  <b>Map layers</b><div className="checks2" style={{display:'flex',flexWrap:'wrap',gap:12,margin:'8px 0'}}>
   <label><input type="checkbox" checked={showFire} onChange={e=>setShowFire(e.target.checked)}/> Wildfire age · mapped {visualMeta.fireCoverage} (snapshot {visualMeta.snapshot})</label>
   <label><input type="checkbox" checked={showDrought} onChange={e=>setShowDrought(e.target.checked)}/> Drought categories · {visualMeta.droughtDate}</label>
   <label><input type="checkbox" checked={showSnowpack} onChange={e=>setShowSnowpack(e.target.checked)}/> Snowpack (NOAA model)</label>
   <label><input type="checkbox" checked={showSnow} onChange={e=>setShowSnow(e.target.checked)}/> Nearby snow station · {snow?.current?.date ?? 'no recent reading'}</label>
  </div>
  {showFire && <div className="small" aria-label="Wildfire age legend" style={{display:'flex',flexWrap:'wrap',gap:10,margin:'8px 0'}}>{FIRE_BANDS.map(b=><span key={b.id}><span aria-hidden="true" style={{display:'inline-block',background:b.color,width:12,height:12,marginRight:4}}/>{b.label}</span>)}</div>}
  {showDrought && <div className="small" aria-label="Drought category legend" style={{display:'flex',flexWrap:'wrap',gap:10,margin:'8px 0'}}>{droughtLegend.map(([label,color])=><span key={label}><span aria-hidden="true" style={{display:'inline-block',background:color,width:12,height:12,marginRight:4}}/>{label}</span>)}</div>}
  {showSnowpack && <><p className="small muted">NOAA modeled snow water equivalent, inches of water in the snow, approximately 1-km resolution. {snowError ? 'The NOAA layer or its timestamp is unavailable; check NOAA before relying on this layer.' : snowTime ? `Model valid: ${snowTime}.` : 'Checking model timestamp…'} The layer is supplied by NOAA and can be delayed or unavailable; 0–0.04 in is transparent; transparent areas may have little snow or no data. Wildfire and drought are drawn above it.</p><div className="small" aria-label="Modeled snow water equivalent legend in inches" style={{display:'flex',flexWrap:'wrap',gap:10,margin:'8px 0'}}>{snowLegend.map(([label,color])=><span key={label}><span aria-hidden="true" style={{display:'inline-block',background:color,width:12,height:12,marginRight:4}}/>{label} in</span>)}</div></>}
  {showSnow && <p className="small muted">{snow ? `${snow.station} · ${snow.current ? `${snow.current.date}: ${snow.current.swe} in snow water equivalent${snow.current.percent===null?' (median unavailable)':` · ${snow.current.percent}% of the same-date 1991–2020 median`}`:'no recent reading'}. The dot is a station, not snow cover across the unit. Orange is below 80% of median, light blue is 80–120%, dark blue is above 120%, and gray means the median is unavailable.`:'No active Idaho snow station within 35 miles of the unit center.'}</p>}
  <b>Find overlapping terrain</b><div className="checks2" style={{display:'flex',flexWrap:'wrap',gap:12,margin:'8px 0'}}>
   <label><input type="checkbox" checked={options.remote} onChange={e=>setOptions({...options,remote:e.target.checked})}/> More than 1 mile from mapped roads and motorized trails</label>
   <label><input type="checkbox" checked={options.high} onChange={e=>setOptions({...options,high:e.target.checked})}/> Above 9,000 feet</label>
   <label><input type="checkbox" checked={options.steep} onChange={e=>setOptions({...options,steep:e.target.checked})}/> Slope 20° or steeper</label>
  </div>
  {selected!==0 && <label style={{display:'block',margin:'8px 0'}}><input type="checkbox" checked={!!options.matchAll} onChange={e=>setOptions({...options,matchAll:e.target.checked})}/> Show only areas matching every selected terrain condition</label>}
  <label style={{display:'block'}}>Within a mapped wildfire perimeter <select value={options.fire} onChange={e=>setOptions({...options,fire:e.target.value as IdahoFirePeriod|'none'})}><option value="none">Any fire history</option>{(Object.entries(FIRE_PERIODS) as [IdahoFirePeriod,string][]).map(([k,label])=><option key={k} value={k}>{label}</option>)}</select></label>
  {hasTerrain && <><div className="small" aria-label="Terrain conditions legend" style={{display:'flex',flexWrap:'wrap',gap:10,margin:'8px 0'}}>{visibleCategories.map(id=><span key={id}><span aria-hidden="true" style={{display:'inline-block',background:terrainColors[id],width:12,height:12,marginRight:4}}/>{terrainLabels[id]}</span>)}</div><p className="small muted">Colors show selected conditions on public-managed cells; combined labels show where conditions overlap. {options.matchAll?'Only areas meeting every selected terrain condition are shown.':'Areas meeting any selected terrain condition are shown.'} {options.fire!=='none'?'The selected fire period restricts the displayed terrain. ':''}Terrain colors are translucent and can blend with fire, drought or snow colors underneath.</p></>}
  {error && <p role="alert">{error}</p>}
  {open && hasTerrain && matched===0 && <p className="small muted">No mapped areas meet these settings in this unit.</p>}
  <p className="small muted">Fire age colors show the most recent mapped perimeter in each 100-m cell, not habitat productivity. Fire records cover {visualMeta.fireCoverage} and are incomplete; perimeters can include unburned and private land. Drought shows {visualMeta.droughtDate} categories; its colors can be covered by wildfire. The <a href="https://mapservices.weather.noaa.gov/raster/rest/services/snow/NOHRSC_Snow_Analysis/MapServer">NOAA snow layer</a> is modeled water in snow, not measured snow depth; the station is a separate point observation. Routes and public management do not establish legal access. Check current maps, closures and regulations.</p>
 </details>;
}
