'use client';
import {useEffect,useState} from 'react';
import maplibregl from 'maplibre-gl';
import grids from '../../data/id-fire-grid.json';
import visualMeta from '../../data/id-visual-meta.json';
import {FIRE_PERIODS,type IdahoFirePeriod} from '@/lib/idFire';
import {idTerrainCategory,type OverlapOptions} from '@/lib/idFireMask';
import {onStyleReady} from '@/lib/basemap';
import {idConditionsUnit} from '@/lib/idConditions';
import {readExplorerView,writeExplorerView,type ExplorerView} from '@/lib/idExplorerView';
import {FIRE_BANDS} from './IdahoConditionsCharts';
import {IdahoStateConditions} from './IdahoStateConditions';
import {StateProvider} from './StateContext';
import {UnitMap} from './UnitMap';

type Grid={corners:number[][]};
type Pixels={data:Uint8ClampedArray;width:number;height:number};
const gridByUnit=grids as Record<string,Grid>;
const colors:Record<number,string>={1:'#35d5f0',2:'#bc85ff',3:'#397fff',4:'#ff72ba',5:'#5de4c0',6:'#e7afff',7:'#ffffff',8:'#35d5f0'};
const labels:Record<number,string>={1:'Remote',2:'Above 9,000 ft',3:'Remote + above 9,000 ft',4:'Steep',5:'Remote + steep',6:'Above 9,000 ft + steep',7:'All three conditions',8:'Selected fire period'};
const corners=(grid:Grid)=>grid.corners as [[number,number],[number,number],[number,number],[number,number]];

/** One map, with each unit's own clipped raster and terrain mask. */
export function IdahoZoneExplorerMap({zone,units,returnHunt,nr,savedUnits,signedIn}:{zone:string;units:string[];returnHunt:string|null;nr:boolean;savedUnits:string[];signedIn:boolean}) {
 const [map,setMap]=useState<maplibregl.Map|null>(null),[open,setOpen]=useState(false),[ready,setReady]=useState(false);
 const [pixels,setPixels]=useState<Record<string,Pixels>>({}),[failed,setFailed]=useState<string[]>([]),[matched,setMatched]=useState<number|null>(null);
 const [showFire,setShowFire]=useState(true),[showStations,setShowStations]=useState(false),[stationError,setStationError]=useState(false),[saved,setSaved]=useState(false),[message,setMessage]=useState(''),[shareLink,setShareLink]=useState('');
 const [options,setOptions]=useState<OverlapOptions>({remote:false,high:false,steep:false,fire:'none',matchAll:false});
 const key=units.join(',');
 const view:ExplorerView={fire:showFire,drought:false,snowpack:false,station:showStations,terrain:options};
 const applyView=(v:ExplorerView)=>{setShowFire(v.fire);setShowStations(v.station);setOptions(v.terrain);};
 useEffect(()=>{const v=readExplorerView(window.location.search);if(v){applyView(v);setOpen(true);}else if(window.location.hash==='#terrain-overlap')setOpen(true);try{setSaved(!!localStorage.getItem('id-zone-explorer:'+zone));}catch{setSaved(false);}},[zone]);
 const save=()=>{try{localStorage.setItem('id-zone-explorer:'+zone,writeExplorerView(view));setSaved(true);setMessage('View saved on this device.');}catch{setMessage('Could not save on this device.');}};
 const restore=()=>{try{const v=readExplorerView(localStorage.getItem('id-zone-explorer:'+zone)??'');if(!v)throw Error();applyView(v);setMessage('Saved view restored.');}catch{setMessage('Saved view is unavailable.');}};
 const share=async()=>{const u=new URL(window.location.href);for(const [k,v] of new URLSearchParams(writeExplorerView(view)))u.searchParams.set(k,v);u.hash='terrain-overlap';setShareLink(u.toString());try{await navigator.clipboard.writeText(u.toString());setMessage('Link copied.');}catch{setMessage('Copy the link below to share this view.');}};
 const hasTerrain=options.remote||options.high||options.steep||options.fire!=='none';
 useEffect(()=>{
  if(!open||!map)return;
  let active=true;const names=key.split(',');setPixels({});setFailed(names.filter(u=>!gridByUnit[u]));setMatched(null);
  const fail=(u:string)=>{if(active)setFailed(old=>old.includes(u)?old:[...old,u]);};
  const onError=(e:maplibregl.ErrorEvent)=>{const id=(e as {sourceId?:string}).sourceId;if(id?.startsWith('zone-fire-'))fail(id.slice('zone-fire-'.length));};
  map.on('error',onError);
  onStyleReady(map,()=>{
   if(!active)return;
   const loads:Promise<[string,Pixels]|null>[]=[];
   for(const u of names){const grid=gridByUnit[u];if(!grid)continue;const id=`zone-fire-${u}`;
    map.addSource(id,{type:'image',url:`/idaho-visual/${encodeURIComponent(u)}.png`,coordinates:corners(grid)});
    map.addLayer({id,type:'raster',source:id,paint:{'raster-opacity':0.85,'raster-fade-duration':0}},'units-line');
    loads.push(new Promise(resolve=>{const img=new Image();img.onload=()=>{if(!active){resolve(null);return;}try{const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const ctx=c.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error();ctx.drawImage(img,0,0);resolve([u,{data:ctx.getImageData(0,0,c.width,c.height).data,width:c.width,height:c.height}]);}catch{fail(u);resolve(null);}};img.onerror=()=>{fail(u);resolve(null);};img.src=`/idaho-fire/${encodeURIComponent(u)}.png`;}));
   }
   setReady(true);
   void Promise.all(loads).then(results=>{if(active)setPixels(Object.fromEntries(results.filter((item):item is [string,Pixels]=>item!==null)));});
  });
  return ()=>{active=false;setReady(false);map.off('error',onError);for(const u of names)for(const id of [`zone-terrain-${u}`,`zone-fire-${u}`]){if(map.getLayer(id))map.removeLayer(id);if(map.getSource(id))map.removeSource(id);}for(const id of ['zone-station-label','zone-station-circle','id-weather-drought','id-weather-snow'])if(map.getLayer(id))map.removeLayer(id);for(const id of ['zone-station','id-weather-drought','id-weather-snow'])if(map.getSource(id))map.removeSource(id);};
 },[open,map,key]);
 useEffect(()=>{if(!ready||!map)return;for(const u of key.split(',')){const id=`zone-fire-${u}`;if(map.getLayer(id))map.setLayoutProperty(id,'visibility',showFire?'visible':'none');}},[ready,map,key,showFire]);
 useEffect(()=>{
  if(!ready||!map)return;let active=true;setStationError(false);
  if(!showStations){for(const id of ['zone-station-label','zone-station-circle'])if(map.getLayer(id))map.setLayoutProperty(id,'visibility','none');return;}
  void Promise.all(key.split(',').map(async u=>{const snow=idConditionsUnit(u)?.snow;if(!snow)return null;const r=await fetch(`/idaho-visual/${encodeURIComponent(u)}.json`);if(!r.ok)throw Error();const weather=await r.json() as {station:{longitude:number;latitude:number}|null};if(!weather.station)return null;return {snow,location:weather.station};})).then(items=>{
   if(!active)return;const seen=new Set<string>();const features:GeoJSON.Feature[]=[];
   for(const item of items){if(!item||seen.has(item.snow.station))continue;seen.add(item.snow.station);const reading=item.snow.current;features.push({type:'Feature',geometry:{type:'Point',coordinates:[item.location.longitude,item.location.latitude]},properties:{label:`${item.snow.station} · ${reading?.percent==null?'median unavailable':`${reading.percent}% of median`}`,percent:reading?.percent??-1}});}
   const data:GeoJSON.FeatureCollection={type:'FeatureCollection',features};const source=map.getSource('zone-station') as maplibregl.GeoJSONSource|undefined;
   if(source)source.setData(data);else{map.addSource('zone-station',{type:'geojson',data});map.addLayer({id:'zone-station-circle',type:'circle',source:'zone-station',paint:{'circle-radius':8,'circle-color':['case',['==',['get','percent'],-1],'#777',['<',['get','percent'],80],'#ef7d25',['<=',['get','percent'],120],'#7bbbe0','#1461a5'],'circle-stroke-color':'#fff','circle-stroke-width':2}});map.addLayer({id:'zone-station-label',type:'symbol',source:'zone-station',layout:{'text-field':['get','label'],'text-font':['Noto Sans Regular'],'text-size':12,'text-offset':[0,1.3],'text-anchor':'top'},paint:{'text-color':'#fff','text-halo-color':'#222','text-halo-width':2}});}
   for(const id of ['zone-station-label','zone-station-circle'])map.setLayoutProperty(id,'visibility','visible');
  }).catch(()=>{if(active)setStationError(true);});return ()=>{active=false;};
 },[ready,map,key,showStations]);
 useEffect(()=>{
  if(!ready||!map)return;let count=0;
  for(const u of key.split(',')){const id=`zone-terrain-${u}`,p=pixels[u],grid=gridByUnit[u];if(!hasTerrain){if(map.getLayer(id))map.setLayoutProperty(id,'visibility','none');continue;}if(!p||!grid)continue;
   const canvas=document.createElement('canvas');canvas.width=p.width;canvas.height=p.height;const ctx=canvas.getContext('2d');if(!ctx)continue;const output=ctx.createImageData(p.width,p.height);
   for(let i=0;i<p.data.length;i+=4){const category=idTerrainCategory(p.data[i],p.data[i+1],p.data[i+2],options);if(!category)continue;count++;const color=colors[category];output.data[i]=parseInt(color.slice(1,3),16);output.data[i+1]=parseInt(color.slice(3,5),16);output.data[i+2]=parseInt(color.slice(5,7),16);output.data[i+3]=180;}
   ctx.putImageData(output,0,0);const url=canvas.toDataURL('image/png');const source=map.getSource(id) as maplibregl.ImageSource|undefined;
   if(source){source.updateImage({url,coordinates:corners(grid)});map.setLayoutProperty(id,'visibility','visible');}else{map.addSource(id,{type:'image',url,coordinates:corners(grid)});map.addLayer({id,type:'raster',source:id,paint:{'raster-opacity':0.9,'raster-fade-duration':0,'raster-resampling':'nearest'}},'units-line');}
  }
  setMatched(hasTerrain && Object.keys(pixels).length===key.split(',').length ? count : null);
 },[ready,map,key,pixels,options,hasTerrain]);
 const selected=(options.remote?1:0)|(options.high?2:0)|(options.steep?4:0);
 const visible=selected?Object.keys(colors).map(Number).filter(n=>n<8&&(n&selected)===n&&(!options.matchAll||n===selected)):options.fire!=='none'?[8]:[];
 return <StateProvider code="ID">
  <details id="terrain-overlap" open={open} onToggle={e=>setOpen(e.currentTarget.open)} style={{margin:'16px 0'}}>
   <summary className="explore-summary"><b>Explore terrain, wildfire and conditions</b></summary>
   <p className="small muted">Choose layers and terrain conditions across the {zone} zone. Public-managed terrain cells are shown for each mapped unit.</p>
   <div style={{display:'flex',gap:8,flexWrap:'wrap',margin:'10px 0'}}><button type="button" className="btn small" onClick={save}>Save view</button>{saved&&<button type="button" className="btn small" onClick={restore}>Restore saved view</button>}<button type="button" className="btn small" onClick={share}>Share view</button></div>
   <p className="small muted">Save one view per zone on this device, or share its terrain settings. Map position and snowpack or drought settings are not saved.</p>
   {message&&<p role="status" className="small">{message}</p>}{shareLink&&<label className="small">Share link <input readOnly value={shareLink} onFocus={e=>e.currentTarget.select()} style={{width:'100%'}}/></label>}
   <b>Map layers</b><div style={{margin:'8px 0'}}><label><input type="checkbox" checked={showFire} onChange={e=>setShowFire(e.target.checked)}/> Wildfire age · mapped {visualMeta.fireCoverage} (snapshot {visualMeta.snapshot})</label></div>
   {showFire&&<div className="small" aria-label="Wildfire age legend" style={{display:'flex',flexWrap:'wrap',gap:10,margin:'8px 0'}}>{FIRE_BANDS.map(b=><span key={b.id}><span aria-hidden="true" style={{display:'inline-block',background:b.color,width:12,height:12,marginRight:4}}/>{b.label}</span>)}</div>}
   {open&&<IdahoStateConditions map={ready?map:null} before={`zone-fire-${units.find(u=>!!gridByUnit[u])??''}`}/>}
   <label style={{display:'block',margin:'8px 0'}}><input type="checkbox" checked={showStations} onChange={e=>setShowStations(e.target.checked)}/> Nearby snow stations</label>
   {showStations&&<p className="small muted">Stations are point observations near unit centers, not snow cover across the zone. Orange is below 80% of the same-date median, light blue 80–120%, dark blue above 120%, and gray means the median is unavailable.{stationError?' Some station data could not be loaded.':''}</p>}
   <p><b>Find overlapping terrain</b></p><div className="checks2" style={{display:'flex',flexWrap:'wrap',gap:12,margin:'8px 0'}}>
    <label><input type="checkbox" checked={options.remote} onChange={e=>setOptions({...options,remote:e.target.checked})}/> More than 1 mile from mapped roads and motorized trails</label>
    <label><input type="checkbox" checked={options.high} onChange={e=>setOptions({...options,high:e.target.checked})}/> Above 9,000 feet</label>
    <label><input type="checkbox" checked={options.steep} onChange={e=>setOptions({...options,steep:e.target.checked})}/> Slope 20° or steeper</label>
   </div>
   {selected!==0&&<label style={{display:'block',margin:'8px 0'}}><input type="checkbox" checked={!!options.matchAll} onChange={e=>setOptions({...options,matchAll:e.target.checked})}/> Show only areas matching every selected terrain condition</label>}
   <label style={{display:'block'}}>Within a mapped wildfire perimeter <select value={options.fire} onChange={e=>setOptions({...options,fire:e.target.value as IdahoFirePeriod|'none'})}><option value="none">Any fire history</option>{(Object.entries(FIRE_PERIODS) as [IdahoFirePeriod,string][]).map(([k,label])=><option key={k} value={k}>{label}</option>)}</select></label>
   {hasTerrain&&<><div className="small" aria-label="Terrain conditions legend" style={{display:'flex',flexWrap:'wrap',gap:10,margin:'8px 0'}}>{visible.map(id=><span key={id}><span aria-hidden="true" style={{display:'inline-block',background:colors[id],width:12,height:12,marginRight:4}}/>{labels[id]}</span>)}</div><p className="small muted">Colors show selected conditions on public-managed cells; combined colors show overlap. {options.matchAll?'Only areas meeting every selected terrain condition are shown.':'Areas meeting any selected terrain condition are shown.'} Terrain colors are translucent and can blend with other layers.</p></>}
   {failed.length>0&&<p role="alert">Map data could not be loaded for units {failed.join(', ')}. Other units are still shown.</p>}
   {hasTerrain&&Object.keys(pixels).length+failed.length<units.length&&<p className="small muted">Loading terrain data for the zone…</p>}
   {hasTerrain&&matched===0&&failed.length===0&&<p className="small muted">No mapped areas meet these settings in this zone.</p>}
   <p className="small muted">Fire colors show the most recent mapped perimeter in each 100-m cell, not habitat productivity. Fire records cover {visualMeta.fireCoverage} and are incomplete; perimeters can include unburned and private land. Public management and mapped routes do not establish legal access. Check current maps, closures and regulations.</p>
  </details>
  <div className="card" style={{padding:0,overflow:'hidden',minHeight:480}}><UnitMap nr={nr} focusUnits={units} returnHunt={returnHunt} savedUnits={savedUnits} signedIn={signedIn} height="480px" bare onMapReady={setMap} exploring={open}/></div>
 </StateProvider>;
}
