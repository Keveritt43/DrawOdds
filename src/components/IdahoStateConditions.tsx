'use client';
import { useEffect, useState } from 'react';
import type { Map as MlMap } from 'maplibre-gl';

const SNOW='https://mapservices.weather.noaa.gov/raster/rest/services/snow/NOHRSC_Snow_Analysis/MapServer';
const droughtColors=[['D0 · Dry','#ffff00'],['D1 · Moderate','#fcd37f'],['D2 · Severe','#ffaa00'],['D3 · Extreme','#e60000'],['D4 · Exceptional','#730000']];
const snowColors=[['0.04–0.20','#80a5c0'],['0.20–0.39','#5f7eb5'],['0.39–0.98','#4448ab'],['0.98–2','#462ca7'],['2–3.9','#501490'],['3.9–5.9','#8722a4'],['5.9–9.8','#9b3394'],['9.8–20','#bd589a'],['20–30','#bd7290'],['30–39','#c38e96'],['39–79','#b39e99']];
/** Dated USDM polygons and live NOAA model above the normal unit shading, below unit outlines. */
export function IdahoStateConditions({map}:{map:MlMap|null}) {
 const [drought,setDrought]=useState(false),[snow,setSnow]=useState(false),[valid,setValid]=useState<string|null>(null),[error,setError]=useState('');
 useEffect(()=>{
  if(!map)return;let live=true;
  if(!drought){if(map.getLayer('id-weather-drought'))map.setLayoutProperty('id-weather-drought','visibility','none');return;}
  const show=async()=>{
   if(!map.getSource('id-weather-drought')){
    const r=await fetch('/idaho-drought-20261117.json');if(!r.ok)throw Error('Drought layer unavailable');const data=await r.json();
    if(!live||!map.getStyle())return;
    if(!map.getSource('id-weather-drought'))map.addSource('id-weather-drought',{type:'geojson',data});
   }
   if(!map.getLayer('id-weather-drought'))map.addLayer({id:'id-weather-drought',type:'fill',source:'id-weather-drought',paint:{'fill-color':['match',['get','level'],0,'#ffff00',1,'#fcd37f',2,'#ffaa00',3,'#e60000',4,'#730000','#999'],'fill-opacity':0.58}},'units-line');
   map.setLayoutProperty('id-weather-drought','visibility','visible');
  };
  void show().catch(()=>{if(live)setError('Could not load the Idaho drought layer.');});
  return ()=>{live=false;};
 },[map,drought]);
 useEffect(()=>{
  if(!map)return;
  if(snow&&!map.getSource('id-weather-snow')){
   map.addSource('id-weather-snow',{type:'raster',tiles:[`${SNOW}/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=256,256&format=png32&transparent=true&f=image&layers=show:7`],tileSize:256,attribution:'Snow: NOAA NOHRSC'});
   map.addLayer({id:'id-weather-snow',type:'raster',source:'id-weather-snow',paint:{'raster-opacity':0.78,'raster-fade-duration':0}},map.getLayer('id-weather-drought')?'id-weather-drought':'units-line');
  }
  if(map.getLayer('id-weather-snow'))map.setLayoutProperty('id-weather-snow','visibility',snow?'visible':'none');
 },[map,snow]);
 useEffect(()=>{
  if(!snow)return;let live=true;setValid(null);
  void fetch(`${SNOW}/6/query?where=1%3D1&outFields=idp_validtime&returnGeometry=false&f=json`,{cache:'no-store'}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(j=>{const n=j?.features?.[0]?.attributes?.idp_validtime;if(typeof n!=='number'||!Number.isFinite(n))throw Error();if(live)setValid(new Date(n).toUTCString());}).catch(()=>{if(live)setError('NOAA snow timestamp unavailable; check NOAA for current conditions.');});
  return ()=>{live=false;};
 },[snow]);
 useEffect(()=>{
  if(!map)return;
  const fail=(event:{sourceId?:string})=>{if(event.sourceId==='id-weather-snow')setError('Could not load the NOAA snowpack layer.');};
  map.on('error',fail);return ()=>{map.off('error',fail);};
 },[map]);
 return <details style={{marginTop:8}}><summary><b>Snowpack &amp; drought layers</b></summary>
  <div className="land-toggles" style={{marginTop:6}}>
   <label><input type="checkbox" checked={snow} onChange={e=>{setError('');setSnow(e.target.checked);}}/> Snowpack · NOAA model</label>
   <label><input type="checkbox" checked={drought} onChange={e=>{setError('');setDrought(e.target.checked);}}/> Drought · Idaho</label>
  </div>
  {snow && <><p className="small muted" style={{margin:'6px 0'}}>NOAA modeled snow water equivalent (inches), about 1 km. {valid?`Valid ${valid}.`:'Checking NOAA timestamp.'} Transparent can mean little snow or missing data. Drought draws above snow.</p><div className="sma-key" aria-label="Snow water equivalent legend">{snowColors.map(([label,color])=><span key={label}><i className="sw" style={{background:color}}/> {label} in</span>)}</div></>}
  {drought && <><p className="small muted" style={{margin:'6px 0'}}>US Drought Monitor: November 17, 2026, within Idaho game units. Not a forecast.</p><div className="sma-key" aria-label="Drought category legend">{droughtColors.map(([label,color])=><span key={label}><i className="sw" style={{background:color}}/> {label}</span>)}</div></>}
  {error && <p className="small" role="alert">{error}</p>}
 </details>;
}
