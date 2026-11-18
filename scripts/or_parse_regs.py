#!/usr/bin/env python3
"""Parse the 2026 Oregon Big Game Hunting Regulations' controlled deer and elk hunt tables and the controlled hunt
boundary descriptions into data/or/regs-2026.json.

Usage: python3 -I scripts/or_parse_regs.py <26_BG_regs.pdf> data/or/source/draws-2021-2026.json data/or/regs-2026.json

Source: https://myodfw.com/sites/default/files/2025-11/26_BG_regs.pdf (saved from Claude in Chrome 2026-11-17).
Text is read with pdftotext -layout (tables) and -raw (descriptions). The hunt list itself comes from ODFW's 2026
draw reports (every 100, 200 and 600 series hunt drawn in 2026); this parser only adds what the tables print:
the section (weapon, youth only), bag limit, season dates, the "*" that marks hunts where private lands limit
access, and the 2025 first-choice applicants ("NEW" for the 2026 Eastern Oregon deer hunt areas).

Checks: every 2026 draw-report hunt is found once in the tables, its printed tags equal the report's tags
authorized, and it has a bag limit and at least one season date. Failures stop the build.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from datetime import date
from pathlib import Path

CODE = re.compile(r'^(?:[A-Z]{2}\d{3}[A-Z]?\d?(?:-\d)?|\d{3}[A-Z]{0,2}\d?)$')
MONTHS = {'Jan': 1, 'Feb': 2, 'Mar': 3, 'Apr': 4, 'May': 5, 'Jun': 6, 'June': 6, 'Jul': 7, 'July': 7, 'Aug': 8,
          'Sep': 9, 'Sept': 9, 'Oct': 10, 'Nov': 11, 'Dec': 12}
DATE_RANGE = re.compile(r'([A-Z][a-z]{2,4})\.?\s*(\d{1,2})(?:,\s*(\d{4}))?\s*-\s*(?:([A-Z][a-z]{2,4})\.?\s*)?(\d{1,2})(?:,?\s*(\d{4}))?')
SECTION = re.compile(r'(ANY LEGAL WEAPON|ARCHERY|MUZZLELOADER|YOUTH ONLY) CONTROLLED (100|200|600) SERIES HUNTS')


def chunks(line: str):
    """[(start column, text)] split on runs of 2+ spaces."""
    out = []
    for m in re.finditer(r'\S(?:.*?\S)?(?=\s{2,}|$)', line):
        out.append((m.start(), m.group(0)))
    return out


def to_dates(text: str, year: int = 2026):
    text = re.sub(r'\s+', ' ', text)
    extra = []
    m0 = re.match(r'([A-Z][a-z]{2,4})\.? (\d{1,2})-(\d{1,2})((?:, \d{1,2}-\d{1,2})+)', text)
    if m0 and m0.group(1) in MONTHS:  # "Nov. 7-8, 14-15, 21-22, 28-29": several short periods in one month
        mo = MONTHS[m0.group(1)]
        for a, b in [(m0.group(2), m0.group(3))] + re.findall(r'(\d{1,2})-(\d{1,2})', m0.group(4)):
            extra.append({'open': date(year, mo, int(a)).isoformat(), 'close': date(year, mo, int(b)).isoformat()})
        return extra
    out = []
    for m in DATE_RANGE.finditer(text):
        m1, d1, y1, m2, d2, y2 = m.groups()
        if m1 not in MONTHS or (m2 and m2 not in MONTHS):
            continue
        a_m, b_m = MONTHS[m1], MONTHS[m2] if m2 else MONTHS[m1]
        b_y = int(y2) if y2 else year
        a_y = int(y1) if y1 else (b_y - 1 if a_m > b_m else b_y) if y2 else year  # "Feb. 1 - Feb. 28, 2027" opens in 2027
        out.append({'open': date(a_y, a_m, int(d1)).isoformat(), 'close': date(b_y, b_m, int(d2)).isoformat()})
    return out


def parse_tables(layout: str):
    rows = []  # per code line: dict
    cols = None
    section = None
    lines = layout.split('\n')
    page_lines = []  # (index, line) since last header, for context
    for i, line in enumerate(lines):
        m = SECTION.search(line)
        if m:
            section = {'weapon': m.group(1), 'series': m.group(2)}
            continue
        if 'HUNT #' in line and 'OPEN SEASON' in line and '2026 TAGS' in line and 'BAG LIMIT' in line:
            cols = {k: line.index(k) for k in ('HUNT NAME', 'BAG LIMIT', 'OPEN SEASON', '2026 TAGS')}
            cols['APPLICANTS'] = line.index('APPLICANTS') if 'APPLICANTS' in line else None
            continue
        if cols is None or section is None or '\f' in line:
            if '\f' in line:
                cols = None
            continue
        ch = chunks(line)
        if not ch:
            continue
        first_col, first = ch[0]
        head, _, rest = first.partition(' ')
        if CODE.match(head) and first_col < cols['HUNT NAME']:
            tail = ch[1:]
            if rest:  # "AD101 Aldrich 01": code and name one space apart
                tail = [(first_col + len(head) + 1, rest.strip())] + tail
            rows.append({'i': i, 'code': head, 'section': dict(section), 'chunks': tail, 'cols': dict(cols)})
    return lines, rows


def column_of(pos: int, cols: dict) -> str:
    order = [('name', cols['HUNT NAME']), ('bag', cols['BAG LIMIT']), ('season', cols['OPEN SEASON']), ('tags', cols['2026 TAGS'])]
    if cols['APPLICANTS'] is not None:
        order.append(('apps', cols['APPLICANTS'] - 4))
    best = 'name'
    for k, c in order:
        if pos >= c - 6:
            best = k
    return best


def main(pdf: str, draws_path: str, dest: str):
    layout = subprocess.run(['pdftotext', '-layout', pdf, '-'], capture_output=True, text=True).stdout
    raw = subprocess.run(['pdftotext', '-raw', pdf, '-'], capture_output=True, text=True).stdout
    draws = json.loads(Path(draws_path).read_text())['draws']
    wanted = {}
    for kind in ('buck', 'antlerless', 'elk'):
        for code, h in draws[f'2026:{kind}']['hunts'].items():
            wanted[code] = (kind, h)
    lines, rows = parse_tables(layout)
    code_lines = {r['i'] for r in rows}
    by_code = {}
    problems = []
    for r in rows:
        if r['code'] not in wanted:
            continue
        if r['code'] in by_code:
            problems.append(f'{r["code"]}: listed twice')
            continue
        # A row's cells in order: name, bag limit (starts "One"), season dates, 2026 tags, 2025 applicants. The
        # printed column headers are centred over left-aligned data, so cells are told apart by content and
        # order, and wrapped lines above and below are matched to the nearest cell start on this line.
        cells = {'name': [], 'bag': [], 'season': [], 'tags': [], 'apps': []}
        anchors = {}
        seen_season = False
        flat_chunks = []
        pieces = []
        for pos, text in r['chunks']:
            m = re.search(r' (\*{0,2}One |\*{0,2}Two )', text)
            if m and not text.lstrip('*').startswith(('One ', 'Two ')):  # name and bag limit one space apart
                pieces += [(pos, text[:m.start()]), (pos + m.start() + 1, text[m.start() + 1:])]
            else:
                pieces.append((pos, text))
        for pos, text in pieces:
            parts = text.split() if re.fullmatch(r'[\d,]+(\s+([\d,]+|NEW))+', text) else [text]
            for k, part in enumerate(parts):
                flat_chunks.append((pos + k, part))
        for pos, text in flat_chunks:
            in_season_col = pos >= r['cols']['OPEN SEASON'] - 12
            if DATE_RANGE.search(text) and not seen_season and in_season_col:
                cells['season'].append(text); anchors.setdefault('season', pos); seen_season = True
            elif seen_season and re.fullmatch(r'[\d,]+|NEW', text):
                (cells['tags'] if not cells['tags'] else cells['apps']).append(text)
            elif seen_season and DATE_RANGE.search(text) and in_season_col:
                cells['season'].append(text)
            elif text.lstrip('*').startswith(('One ', 'Two ')) or 'bag' in anchors:
                cells['bag'].append(text); anchors.setdefault('bag', pos)
            else:
                cells['name'].append(text); anchors.setdefault('name', pos)
        anchors.setdefault('name', r['cols']['HUNT NAME'] - 14)
        if not seen_season:
            nums = [t for t in cells['name'] + cells['bag'] if re.fullmatch(r'[\d,]+|NEW', t)]
            if len(nums) >= 2:
                cells['tags'], cells['apps'] = [nums[-2]], [nums[-1]]
                cells['name'] = [t for t in cells['name'] if t not in nums[-2:]]
                cells['bag'] = [t for t in cells['bag'] if t not in nums[-2:]]
            anchors['season'] = r['cols']['OPEN SEASON'] - 4

        def neighbours(step):
            out = []
            j = r['i'] + step
            while 0 <= j < len(lines) and abs(j - r['i']) <= 6 and j not in code_lines and lines[j].strip() and 'HUNT #' not in lines[j] and '1ST CHOICE' not in lines[j]:
                out.append(lines[j])
                j += step
            return out
        above, below = neighbours(-1), neighbours(1)
        if 'bag' not in anchors:  # the bag limit wrapped around a line that holds none of it
            for ln in above[::-1] + below:
                for pos, text in chunks(ln):
                    if text.lstrip('*').startswith(('One ', 'Two ')) and pos > anchors['name'] + 10:
                        anchors.setdefault('bag', pos)
        near = {'name': [], 'bag': [], 'season': []}
        below_season = [t for ln in below for pos, t in chunks(ln) if pos >= r['cols']['OPEN SEASON'] - 12]
        for ln in above[::-1] + below:
            for pos, text in chunks(ln):
                if (DATE_RANGE.search(text) or text.startswith(('(', '&', '20'))) and pos >= r['cols']['OPEN SEASON'] - 12:
                    near['season'].append(text)
                    continue
                k = min(anchors, key=lambda a: abs(anchors[a] - pos))
                if k in near and abs(anchors[k] - pos) < 14:
                    near[k].append(text)
        name_text = ' '.join(near['name'][:0] + cells['name'] + near['name'])
        # bag limit fragments top to bottom; the row's own bag starts at its line's "One ..." (or the nearest one
        # above when the cell wrapped around the code line) and runs until the next "One ..."
        frags = []
        for ln in above[::-1]:
            frags += [('a', t) for pos, t in chunks(ln) if 'bag' in anchors and abs(pos - anchors['bag']) < 14]
        frags += [('c', t) for t in cells['bag']]
        for ln in below:
            frags += [('b', t) for pos, t in chunks(ln) if 'bag' in anchors and abs(pos - anchors['bag']) < 14]
        is_start = lambda t: t.lstrip('*').startswith(('One ', 'Two '))
        own = [i for i, (w, t) in enumerate(frags) if w == 'c' and is_start(t)]
        up = [i for i, (w, t) in enumerate(frags) if w == 'a' and is_start(t)]
        start = own[0] if own else (up[-1] if up else None)
        bag_parts = []
        if start is not None:
            bag_parts.append(frags[start][1])
            for w, t in frags[start + 1:]:
                if is_start(t) and not (t.startswith('**') and bag_parts[-1].startswith('**')):
                    break
                bag_parts.append(t)
        bag_all = ' '.join(bag_parts)
        # a date on the row's own line stands alone unless it ends with "&" (a second period on the next line);
        # wrapped date text nearby otherwise belongs to the neighbouring hunt
        if not seen_season:
            season_text = ' '.join(near['season'])
        elif cells['season'][-1].rstrip().endswith('&'):
            season_text = ' '.join(cells['season'] + [t for t in below_season if DATE_RANGE.search(t)][:1])
        else:
            season_text = ' '.join(cells['season'])
        tags = cells['tags'][0].replace(',', '') if cells['tags'] else None
        apps = cells['apps'][0].replace(',', '') if cells['apps'] else None
        by_code[r['code']] = {
            'code': r['code'], 'series': r['section']['series'], 'section': r['section']['weapon'],
            'nameText': name_text, 'bag': bag_all.strip(), 'seasonText': season_text,
            'dates': to_dates(season_text), 'tags': int(tags) if tags and tags.isdigit() else None,
            'apps2025': None if apps in (None, 'NEW') else int(apps) if apps.isdigit() else apps,
            'newHunt': apps == 'NEW', 'privateLimited': '*' in name_text,
        }
    for code, (kind, h) in wanted.items():
        x = by_code.get(code)
        if not x:
            problems.append(f'{code}: not found in the hunt tables')
            continue
        if x['tags'] != h['tags']:
            problems.append(f'{code}: tables print {x["tags"]} tags, draw report {h["tags"]}')
        if not x['bag']:
            problems.append(f'{code}: no bag limit')
        if not x['dates']:
            problems.append(f'{code}: no season dates ({x["seasonText"]!r})')
    # boundary descriptions: "HUNT 123A: Umpqua - 50% public lands." / "HUNTS 233X and 233Y: Sprague - 75% public lands."
    desc = {}
    flat = re.sub(r'\s+', ' ', raw[raw.find('Hunt descriptions with [MAP]'):])
    starts = [m for m in re.finditer(r'\bHUNTS? ([0-9A-Z][0-9A-Z,& -]{1,80}?):', flat)]
    for k, m in enumerate(starts):
        codes = [c for c in re.findall(r'[0-9A-Z]+(?:-\d)?', m.group(1)) if c not in ('AND',)]
        end = starts[k + 1].start() if k + 1 < len(starts) else len(flat)
        body = flat[m.end():end][:1200]
        pct = re.search(r'(\d{1,3})% public lands?', body)
        for c in codes:
            if c in wanted:
                desc[c] = {'text': body.strip(), 'publicPct': int(pct.group(1)) if pct else None}
    out = {
        'source': 'ODFW 2026 Oregon Big Game Hunting Regulations, https://myodfw.com/sites/default/files/2025-11/26_BG_regs.pdf',
        'year': 2026, 'hunts': by_code, 'descriptions': desc, 'problems': problems,
    }
    Path(dest).write_text(json.dumps(out, indent=1))
    print('hunts', len(by_code), 'of', len(wanted), 'descriptions', len(desc), 'problems', len(problems))
    for p in problems[:40]:
        print('  ', p)


if __name__ == '__main__':
    main(*sys.argv[1:4])
