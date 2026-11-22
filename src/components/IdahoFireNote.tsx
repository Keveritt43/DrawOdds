import { idFireUnit, type FireRecord } from '@/lib/idFire';

function sourceLink(fire:FireRecord) {
 const service=fire.source==='history'?'InterAgencyFirePerimeterHistory_All_Years_View':'WFIGS_Interagency_Perimeters';
 return `https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/${service}/FeatureServer/0/query?objectIds=${fire.ids.join(',')}&outFields=*&returnGeometry=false&f=html`;
}
export function IdahoFireNote({units}:{units:string[]}) {
 const found=units.map(unit=>({unit,data:idFireUnit(unit)})).filter(x=>x.data!==null);
 if(!found.length)return <p className="small muted">Wildfire perimeter history: not measured for these units.</p>;
 return <details className="small muted" style={{marginTop:8}}><summary>Wildfire history · unit context</summary>
  {found.map(({unit,data})=><div key={unit}><p><b>Unit {unit}</b>:  {Object.entries(data!.annualAcres).sort(([a],[b])=>Number(b)-Number(a)).map(([year,acres])=>`${year}: ${acres.toLocaleString()} ac`).join(' · ') || 'No mapped wildfire perimeters in the snapshot.'}</p>
  <p><a href={`/units/${encodeURIComponent(unit)}#terrain-overlap`}>Explore terrain and wildfire overlap in Unit {unit}</a></p>
  {data!.fires.length>0 && <p>Largest named perimeter records: {data!.fires.slice(0,5).map((fire,i)=><span key={`${fire.year}:${fire.name}`}>{i>0?' · ':''}<a href={sourceLink(fire)} target="_blank" rel="noreferrer">{fire.name} ({fire.year}, {fire.acres.toLocaleString()} ac)</a></span>)}</p>}</div>)}
  <p>Mapped perimeter area can include unburned ground; records are incomplete and 2026 is partial. Acres cover the whole unit, including private land, and may extend beyond a hunt area. Overlapping perimeters within a year are counted once. This is not a measure of forage quality or legal access. NIFC snapshot downloaded November 2026.</p>
 </details>;
}
