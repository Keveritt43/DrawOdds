'use client';
import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import grids from '../../data/id-fire-grid.json';
import { loadUnits } from '@/lib/unitData';
import { baseStyle, onStyleReady } from '@/lib/basemap';
import { FIRE_PERIODS, type IdahoFirePeriod } from '@/lib/idFire';
import { matchesIdOverlap, type OverlapOptions } from '@/lib/idFireMask';

type Grid={corners:number[][];width:number;height:number;pngSha256:string};
type Pixels={data:Uint8ClampedArray;width:number;height:number};
const gridByUnit=grids as Record<string,Grid>;

/** A single unit at a time: the browser intersects a compact, precomputed 100-m mask on the same grid. */
export function IdahoOverlapExplorer({unit}:{unit:string}) {
 const grid=gridByUnit[unit], mapEl=useRef<HTMLDivElement>(null), map=useRef<maplibregl.Map|null>(null);
 const [open,setOpen]=useState(false),[ready,setReady]=useState(false),[pixels,setPixels]=useState<Pixels|null>(null),[error,setError]=useState(''),[matched,setMatched]=useState<number|null>(null);
 const [options,setOptions]=useState<OverlapOptions>({remote:true,high:false,steep:false,fire:'none'});
 useEffect(()=>{
  if(!open||!grid||!mapEl.current)return;
  setMatched(null);setError('');
  let cancelled=false;
  const m=new maplibregl.Map({container:mapEl.current,style:baseStyle('satellite'),bounds:[grid.corners[3] as [number,number],grid.corners[1] as [number,number]],fitBoundsOptions:{padding:24}});
  map.current=m;m.addControl(new maplibregl.NavigationControl({showCompass:false}),'bottom-right');
  onStyleReady(m,()=>{
   if(cancelled)return;setReady(true);
   void loadUnits('ID').then(data=>{
    if(cancelled)return;
    const feature=data.fc.features.find(f=>f.properties.name===unit);
    if(!feature){setError('The unit boundary is unavailable on this map.');return;}
    m.addSource('unit-outline',{type:'geojson',data:{type:'FeatureCollection',features:[feature]} as unknown as GeoJSON.FeatureCollection});
    m.addLayer({id:'unit-outline-casing',type:'line',source:'unit-outline',paint:{'line-color':'#fff','line-width':4}});
    m.addLayer({id:'unit-outline',type:'line',source:'unit-outline',paint:{'line-color':'#4b263f','line-width':2}});
   }).catch(()=>{if(!cancelled)setError('The unit boundary is unavailable on this map.');});
  });
  const img=new Image();img.onload=()=>{
   if(cancelled)return;
   try {const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const ctx=c.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('Canvas unavailable');ctx.drawImage(img,0,0);setPixels({data:ctx.getImageData(0,0,c.width,c.height).data,width:c.width,height:c.height});}
   catch {setError('Could not read this unit’s map data.');}
  };img.onerror=()=>{if(!cancelled)setError('Could not load this unit’s map data.');};img.src=`/idaho-fire/${encodeURIComponent(unit)}.png`;
  return ()=>{cancelled=true;setReady(false);setPixels(null);map.current=null;m.remove();};
 },[open,unit,grid]);
 useEffect(()=>{
  const m=map.current;if(!ready||!pixels||!grid||!m)return;
  const canvas=document.createElement('canvas');canvas.width=pixels.width;canvas.height=pixels.height;const ctx=canvas.getContext('2d');if(!ctx){setError('Could not draw this unit’s map data.');return;}
  const result=ctx.createImageData(pixels.width,pixels.height);
  let count=0;for(let i=0;i<pixels.data.length;i+=4)if(matchesIdOverlap(pixels.data[i],pixels.data[i+1],pixels.data[i+2],options)){
   count++;result.data[i]=255;result.data[i+1]=115;result.data[i+2]=20;result.data[i+3]=175;
  }
  setMatched(count);ctx.putImageData(result,0,0);const url=canvas.toDataURL('image/png');
  const source=m.getSource('qualifying') as maplibregl.ImageSource|undefined;
  if(source)source.updateImage({url,coordinates:grid.corners as [[number,number],[number,number],[number,number],[number,number]]});
  else {m.addSource('qualifying',{type:'image',url,coordinates:grid.corners as [[number,number],[number,number],[number,number],[number,number]]});m.addLayer({id:'qualifying',type:'raster',source:'qualifying',paint:{'raster-opacity':0.75,'raster-fade-duration':0}},m.getLayer('unit-outline-casing')?'unit-outline-casing':undefined);}
 },[ready,pixels,grid,options]);
 if(!grid)return <p className="small muted">The overlap map is not available for Unit {unit}.</p>;
 return <details id="terrain-overlap" onToggle={e=>setOpen(e.currentTarget.open)} style={{margin:'16px 0'}}>
  <summary><b>Explore terrain and wildfire overlap</b></summary>
  <p className="small muted">Orange shows public-managed land in Unit {unit} meeting every selected condition. The map uses approximately 100-m cells and a November 2026 snapshot.</p>
  <div className="checks2" style={{display:'flex',flexWrap:'wrap',gap:12,margin:'8px 0'}}>
   <label><input type="checkbox" checked={options.remote} onChange={e=>setOptions({...options,remote:e.target.checked})} /> More than 1 mile from mapped roads and motorized trails</label>
   <label><input type="checkbox" checked={options.high} onChange={e=>setOptions({...options,high:e.target.checked})} /> Above 9,000 feet</label>
   <label><input type="checkbox" checked={options.steep} onChange={e=>setOptions({...options,steep:e.target.checked})} /> Slope 20° or steeper</label>
  </div>
  <label>Within a mapped wildfire perimeter <select value={options.fire} onChange={e=>setOptions({...options,fire:e.target.value as IdahoFirePeriod|'none'})}><option value="none">Any fire history</option>{(Object.entries(FIRE_PERIODS) as [IdahoFirePeriod,string][]).map(([k,label])=><option key={k} value={k}>{label}</option>)}</select></label>
  {error && <p role="alert">{error}</p>}
  {open && matched===0 && <p className="small muted">No mapped areas meet these settings in this unit.</p>}
  {open && <div ref={mapEl} aria-label={`Qualifying areas in Idaho Unit ${unit}`} style={{height:'min(470px,65vh)',minHeight:280,marginTop:10,borderRadius:8}} />}
  <p className="small muted">Fire perimeters can contain unburned land and do not measure forage. The inventory and mapped routes are incomplete, some routes are closed or private, and slope is an approximate 100-m terrain measure. Public management does not guarantee legal access. Check current maps, closures and regulations.</p>
 </details>;
}

