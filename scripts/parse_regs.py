"""
Builds data/controlled-hunts-<year>.json from IDFG's Big Game Seasons & Rules PDF.

    pdftotext -layout seasons-rules-big-game-2026.pdf regs.txt
    python3 scripts/parse_regs.py regs.txt 2026

Why: IDFG's per-unit hunt lists only show hunts that haven't closed yet, so in November most of the
season's controlled hunts vanish from them. The regs tables list every controlled hunt for the year.
"""
import json, re, sys

MON = {m: i for i, m in enumerate(['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'], 1)}
MONS = 'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec'
# hunt, area (a/b footnote letter and "(See pg N)" optional), anything (tags, "1st choice only"), first date range, notes
LINE = re.compile(
    r'^\s*(?P<hunt>[124]\d{3})\s+(?P<area>\d{1,2}[A-Z]?(?:-\d)?X?)[ab]?\s*(?:\(See pg \d+\))?(?P<mid>.*?)'
    rf'(?P<d1>{MONS})\s+(?P<n1>\d{{1,2}})\s*-\s*(?P<d2>{MONS})\s+(?P<n2>\d{{1,2}})(?P<rest>.*)$'
)
# section headings, e.g. "2026 Controlled Hunts - Archery Only Deer - Archery Permit Required", "Antlerless Elk"
HEAD = re.compile(r'(?P<h>(Youth Only ?-? ?)?(Extra )?(Antlered|Antlerless|Either Sex|Doe or Fawn|Buck Only|Archery Only|Muzzleloader Only|Short[- ]Range (?:Weapon )?Only|Outfitter Allocation)[A-Za-z ()-]*?(Deer|Elk|Pronghorn))\b')
# pronghorn's weapon sections name no species: "Archery Only - Archery Permit Required"
HEAD2 = re.compile(r'^(?P<h>(Archery Only|Muzzleloader Only|Short[- ]Range Weapons? Only)\b.*Permit Required)')
START = re.compile(r'^\s{0,40}[124]\d{3}\s+\d{1,2}[A-Z]?(?:-\d)?X?[ab]?\b')
DATES = re.compile(r'[A-Z][a-z]{2}\s+\d{1,2}\s*-\s*[A-Z][a-z]{2}\s+\d{1,2}')


def classify(section: str, notes: str):
    notes = re.sub(r'Caution:.*', '', notes)  # "Caution: An archery only hunt is open at the same time" is about another hunt
    t = f'{section} {notes}'.lower()
    weapon = 'ANY'
    if 'archery only' in t:
        weapon = 'ARCHERY'
    elif 'muzzleloader only' in t:
        weapon = 'MUZZLELOADER'
    elif 'short-range' in t or 'short range' in t:
        weapon = 'SHORT_RANGE'
    n = notes.lower()
    if 'either sex' in n:
        antler = 'EITHER'
    elif 'doe or fawn' in n or 'doe or fawn' in section.lower():
        antler = 'ANTLERLESS'
    elif 'buck only' in n or 'buck only' in section.lower():
        antler = 'ANTLERED'
    elif 'antlerless' in n:
        antler = 'ANTLERLESS'
    elif 'antlered' in n:
        antler = 'ANTLERED'
    elif 'either sex' in section.lower():
        antler = 'EITHER'
    elif 'antlerless' in section.lower():
        antler = 'ANTLERLESS'
    elif 'antlered' in section.lower() or 'outfitter' in section.lower():
        antler = 'ANTLERED'
    else:
        antler = 'EITHER'
    return weapon, antler


def main(path, year):
    section = ''
    out = {}
    lines = open(path, encoding='utf-8', errors='replace').read().split('\n')
    i = 0
    while i < len(lines):
        line = lines[i]
        start = i
        i += 1
        if not START.match(line):
            if line.strip() == 'Youth Only' and 'Pronghorn' in lines[start - 1]:
                section = 'Youth Only Pronghorn'  # mixed table: each hunt's note names its weapon
                continue
            h = HEAD.search(line.strip()) or HEAD2.search(line.strip())
            if h and len(line.strip()) < 110 and 'Controlled Hunt Area' not in line and 'DESCRIPTIONS' not in line:
                section = h.group('h').strip()
            continue
        # a row whose notes wrap puts tags + dates on the next line(s): join until the dates show up
        j = i
        while not DATES.search(line) and j < len(lines) and j - i < 4 and not START.match(lines[j]):
            line = line + ' ' + re.sub(r'^\s*[ab]\s*$', '', lines[j]).strip()
            j += 1
        if DATES.search(line):
            i = j
        line = re.sub(r'\s+', ' ', line)
        m = LINE.match(line)
        if not m:
            print(f'unparsed: {line[:120]}', file=sys.stderr)
            continue
        hunt = int(m['hunt'])
        species = 'DEER' if hunt < 2000 else 'ELK' if hunt < 3000 else 'PRONGHORN'
        d1, d2 = MON.get(m['d1'][:3].lower()), MON.get(m['d2'][:3].lower())
        if not d1 or not d2:
            continue
        # the regs year runs Aug-Jan(+): hunts opening Jan-Mar are the following winter
        y1 = year + 1 if d1 <= 3 else year
        y2 = y1 + 1 if d2 < d1 else y1
        notes = re.sub(r'\s+', ' ', m['rest']).strip()
        if hunt >= 4000:
            # pronghorn tables print some notes on the line(s) above the row: take a text-only line just above
            # (the note block directly above, up to 6 lines back, stopping at the previous row or a heading)
            block = []
            for l in reversed(lines[max(0, start - 6):start]):
                t = l.strip()
                if not t or t == 'PRONGHORN':
                    continue
                if START.match(l) or DATES.search(t) or HEAD.search(t) or re.match(r'^(Hunt No|Controlled|Hunt Areas|Youth Only|[ab]$)', t):
                    break
                block.insert(0, t)
            pre = ' '.join(block)
            if pre and re.search(r'(Either sex|Doe or Fawn|Buck only|only)', pre, re.I):
                notes = f'{pre} {notes}'.strip()
        weapon, antler = classify(section, notes)
        if hunt >= 4000 and weapon == 'SHORT_RANGE' and re.search(r'short[- ]range weapons only on', notes, re.I):
            weapon = 'ANY'  # short range only on named WMAs, not the whole hunt
        # tags: first number between area and dates; "Unlimited" there or on the line above means no cap
        prev = lines[start - 1] if start > 0 else ''
        tm = re.search(r'(?<![\w/])(\d[\d,]*)(?![\w/])', re.sub(r'\d+(st|nd|rd|th)\b', '', m['mid']))
        unlimited = 'Unlimited' in m['mid'] or ('Unlimited' in prev and not START.match(prev))
        tags = None if unlimited or not tm else int(tm.group(1).replace(',', ''))
        key = f'{species}|{hunt}'
        if key in out:
            continue  # first listing wins (some hunts are repeated in a notes table)
        out[key] = {
            'species': species, 'huntNumber': hunt, 'area': m['area'], 'tags': tags,
            'open': f'{y1}-{d1:02d}-{int(m["n1"]):02d}', 'close': f'{y2}-{d2:02d}-{int(m["n2"]):02d}',
            'weapon': weapon, 'antlerClass': antler, 'youthOnly': 'youth' in section.lower(),
            'section': section, 'notes': notes,
        }
    rows = sorted(out.values(), key=lambda r: (r['species'], r['huntNumber']))
    json.dump({'year': year, 'source': 'IDFG Big Game Seasons & Rules', 'hunts': rows}, sys.stdout, indent=1)
    print(f"\n{len(rows)} hunts: {sum(r['species']=='DEER' for r in rows)} deer, {sum(r['species']=='ELK' for r in rows)} elk, {sum(r['species']=='PRONGHORN' for r in rows)} pronghorn", file=sys.stderr)


if __name__ == '__main__':
    main(sys.argv[1], int(sys.argv[2]))
