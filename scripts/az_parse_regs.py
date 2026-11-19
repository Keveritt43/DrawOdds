"""Parse AZGFD hunt tables (Commission Orders) by word position.
A multi-line cell is printed with the hunt number on its middle line, so each word goes to the hunt row whose line is
nearest vertically, inside the column the table's header sets (Season Dates / Notes / Open Areas / Legal Wildlife /
Permits). Pages can hold two tables side by side; each is read on its own. Tribal and military hunts print '----'
instead of a hunt number: they take their own words but are not output.
Usage: az_parse_regs.py <pdf> <lo> <hi> <out.json>"""
import re, sys, json, pdfplumber
SEC = re.compile(r'^([A-Z][A-Z0-9 ,/\-’\'()&]*?(DEER|ELK))(?:\s*\(.*\))?$')
CELLS = ('dates', 'notes', 'areas', 'legal', 'permits')
def lines_of(words):
    rows = {}
    for w in words: rows.setdefault(round(w['top']), []).append(w)
    out = []
    for k in sorted(rows):
        if out and k - out[-1][0] <= 2: out[-1][1].extend(rows[k])
        else: out.append([k, list(rows[k])])
    return [(k, sorted(ws, key=lambda w: w['x0'])) for k, ws in out]
def band_rows(lines, lo, hi, sec):
    res = []
    hdrs = [(y, ws) for y, ws in lines if {'Season', 'Permits', 'Hunt'} <= {w['text'] for w in ws}]
    for y, ws in lines:  # section header above the first table in this band
        if hdrs and y >= hdrs[0][0]: break
        t = ' '.join(w['text'] for w in ws).strip()
        if SEC.match(t): sec = SEC.match(t).group(1)
    for i, (hy, hws) in enumerate(hdrs):
        ny = hdrs[i + 1][0] if i + 1 < len(hdrs) else 1e9
        x = {w['text']: w['x0'] for w in hws}
        cx = {'dates': x['Season'], 'notes': x['Notes'], 'areas': x['Open'], 'legal': x['Legal'], 'permits': x['Permits']}
        body = [(y, ws) for y, ws in lines if hy < y < ny]
        rows = []
        for y, ws in body:
            t = ' '.join(w['text'] for w in ws).strip()
            m = SEC.match(t)
            if m:  # next section header inside this band ends the table
                ny = y; sec_next = m.group(1); break
            w0 = ws[0]
            if w0['x0'] < cx['dates'] - 5 and (re.fullmatch(r'\d{4}', w0['text']) or w0['text'] == '----'):
                h = int(w0['text']) if w0['text'] != '----' else None
                rows.append({'y': y, 'hunt': h, 'cells': {k: [] for k in CELLS}})
        else:
            sec_next = None
        body = [(y, ws) for y, ws in body if y < ny]
        rowy = {r['y'] for r in rows}
        def own_area(r):
            ws = [w for yy, wl in body if yy == r['y'] for w in wl if cx['areas'] - 4 <= w['x0'] < cx['legal'] - 4]
            return ' '.join(w['text'] for w in ws)
        def complete(t):
            t = t.strip(); d = 0
            for ch in t:
                d += (ch == '(') - (ch == ')')
                if d < 0: return False
            return bool(t) and d == 0 and not re.search(r'(,|\band|\bSee|Apply|-)$', t)
        for y, ws in body:
            if not rows: break
            above = [r for r in rows if r['y'] <= y]; below = [r for r in rows if r['y'] > y]
            for w in ws:
                if w['x0'] < cx['dates'] - 5 and re.fullmatch(r'\d{4}|----', w['text']): continue
                if y in rowy: r = [q for q in rows if q['y'] == y][0]
                else:
                    a = above[-1] if above else None; b = below[0] if below else None
                    cand = [q for q in (a, b) if q and abs(q['y'] - y) <= 14]
                    if not cand: continue
                    if len(cand) == 2:
                        # a wrapped line belongs to the row above unless that row's own cell is already complete
                        r = b if complete(own_area(a)) and not complete(own_area(b)) else a if not complete(own_area(a)) else min(cand, key=lambda q: abs(q['y'] - y))
                    else: r = cand[0]
                xc = w['x0']
                col = 'permits' if xc >= cx['permits'] - 15 else 'legal' if xc >= cx['legal'] - 4 else 'areas' if xc >= cx['areas'] - 4 else 'notes' if xc >= cx['notes'] - 4 else 'dates'
                r['cells'][col].append((y, w['x0'], w['text']))
        for r in rows:
            if r['hunt'] is None or not lo <= r['hunt'] <= hi: continue
            c = {k: ' '.join(t for _, _, t in sorted(v)) for k, v in r['cells'].items()}
            if 'BONUS POINT ONLY' in ' '.join(c.values()): continue
            d = re.search(r'([A-Z][a-z]{2} \d{1,2}(?:, \d{4})? - [A-Z][a-z]{2} \d{1,2}, \d{4})', c['dates'] + ' ' + c['notes'])
            notes = [int(n) for n in re.findall(r'\d+', ''.join(re.findall(r'\(([\d,]+)\)', c['notes'] + c['dates'])))]
            perm = re.findall(r'\d[\d,]*', c['permits'])
            res.append({'hunt': r['hunt'], 'section': sec, 'dates': d.group(1) if d else None, 'notes': notes,
                        'areas': c['areas'], 'legal': c['legal'], 'permits': int(perm[-1].replace(',', '')) if perm else None})
        if sec_next: sec = sec_next
        # a section header below the last table, for the next page
    for y, ws in lines:
        if hdrs and y > hdrs[-1][0]:
            t = ' '.join(w['text'] for w in ws).strip()
            if SEC.match(t): sec = SEC.match(t).group(1)
    return res, sec
def parse(path, lo, hi):
    out, secs = [], {}
    with pdfplumber.open(path) as pdf:
        for pg in pdf.pages:
            allw = pg.extract_words(keep_blank_chars=False)
            hx = sorted({round(w['x0']) for w in allw if w['text'] == 'Hunt' and any(v['text'] == 'No.' and abs(v['top'] - w['top']) < 2 and 0 <= v['x0'] - w['x1'] < 8 for v in allw)})
            bands = []
            for x in hx:
                if not bands or x - bands[-1] > 100: bands.append(x)
            edges = [-1] + [b - 3 for b in bands[1:]] + [1e9]
            for bi in range(len(edges) - 1):
                words = [w for w in allw if edges[bi] <= w['x0'] < edges[bi + 1]]
                # a right-hand table continues the right-hand section; left continues left
                key = 'L' if bi == 0 else 'R'
                prev = secs.get(key, secs.get('L'))
                rows, sec = band_rows(lines_of(words), lo, hi, prev)
                secs[key] = sec
                if key == 'R': secs['L'] = sec
                out.extend(rows)
    return out
if __name__ == '__main__':
    rows = parse(sys.argv[1], int(sys.argv[2]), int(sys.argv[3]))
    json.dump(rows, open(sys.argv[4], 'w'), indent=0)
    import collections
    print(len(rows), collections.Counter(r['section'] for r in rows))
    print(collections.Counter(r['legal'] for r in rows).most_common(8))
    for r in rows:
        if r['hunt'] in (1068, 1190, 1191, 1192, 3033, 3067, 3068, 3074, 3076, 3103, 3112) or not r['dates'] or not r['areas'] or not r['legal']: print(r)
