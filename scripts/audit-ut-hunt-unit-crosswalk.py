#!/usr/bin/env python3
"""Read-only comparison of supplied hunt-name/code links with DWR-derived geography.

Usage: python scripts/audit-ut-hunt-unit-crosswalk.py output.json
Name matches and polygon overlap are evidence for review, not automatic identity links.
"""
import csv
import hashlib
import json
import sys
from collections import Counter
from pathlib import Path

root=Path(__file__).resolve().parent.parent
crosswalk=root/'data/ut/trophy-hunt-unit-crosswalk.csv'
with crosswalk.open(encoding='utf-8-sig', newline='') as f:
    rows=list(csv.DictReader(f))
hunts_path=root/'data/ut/hunts.json'
geometry_path=root/'data/trophy-ut-wmu-crosswalk.json'
hunts=json.loads(hunts_path.read_text(encoding='utf8'))['hunts']
geometry=json.loads(geometry_path.read_text(encoding='utf8'))['links']
by_boundary={(r['species'],str(r['huntBoundary'])):str(r['managementUnit']) for r in geometry}
results=[]
for h in hunts:
    hits=[r for r in rows if r['species'].upper()==h['species'] and (
        (r['match_type']=='hunt_code_exact' and r['match_value'].casefold()==h['tagCode'].casefold()) or
        (r['match_type']=='hunt_name_substring' and r['match_value'].casefold() in h['name'].casefold()))]
    supplied=sorted(set(r['unit_id'] for r in hits))
    mapped=[by_boundary.get((h['species'],str(u))) for u in h['units']]
    known=sorted(set(v for v in mapped if v is not None))
    if not hits: status='no supplied match'
    elif len(supplied)>1: status='ambiguous supplied matches'
    elif not mapped or any(v is None for v in mapped): status='geometry incomplete'
    elif len(known)!=1 or supplied!=known: status='conflict'
    else: status='agrees with geographic association'
    results.append({'code':h['tagCode'],'name':h['name'],'species':h['species'],'boundary_ids':h['units'],
                    'supplied_units':supplied,'geometry_units':known,'status':status,
                    'matches':[{'type':r['match_type'],'value':r['match_value'],'record_id':r['record_id']} for r in hits]})
out=Path(sys.argv[1]);out.write_text(json.dumps({'sha256':hashlib.sha256(crosswalk.read_bytes()).hexdigest(),
    'huntsSha256':hashlib.sha256(hunts_path.read_bytes().replace(b'\r\n',b'\n')).hexdigest(),
    'geometrySha256':hashlib.sha256(geometry_path.read_bytes().replace(b'\r\n',b'\n')).hexdigest(),
    'note':'Current retained snapshot only. Agreement is geographic context, not proof of historical identity or trophy size.',
    'counts':dict(Counter(r['status'] for r in results)),'hunts':results},indent=2)+'\n',encoding='utf8')
print(json.dumps({'hunts':len(results),'counts':dict(Counter(r['status'] for r in results))}))
