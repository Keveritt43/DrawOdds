"""
Elk general-season A/B tag seasons per zone from IDFG's Big Game Seasons & Rules PDF.

The zone tables are calendar graphics on rotated (landscape) pages: a label column ("A Tag" / "B Tag") and
season boxes placed under the month they fall in. We rotate the words back, find each zone's A and B bands
from the label column's row edges, group words into boxes, and read weapon / sex / dates / restrictions.

    python3 scripts/parse_elk_tags.py <seasons-rules-big-game-YYYY.pdf> > data/elk-tag-seasons-YYYY.json
"""
import json, re, sys
from collections import defaultdict
import pdfplumber

MONTHS = 'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec'
DATE = re.compile(rf'({MONTHS})\.? ?(\d{{1,2}}) ?[-–—] ?({MONTHS})\.? ?(\d{{1,2}})')
WEAPON = re.compile(r'(Archery only|Muzzleloader only|Any weapon|Short[- ]range weapons only|Short range only)\s*[—–-]+\s*([^|]+)', re.I)
SKIP = re.compile(r'^(Note:|Residents:|there is a 5 day|See archers caution|August|September|October|November|December|August/September)', re.I)
ZONE = re.compile(r'^(.+?) Zone \(Units? ([^)]*)\)')


def landscape(page):
    """Words and segments rotated back to reading orientation: X left->right, Y top->bottom."""
    H = page.height
    words = [{'t': w['text'][::-1], 'x0': H - w['bottom'], 'x1': H - w['top'], 'y': w['x0'], 'y1': w['x1']}
             for w in page.extract_words(keep_blank_chars=False, use_text_flow=False) if not w['upright']]
    segs = [{'X0': H - s['bottom'], 'X1': H - s['top'], 'Y0': s['x0'], 'Y1': s['x1']} for s in page.lines + page.rects]
    return words, segs


def text_lines(words, tol=3.5):
    """Group words into lines (by Y), each line split into segments where the horizontal gap is large."""
    words = sorted(words, key=lambda w: (w['y'], w['x0']))
    lines = []
    for w in words:
        if lines and abs(lines[-1][0]['y'] - w['y']) <= tol:
            lines[-1].append(w)
        else:
            lines.append([w])
    out = []
    for ln in lines:
        ln.sort(key=lambda w: w['x0'])
        seg = [ln[0]]
        for w in ln[1:]:
            if w['x0'] - seg[-1]['x1'] > 14:
                out.append(seg); seg = [w]
            else:
                seg.append(w)
        out.append(seg)
    return [{'t': ' '.join(w['t'] for w in s), 'x0': s[0]['x0'], 'x1': s[-1]['x1'], 'y': min(w['y'] for w in s)} for s in out]


def boxes(segs):
    """Merge text segments into boxes: stacked (small vertical gap) and overlapping horizontally."""
    segs = sorted(segs, key=lambda s: (s['y'], s['x0']))
    bx = []
    for s in segs:
        for b in bx:
            last = b[-1]
            if 0 <= s['y'] - last['y'] <= 13 and min(s['x1'], max(x['x1'] for x in b)) - max(s['x0'], min(x['x0'] for x in b)) > -4:
                b.append(s); break
        else:
            bx.append([s])
    return bx


def split_box(b):
    """A merged box holding two stacked seasons: start a new season at each weapon line."""
    parts = []
    for seg in b:
        if WEAPON.search(seg['t']) or not parts:
            parts.append([seg])
        else:
            parts[-1].append(seg)
    return parts


def parse_box(b, year):
    text = ' | '.join(s['t'] for s in b)
    m = WEAPON.search(text)
    if not m:
        return None
    weapon = {'archery only': 'ARCHERY', 'muzzleloader only': 'MUZZLELOADER', 'any weapon': 'ANY'}.get(m.group(1).lower(), 'SHORT_RANGE')
    sex = m.group(2).strip().rstrip('|').strip()
    if not sex:
        # the sex sits on its own line ("antlerless only", "Units 20A and 26: antlered only"): take the first one
        for seg in text.split('|')[1:]:
            mm = re.search(r'(antlered|antlerless|any elk|spike|brow-tined)[^|]*?only|any elk', seg, re.I)
            if mm:
                sex = mm.group(0).strip()
                break
    dates = []
    mo = {k: i + 1 for i, k in enumerate(MONTHS.split('|'))}
    for d in DATE.finditer(text):
        o = (mo[d.group(1)], int(d.group(2))); c = (mo[d.group(3)], int(d.group(4)))
        yo = year + (1 if o[0] <= 3 else 0); yc = year + (1 if c[0] <= 3 or c[0] < o[0] else 0)
        dates.append({'open': f'{yo}-{o[0]:02d}-{o[1]:02d}', 'close': f'{yc}-{c[0]:02d}-{c[1]:02d}'})
    rest = [s['t'] for s in b if not WEAPON.search(s['t']) and not DATE.fullmatch(s['t'].strip()) and not re.search(r'archers caution', s['t'], re.I)]
    rest = [r for r in rest if not (sex and r.strip() and r.strip() in sex)]
    return {'weapon': weapon, 'sex': sex, 'dates': dates, 'notes': ' '.join(rest).strip(), 'text': text}


def main(path):
    year = int(re.search(r'(20\d\d)', path).group(1))
    pdf = pdfplumber.open(path)
    zones = []
    for page in pdf.pages:
        words, segs = landscape(page)
        if not words:
            continue
        lines = text_lines(words)
        heads = [(l['y'], ZONE.match(l['t'])) for l in lines if ZONE.match(l['t'])]
        if not heads:
            continue
        labels = [l for l in lines if re.fullmatch(r'[AB] Tag.*', l['t']) and l['x0'] < 90]
        edges = sorted({round(s['Y0']) for s in segs if abs(s['X1'] - s['X0']) < 2 and 45 < s['X0'] < 60} |
                       {round(s['Y1']) for s in segs if abs(s['X1'] - s['X0']) < 2 and 45 < s['X0'] < 60})
        for i, (zy, zm) in enumerate(heads):
            end = heads[i + 1][0] if i + 1 < len(heads) else 10_000
            zl = [l for l in labels if zy < l['y'] < end]
            ze = [e for e in edges if zy < e < end]
            entry = {'zone': zm.group(1).strip(), 'units': [u.strip() for u in re.split(r',|and', zm.group(2)) if u.strip()], 'tags': {}}
            if not zl or not ze:
                zones.append(entry); continue
            top, bottom = min(ze), max(ze)
            la = next((l for l in zl if l['t'].startswith('A')), None)
            lb = next((l for l in zl if l['t'].startswith('B')), None)
            # boundary between the A band and the B band: the row edge that best centers the B label in its band
            cut = None
            if la and lb:
                ca, cb = la['y'] + 4, lb['y'] + 4
                cands = [e for e in ze if ca < e < cb] or [(ca + cb) / 2]
                cut = min(cands, key=lambda e: abs((e + bottom) / 2 - cb))
            content = [l for l in lines if top - 2 <= l['y'] <= bottom + 2 and l['x0'] > 95 and not SKIP.match(l['t'])]
            for tag, lab in (('A', la), ('B', lb)):
                if not lab:
                    continue
                if re.search(r'No [AB] Tags', lab['t']) or any(re.search(rf'No {tag} Tags', l['t']) for l in lines if zy < l['y'] < end):
                    entry['tags'][tag] = {'available': False, 'seasons': []}
                    continue
                if cut is None:
                    band = content
                else:
                    band = [l for l in content if (l['y'] < cut) == (tag == 'A')]
                seasons = [p for b in boxes(band) for part in split_box(b) for p in [parse_box(part, year)] if p]
                quota = next((int(m.group(1).replace(',', '')) for l in lines if zy < l['y'] < end
                              for m in [re.search(rf'([\d,]+) {tag} Tag Quota', l['t'])] if m), None)
                entry['tags'][tag] = {'available': True, 'seasons': seasons, 'residentQuota': quota}
            zones.append(entry)
    json.dump({'year': year, 'source': path.rsplit('/', 1)[-1], 'zones': zones}, sys.stdout, indent=1)


if __name__ == '__main__':
    main(sys.argv[1])
