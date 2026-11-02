"""
General-season deer tag seasons by unit (Regular Deer tag and White-tailed Deer tag) from IDFG's
Big Game Seasons & Rules PDF: the "2026 Regular Deer Tag / White-tailed Deer Tag - General Any Weapon /
Archery Only / Muzzleloader Only Seasons" tables (Unit(s) | Antlered | Antlerless | Notes).

Rows come from the shaded Unit(s) cells, columns from the header cells. Inside a cell each date line starts
a season; the lines under it ("(White-tailed deer only)", "(Youth hunt only)") are its qualifiers.

    python3 scripts/parse_deer_tags.py <seasons-rules-big-game-YYYY.pdf> > data/deer-tag-seasons-YYYY.json
"""
import json, re, sys
from collections import defaultdict
import pdfplumber

MONTHS = 'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec'
DATE = re.compile(rf'({MONTHS})\.? ?(\d{{1,2}}) ?[-–—] ?({MONTHS})\.? ?(\d{{1,2}})')
MO = {k: i + 1 for i, k in enumerate(MONTHS.split('|'))}


def iso(year, m, d, after=None):
    y = year + (1 if m <= 3 else 0)
    if after and (y, m) < after:
        y += 1
    return f'{y}-{m:02d}-{d:02d}'


def lines_in(words, x0, x1, y0, y1, tol=3):
    ws = sorted([w for w in words if x0 - 1 <= (w['x0'] + w['x1']) / 2 <= x1 + 1 and y0 - 1 <= (w['top'] + w['bottom']) / 2 <= y1 + 1],
                key=lambda w: (round(w['top']), w['x0']))
    out = []
    for w in ws:
        if out and abs(out[-1]['top'] - w['top']) <= tol:
            out[-1]['t'] += ' ' + w['text']
        else:
            out.append({'t': w['text'], 'top': w['top']})
    return [l['t'].strip() for l in out]


def cell_seasons(lines, year, weapon, sex, row_notes):
    seasons = []
    for ln in lines:
        m = DATE.search(ln)
        if m:
            o = (MO[m.group(1)], int(m.group(2))); c = (MO[m.group(3)], int(m.group(4)))
            open_ = iso(year, *o)
            close = iso(year, *c, after=(int(open_[:4]), o[0]))
            prefix = ln[:m.start()].strip().rstrip(':')
            seasons.append({'weapon': weapon, 'sex': sex, 'dates': [{'open': open_, 'close': close}], 'qualifier': prefix, 'notes': row_notes})
        elif seasons:
            seasons[-1]['qualifier'] = (seasons[-1]['qualifier'] + ' ' + ln).strip()
        elif ln.lower() != 'none':
            # text above the first date (rare): keep it with the next season
            seasons.append({'weapon': weapon, 'sex': sex, 'dates': [], 'qualifier': ln, 'notes': row_notes})
    for s in seasons:
        s['qualifier'] = re.sub(r'^\((.*)\)$', r'\1', s['qualifier'].strip()).strip()
    return [s for s in seasons if s['dates']]


def units_of(text):
    return [u for u in re.findall(r'\b(\d{1,2}[A-C]?)\b', text.replace('Units', '').replace('Unit', ''))]


def main(path):
    year = int(re.search(r'(20\d\d)', path).group(1))
    pdf = pdfplumber.open(path)
    out = {'RD': defaultdict(list), 'WD': defaultdict(list)}
    tables = 0
    for page in pdf.pages:
        text = page.extract_text() or ''
        if 'Deer Tag' not in text or 'Unit(s)' not in text:
            continue
        words = page.extract_words()
        heads = [w for w in words if w['text'] == 'Unit(s)']
        for hi, h in enumerate(heads):
            # table title: the nearest "Regular/White-tailed Deer Tag" and "... Seasons" lines above the header
            above = [l for l in page.extract_text_lines() if l['top'] < h['top'] and l['top'] > h['top'] - 120]
            title = ' '.join(l['text'] for l in above)
            kind = 'WD' if 'White-tailed Deer Tag' in title else 'RD' if 'Regular Deer Tag' in title else None
            # the last title above the header decides (several tables can share a page)
            title = title[title.rfind('Deer Tag'):] if 'Deer Tag' in title else title
            weapon = 'ARCHERY' if 'Archery' in title else 'MUZZLELOADER' if 'Muzzleloader' in title else 'SHORT_RANGE' if 'Short Range' in title else 'ANY' if 'Any Weapon' in title else None
            if not kind or not weapon:
                continue
            hdr = {w['text']: w for w in words if abs(w['top'] - h['top']) < 3 and w['text'] in ('Unit(s)', 'Antlered', 'Antlerless', 'Notes')}
            if len(hdr) < 4:
                continue
            # column edges: the header cell rectangles on that row
            cells = sorted([r for r in page.rects if abs(r['top'] - (h['top'] - 6)) < 10 and r['height'] < 30 and r['width'] > 50], key=lambda r: r['x0'])
            if len(cells) >= 4:
                cols = [(c['x0'], c['x1']) for c in cells[:4]]
            else:  # fall back to midpoints between header words
                xs = [hdr[k]['x0'] for k in ('Unit(s)', 'Antlered', 'Antlerless', 'Notes')]
                cols = [(xs[0] - 30, (xs[0] + xs[1]) / 2), ((xs[0] + xs[1]) / 2, (xs[1] + xs[2]) / 2 + 20), ((xs[1] + xs[2]) / 2 + 20, xs[3] - 10), (xs[3] - 10, page.width)]
            ux0, ux1 = cols[0]
            nxt = heads[hi + 1]['top'] - 40 if hi + 1 < len(heads) else page.height
            rows = sorted([r for r in page.rects if abs(r['x0'] - ux0) < 3 and abs(r['x1'] - ux1) < 3 and r['top'] >= h['top'] + 4 and r['top'] < nxt and r['height'] > 10],
                          key=lambda r: r['top'])
            tables += 1
            bands = [(r['top'], r['bottom']) for r in rows]
            # rows whose Unit(s) cell isn't shaded: unit text not inside any shaded cell starts its own band
            table_end = nxt if hi + 1 < len(heads) else max([b[1] for b in bands] + [h['bottom'] + 60])
            for w in words:
                cx = (w['x0'] + w['x1']) / 2
                if ux0 <= cx <= ux1 and h['top'] + 8 < w['top'] < table_end and re.fullmatch(r'\d{1,2}[A-C]?,?', w['text']) \
                        and not any(b0 - 1 <= w['top'] <= b1 + 1 for b0, b1 in bands):
                    later = [b0 for b0, _ in bands if b0 > w['top']]
                    bands.append((w['top'] - 3, min(later + [w['top'] + 40, table_end])))
            bands.sort()
            for y0, y1 in bands:
                units = units_of(' '.join(lines_in(words, *cols[0], y0, y1)))
                notes = ' '.join(lines_in(words, *cols[3], y0, y1))
                seasons = cell_seasons(lines_in(words, *cols[1], y0, y1), year, weapon, 'antlered', notes) + \
                          cell_seasons(lines_in(words, *cols[2], y0, y1), year, weapon, 'antlerless', notes)
                for u in units:
                    out[kind][u].extend(seasons)
    print(f'{tables} tables; RD units {len(out["RD"])}, WD units {len(out["WD"])}', file=sys.stderr)
    json.dump({'year': year, 'source': path.rsplit('/', 1)[-1], 'tags': {k: dict(sorted(v.items(), key=lambda kv: (int(re.match(r"\d+", kv[0]).group()), kv[0]))) for k, v in out.items()}}, sys.stdout, indent=1)


if __name__ == '__main__':
    main(sys.argv[1])
