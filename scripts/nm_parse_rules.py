#!/usr/bin/env python3
"""Parse the deer and elk hunt tables of NMDOW's 2026-2027 Hunting Rules and Information booklet.

Usage: python3 -I scripts/nm_parse_rules.py data/nm/source/rules-2026-27.txt data/nm/rules-2026.json

Input: `pdftotext -layout` of the booklet (164 pages, fetched Nov 17, 2026). Every table row with a deer or elk
hunt code is read: weapon text, dates, code, fee type, licenses and bag limit. The unit header above it (e.g.
"Unit 4 Sargent WMA Only (NM Residents Only)") and wrapped qualifier lines below it ("Resident Only / Youth Only")
are kept with the row. The build stops if a code appears twice or a row can't be read.
"""
import json, re, sys

MON = {'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6, 'jul': 7, 'aug': 8, 'sep': 9, 'sept': 9, 'oct': 10, 'nov': 11, 'dec': 12}
ROW = re.compile(r"^(?P<left>.*?)\s+(?P<dates>(?:Jan|Feb|Mar|Apr|May|June|Jun|July|Jul|Aug|Sept|Sep|Oct|Nov|Dec)\.?\s*\d[^A-Z]*?(?:[A-Z][a-z]{2,3}\.?\s*\d+[^A-Z]*?)?)\s+(?P<code>(?:DER|ELK)-\d-\d{3})\s+(?P<fee>[A-Z/]+)\s+(?P<lic>\d+|Unlimited)\s+(?P<bag>[A-Z0-9/]+(?:-\d)?)\s*$")
CODE = re.compile(r'(DER|ELK)-\d-\d{3}')
HEAD = re.compile(r'^\s{0,6}(Units?\s+\d|Premium Statewide)')

def parse_dates(s, season=2026):
    """'Oct. 31-Nov. 4' / 'Jan. 1-15, '27' / 'Sept. 1-Jan.31, '27' -> (open, close) ISO dates."""
    s = s.replace('‘', "'").replace('’', "'").replace('–', '-').replace('—', '-')
    s = re.sub(r",?\s*'2\d", '', s).strip().rstrip(',').strip()
    m = re.match(r"([A-Za-z]+)\.?\s*(\d+)\s*-\s*(?:([A-Za-z]+)\.?\s*)?(\d+)$", s)
    if not m: return None
    m1 = MON[m.group(1).lower()[:4] if m.group(1).lower().startswith('sept') else m.group(1).lower()[:3]]
    m2 = MON[(m.group(3) or m.group(1)).lower()[:4] if (m.group(3) or m.group(1)).lower().startswith('sept') else (m.group(3) or m.group(1)).lower()[:3]]
    y = lambda mo: season + 1 if mo <= 3 else season
    return f'{y(m1)}-{m1:02d}-{int(m.group(2)):02d}', f'{y(m2)}-{m2:02d}-{int(m.group(4)):02d}'

def main(src, dst):
    lines = open(src, encoding='utf-8').read().split('\n')
    out, problems = {}, []
    section, header = None, None
    for i, raw in enumerate(lines):
        line = raw.rstrip()
        if re.match(r'^\s*Deer Draw Hunts\s*$', line): section = 'deer-draw'
        elif re.match(r'^\s*Private-Land Deer Hunting in Units', line): section = 'deer-private-otc'
        elif re.match(r'^\s*Elk Draw Hunts\s*$', line): section = 'elk-draw'
        if HEAD.match(line) and not CODE.search(line):
            header = re.sub(r'\s+', ' ', line).strip()
            # a header can wrap onto the next line ("..., Including Double E and River Ranch WMAs")
            nxt = lines[i + 1].strip() if i + 1 < len(lines) else ''
            if nxt and not CODE.search(nxt) and not HEAD.match(lines[i + 1]) and not re.match(r'^(Bow|Muzzle|Any|\d)', nxt) and len(nxt) < 70:
                header += ' ' + nxt
            continue
        if not CODE.search(line) or len(CODE.findall(line)) > 1 or re.match(r'^\s*(?:DER|ELK)-', line): continue
        m = ROW.match(line)
        code = CODE.search(line).group(0)
        if not m:
            problems.append(f'line {i+1}: unreadable row {line.strip()[:100]}'); continue
        left = m.group('left').strip()
        # wrapped text below the row: left-column qualifiers and a "'27" year continuation
        k = i + 1
        while k < len(lines) and lines[k].strip() and not CODE.search(lines[k]) and not HEAD.match(lines[k]) and len(lines[k].strip()) < 40:
            t = lines[k].strip()
            if not re.fullmatch(r"[‘']2\d", t): left += ' ' + t
            k += 1
        d = parse_dates(m.group('dates'))
        if not d: problems.append(f'{code}: dates {m.group("dates")!r}')
        rec = {'code': code, 'section': section, 'header': header, 'weaponText': re.sub(r'\s+', ' ', left),
               'dates': m.group('dates').strip(), 'open': d[0] if d else None, 'close': d[1] if d else None,
               'fee': m.group('fee'), 'licenses': None if m.group('lic') == 'Unlimited' else int(m.group('lic')),
               'unlimited': m.group('lic') == 'Unlimited', 'bag': m.group('bag'), 'line': i + 1}
        if code in out: problems.append(f'{code}: listed twice (lines {out[code]["line"]} and {i+1})')
        out[code] = rec
    doc = {'source': 'NMDOW 2026-2027 New Mexico Hunting Rules and Information (pdftotext -layout), fetched Nov 17, 2026', 'season': '2026-27',
           'problems': problems, 'hunts': out}
    json.dump(doc, open(dst, 'w'), indent=1)
    from collections import Counter
    print(len(out), Counter((r['section'], r['code'][:3]) for r in out.values()))
    print('problems', len(problems)); print('\n'.join(problems[:20]))

if __name__ == '__main__':
    main(*sys.argv[1:3])
