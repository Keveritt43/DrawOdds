'use client';
import {useState} from 'react';
import type {Map as MlMap} from 'maplibre-gl';
import {StateProvider} from './StateContext';
import {UnitMap} from './UnitMap';
import {IdahoOverlapExplorer} from './IdahoOverlapExplorer';
import {IdahoConditionsCharts} from './IdahoConditionsCharts';
import type {StudyLite} from './MigrationLayers';

/** Keep one map mounted while Explore adds or removes its layers. */
export function IdahoUnitExplorerMap({unit,draw,savedUnits,signedIn,nr,migrations}:{unit:string;draw:'DEP'|'MSG';savedUnits:string[];signedIn:boolean;nr:boolean;migrations:StudyLite[]}) {
  const [map,setMap]=useState<MlMap|null>(null);
  const [open,setOpen]=useState(false);
  return <StateProvider code="ID">
    <IdahoOverlapExplorer unit={unit} sharedMap={map} open={open} onOpenChange={setOpen}/>
    <div className="card" style={{padding:0,overflow:'hidden',minHeight:480}}>
      <UnitMap key={draw} draw={draw} savedUnits={savedUnits} signedIn={signedIn} nr={nr} focus={unit} height="480px" bare migrations={migrations} onMapReady={setMap} exploring={open}/>
    </div>
    {open && <IdahoConditionsCharts unit={unit}/>}
  </StateProvider>;
}
