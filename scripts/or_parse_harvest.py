#!/usr/bin/env python3
"""Parse ODFW's deer and elk harvest summaries (2021-2025) into data/or/source/harvest-2021-2025.json.

Usage: python3 -I scripts/or_parse_harvest.py <dir of harvest PDFs named YEAR__file.pdf> data/or/source/harvest-2021-2025.json

Sources: https://myodfw.com/articles/big-game-hunting-harvest-statistics (2025, myodfw.com) and the
dfw.state.or.us .../controlled_hunts/docs/hunts_summary_reports/<year>/ files it links (2020-2024), saved from
Claude in Chrome on 2026-11-17. Reports read: Buck Deer by weapon (Any Legal Weapon, Archery, Muzzleloader),
Antlerless Deer, Elk by weapon. The public-vs-private and damage-tag summaries are not used.

Every report lists, by zone and wildlife management unit (WMU), one row per hunt or general season: hunters,
days, antlerless, antlered, total harvest, antler classes and success %. A hunt that spans several units has a
row in each unit; ODFW's hunter counts are per unit, so a hunt's statewide hunters are the sum of its unit rows
(a hunter who hunted two units of one hunt is counted in both; see or-onboarding.md section 4).

Checks: every data row has the full set of numbers; each zone's printed total equals the sum of its rows
(hunters and harvest) in at least 95% of zones, else the parse stops.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

DEER = ['hunters', 'days', 'antlerless', 'antlered', 'harvest', 'spike', 'pt2', 'pt3', 'pt4plus']
ELK = ['hunters', 'days', 'antlerless', 'antlered', 'harvest', 'spike', 'pt2', 'pt3', 'pt4', 'pt5', 'pt6plus']
ZONES = {'Northwest', 'Southwest', 'Northeast', 'Central', 'Southeast', 'High Desert', 'Mid Columbia', 'Columbia Basin',
         'Blue Mountains', 'Cascade', 'Coast', 'Statewide', 'Western Oregon', 'Eastern Oregon'}
NUM = re.compile(r'^-?[\d,]+$')


def report_of(name: str):
    n = name.lower()
    species = 'elk' if 'elk' in n else 'deer'
    if 'public' in n or 'damage' in n:
        return None
    if 'antlerless deer' in n or 'antlerless_deer' in n:
        return ('antlerless', species)
    if 'archery' in n:
        weapon = 'archery'
    elif 'muzzleloader' in n or ' ml ' in n:
        weapon = 'muzzleloader'
    elif 'any legal weapon' in n or 'any_legal_weapon' in n or ' alw ' in n:
        weapon = 'any'
    else:
        return None
    return (weapon, species)


def page_lines(path: Path):
    """Lines of cells, read with pdfplumber in content-stream order. In several ODFW summaries a long hunt name
    is printed over the numbers next to it (pdftotext then interleaves them: "Western83Oregon"); the stream
    writes the name first and the numbers after, so a cell ends where the next character jumps back left,
    leaves a gap or changes line."""
    import pdfplumber
    out = []
    with pdfplumber.open(str(path)) as pdf:
        for page in pdf.pages:
            cells = []
            cur = None
            for c in page.chars:
                t = c['text']
                if cur is not None and (abs(c['top'] - cur['top']) > 2 or c['x0'] < cur['x1'] - 1 or c['x0'] - cur['x1'] > 6):
                    cells.append(cur)
                    cur = None
                if cur is None:
                    if t.isspace():
                        continue
                    cur = {'x0': c['x0'], 'x1': c['x1'], 'top': c['top'], 'text': t, 'xs': [c['x0']]}
                else:
                    if c['x0'] - cur['x1'] > 1.2 and not t.isspace() and not cur['text'].endswith(' '):
                        cur['text'] += ' '  # some pages position words without a space character
                        cur['xs'].append(cur['x1'])
                    cur['text'] += t
                    cur['xs'].append(c['x0'])
                    cur['x1'] = c['x1']
            if cur:
                cells.append(cur)
            for c in cells:
                c['text'] = re.sub(r'\s+', ' ', c['text']).rstrip()
            cells = [c for c in cells if c['text']]
            cells.sort(key=lambda c: (round(c['top']), c['x0']))
            lines = []
            for c in cells:
                if lines and abs(lines[-1][0]['top'] - c['top']) <= 2.5:
                    lines[-1].append(c)
                else:
                    lines.append([c])
            out.append([sorted(ln, key=lambda c: c['x0']) for ln in lines])
    return out


def parse_pdf(path: Path, cols):
    rows, zones_check = [], []
    season_type = zone = unit = None
    unit_rows = []
    col_x = None
    for page in page_lines(path):
        hunt_x = unit_x = None
        for ln in page:
            texts = [c['text'] for c in ln]
            joined = ' '.join(texts)
            for c in ln:
                if c['text'].startswith('Season/Tag/Hunt') or 'Season/Tag/Hunt' in c['text']:
                    hunt_x = c['x0'] + c['text'].index('Season/Tag/Hunt') * 5
                if c['text'] in ('Unit', 'Unit Name') or c['text'].startswith('Unit '):
                    unit_x = c['x0']
            if 'Season/Tag/Hunt' in joined or hunt_x is None:
                continue
            if ln[0]['text'] in ('Controlled', 'General') and (len(ln) <= 2 or not any('%' in c['text'] for c in ln)):
                season_type = ln[0]['text']
                continue
            if re.search(r'\bHunters\b|\bHunted\b', joined) and not re.search(r'\d', joined):
                continue  # second header line
            # a unit name run straight into the hunt name ("Lookout Mountain151M Baker"): split at hunt_x
            fixed = []
            for c in ln:
                if c['x0'] < hunt_x - 3 and c['x1'] > hunt_x + 4 and 'xs' in c and len(c['xs']) == len(c['text']):
                    k = next((i for i, x in enumerate(c['xs']) if x >= hunt_x - 4), None)
                    if k:
                        a, b = c['text'][:k].strip(), c['text'][k:].strip()
                        m = re.match(r'^(.*?[a-z])(\d{3}.*)$', a + b) if not b or not a else None
                        if m:
                            a, b = m.group(1), m.group(2)
                        if a and b:
                            fixed += [dict(c, text=a, x1=c['xs'][k]), dict(c, text=b, x0=hunt_x)]
                            continue
                fixed.append(c)
            ln = fixed
            nums = [c for c in ln if re.fullmatch(r'[\d,]+|\d+%|NA%?', c['text']) and c['x0'] > hunt_x + 60]
            text_cells = [c for c in ln if c not in nums]
            if len(nums) == len(cols) + 1:
                col_x = [c['x1'] for c in nums]  # right edges of the number columns, from a full row
            elif col_x and 2 <= len(nums) <= len(cols) and text_cells:
                # ODFW leaves cells blank when nothing was taken: place each number by its right edge, blanks = 0
                slots = [None] * (len(cols) + 1)
                for c in nums:
                    k = min(range(len(col_x)), key=lambda i: abs(col_x[i] - c['x1']))
                    slots[k] = c
                if slots[0] is not None and slots[1] is not None:
                    nums = [c if c is not None else {'text': '0' if i < len(cols) else 'NA%', 'x1': col_x[i]} for i, c in enumerate(slots)]
            if nums and not nums[-1]['text'].endswith('%') and len(nums) == len(cols):
                nums = nums + [{'text': 'NA%', 'x0': 9e9}]  # ODFW left the success % blank (2023 Alsea archery elk)
            if not nums or not nums[-1]['text'].endswith('%'):
                s = joined.strip()
                x = ln[0]['x0']
                if s in ('Controlled', 'General'):
                    season_type = s
                elif re.fullmatch(r'(Controlled|General) .+', s) and not re.search(r'\d', s):
                    season_type, zone = s.split(' ', 1)
                elif x < (unit_x or hunt_x) - 5 and not re.search(r'\d', s) and len(s) < 30:
                    zone = s
                elif x < hunt_x - 3 and len(s) < 22 and unit and not re.search(r'\d', s):
                    unit = unit + ' ' + s  # "Columbia" / "Basin": the unit name wrapped below its first rows
                    for r in unit_rows:
                        r['unit'] = unit
                elif x >= hunt_x - 3 and rows and not re.search(r'Estimated|Reports', s):
                    rows[-1]['hunt'] += ' ' + s  # hunt name wrapped onto the next line
                continue
            vals = [c['text'] for c in nums]
            pct_s = vals[-1].rstrip('%')
            ints = vals[:-1]
            if len(ints) != len(cols) or not all(re.fullmatch(r'[\d,]+', v) for v in ints):
                continue
            rec = dict(zip(cols, [int(v.replace(',', '')) for v in ints]))
            rec['successPct'] = int(pct_s) if pct_s.isdigit() else None
            hunt = ' '.join(c['text'] for c in text_cells if c['x0'] >= hunt_x - 3)
            left = ' '.join(c['text'] for c in text_cells if c['x0'] < hunt_x - 3)
            for st in ('Controlled', 'General'):
                if left == st or left.startswith(st + ' '):
                    season_type, left = st, left[len(st):].strip()
            if re.search(r'grand total', hunt + ' ' + left, re.I):
                continue
            if not hunt and not left and rec['hunters'] == 0:
                continue  # an all-zero row whose hunt name ODFW printed on another line; nothing to keep
            if not hunt or re.search(r'zone total', hunt, re.I):
                if left:
                    zone = left  # 2020-2023: the zone's total sits on its heading line
                zname = re.sub(r'\s*Zone Total.*', '', hunt, flags=re.I) if hunt else zone
                zones_check.append((season_type, zname, rec))
                continue
            if left:
                unit_cells = [c['text'] for c in text_cells if c['x0'] < hunt_x - 3 and (unit_x is None or c['x0'] >= unit_x - 5)]
                zone_cells = [c['text'] for c in text_cells if unit_x is not None and c['x0'] < unit_x - 5]
                if zone_cells:
                    z = ' '.join(zone_cells)
                    for st in ('Controlled', 'General'):
                        if z == st or z.startswith(st + ' '):
                            season_type, z = st, z[len(st):].strip()
                    if z:
                        zone = z
                if unit_cells:
                    unit = ' '.join(unit_cells)
                    unit_rows = []
            rec.update({'seasonType': season_type, 'zone': zone, 'unit': unit, 'hunt': hunt})
            rows.append(rec)
            unit_rows.append(rec)
    return rows, zones_check


def main(src: str, dest: str):
    out, problems, mism = {}, [], []
    for f in sorted(Path(src).glob('*.pdf')):
        year = int(f.name[:4])
        if year < 2021:  # 2021-2025: five seasons; the 2020 archery deer summary does not reconcile by zone
            continue
        rk = report_of(f.name.split('__', 1)[1].replace('_', ' '))
        if not rk:
            continue
        weapon, species = rk
        cols = ELK if species == 'elk' else DEER
        rows, zc = parse_pdf(f, cols)
        key = f'{year}:{species}:{weapon}'
        if key in out:
            problems.append(f'{key}: two files ({out[key]["file"]}, {f.name})')
        ok = tot = 0
        for st, zone, rec in zc:
            zr = [r for r in rows if r['seasonType'] == st and r['zone'] == zone]
            if not zr:
                continue
            tot += 1
            tol = lambda v: max(3, 0.01 * v)  # ODFW's estimates are rounded row by row
            if abs(sum(r['hunters'] for r in zr) - rec['hunters']) <= tol(rec['hunters']) and abs(sum(r['harvest'] for r in zr) - rec['harvest']) <= tol(rec['harvest']):
                ok += 1
            else:
                mism.append(f"{key} {st} {zone}: rows {sum(r['hunters'] for r in zr)}/{sum(r['harvest'] for r in zr)} vs total {rec['hunters']}/{rec['harvest']}")
        out[key] = {'file': f.name.split('__', 1)[1], 'rows': rows, 'zoneTotalsChecked': tot, 'zoneTotalsMatched': ok}
        if tot and ok / tot < 0.95:
            problems.append(f'{key}: zone totals matched {ok}/{tot}')
        if not rows:
            problems.append(f'{key}: no rows')
    for m in mism:
        print('zone mismatch:', m)
    if problems:
        raise SystemExit('\n'.join(problems))
    Path(dest).write_text(json.dumps({'source': 'ODFW harvest summaries 2021-2025 (see script header)', 'reports': out}, separators=(',', ':')))
    for k, v in sorted(out.items()):
        print(k, len(v['rows']), 'zones', v['zoneTotalsMatched'], '/', v['zoneTotalsChecked'])


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
