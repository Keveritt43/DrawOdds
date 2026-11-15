"""Build a review-only exceptional-demand candidate list from retained snapshots.

No agency requests or database writes. Pass archived Idaho and Colorado snapshots as
arguments. Published residency pools or a validated pooled total are required. Wyoming
uses the disjoint resident, nonresident regular and nonresident special first-choice
populations; its random phase is a subset and is never added a second time.
"""
import collections, hashlib, json, math, re, sys
from pathlib import Path

if len(sys.argv) != 3:
    raise SystemExit('Usage: python scripts/prepare-exceptional-trophy-demand.py ID_SNAPSHOT CO_SNAPSHOT')
root = Path(__file__).resolve().parents[1]
sources = {'ID': Path(sys.argv[1]), 'CO': Path(sys.argv[2]), 'MT': root/'data/mt/hunts.json', 'UT': root/'data/ut/hunts.json', 'WA': root/'data/wa/hunts.json', 'WY': root/'data/wy/hunts.json'}
files = {s: json.loads(p.read_text(encoding='utf-8')) for s,p in sources.items()}
wa_file = root/'data/wa/source/permit-tables-2021-2026.json'
wy_file = root/'data/wy/draws.json'
wy_draws = json.loads(wy_file.read_text(encoding='utf-8'))['hunts']
wa_rows = json.loads(wa_file.read_text(encoding='utf-8'))['rows']
wa_by_year_code = collections.defaultdict(list)
for row in wa_rows:
    if row.get('year') in (2025, 2026):
        wa_by_year_code[(row['year'], row['species'].upper(), str(row['choice']))].append(row)
def normalize(v):
    return re.sub(r'[^a-z0-9]', '', str(v or '').lower())
groups = collections.defaultdict(list)
for state, doc in files.items():
    records = doc.get('rows') if state == 'ID' else doc.get('summaries') if state == 'CO' else doc.get('hunts')
    for h in records:
        sp, units = h.get('species'), h.get('units') or []
        if sp not in ('DEER', 'ELK', 'PRONGHORN') or h.get('antlerClass') not in ('ANTLERED', 'EITHER') or not units:
            continue
        if h.get('privateOnly') or h.get('youthOnly') or (h.get('pointOdds') or {}).get('multiSeason'):
            continue
        code = str(h.get('tagCode') or h.get('huntNumber') or '')
        year = h.get('oddsLastYear')
        if not code or not isinstance(year, int):
            continue
        if state == 'WY':
            parts = h['id'].split(':')
            draw = wy_draws.get(parts[1], {}).get(parts[2], {}).get('years', {}).get(str(year), {}) if len(parts)==3 else {}
            if not all(k in draw for k in ('res','regular','special')):
                continue
            try:
                res = draw['res']['apps'][0]
                totals = []
                for pool in ('regular','special'):
                    pref = draw[pool]['pref']['rows']
                    applicants = sum(r[4] for r in pref)
                    issued = sum(r[1] or 0 for r in pref)
                    if applicants-issued != draw[pool]['random']['apps'][0]:
                        raise ValueError('Preference and random phases do not reconcile')
                    totals.append(applicants)
                if h.get('resAppsLast') != res or h.get('nrAppsLast') != sum(totals):
                    continue
                apps = res + sum(totals)
            except (KeyError, IndexError, TypeError, ValueError):
                continue
            group = str(h.get('description') or '')+' / '+str(h.get('weapon') or 'ANY')
            if not h.get('description'):
                continue
            basis = 'WGFD first-choice applicants: resident + nonresident regular + special; random phase not added'
        elif state == 'WA':
            old = wa_by_year_code.get((2025, sp, code), [])
            new = wa_by_year_code.get((2026, sp, code), [])
            if len(old) != 1 or len(new) != 1:
                continue
            old, new = old[0], new[0]
            if any(normalize(old.get(k)) != normalize(new.get(k)) for k in ('name','category','area','tag')):
                continue
            apps = new.get('prior_apps') if new.get('prior_year') == 2025 else None
            if h.get('oddsLastYear') != 2025 or h.get('appsLast') != apps:
                continue
            group = str(new.get('category'))+' / '+str(new.get('tag'))
            basis = 'WDFW combined all-choice applications'
        elif state == 'CO':
            po = h.get('pointOdds') or {}
            if (po.get('sharedPool') or not re.match(r'^[DEA][ME]\d{3}[OU][1-4][ARM]$', code)):
                continue
            apps = h.get('appsLast')
            group = ('Rifle '+code[-2]) if code.endswith('R') else ('Archery' if code.endswith('A') else 'Muzzleloader')
            basis = 'CPW combined first-choice applications'
        else:
            res, nr = h.get('resAppsLast'), h.get('nrAppsLast')
            apps = res + nr if isinstance(res, int) and isinstance(nr, int) and res >= 0 and nr >= 0 else None
            po = h.get('pointOdds') or {}
            category = 'Controlled' if state == 'ID' else po.get('license') if state == 'MT' else h.get('huntCategory')
            if state == 'ID' and h.get('type') != 'CONTROLLED':
                continue
            if not category:
                continue
            group = str(category)+' / '+str(h.get('weapon') or 'ANY')
            basis = f'{state} resident + nonresident first-choice applications'
        if not isinstance(apps, int) or apps < 0:
            continue
        groups[(state,sp,year,group)].append({'code': code, 'unit': str(units[0]) if len(units)==1 else None,
                                             'units':[str(u) for u in units], 'apps': apps, 'basis': basis})

output = []
season_evidence = []
unit_groups = collections.defaultdict(dict)
for (state,sp,year,group), rows in sorted(groups.items()):
    by_id = {}
    for row in rows:
        if row['code'] in by_id and by_id[row['code']] != row:
            raise ValueError(f'Conflicting hunt identity: {state} {sp} {year} {row["code"]}')
        by_id[row['code']] = row
    rows = list(by_id.values())
    for row in rows:
        if row['unit'] is None:
            continue
        prior = unit_groups[(state,sp,year)].get(row['unit'])
        if prior is None or row['apps'] > prior['apps']:
            unit_groups[(state,sp,year)][row['unit']] = row
    if state == 'CO':
        single = [r for r in rows if r['unit'] is not None]
        singles = sorted(r['apps'] for r in single)
        if len(singles) >= 20:
            pos = (len(singles)-1)*.75
            lower = int(pos)
            q75 = singles[lower] + (singles[min(lower+1,len(singles)-1)]-singles[lower])*(pos-lower)
            season_evidence.extend({'state':state,'species':sp,'year':year,'group':group,'peers':len(single),
                                'threshold':q75,'code':r['code'],'unit':r['unit'],'apps':r['apps'],'high':r['apps']>=q75}
                               for r in single)
    if len(rows) < 20:
        continue
    counts = sorted(row['apps'] for row in rows)
    cutoff = counts[math.ceil(len(counts)*.95)-1]
    if cutoff <= 0:
        continue
    output.extend({'state':state,'species':sp,'year':year,'group':group,'peers':len(rows),'threshold':cutoff,**r}
                  for r in rows if r['apps'] >= cutoff)

unit_evidence = []
for (state, sp, year), by_unit in sorted(unit_groups.items()):
    values = sorted(row['apps'] for row in by_unit.values())
    if len(values) < 20:
        continue
    p = (len(values)-1)*.75
    lo = int(p)
    cutoff = values[lo] + (values[min(lo+1,len(values)-1)]-values[lo])*(p-lo)
    unit_evidence.extend({'state':state,'species':sp,'year':year,'unit':unit,'apps':row['apps'],
                          'huntCode':row['code'],'cutoff':cutoff,'peerUnits':len(values),'high':row['apps']>=cutoff}
                         for unit,row in by_unit.items())
target=root/'out/trophy-tier-review/exceptional-demand-candidates.json'
target.parent.mkdir(parents=True,exist_ok=True)
target.write_text(json.dumps({'status':'review only; not wired into production','method':'95th percentile nearest rank; minimum 20 distinct eligible comparable hunts; unit demand uses direct single-unit hunts only',
    'sources':{**{s:{'file':p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for s,p in sources.items()},
               'WA_PERMIT_TABLES':{'file':wa_file.name,'sha256':hashlib.sha256(wa_file.read_bytes()).hexdigest()},
               'WY_DRAWS':{'file':wy_file.name,'sha256':hashlib.sha256(wy_file.read_bytes()).hexdigest()}},
    'candidates':output, 'unitDemand':unit_evidence, 'seasonDemand':season_evidence},indent=2)+'\n',encoding='utf-8')
print(f'{len(output)} candidate hunt records in {len(groups)} eligible peer groups; {len(unit_evidence)} unit demand observations; output {target}')
