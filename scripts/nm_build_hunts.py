#!/usr/bin/env python3
"""Build data/nm/hunts.json: New Mexico deer and elk hunts for the 2026-27 season with draw odds, harvest and land.

Usage: python3 -I scripts/nm_build_hunts.py   (reads data/nm/{rules-2026,draws,harvest,land,units,backtest}.json)

Hunts: every deer and elk draw hunt in the 2026-27 booklet, the 21 landowner-authorized private-land-only deer draw
hunts in Units 2A, 2B, 2C, 4 and 5A (in the draw report, not the booklet), and the 20 over-the-counter private-land deer
hunts in Units 8, 46, 54, 55A and 55B. Youth Encouragement elk (sold first come, not drawn) are left out.

Draw odds, per pool (resident, nonresident 6%, outfitter 10%): first-choice drawn / first-choice applicants.
  last: the 2026 draw (NMDOW Complete Drawing Odds Report).
  proj: the next-draw estimate chosen per pool in scripts/nm_backtest.py (data/nm/backtest.json): residents pool the
        last 2 draws, nonresident and outfitter pools shrink the last draw toward the pooled last 3 by applicants.
NMDOW renumbers every hunt for 2027-28; until the 2027-28 booklet is out, the estimate is for this hunt as offered now.

Harvest: NMDOW harvest reports 2023-24 to 2025-26 (the seasons with today's hunt codes), pooled: success = sum harvest /
sum hunters. Hunters per mi²: hunters per season / the hunt's GMU area (left out for hunts limited to a WMA or area).
"""
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
D = ROOT / 'data' / 'nm'
rules = json.load(open(D / 'rules-2026.json'))
draws = json.load(open(D / 'draws.json'))['years']
harvest = json.load(open(D / 'harvest.json'))['seasons']
land = json.load(open(D / 'land.json'))
units = {u['name']: u for u in json.load(open(D / 'units.json'))['units']}
GMUS = set(units)

problems, omitted = [], []
BAG_TEXT = {'FAD': 'Fork-antlered deer (mule or white-tailed)', 'FAMD': 'Fork-antlered mule deer', 'FAWTD': 'Fork-antlered white-tailed deer',
            'ESWTD': 'Either-sex white-tailed deer', 'A': 'Antlerless', 'MB': 'Mature bull (no spikes)', 'MB/A': 'Mature bull or antlerless',
            'ES': 'Either sex', 'APRE/6': 'Antler-point-restricted bull (6+ points on one side)', 'APRE/6/A': 'Antler-point-restricted bull (6+ points) or antlerless'}
ANTLER = {'FAD': 'ANTLERED', 'FAMD': 'ANTLERED', 'FAWTD': 'ANTLERED', 'MB': 'ANTLERED', 'APRE/6': 'ANTLERED', 'A': 'ANTLERLESS',
          'ES': 'EITHER', 'ESWTD': 'EITHER', 'MB/A': 'EITHER', 'APRE/6/A': 'EITHER'}
DEER_TYPE = {'FAMD': 'MULE', 'FAWTD': 'WHITETAIL', 'ESWTD': 'WHITETAIL', 'FAD': 'MIXED', 'A': 'MIXED'}
WEAPON = {'1': 'ANY', '2': 'ARCHERY', '3': 'MUZZLELOADER'}
FEE = {'S': 'Standard', 'Q': 'Quality', 'HD': 'High-demand', 'Q/HD': 'Quality / high-demand'}


def unit_list(text):
    """'Unit 16 (A, B, C, D and E)' -> 16A..16E; 'Units 6A and 6C'; 'Unit 191 WSMR' (footnote 1) -> 19; 'Unit 2' -> 2A,2B,2C."""
    t = re.sub(r'\(CWD.*?\)|\(see.*?\)|\(Valles.*?\)', '', text)
    m = re.match(r'Units? 16 \(A, B, C, D and E\)', t)
    if m: return ['16A', '16B', '16C', '16D', '16E']
    head = re.match(r'Units?\s+([0-9A-Z ,/and]+?)(?=\s+(?:[Ii]ncluding|[Ee]xcluding|Burro|McGregor|Humphries|Rio|Sargent|Marquez|Colin|ES|Urraca|Valle|Sugarite|WSMR|Public|\()|\s*$)', t.strip())
    if not head: return []
    out = []
    for tok in re.findall(r'\d{1,3}[A-E]?', head.group(1)):
        if tok in GMUS: out.append(tok)
        elif tok[:-1] in GMUS and tok[-1].isdigit(): out.append(tok[:-1])  # a footnote digit glued to the unit
        else:
            subs = sorted(g for g in GMUS if re.fullmatch(re.escape(tok) + r'[A-E]', g))
            if subs: out += subs
            else: problems.append(f'unit {tok!r} in {text!r} is not a GMU')
    return out


def flags(header, wt):
    s = f'{header} | {wt}'
    area = None
    for pat in [r'(?:[Ee]xcluding|[Ii]ncluding) (?:Fort Bayard Management Area|Ft\. Bayard Mgmt\. Area)',r'Burro Mountain Area Only', r'Excluding Burro Mountain Area', r'McGregor Range Only', r'WSMR Portion Only', r'Valle Vidal Only',
                r'Sugarite Canyon State Park Only', r'Fort Bayard Management Area|Ft\. Bayard Mgmt\. Area', r'(?:Humphries|Rio Chama|Sargent|Marquez|LBar|Colin Neblett|Barker|Urraca|Huey)[A-Za-z /]*WMAs? (?:Only|only)',
                r'Valles Caldera', r'South of NM 78', r'Excluding Cerro portion']:
        m = re.search(pat, s)
        if m: area = m.group(0); break
    return {
        'youth': bool(re.search(r'Youth', s)),
        'residentOnly': bool(re.search(r'NM Residents? Only', s)),
        'mobility': bool(re.search(r'Mobility|Impaired', s)),
        'military': bool(re.search(r'Military Only', s)),
        'wmaOnly': bool(re.search(r'WMAs? (?:Only|only)', s)),
        'publicOnly': 'Public Land Only' in s,
        'restrictedMuzzle': bool(re.search(r'restricted muzzleloader', s, re.I)),
        'onceInALifetime': 'Once-in-a-Lifetime' in s,
        'cwd': 'CWD' in s,
        'area': area,
    }


def first(h, pool):
    a, d = h['applicants'][pool][0], h['drawn'][pool][0]
    return (min(d, a), a) if a > 0 else None


def est(hist, pool, method):
    obs = [o for o in (first(h, pool) for h in hist) if o]
    if not obs: return None
    if method == 'pool2':
        sel = obs[-2:]
        return sum(d for d, _ in sel) / sum(a for _, a in sel)
    d, a = obs[-1]
    sel = obs[-3:]
    prior = sum(x for x, _ in sel) / sum(y for _, y in sel)
    w = a / (a + 20.0)
    return w * d / a + (1 - w) * prior


METHOD = {'res': 'pool2', 'nr': 'shrink', 'out': 'shrink'}
YEARS = ['2023', '2024', '2025', '2026']  # draws with today's hunt codes


def harvest_for(code):
    seasons = []
    for y in sorted(harvest):
        h = harvest[y].get(code)
        if not h: continue
        seasons.append({'year': int(y), 'licenses': h['licensesSold'], 'hunters': h['hunters'], 'harvest': h['harvest'], 'success': h['success'],
                        'male': h['male'], 'female': h['female'], 'days': h['daysHunted']})
    use = [s for s in seasons if s['hunters'] and s['harvest'] is not None]
    hunters = sum(s['hunters'] for s in use)
    hv = sum(s['harvest'] for s in use)
    days = sum(s['days'] * s['hunters'] for s in use if s['days'] is not None)
    last = seasons[-1] if seasons else None
    return seasons, {
        'success5': hv / hunters if hunters else None, 'hunters5': hunters or None, 'harvest5': hv if hunters else None,
        'harvestYears': len(use), 'harvestLastYear': (last['year'] if last else None), 'successLast': (last['success'] if last else None),
        'daysPerHunter5': (days / hunters if hunters and all(s['days'] is not None for s in use) else None),
        'smallSample': hunters < 30 if hunters else False,
    }


def land_for(us, private_only):
    acres = sum(units[u]['acres'] for u in us)
    pub = sum(units[u]['acres'] * (units[u].get('publicPct') or 0) for u in us) / acres if acres else None
    prv = sum(units[u]['acres'] * (units[u].get('privatePct') or 0) for u in us) / acres if acres else None
    return acres, (None if pub is None else round(pub, 1)), (None if prv is None else round(prv, 1))


def build():
    hunts = []
    rows = dict(rules['hunts'])
    # landowner-authorized private-land-only draw hunts (Units 2A, 2B, 2C, 4, 5A): in the draw report, not the booklet
    for code, h in draws['2026'].items():
        if code in rows: continue
        if 'private land only' not in h['desc'].lower():
            problems.append(f'{code}: in the 2026 draw report but not the booklet: {h["desc"]}'); continue
        rows[code] = {'code': code, 'section': 'deer-private-draw', 'header': h['desc'].split(':')[0], 'weaponText': {'1': 'Any Legal', '2': 'Bow', '3': 'Muzzle'}[code[4]],
                      'open': None, 'close': None, 'dates': None, 'fee': None, 'licenses': h['licenses'], 'unlimited': False, 'bag': h.get('bag') or 'FAD'}
    # their dates: the public hunt in the same GMU and weapon that ran the same 2025-26 dates
    h25 = harvest.get('2025', {})
    for code, r in rows.items():
        if r['section'] != 'deer-private-draw': continue
        mine = (h25.get(code) or {}).get('dates')
        twin = [c for c, x in rows.items() if x['section'] == 'deer-draw' and c[4] == code[4] and (h25.get(c) or {}).get('dates') == mine and mine
                and unit_list(x['header'] or '')[:1] == unit_list(r['header'])[:1]]
        if not twin:
            # no public hunt of that weapon in the GMU (Unit 4's public deer hunts are WMA-only): the statewide season
            # that ran those dates in 2025 (e.g. every muzzleloader deer hunt ran 9/27-10/3)
            if not mine:
                mine = next(((harvest[y].get(code) or {}).get('dates') for y in ('2024', '2023') if (harvest[y].get(code) or {}).get('dates')), None)
                pool = {y: harvest.get(y, {}) for y in ('2024', '2023')}
                twin = [c for c, x in rows.items() if x['section'] == 'deer-draw' and c[4] == code[4] and mine and any((pool[y].get(c) or {}).get('dates') == mine for y in pool)]
            else:
                twin = [c for c, x in rows.items() if x['section'] == 'deer-draw' and c[4] == code[4] and (h25.get(c) or {}).get('dates') == mine]
        if twin and mine:
            t = rows[twin[0]]
            r.update(open=t['open'], close=t['close'], dates=t['dates'], datesFrom=twin[0])
        else:
            problems.append(f'{code}: no public twin for dates {mine!r}')
    for code, r in sorted(rows.items()):
        sp = 'DEER' if code.startswith('DER') else 'ELK'
        drawn_hunt = r['section'] != 'deer-private-otc'
        if drawn_hunt and code not in draws['2026']:
            omitted.append({'code': code, 'reason': 'not in the 2026 public draw (Youth Encouragement elk license, sold first come)' if r['weaponText'].endswith('Youth Only') and sp == 'ELK' else 'not in the 2026 draw report', 'header': r['header']})
            continue
        f = flags(r['header'] or '', r['weaponText'])
        us = unit_list(r['header'] or '') if not r['header'].startswith('Premium') else sorted(GMUS - {'1', '3', '11', '35'})
        if not us: problems.append(f'{code}: no units from {r["header"]!r}'); continue
        private_only = r['section'] in ('deer-private-draw', 'deer-private-otc')
        # nonresidents can't apply for antlerless elk, WMA draw hunts or resident-only hunts (2027-28 fee sheet; booklet)
        nr_ok = not (f['residentOnly'] or f['wmaOnly'] or (sp == 'ELK' and r['bag'] == 'A'))
        rec = {'id': f'NM:{code}', 'slug': f'nm-{code.lower()}', 'state': 'NM', 'species': sp, 'type': 'CONTROLLED' if drawn_hunt else 'GENERAL',
               'tagCode': code, 'units': us, 'weapon': WEAPON[code[4]], 'antlerClass': ANTLER[r['bag']], 'takeMethod': BAG_TEXT[r['bag']],
               'openDate': r['open'], 'closeDate': r['close'], 'tags': r['licenses'], 'privateOnly': private_only, 'youthOnly': f['youth'],
               'deerType': DEER_TYPE.get(r['bag']) if sp == 'DEER' else None}
        unit_label = ', '.join(us) if len(us) <= 3 else f'{len(us)} GMUs'
        what = {'ANY': 'Any Legal Weapon', 'ARCHERY': 'Archery', 'MUZZLELOADER': 'Muzzleloader'}[rec['weapon']]
        rec['areaName'] = (f'GMU {unit_label}' if len(us) <= 3 else unit_label) + (f' · {f["area"]}' if f['area'] else '')
        rec['name'] = f"{'Statewide Premium' if r['header'].startswith('Premium') else 'GMU ' + unit_label} {what} {('Deer' if sp == 'DEER' else 'Elk')}" + (' (Youth)' if f['youth'] else '')
        # odds
        po = {'state': 'NM', 'kind': 'draw' if drawn_hunt else 'otc', 'year': 2026, 'bag': r['bag'], 'fee': r['fee'], 'feeType': FEE.get(r['fee']),
              'header': r['header'], 'weaponText': r['weaponText'], 'dates': r['dates'], 'datesFrom': r.get('datesFrom'), 'nrEligible': nr_ok, **{k: v for k, v in f.items() if v}}
        if drawn_hunt:
            hist = [draws[y][code] for y in YEARS if code in draws[y]]
            h26 = draws['2026'][code]
            last = {p: (lambda o: None if o is None else o[0] / o[1])(first(h26, p)) for p in ('res', 'nr', 'out')}
            proj = {p: est(hist, p, METHOD[p]) for p in ('res', 'nr', 'out')}
            if not nr_ok:
                for p in ('nr',):
                    if h26['applicants'][p][0] or h26['drawn'][p][0]: problems.append(f'{code}: flagged nonresident-ineligible but {p} applied')
            rec['oddsByPts'] = {'last': {p: [round(v, 6)] for p, v in last.items() if v is not None}, 'proj': {p: [round(v, 6)] for p, v in proj.items() if v is not None}}
            rec['oddsLastYear'] = 2026
            rec['oddsYears'] = len(hist)
            rec['appsLast'] = sum(h26['applicants'][p][0] for p in ('res', 'nr', 'out'))
            rec['resAppsLast'] = h26['applicants']['res'][0]
            rec['nrAppsLast'] = h26['applicants']['nr'][0]
            rec['permitsLast'] = h26['licenses']
            rec['resOddsLast'] = last['res']
            rec['nrOddsLast'] = last['nr'] if nr_ok else None
            rec['resOdds5'] = proj['res']
            rec['nrOdds5'] = proj['nr'] if nr_ok else None
            rec['nrPermitsLast'] = sum(h26['drawn']['nr'])
            rec['secondAppsLast'] = sum(h26['applicants'][p][1] for p in ('res', 'nr', 'out'))
            rec['secondDrewLast'] = sum(h26['drawn'][p][1] for p in ('res', 'nr', 'out'))
            po['projected'] = True
            po['method'] = METHOD
            po['history'] = {y: {p: [draws[y][code]['applicants'][p][0], draws[y][code]['drawn'][p][0]] for p in ('res', 'nr', 'out')} | {'licenses': draws[y][code]['licenses']}
                             for y in YEARS if code in draws[y]}
            po['choices2026'] = {p: {'apps': h26['applicants'][p], 'drew': h26['drawn'][p]} for p in ('res', 'nr', 'out')}
            po['issued2026'] = {p: sum(h26['drawn'][p]) for p in ('res', 'nr', 'out')}
        else:
            rec['oddsByPts'] = {'last': {}, 'proj': {}}
            rec['oddsYears'] = 0
            po['projected'] = False
        seasons, hv = harvest_for(code)
        # a private-OTC licence that reuses a draw code reports separately (nm_parse_harvest.py `privateOtc`); the 500
        # series codes are their own hunts, so their single row is theirs
        rec.update(hv)
        po['harvest'] = seasons
        acres, pub, prv = land_for(us, private_only)
        rec['acres'] = acres
        if f['wmaOnly']:
            rec['publicPct'], rec['privatePct'] = 100.0, 0.0  # WMA-only hunts are on State Game Commission land
            po['landNote'] = 'WMA-only hunt: State Game Commission land'
        elif f['area'] == 'Valle Vidal Only':
            vv = land['designatedAreas'].get('Valle Vidal Unit Carson NF', {})
            rec['publicPct'], rec['privatePct'] = vv.get('publicPct'), None
        else:
            rec['publicPct'], rec['privatePct'] = pub, prv
        limited = f['wmaOnly'] or (f['area'] and not re.match(r'(?:[Ee]xcluding|[Ii]ncluding)', f['area'])) or r['header'].startswith('Premium')
        rec['huntersSqMi'] = None if limited or not rec['hunters5'] or not rec['harvestYears'] else round((rec['hunters5'] / rec['harvestYears']) / (acres / 640), 3)
        rec['pointOdds'] = po
        hunts.append(rec)
    return hunts


def main():
    hunts = build()
    ids = [h['id'] for h in hunts]
    if len(ids) != len(set(ids)): problems.append('duplicate ids')
    out = {'generated': 'scripts/nm_build_hunts.py', 'drawYear': 2026, 'regsYear': 2026, 'season': '2026-27', 'problems': problems, 'omitted': omitted, 'hunts': hunts}
    (D / 'hunts.json').write_text(json.dumps(out, separators=(',', ':')) + '\n')
    from collections import Counter
    print(len(hunts), Counter((h['species'], h['type'], h['privateOnly']) for h in hunts))
    print('nr-ineligible', sum(not h['pointOdds']['nrEligible'] for h in hunts), 'scored harvest', sum(h['success5'] is not None for h in hunts))
    print('omitted', len(omitted), Counter(o['reason'] for o in omitted))
    print('problems', len(problems)); print('\n'.join(problems[:30]))


if __name__ == '__main__':
    main()
