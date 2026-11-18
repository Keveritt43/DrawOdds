#!/usr/bin/env python3
"""Parse ODFW's controlled hunt draw reports (deer and elk) into data/or/source/draws-2021-2026.json.

Usage: python3 -I scripts/or_parse_draws.py <dir of ODFW .xlsx files> data/or/source/draws-2021-2026.json

Inputs: the "Preference Point Draw Report" (2021: "Point Summary Report") and "Applicants by Hunt Choice"
(2021: "Detail Report") workbooks for Buck Deer (100 series), Antlerless Deer (600) and Elk (200), 2021-2026,
listed on https://myodfw.com/articles/point-summary-reports (saved from Claude in Chrome on 2026-11-17; the
shells can't reach myodfw.com). ODFW posted no 2022 antlerless report.

Each draw report has one block per hunt: hunt-level totals (tags authorized, resident/nonresident first-choice
applicants and drawn, total drawn, the points of all applicants, of preference-phase winners (P1) and of
random-phase winners (P2)), then one row per point level of FIRST-CHOICE applicants with the applicants and the
number drawn IN THE PREFERENCE PHASE ("Applicants included in Preference Point Draw Phase (75%)"). Random-phase
winners are only given as a total and a point sum. See docs/states/or-onboarding.md section 2.

Checks (the parse stops if they fail, except ODFW's own known slips listed in main()): every hunt's point rows sum to its first-choice applicants and to its
resident/nonresident split; preference-phase draws at 0 points are always 0. In 2025-2026 the points columns
also sum exactly to the printed point totals; in 2021-2024 they don't always (party averages), so that check
is reported, not enforced.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import openpyxl

KINDS = {'buck': 'Buck Deer', 'antlerless': 'Antlerless Deer', 'elk': 'Elk'}


def kind_of(name: str):
    if 'Premium' in name:
        return None
    if re.search('ntlerless|anterless', name):
        return 'antlerless'
    if re.search('Buck|buck', name):
        return 'buck'
    if re.search('Elk|elk', name):
        return 'elk'
    return None


def year_of(name: str) -> int:
    m = re.search(r'(20\d\d)[ _]', name.split('__')[-1])
    return int(m.group(1))


def cell_int(v):
    if v is None or v == '':
        return None
    return int(round(float(v)))


def parse_draw(path: Path):
    ws = openpyxl.load_workbook(path, read_only=True, data_only=True).worksheets[0]
    hunts: dict[str, dict] = {}
    cur = None
    header = False
    for r in ws.iter_rows(values_only=True):
        r = list(r) + [None] * (18 - len(r))
        if not header:
            header = r[0] == 'Hunt Number'
            continue
        if all(c is None or str(c).strip() == '' for c in r):
            continue
        if r[0] is not None:
            code = str(r[0]).strip()
            if code.lower().startswith(('total', 'grand')):
                cur = None
                continue
            vals = [cell_int(v) for v in r[2:12]]
            tail = r[12:18]
            h = hunts.setdefault(code, {
                'hunt': code, 'name': str(r[1] or '').strip(), 'tags': vals[0], 'resApps': vals[1], 'resDrawn': vals[2],
                'nrApps': vals[3], 'nrDrawn': vals[4], 'apps': vals[5], 'drawn': vals[6], 'ptsApps': vals[7],
                'ptsP1': vals[8], 'ptsP2': vals[9], 'rows': [],
            })
            if h['tags'] != vals[0]:
                raise SystemExit(f'{path.name}: hunt {code} appears twice with different totals')
            cur = h
        else:
            vals = [c for c in r if c is not None and str(c).strip() != '']
            tail = vals[-6:] if len(vals) >= 6 else None
            if tail is None or cur is None:
                continue
        if any(c is None for c in tail):
            continue
        p, n, ra, rd, na, nd = (cell_int(v) for v in tail)
        cur['rows'].append([p, n, ra, rd, na, nd])
    return hunts


def parse_choices(path: Path):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    out = {}
    if not wb.worksheets:  # ODFW's 2024 Buck Deer choice workbook has no readable sheet (checked 2026-11-17)
        return None
    ws = wb.worksheets[0]
    header = False
    for r in ws.iter_rows(values_only=True):
        r = list(r)
        if not header:
            header = bool(r) and r[0] == 'Hunt Number'
            continue
        if not r or r[0] is None:
            continue
        code = str(r[0]).strip()
        if code.lower().startswith('total'):
            continue
        nums = [cell_int(v) for v in r[1:8]]
        if any(v is None for v in nums):
            continue
        out[code] = dict(zip(['c1', 'c2', 'c3', 'c4', 'c5', 'lop', 'total'], nums))
    return out


def main(src: Path, dest: Path):
    draws, choices, problems, notes = {}, {}, [], []
    for f in sorted(src.glob('*.xlsx')):
        k = kind_of(f.name)
        if not k:
            continue
        y = year_of(f.name)
        key = f'{y}:{k}'
        if 'Applicants by Hunt Choice' in f.name or 'Detail Report' in f.name:
            c = parse_choices(f)
            if c is None:
                notes.append(f'{key}: choice workbook unreadable')
                continue
            choices[key] = {'file': f.name.split('__')[-1], 'hunts': c}
        elif re.search('Preference Point|_points|Point Summary', f.name):
            hunts = parse_draw(f)
            for h in hunts.values():
                rows = h['rows']
                if sum(x[1] for x in rows) != h['apps']:
                    problems.append(f'{key} {h["hunt"]}: point rows {sum(x[1] for x in rows)} != apps {h["apps"]}')
                if sum(x[2] for x in rows) != h['resApps'] or sum(x[4] for x in rows) != h['nrApps']:
                    problems.append(f'{key} {h["hunt"]}: residency split does not add up')
                if any(x[0] == 0 and (x[3] or x[5]) for x in rows):
                    problems.append(f'{key} {h["hunt"]}: preference draw at 0 points')
                if sum(x[0] * x[1] for x in rows) != h['ptsApps']:
                    notes.append(f'{key} {h["hunt"]}: points column {sum(x[0] * x[1] for x in rows)} vs printed {h["ptsApps"]}')
            draws[key] = {'file': f.name.split('__')[-1], 'hunts': hunts}
    # ODFW's own inconsistencies, checked against the workbooks on 2026-11-17 and kept as printed: 2021-2024 hunt
    # 158 (Buck Deer) appears with point rows summing past its applicants; 2022 elk 256A lists 35 of its 37 (2021 elk 273A, 62 of 65)
    # applicants; 2026 antlerless 615 prints 0 nonresident applicants above point rows holding 51. The build uses
    # the point rows. Any other failure stops the parse.
    KNOWN = ('2021:buck 158', '2022:buck 158', '2023:buck 158', '2024:buck 158', '2022:elk 256A', '2021:elk 273A', '2026:antlerless 615')
    hard = [p for p in problems if not p.startswith(KNOWN)]
    soft = [p for p in problems if p.startswith(KNOWN)]
    out = {
        'source': 'ODFW controlled hunt draw reports, https://myodfw.com/articles/point-summary-reports (saved 2026-11-17)',
        'rowColumns': ['points', 'applicants', 'resApps', 'resDrawnPref', 'nrApps', 'nrDrawnPref'],
        'draws': draws, 'choices': choices,
        'knownProblems': soft,
        'pointSumNotes': len(notes),
    }
    if hard:
        raise SystemExit('draw reports failed checks:\n' + '\n'.join(hard[:40]))
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(out, separators=(',', ':')))
    print(json.dumps({k: len(v['hunts']) for k, v in sorted(draws.items())}), 'choices', len(choices), 'notes', len(notes), 'known', soft)


if __name__ == '__main__':
    main(Path(sys.argv[1]), Path(sys.argv[2]))
