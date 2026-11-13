"""Parse WDFW Big Game pamphlet special-permit tables (deer and elk).

Usage: python3 -I scripts/wa_parse_permit_tables.py <wa-regs-2026.json> <wa-pamphlets-2021-2025.json> <out.json>

Input files are text items [x, y, width, fontSize, str] per page, extracted in
Chrome with pdf.js 4.4.168. Columns are assigned from each table's own header
row (midpoints between header labels), so a shifted layout in another year
doesn't silently misplace cells. Lines without a 4-digit hunt choice are
continuations (wrapped dates or areas) and are appended to the row above.

The last column is "<prior year> APPS / AVG POINTS": applications and average
points of the applications drawn in the previous year's drawing for that hunt
number (see docs/states/wa-onboarding.md §4 for the check of that meaning).
"""
import json, re, sys

COLS = ['choice', 'name', 'notes', 'tag', 'dates', 'legal', 'area', 'permits', 'apps']

def lines_of(items):
    rows = {}
    for x, y, w, fs, s in items:
        key = round(y)
        # merge items whose baselines differ by <= 2 pt
        for k in (key, key - 1, key + 1, key - 2, key + 2):
            if k in rows:
                key = k
                break
        rows.setdefault(key, []).append((x, s.strip()))
    return [(y, sorted(v)) for y, v in sorted(rows.items(), reverse=True)]

def header_bounds(lines):
    """Find the header row (three stacked lines) and return column cut points."""
    for i, (y, toks) in enumerate(lines):
        txt = ' '.join(t for _, t in toks)
        if 'HUNT NAME' in txt and 'PERMITS' in txt and ('LEGAL' in txt):
            block = [t for yy, tt in lines[max(0, i - 2):i + 3] for t in tt if abs(yy - y) <= 12]
            pos = {}
            for x, t in block:
                for key, pat in (('name', r'^HUNT NAME'), ('notes', r'^NOTES'), ('tag', r'^(TAG|TO APPLY)'),
                                 ('dates', r'^HUNT DATES'), ('legal', r'^LEGAL'), ('area', r'^UNIT'),
                                 ('permits', r'^PERMITS'), ('apps', r'APPS')):
                    if re.search(pat, t):
                        pos.setdefault(key, x)
            if not all(k in pos for k in ('name', 'dates', 'legal', 'area', 'permits', 'apps')):
                continue
            order = [k for k in COLS[1:] if k in pos]
            cuts = []
            for a, b in zip(order, order[1:]):
                cuts.append(((pos[a] + pos[b]) / 2, b))
            year = None
            for x, t in block:
                m = re.match(r'^(20\d\d) APPS', t)
                if m:
                    year = int(m.group(1))
            return y, cuts, year
    return None

def assign(x, cuts):
    col = 'name'
    for cut, name in cuts:
        if x >= cut:
            col = name
    return col

def parse_app(s):
    s = s.replace(' ', '')
    m = re.match(r'^(\d[\d,]*)/(\d+(?:\.\d+)?)$', s)
    if m:
        return int(m.group(1).replace(',', '')), float(m.group(2))
    m = re.match(r'^(\d[\d,]*)$', s)
    if m:
        return int(m.group(1).replace(',', '')), None
    return None, None

def parse_pages(pages, pamphlet_year):
    out, category, species = [], None, None
    for pg in pages:
        if pg.get('skipped'):
            continue
        lines = lines_of(pg['items'])
        page_txt = ' '.join(t for _, tt in lines for _, t in tt)
        if re.search(r'DEER SPECIAL PERMITS|Deer Special Permits', page_txt):
            species = 'Deer'
        if re.search(r'ELK SPECIAL PERMITS|Elk Special Permits', page_txt):
            species = 'Elk'
        if re.search(r'Moose Special Permits|MOOSE SPECIAL|Mountain Goat Special|Bighorn Sheep Special|Turkey Special', page_txt):
            species = None
        hb = header_bounds(lines)
        cur = None
        want_cat = False
        for y, toks in lines:
            txt = ' '.join(t for _, t in toks)
            if want_cat:
                category = re.split(r'\s+Who May Apply', txt)[0].strip()
                want_cat = False
                continue
            m = re.search(r'\(Category\):\s*(.*?)\s*(Who May Apply|$)', txt)
            if m:
                if m.group(1).strip():
                    category = m.group(1).strip()
                else:
                    want_cat = True
                continue
            if not hb or y >= hb[0] - 10 or species is None:
                continue
            first_x, first = toks[0]
            if re.fullmatch(r'\d{4}', first) and first_x < 60:
                cur = {c: [] for c in COLS}
                cur['choice'] = first
                for x, t in toks[1:]:
                    cur[assign(x, hb[1])].append(t)
                cur['_cat'], cur['_sp'], cur['_page'], cur['_appyear'] = category, species, pg['page'], hb[2]
                out.append(cur)
            elif cur is not None and first_x > 60 and not re.search(r'Category continued|Use numbers in this column|please see page|You will owe', txt):
                if y < 60:
                    continue
                for x, t in toks:
                    cur[assign(x, hb[1])].append(t)
            else:
                cur = None
    rows = []
    for r in out:
        apps, avg = parse_app(' '.join(r['apps']))
        permits_raw = ' '.join(r['permits'])
        pm = re.match(r'^(\d[\d,]*)', permits_raw)
        permits = pm.group(1).replace(',', '') if pm else ''
        rows.append({
            'year': pamphlet_year, 'species': r['_sp'], 'category': r['_cat'], 'choice': int(r['choice']),
            'name': ' '.join(r['name']), 'notes': ' '.join(r['notes']), 'tag': ' '.join(r['tag']),
            'dates': ' '.join(r['dates']), 'legal': ' '.join(r['legal']), 'area': ' '.join(r['area']),
            'permits': int(permits) if permits else None, 'permits_raw': permits_raw,
            'prior_year': r['_appyear'], 'prior_apps': apps, 'prior_avg_points': avg,
            'prior_raw': ' '.join(r['apps']), 'page': r['_page'],
        })
    return rows

def main(regs, pams, out):
    allrows = []
    r26 = json.load(open(regs))
    pages = [{'page': i + 1, 'items': p['items']} for i, p in enumerate(r26['pamphlet']['pages'])]
    allrows += parse_pages(pages, 2026)
    pj = json.load(open(pams))
    for y, p in sorted(pj['pamphlets'].items()):
        allrows += parse_pages(p['pages'], int(y))
    json.dump({'source': 'WDFW Big Game Hunting Seasons and Regulations pamphlets 2021-2026 (special permit tables)',
               'rows': allrows}, open(out, 'w'), indent=0)
    from collections import Counter
    c = Counter((r['year'], r['species'], r['category']) for r in allrows)
    for k in sorted(c, key=lambda k: (k[0], k[1] or '', k[2] or '')):
        print(k, c[k])
    bad = [r for r in allrows if r['permits'] is None or (r['prior_apps'] is None and r['prior_raw'] not in ('', 'New', 'NEW'))]
    print('rows', len(allrows), 'unparsed permits/apps', len(bad))
    for r in bad[:15]:
        print('  ', r['year'], r['choice'], r['name'], '| permits', r['permits_raw'], '| apps', r['prior_raw'], '| p', r['page'])

if __name__ == '__main__':
    main(*sys.argv[1:4])
