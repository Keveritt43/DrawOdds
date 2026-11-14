"""Turn reviewed Utah overlap candidates into conservative source-unit links.

Input is produced by review-ut-trophy-crosswalk.cjs from the DWR species-specific
management polygons. A link requires at least 90% of the hunt boundary in one
management polygon and a single numeric parent unit in that polygon's key.
Combined management keys remain unmatched. This is geographic context only.
"""
import hashlib, json, re, sys
from pathlib import Path

if len(sys.argv) != 2:
    raise SystemExit('Usage: python scripts/prepare-ut-trophy-crosswalk.py CANDIDATE_DIRECTORY')
root = Path(__file__).resolve().parents[1]
source = Path(sys.argv[1])
records = json.loads((source/'ut-crosswalk-candidates.json').read_text(encoding='utf-8'))
source_rows = json.loads((root/'data/trophy-source-western-v3.json').read_text(encoding='utf-8'))['records']
valid = {(r['species'], re.sub(r'^Unit\s+', '', r['unit'], flags=re.I)) for r in source_rows if r['state']=='UT'}
links = []
for r in records:
    match = re.fullmatch(r'(\d+)[A-Za-z]*', str(r['managementKey']))
    if not match or r['portion'] < .9 or (r['species'], match.group(1)) not in valid:
        continue
    links.append({ 'species':r['species'], 'huntBoundary':r['huntBoundary'], 'managementUnit':match.group(1),
                   'managementKey':r['managementKey'], 'managementName':r['managementName'],
                   'huntBoundaryName':r['label'], 'portion':r['portion'] })
links.sort(key=lambda x:(x['species'],x['huntBoundary'],x['managementKey']))
hashes = {s:hashlib.sha256((source/f'ut-management-{s}.json').read_bytes()).hexdigest() for s in ('deer','elk','pronghorn')}
target=root/'data/trophy-ut-wmu-crosswalk.json'
target.write_text(json.dumps({'status':'geographic association; does not locate county records or establish trophy size',
    'coverage':'At least 90% of hunt-boundary area in a single DWR species-specific management polygon; combined keys omitted',
    'sources':{'deer':'https://services.arcgis.com/ZzrwjTRez6FJiOq4/arcgis/rest/services/WMUs/FeatureServer/0',
               'elk':'https://services.arcgis.com/ZzrwjTRez6FJiOq4/arcgis/rest/services/Utah_WMUs_Elk/FeatureServer/27',
               'pronghorn':'https://services.arcgis.com/ZzrwjTRez6FJiOq4/arcgis/rest/services/Utah_WMUs_Pronghorn/FeatureServer/26'},
    'sourceSha256':hashes, 'links':links},indent=2)+'\n',encoding='utf-8')
print(f'Prepared {len(links)} conservative Utah management-to-hunt-boundary associations')
