#!/usr/bin/env python3
"""Build data/or/hunts.json: Oregon's 2026 controlled deer and elk hunts (100, 200 and 600 series) with odds at every
point level, plus the 2026 general seasons by WMU, joined to five seasons of ODFW harvest and to land ownership.

Usage: python3 -I scripts/or_build_hunts.py
Inputs (all in data/or/, built by the other or_*.py scripts):
  source/draws-2021-2026.json   ODFW draw reports (scripts/or_parse_draws.py)
  regs-2026.json                2026 regulation hunt tables and boundary descriptions (scripts/or_parse_regs.py)
  source/harvest-2021-2025.json ODFW harvest summaries (scripts/or_parse_harvest.py)
  units.json, land.json         WMUs and 2026 deer hunt areas with land shares (scripts/or_build_land.py)
  backtest.json                 projection choice per series and residency (scripts/or_backtest.py)

Odds (scripts/or_odds.py, evidence in docs/states/or-onboarding.md section 2): 'last' = the 2026 draw at each
point level, per residency; 'proj' = the 2027 projection, only for the series and residency pools where it beat
last draw's odds in the backtest (nonresident buck deer and elk: points creep 0.25 a year). Points are the
points a hunter holds when applying (ODFW's "Points" column).

Harvest identity: a past year counts for a hunt only when that year's draw report has the same hunt number under
a matching name (token overlap >= 0.5 after dropping "unit", "no."), so a renumbered or redrawn hunt doesn't carry
someone else's history. Eastern Oregon deer hunts are new for 2026 (hunt areas replaced WMUs) and have none.
"""
from __future__ import annotations

import json
import re
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from or_odds import MAX_PTS, last_draw, pool_rows  # noqa: E402
from or_backtest import shift  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
D = ROOT / 'data' / 'or'
DRAW_YEAR = 2026
PROJ_YEAR = 2027
SERIES = {'buck': '100', 'antlerless': '600', 'elk': '200'}

# 2026 general seasons, from the 2026 regulations (deer pp. 33 and 35, elk pp. 45 and 49). Unit lists as printed;
# "portion of" units are listed with the portion noted. Harvest comes from the harvest summaries' general rows.
WEST = list(range(10, 31))
WEST = [u for u in WEST if u != 13]
GENERAL = [
    {'key': 'WD', 'species': 'DEER', 'weapon': 'ANY', 'name': 'Western Oregon General Rifle Buck', 'tag': 'General Any Legal Weapon Western Oregon Deer Tag',
     'dates': [('2026-10-03', '2026-11-06')], 'units': {u: 'One buck with visible antler' for u in WEST}, 'harvest': ('deer', 'any', 'General Western Deer')},
    {'key': 'WDA', 'species': 'DEER', 'weapon': 'ARCHERY', 'name': 'Western Oregon General Archery Deer', 'tag': 'General Archery Season Western Oregon Deer Tag',
     'dates': None, 'units': None, 'harvest': ('deer', 'archery', ('Early Bow Deer', 'Late Bow Deer'))},
    {'key': 'WCE', 'species': 'ELK', 'weapon': 'ANY', 'name': 'General West Cascade Elk', 'tag': 'General West Cascade Elk Tag',
     'dates': [('2026-11-07', '2026-11-13')], 'units': {u: 'One bull elk' for u in (16, 19, 21, 22, 29, 30)}, 'harvest': ('elk', 'any', 'West Cascade')},
    {'key': 'CE1', 'species': 'ELK', 'weapon': 'ANY', 'name': 'General Coast Elk, 1st Season', 'tag': 'General Western Oregon Coast First Season Tag',
     'dates': [('2026-11-14', '2026-11-17')], 'units': {u: 'One bull elk' for u in (11, 12, 14, 15, 17, 18, 20, 23, 28)}, 'harvest': ('elk', 'any', 'Coast 1st season')},
    {'key': 'CE2', 'species': 'ELK', 'weapon': 'ANY', 'name': 'General Coast Elk, 2nd Season', 'tag': 'General Western Oregon Coast Second Season Tag',
     'dates': [('2026-11-21', '2026-11-27')], 'units': {**{u: 'One bull elk' for u in (11, 15, 17, 18, 23, 28)}, **{u: 'One spike elk' for u in (12, 14, 20)}},
     'harvest': ('elk', 'any', 'Coast 2nd season')},
    {'key': 'RM2', 'species': 'ELK', 'weapon': 'ANY', 'name': 'General Rocky Mountain Elk, 2nd Season (Spike)', 'tag': 'General Eastern Oregon Rocky Mountain 2nd Season Tag',
     'dates': [('2026-11-07', '2026-11-15')], 'units': {**{u: 'One spike elk' for u in (49, 50, 52, 53, 61, 62, 63)},
                                                       48: 'One spike elk (north and west of the N Fork John Day River only)',
                                                       51: 'One spike elk (north of Hwy 245 and Burnt River Canyon Rd only)'},
     'harvest': ('elk', 'any', 'Rocky Mtn 2nd season')},
    {'key': 'WEA', 'species': 'ELK', 'weapon': 'ARCHERY', 'name': 'Western Oregon General Archery Elk', 'tag': 'General Archery Season Elk Tag',
     'dates': [('2026-08-29', '2026-09-27')],
     'units': {**{u: 'One elk' for u in (15, 20, 23, 25, 28)}, **{u: 'One bull elk' for u in (11, 12, 14, 17, 18, 27)},
               **{u: 'One bull elk, except one elk outside USFS lands' for u in (16, 19, 21, 22, 29, 30)}, **{u: 'One 3 pt.+ bull elk' for u in (10, 24)}, 26: 'One spike elk'},
     'harvest': ('elk', 'archery', 'Western Elk Archery')},
    {'key': 'EEA', 'species': 'ELK', 'weapon': 'ARCHERY', 'name': 'Eastern Oregon General Archery Elk', 'tag': 'General Archery Season Elk Tag',
     'dates': [('2026-08-29', '2026-09-27')],
     'units': {**{u: 'One elk' for u in (35, 38, 40, 41, 42, 43, 44, 45, 64, 67, 68, 69, 70, 71, 73)},
               51: 'One elk (southern portion of the unit only)', 65: 'One elk (eastern portion of the unit only)', 66: 'One elk (southern portion of the unit only)',
               77: 'One elk east of Hwy 97; one bull elk west of Hwy 97',
               **{u: 'One bull elk' for u in (31, 32, 33, 34, 39, 74, 75, 76)}},
     'harvest': ('elk', 'archery', 'Eastern Elk Archery')},
]
# Western Oregon general archery deer: dates and bag by unit (2026 regulations p. 35)
WDA_EARLY = ('2026-08-29', '2026-09-27')
WDA = {}
for u in (11, 12, 14, 22, 24, 27, 28):
    WDA[u] = ('One buck with visible antler', [WDA_EARLY])
WDA[21] = ('One buck with visible antler (one deer in South Indigo)', [WDA_EARLY])
for u in (25, 29, 30):
    WDA[u] = ('One buck with visible antler', [WDA_EARLY, ('2026-11-14', '2026-12-06')])
WDA[23] = ('One deer', [WDA_EARLY, ('2026-11-14', '2026-12-06')])
WDA[26] = ('One buck with visible antler (late period traditional archery only)', [WDA_EARLY, ('2026-11-14', '2026-12-06')])
for u in (10, 17, 18, 20):
    WDA[u] = ('One buck with visible antler', [WDA_EARLY, ('2026-11-21', '2026-12-13')])
for u in (15, 16, 19):
    WDA[u] = ('One deer', [WDA_EARLY, ('2026-11-21', '2026-12-13')])
GENERAL[1]['units'] = {u: v[0] for u, v in WDA.items()}


def norm_name(s: str) -> set[str]:
    s = re.sub(r'[^a-z0-9 ]', ' ', s.lower().replace('mtn', 'mountain').replace('cr ', 'creek ').replace('rvr', 'river'))
    return {t for t in s.split() if t not in {'unit', 'no', 'the', 'of', 'and'}}


def same_hunt(a: str, b: str) -> bool:
    x, y = norm_name(a), norm_name(b)
    if not x or not y:
        return False
    return len(x & y) / len(x | y) >= 0.5 or x <= y or y <= x


def antler_class(series: str, bag: str) -> str:
    b = bag.lower()
    if 'antlerless' in b and not re.search(r'\bbuck\b|\bbull\b|spike', b):
        return 'ANTLERLESS'
    if re.search(r'\bbuck\b|\bbull\b|spike|3 pt', b) and not re.search(r'one (deer|elk|white-tailed deer|black-tailed deer)\b(?! buck)', b):
        return 'ANTLERED'
    if series == '100' and re.search(r'\bbuck\b', b):
        return 'ANTLERED'
    return 'EITHER'


def weapon_of(section: str, code: str) -> str:
    return {'ARCHERY': 'ARCHERY', 'MUZZLELOADER': 'MUZZLELOADER'}.get(section, 'ANY')


def area_of(code: str, units_by_name: dict) -> list[str]:
    m = re.match(r'^([A-Z]{2})\d(\d{2})', code)
    if m:
        a = f'{m.group(1)}-{m.group(2)}'
        return [a] if a in units_by_name else []
    m = re.match(r'^\d(\d{2})', code)
    if m and str(int(m.group(1))) in units_by_name:
        return [str(int(m.group(1)))]
    return []


def season_text(dates):
    def f(d):
        x = date.fromisoformat(d)
        return x.strftime('%b. %-d').replace('May.', 'May').replace('Jun.', 'June').replace('Jul.', 'July').replace('Sep.', 'Sept.')
    out = []
    for p in dates:
        o, c = p['open'], p['close']
        s = f'{f(o)} - {f(c)}'
        if c[:4] != o[:4]:
            s += f', {c[:4]}'
        out.append(s)
    return ' & '.join(out)


def main():
    draws = json.loads((D / 'source' / 'draws-2021-2026.json').read_text())['draws']
    regs = json.loads((D / 'regs-2026.json').read_text())
    harvest = json.loads((D / 'source' / 'harvest-2021-2025.json').read_text())['reports']
    units = {u['name']: u for u in json.loads((D / 'units.json').read_text())['units']}
    land = json.loads((D / 'land.json').read_text())['units']
    picks = json.loads((D / 'backtest.json').read_text())['pick']
    problems = []

    # harvest rows by (year, species) -> code -> [rows]
    by_code: dict[tuple[int, str], dict[str, list]] = {}
    general_rows: dict[tuple[int, str, str], list] = {}
    for key, rep in harvest.items():
        y, sp, wp = key.split(':')
        y = int(y)
        for r in rep['rows']:
            tok = r['hunt'].split()[0] if r['hunt'] else ''
            if r['seasonType'] == 'Controlled' and re.match(r'^([A-Z]{2}\d{3}|\d{3})', tok):
                by_code.setdefault((y, sp), {}).setdefault(tok, []).append(r)
            elif r['seasonType'] == 'General':
                base = re.sub(r'(\s+(\d+|[A-Z]))+$', '', r['hunt'])  # page artifacts: "Coast 2nd season R", "Late Bow Deer 6 F"
                general_rows.setdefault((y, sp, wp), []).append(dict(r, hunt=base))

    def clean_unit(name: str) -> str:
        # stray letters from the page background ("Santiam D", "Fort D Rock") and words split by a hyphen
        n = ' '.join(t for t in (name or '').replace("'", '').split() if not re.fullmatch(r'[A-Z]', t))
        return re.sub(r'-\s+', '', n)

    def unit_num(name: str):
        for u in units.values():
            if u['kind'] == 'wmu' and norm_name(u['label']) == norm_name(name):
                return u['name']
        return None

    # ODFW's harvest tables spell a few units differently from the WMU layer
    ALIAS = {'Stott Mt.': '17', 'Stott Mountain': '17', 'Mt. Emily': '54', 'Mt Emily': '54', 'Mt.': '54', 'Hood': '42', 'Saddle': '10', 'Saddle Mountain': '10',
             'Evans': '29', 'Evans Creek': '29', 'Murderers': '46', 'Murderers Creek': '46', 'Lookout': '64', 'Lookout Mountain': '64', 'Lookout Mtn': '64',
             'Steens': '69', 'Steens Mountain': '69', 'Steens Mtn': '69', 'Beatys': '70', 'Beatys Butte': '70', 'Klamath': '31', 'Klamath Falls': '31',
             'Malheur': '66', 'Malheur River': '66', 'Pine': '62', 'Pine Creek': '62', 'Sled': '57', 'Sled Springs': '57', 'Walla': '55', 'Walla Walla': '55',
             'Silver': '76', 'Silver Lake': '76', 'Fort': '77', 'Fort Rock': '77', 'Columbia': '44', 'Columbia Basin': '44', 'Upper': '34', 'Upper Deschutes': '34',
             'Catherine': '58', 'Catherine Creek': '58', 'White': '41', 'White River': '41', 'Mckenzie': '19', 'McKenzie': '19'}
    unit_by_label = {}
    for key, rep in harvest.items():
        for r in rep['rows']:
            if r['unit'] and r['unit'] not in unit_by_label and clean_unit(r['unit']):
                unit_by_label[r['unit']] = unit_num(clean_unit(r['unit'])) or ALIAS.get(clean_unit(r['unit']))
    unmatched = sorted(k for k, v in unit_by_label.items() if v is None)
    unmatched = sorted(k for k, v in unit_by_label.items() if v is None)
    if unmatched:
        problems.append(f'harvest unit names not matched to a WMU: {unmatched}')

    def bag_area_info(us):
        acres = sum(units[u]['acres'] for u in us)
        if not acres:
            return None, None, None
        pub = sum(land[u]['publicPct'] * units[u]['acres'] for u in us) / acres
        priv = sum(land[u]['privatePct'] * units[u]['acres'] for u in us) / acres
        return acres, round(pub, 1), round(priv, 1)

    out = []
    for kind in ('buck', 'antlerless', 'elk'):
        series = SERIES[kind]
        species = 'ELK' if kind == 'elk' else 'DEER'
        for code, h in sorted(draws[f'{DRAW_YEAR}:{kind}']['hunts'].items()):
            rg = regs['hunts'][code]
            desc = regs['descriptions'].get(code)
            name = re.sub(r'\s+', ' ', h['name'].replace('*', '')).strip()
            # lineage: years whose draw report has this hunt number under a matching name
            years = [y for y in range(2021, DRAW_YEAR + 1) if code in draws.get(f'{y}:{kind}', {}).get('hunts', {}) and same_hunt(draws[f'{y}:{kind}']['hunts'][code]['name'], h['name'])]
            # units: the hunt-number unit or hunt area, plus every unit ODFW's harvest tables list for the hunt
            us = set(area_of(code, units))
            hv = []
            unit_hunters: dict[str, int] = {}
            for y in years:
                rows = by_code.get((y, 'elk' if kind == 'elk' else 'deer'), {}).get(code, [])
                if not rows:
                    continue
                for r in rows:
                    u = unit_by_label.get(r['unit'])
                    if u and not re.match(r'^[A-Z]{2}\d', code):
                        unit_hunters[u] = unit_hunters.get(u, 0) + r['hunters']
                hv.append({'year': y, 'hunters': sum(r['hunters'] for r in rows), 'harvest': sum(r['harvest'] for r in rows),
                           'antlered': sum(r['antlered'] for r in rows), 'days': sum(r['days'] for r in rows),
                           'big': sum((r.get('pt4plus', 0) if kind != 'elk' else r.get('pt5', 0) + r.get('pt6plus', 0)) for r in rows),
                           'units': sorted({unit_by_label.get(r['unit']) or r['unit'] for r in rows})})
            # a unit counts when it holds at least 3% of the hunt's reported hunters (a stray report in a
            # neighbouring unit doesn't make the hunt span it); the hunt-number unit always counts
            tot_h = sum(unit_hunters.values())
            us |= {u for u, n in unit_hunters.items() if tot_h and n / tot_h >= 0.03}
            us = sorted(us, key=lambda x: (not x.isdigit(), int(x) if x.isdigit() else 0, x))
            if not us:
                problems.append(f'{code}: no unit')
                continue
            acres, pub, priv = bag_area_info(us)
            pub_src = 'units'
            if desc and desc.get('publicPct') is not None:
                pub, priv, pub_src = float(desc['publicPct']), None, 'odfw'  # a part of a unit: ODFW's own printed share
            od = last_draw(h)
            if not od and h['tags'] and not h['apps']:
                # nobody applied in 2026: any applicant would have drawn
                od = {'res': [1.0] * (MAX_PTS + 1), 'nr': [1.0] * (MAX_PTS + 1)}
            if not od:
                problems.append(f'{code}: no odds')
                continue
            proj = {}
            for pool in ('res', 'nr'):
                p = picks.get(f'{kind}:{pool}')
                if p and p['ship'] and p['best'].startswith('shift') and pool in od:
                    proj[pool] = [round(x, 6) for x in shift(od[pool], float(p['best'][5:]))]
            hv5 = [x for x in hv if x['year'] >= 2021]
            hunters5 = sum(x['hunters'] for x in hv5)
            harvest5 = sum(x['harvest'] for x in hv5)
            last = hv5[-1] if hv5 else None
            antlered5 = sum(x['antlered'] for x in hv5)
            big5 = sum(x['big'] for x in hv5)
            sqmi = acres / 640 if acres and pub_src == 'units' else None
            demand = {}
            for y in years:
                x = draws[f'{y}:{kind}']['hunts'][code]
                rows = x['rows']
                pref = [p for p, n, ra, rd, na, nd in rows if (rd or nd)]
                demand[str(y)] = {'tags': x['tags'], 'drawn': x['drawn'], 'apps': x['apps'], 'resApps': x['resApps'], 'nrApps': x['nrApps'],
                                  'resDrawn': x['resDrawn'], 'nrDrawn': x['nrDrawn'], 'prefCutoff': min(pref) if pref else None}
            res_rate = h['resDrawn'] / h['resApps'] if h['resApps'] else None
            nr_rate = h['nrDrawn'] / h['nrApps'] if h['nrApps'] else None
            youth = rg['section'] == 'YOUTH ONLY' or bool(re.search(r'T\d?$|T\d?-\d$', code))
            dates = rg['dates']
            ac = antler_class(series, rg['bag'])
            if kind == 'antlerless' and ac == 'ANTLERED':
                problems.append(f'{code}: antlerless series with an antlered bag ({rg["bag"]})')
            # private-land-only: ODFW's boundary description says "PRIVATE LANDS ONLY", "All private land" or "0%
            # public lands"; hunts with no description fall back to a name ending in "Private"
            private_only = bool(desc and desc.get('privateOnly')) or (not desc and bool(re.search(r'\bPrivate( Lands)?( No\. ?\d)?$', name)))
            po = {
                'state': 'OR', 'kind': 'preference', 'year': DRAW_YEAR, 'projYear': PROJ_YEAR, 'projected': sorted(proj),
                'series': series, 'section': rg['section'].title(), 'legal': rg['bag'], 'dates': season_text(dates), 'tags': h['tags'],
                'privateLimited': rg['privateLimited'], 'newHunt': rg['newHunt'] or len(years) == 1, 'apps2025': rg['apps2025'],
                'publicPctSource': pub_src, 'boundary': desc['text'][:600] if desc else None,
                'pointsMeaning': 'Points you hold when you apply. 75% of the tags go to the most points (0 points never draw there); the rest by random draw, with the same random number.',
                'demand': demand, 'harvest': hv, 'pools': {pool: {'rows': [[p, n, d] for p, n, d in pool_rows(h, pool)]} for pool in ('res', 'nr')},
            }
            rec = {
                'id': f'OR:{code}', 'slug': f'or-{code.lower()}', 'state': 'OR', 'species': species, 'type': 'CONTROLLED', 'tagCode': code,
                'name': name, 'areaName': ', '.join(units[u]['label'] + (f' ({u})' if u.isdigit() else '') for u in us[:4]) + (' …' if len(us) > 4 else ''),
                'description': rg['section'].title(), 'huntCategory': f'{series} series', 'units': us,
                'weapon': weapon_of(rg['section'], code), 'antlerClass': ac, 'takeMethod': rg['bag'], 'tagRequired': f'Controlled {series} Series Tag',
                'openDate': dates[0]['open'] if dates else None, 'closeDate': max(d['close'] for d in dates) if dates else None,
                'tags': h['tags'], 'privateOnly': private_only, 'youthOnly': youth,
                'oddsLastYear': DRAW_YEAR, 'oddsYears': len(years), 'appsLast': h['apps'], 'permitsLast': h['drawn'],
                'resAppsLast': h['resApps'], 'nrAppsLast': h['nrApps'], 'nrPermitsLast': h['nrDrawn'],
                'resOddsLast': res_rate, 'nrOddsLast': nr_rate,
                'success5': harvest5 / hunters5 if hunters5 else None, 'hunters5': hunters5 or None, 'harvest5': harvest5 if hunters5 else None,
                'harvestYears': len(hv5), 'harvestLastYear': last['year'] if last else None,
                'successLast': last['harvest'] / last['hunters'] if last and last['hunters'] else None,
                'daysPerHunter5': sum(x['days'] for x in hv5) / hunters5 if hunters5 else None,
                'smallSample': hunters5 < 30 if hunters5 else True,
                'bigPct5': big5 / antlered5 if antlered5 and ac != 'ANTLERLESS' else None,
                'acres': acres if pub_src == 'units' else None, 'publicPct': pub, 'privatePct': priv,
                'huntersSqMi': (last['hunters'] / sqmi) if last and sqmi else None,
                'oddsByPts': {'proj': proj, 'last': od},
                'tagSeasons': {'year': DRAW_YEAR, 'seasons': [{'weapon': weapon_of(rg['section'], code), 'sex': rg['bag'], 'dates': dates, 'notes': ''}]},
                'pointOdds': po,
            }
            out.append(rec)

    # general seasons, one row per WMU and season
    for g in GENERAL:
        sp = 'elk' if g['species'] == 'ELK' else 'deer'
        for u, bag in sorted(g['units'].items()):
            un = str(u)
            if un not in units:
                problems.append(f'general {g["key"]}: unit {u} missing')
                continue
            label = units[un]['label']
            names = g['harvest'][2] if isinstance(g['harvest'][2], tuple) else (g['harvest'][2],)
            hv = []
            for y in range(2021, 2026):
                rows = [r for r in general_rows.get((y, sp, g['harvest'][1]), []) if r['hunt'] in names and unit_by_label.get(r['unit']) == un]
                # Western Oregon general archery deer: Eastern Oregon units' 2021-2025 rows were general archery too,
                # but East archery deer is controlled from 2026, so only West units get a general archery row at all
                if rows:
                    hv.append({'year': y, 'hunters': sum(r['hunters'] for r in rows), 'harvest': sum(r['harvest'] for r in rows), 'days': sum(r['days'] for r in rows),
                               'antlered': sum(r['antlered'] for r in rows),
                               'big': sum((r.get('pt4plus', 0) if sp == 'deer' else r.get('pt5', 0) + r.get('pt6plus', 0)) for r in rows)})
            dates = [{'open': o, 'close': c} for o, c in (WDA[u][1] if g['key'] == 'WDA' else g['dates'])]
            hunters5 = sum(x['hunters'] for x in hv)
            harvest5 = sum(x['harvest'] for x in hv)
            antl = sum(x['antlered'] for x in hv)
            last = hv[-1] if hv else None
            ac = antler_class('200' if sp == 'elk' else '100', bag) if 'except one elk' not in bag else 'EITHER'
            if 'one elk east of' in bag.lower():
                ac = 'EITHER'
            land_u = land[un]
            out.append({
                'id': f'OR:G{g["key"]}-{un}', 'slug': f'or-g{g["key"].lower()}-{un}', 'state': 'OR', 'species': g['species'], 'type': 'GENERAL',
                'tagCode': g['tag'], 'name': f'{label} ({un}) {g["name"]}', 'areaName': f'WMU {un} {label}', 'description': 'General season',
                'huntCategory': 'General', 'units': [un], 'weapon': g['weapon'], 'antlerClass': ac, 'takeMethod': bag, 'tagRequired': g['tag'],
                'openDate': dates[0]['open'], 'closeDate': max(d['close'] for d in dates), 'tags': None, 'privateOnly': False, 'youthOnly': False,
                'oddsLastYear': None, 'oddsYears': 0,
                'success5': harvest5 / hunters5 if hunters5 else None, 'hunters5': hunters5 or None, 'harvest5': harvest5 if hunters5 else None,
                'harvestYears': len(hv), 'harvestLastYear': last['year'] if last else None,
                'successLast': last['harvest'] / last['hunters'] if last and last['hunters'] else None,
                'daysPerHunter5': sum(x['days'] for x in hv) / hunters5 if hunters5 else None, 'smallSample': hunters5 < 30 if hunters5 else True,
                'bigPct5': sum(x['big'] for x in hv) / antl if antl else None,
                'acres': units[un]['acres'], 'publicPct': land_u['publicPct'], 'privatePct': land_u['privatePct'],
                'huntersSqMi': last['hunters'] / (units[un]['acres'] / 640) if last else None,
                'oddsByPts': {'proj': {}, 'last': {}},
                'tagSeasons': {'year': DRAW_YEAR, 'seasons': [{'weapon': g['weapon'], 'sex': bag, 'dates': dates, 'notes': ''}]},
                'pointOdds': {'state': 'OR', 'kind': 'otc', 'year': DRAW_YEAR, 'projected': [], 'legal': bag, 'dates': season_text(dates), 'tag': g['tag'],
                              'generalKey': g['key'], 'harvest': hv,
                              'note': 'Harvest is ODFW\'s estimate for this unit and season; a hunter who hunted two units is counted in both.'},
            })

    # every hunt: success consistent, odds monotone
    for r in out:
        if r['success5'] is not None and r['harvest5'] > r['hunters5']:
            problems.append(f"{r['id']}: harvest above hunters")
        for m in ('proj', 'last'):
            for pool, arr in r['oddsByPts'][m].items():
                if any(not (0 <= x <= 1) for x in arr) or any(arr[i] + 1e-9 < arr[i - 1] for i in range(1, len(arr))):
                    problems.append(f"{r['id']}: bad {m} {pool} odds")
    if problems:
        raise SystemExit('Oregon hunts failed checks:\n' + '\n'.join(problems[:60]))
    (D / 'hunts.json').write_text(json.dumps({'drawYear': DRAW_YEAR, 'regsYear': DRAW_YEAR, 'problems': [], 'hunts': out}, separators=(',', ':')) + '\n')
    c = {}
    for r in out:
        k = (r['species'], r['type'])
        c[k] = c.get(k, 0) + 1
    print(len(out), 'hunts', {f'{a} {b}': v for (a, b), v in sorted(c.items())})
    print('with harvest:', sum(1 for r in out if r['hunters5']), 'private-only:', sum(r['privateOnly'] for r in out), 'youth:', sum(r['youthOnly'] for r in out),
          'projected pools:', sum(bool(r['oddsByPts']['proj']) for r in out))


if __name__ == '__main__':
    main()
