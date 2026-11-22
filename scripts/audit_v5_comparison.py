#!/usr/bin/env python3
"""Compare public finder CSV exports with an unmodified western v5 CSV.

Usage: python scripts/audit_v5_comparison.py reference.csv output-prefix export.csv [...]
The detail CSV is deliberately conservative: a geographic association is not proof
that a reference row and the hunt describe the same eligible population or season.
"""
import csv
import hashlib
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

STATES = {'ID', 'CO', 'MT', 'UT', 'WA', 'WY'}
RANK = {'Standard': 50, 'Good': 65, 'Excellent': 80, 'Elite': 100}
ROOT = Path(__file__).resolve().parent.parent
# 2026 WDFW legal descriptions identify these deer areas as portions of GMUs.
# This is review context only; it never establishes a whole-GMU hunt or historic boundary.
# https://wdfw.wa.gov/sites/default/files/publications/02706/wdfw02706.pdf (pp. 95–96)
WA_DEER_AREAS_2026 = {'DA1008':'169', 'DA1009':'169', 'DA1031':'117', 'DA1035':'121', 'DA2010':'284'}

def norm(value):
    value = re.sub(r'^(UNIT|GMU|HD|ZONE)\s*', '', value.strip().upper())
    # Normalize numeric identifiers only. Do not conflate alphanumeric units,
    # partial boundaries, or separate management units such as 44 and 444.
    return str(int(value)) if value.isdigit() else value

def scope(reference, hunt):
    """Return a scope assessment, never inferring population from unit alone."""
    text = reference.get('hunt_scope', '').lower()
    name = (hunt.get('Hunt', '') + ' ' + hunt.get('Season dates', '')).lower()
    if re.search(r'\b(cow|calf|doe|fawn|antlerless)\b', name) and re.search(r'\b(buck|bull|antlered)\b', text):
        return 'different scope', 'Hunt describes antlerless animals; reference describes antlered hunts'
    if re.search(r'\b(general|dedicated hunter)\b', name) and re.search(r'limited.entry|premium|limited quota', text) and not re.search(r'general|dedicated hunter', text):
        return 'different scope', 'General hunt; reference names limited-entry hunts'
    if re.search(r'\b(cwmu|ranching for wildlife|private land only)\b', name) and not re.search(r'cwmu|private|ranch', text):
        return 'different scope', 'Restricted hunt geography or access is not specified in the reference scope'
    return 'scope unverified', 'Reference text does not establish identical hunt, methods, season and eligibility'

def spreadsheet_cell(value):
    value = str(value or '')
    return "'" + value if value[:1] in ('=', '+', '-', '@', '\t', '\r') else value

def reference_index(rows):
    out = defaultdict(list)
    for r in rows:
        out[(r['state'].upper(), r['species'].upper(), norm(r.get('unit_id_normalized') or r.get('unit_id', '')))].append(r)
    return out

def explicit_deer_type(name):
    """Only use an explicit animal restriction in the exported hunt name.

    Geography alone does not distinguish sympatric deer. A mixed name is unknown.
    The exported name is context, not independent confirmation of legal eligibility.
    """
    name = name.lower()
    found = set()
    if re.search(r'\bwhite[ -]*tail(?:ed)?\b', name): found.add('whitetail')
    if re.search(r'\bmule deer\b', name): found.add('mule deer')
    if re.search(r'\bblack[ -]*tail(?:ed)?\b', name): found.add('blacktail')
    return next(iter(found)) if len(found) == 1 else None

def normalized_deer_type(name):
    value = re.sub(r'[^a-z]', '', name.lower())
    if 'whitetail' in value: return 'whitetail'
    if 'muledeer' in value: return 'mule deer'
    if 'blacktail' in value: return 'blacktail'
    return None

def candidates(hunt, index, ut):
    state, species = hunt['State'], hunt['Species'].upper()
    units = hunt['Units'].split()
    found = []
    for original in units:
        u = norm(original)
        note = 'exact unit identifier'
        if state == 'UT':
            link = ut.get((species, u))
            if not link:
                continue
            u = norm(str(link['managementUnit']))
            note = 'Utah hunt boundary associated with broader management unit; not identical geography'
        elif state == 'WA' and species == 'DEER' and u in WA_DEER_AREAS_2026:
            u = WA_DEER_AREAS_2026[u]
            note = '2026 WDFW deer area is a portion of this GMU; not identical geography; verify other years'
        elif state == 'WY':
            u = norm(re.sub(r'^[DEA](?=\d)', '', u))
        elif state == 'MT' and species == 'PRONGHORN':
            u = re.sub(r'^A(?=\d)', '', u)
            if re.search(r'\d[NS]$', u):
                u = u[:-1]
                note = 'Montana district portion associated with parent district'
        records = index.get((state, species, u), [])
        # Names such as "mule deer buck" and "white-tailed buck" explicitly
        # distinguish hunts sharing a GMU. Retain ambiguity when the name does
        # not do so; do not infer an animal type solely from the GMU.
        if state == 'WA' and species == 'DEER':
            deer_type = explicit_deer_type(hunt.get('Hunt', ''))
            if deer_type:
                records = [r for r in records if normalized_deer_type(r.get('subspecies', '')) == deer_type]
        for record in records:
            found.append((original, record, note))
    return found

def main():
    if len(sys.argv) < 4:
        raise SystemExit(__doc__)
    reference, output, *exports = map(Path, sys.argv[1:])
    with reference.open(encoding='utf-8-sig', newline='') as f:
        refs = list(csv.DictReader(f))
    index = reference_index(refs)
    links = json.loads((ROOT / 'data/trophy-ut-wmu-crosswalk.json').read_text(encoding='utf-8'))['links']
    ut = {(r['species'], norm(r['huntBoundary'])): r for r in links}
    hunts = {}
    for path in exports:
        with path.open(encoding='utf-8-sig', newline='') as f:
            for h in csv.DictReader(f):
                if h.get('Link') and h.get('State') in STATES:
                    hunts[h['Link']] = h
    detail = []
    for h in hunts.values():
        found = candidates(h, index, ut)
        if not found:
            for u in h['Units'].split() or ['']:
                detail.append({'state':h['State'], 'hunt':h['Hunt'], 'code':h['Code'], 'link':h['Link'], 'status':'no reference association', 'reason':'No established matching reference unit', 'units':h['Units'], 'matched_unit':u})
            continue
        per_unit = defaultdict(set)
        for u, ref, _ in found:
            per_unit[u].add(ref['subspecies'])
        for u, ref, geo in found:
            scope_status, scope_reason = scope(ref, h)
            status, reason = scope_status, scope_reason
            if len(per_unit[u]) > 1:
                status, reason = 'subspecies unresolved', 'Reference unit contains multiple subspecies; export does not establish the hunt population'
            elif 'not identical geography' in geo or 'portion' in geo or len(h['Units'].split()) > 1:
                status, reason = 'different or broader geography', geo if len(h['Units'].split()) == 1 else 'Multi-unit hunt score is not a score for this individual reference unit'
            if not h.get('Trophy score'):
                reason += '; hunt trophy score unavailable'
            try:
                delta = float(h.get('Trophy score', '')) - RANK[ref['trophy_tier']]
                direction = 'lower' if delta < 0 else 'higher' if delta > 0 else 'same'
            except (KeyError, ValueError):
                direction = 'unavailable'
            detail.append({'state':h['State'], 'hunt':h['Hunt'], 'code':h['Code'], 'link':h['Link'], 'units':h['Units'], 'matched_unit':u,
                'record_id':ref['record_id'], 'reference_subspecies':ref['subspecies'], 'reference_scope':ref['hunt_scope'], 'reference_tier':ref['trophy_tier'],
                'hunt_trophy_score':h.get('Trophy score', ''), 'tier_direction_context_only':direction, 'status':status, 'reason':reason,
                'scope_assessment':scope_status, 'scope_reason':scope_reason, 'geography_basis':geo,
                'subspecies_assessment':'unresolved' if len(per_unit[u]) > 1 else 'not independently verified'})
        for u in set(h['Units'].split()) - {v[0] for v in found}:
            detail.append({'state':h['State'], 'hunt':h['Hunt'], 'code':h['Code'], 'link':h['Link'], 'units':h['Units'], 'matched_unit':u, 'status':'no reference association', 'reason':'No established reference association for this unit'})
    fields = ['state','hunt','code','link','units','matched_unit','record_id','reference_subspecies','reference_scope','reference_tier','hunt_trophy_score','tier_direction_context_only','status','reason','scope_assessment','scope_reason','geography_basis','subspecies_assessment']
    with output.with_suffix('.csv').open('w', encoding='utf-8-sig', newline='') as f:
        writer = csv.DictWriter(f, fields); writer.writeheader(); writer.writerows({k:spreadsheet_cell(v) for k,v in row.items()} for row in detail)
    totals = defaultdict(Counter)
    unique = defaultdict(set)
    for d in detail:
        totals[d['state']][d['status']] += 1
        unique[d['state']].add(d['link'])
    digest = hashlib.sha256(reference.read_bytes()).hexdigest()
    lines = ['# Western v5 comparison: scope and evidence audit', '',
        f'Reference SHA-256: `{digest}`. The reference file was read only. Public export inputs: ' + ', '.join(p.name for p in exports) + '.', '',
        'The source tier and the live hunt trophy score use different methods. A matching unit is an association, not a confirmed discrepancy. The detail direction is descriptive context only; no numerical tier differences are classified as errors without individual scope, species, geography and season verification.', '',
        'Counts below are association rows, except unique hunts. A hunt can appear in multiple categories. Exports reflect the selected finder filters and may omit hidden or restricted hunts. Utah management units and hunt boundaries are different geographies. Unknown subspecies are not assigned by geography alone.', '',
        '| State | Unique exported hunts | No reference association | Subspecies unresolved | Different or broader geography | Different scope | Scope unverified |', '| --- | ---: | ---: | ---: | ---: | ---: | ---: |']
    for state in sorted(totals):
        c = totals[state]
        lines.append(f"| {state} | {len(unique[state])} | {c['no reference association']} | {c['subspecies unresolved']} | {c['different or broader geography']} | {c['different scope']} | {c['scope unverified']} |")
    lines += ['', '## Raw tier direction, for context only', '',
        'These associations include different or unverified scope and geography. Lower or higher does not mean wrong; do not use these counts as error rates.', '',
        '| State | Lower | Same | Higher | Unrated or unavailable |', '| --- | ---: | ---: | ---: | ---: |']
    for state in sorted(totals):
        c = Counter(d.get('tier_direction_context_only') for d in detail if d['state']==state and d.get('record_id'))
        lines.append(f"| {state} | {c['lower']} | {c['same']} | {c['higher']} | {c['unavailable']} |")
    lines += ['', f'Detail: `{output.with_suffix(".csv").name}`. Each row includes the original scope, source tier, live score and reason for its classification.', '',
        'Unrepresented and unsupported reference records are not evidence of an application defect; this report starts from exported hunts. The accompanying detail is a review queue, not an instruction to change scores.']
    output.with_suffix('.md').write_text('\n'.join(lines)+'\n', encoding='utf-8')
    print(f'{len(hunts)} distinct hunts; {len(detail)} detail rows; reference sha256 {digest}')

if __name__ == '__main__':
    main()
