"""Download ID-area NIFC fire-history perimeters by object ID; no database access."""
import json,pathlib,sys,time,hashlib
sys.path.insert(0,'out/geodeps');import requests
root=pathlib.Path('out/id-fire');root.mkdir(parents=True,exist_ok=True);session=requests.Session()
URLS={'history':'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/InterAgencyFirePerimeterHistory_All_Years_View/FeatureServer/0','wfigs':'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Interagency_Perimeters/FeatureServer/0'}
def query(url,params):
 for i in range(4):
  try:
   r=session.get(url+'/query',params=params,timeout=180);r.raise_for_status();j=r.json()
   if 'error' in j:raise ValueError(j['error'])
   return j
  except Exception as e:print('retry',str(e),flush=True);time.sleep(2*(i+1))
 raise RuntimeError(url)
def fetch(kind,year):
 out=root/f'{kind}-{year}.json'
 if out.exists():return json.loads(out.read_text(encoding='utf8'))
 where=f"FIRE_YEAR_INT={year} AND FEATURE_CA LIKE 'Wildfire%'" if kind=='history' else f"attr_IncidentTypeCategory='WF' AND poly_FeatureCategory IN ('Wildfire Final Fire Perimeter','Wildfire Daily Fire Perimeter') AND attr_FireDiscoveryDateTime >= DATE '{year}-01-01 00:00:00' AND attr_FireDiscoveryDateTime < DATE '{year+1}-01-01 00:00:00'"
 bbox={'geometry':'-117.3,41.9,-110.9,49.1','geometryType':'esriGeometryEnvelope','inSR':4326,'spatialRel':'esriSpatialRelIntersects'}
 ids=query(URLS[kind],{'f':'json','where':where,**bbox,'returnIdsOnly':'true'}).get('objectIds') or []
 if len(ids)!=len(set(ids)):raise ValueError('duplicate ids')
 fields='OBJECTID,INCIDENT,IRWINID,UNQE_FIRE_ID,FIRE_YEAR_INT,FEATURE_CA,DATE_CUR' if kind=='history' else 'OBJECTID,poly_IncidentName,poly_FeatureCategory,poly_IRWINID,poly_DateCurrent,poly_PolygonDateTime,attr_IncidentName,attr_UniqueFireIdentifier,attr_FireDiscoveryDateTime,attr_IncidentTypeCategory,poly_GISAcres'
 features=[]
 for start in range(0,len(ids),100):
  j=query(URLS[kind],{'f':'geojson','objectIds':','.join(map(str,ids[start:start+100])),'outFields':fields,'outSR':5070,'returnGeometry':'true','maxAllowableOffset':10})
  features+=j.get('features',[]);print(kind,year,len(features),'/',len(ids),flush=True)
 found=[x['properties']['OBJECTID'] for x in features]
 if len(found)!=len(set(found)) or set(found)!=set(ids) or any(not x.get('geometry') for x in features):raise ValueError((kind,year,'incomplete records'))
 out.write_text(json.dumps({'kind':kind,'year':year,'where':where,'count':len(ids),'features':features}),encoding='utf8');return {'count':len(ids),'features':features}
if __name__=='__main__':
 for y in range(2018,2027):fetch('history' if y<2020 else 'wfigs',y)
