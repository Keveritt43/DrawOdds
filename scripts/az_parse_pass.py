"""Parse AZGFD Draw Report (Bonus / 1-2 / 3-4-5 pass) by word position.
Columns: authorized, available, 1st apps, 2nd apps, 1st+2nd apps, 1st drawn, 2nd drawn, 2nd issued first,
issued this pass, grand total issued, unissued. Blank cells stay None (pdftotext -layout drops them)."""
import re, sys, pdfplumber
NUM = re.compile(r'^-?\d+(?:\.\d+)?$')
def parse(path):
    out = {}
    with pdfplumber.open(path) as pdf:
        lines_all = []
        for pg in pdf.pages:
            ws = pg.extract_words(keep_blank_chars=False, use_text_flow=False)
            rows = {}
            for w in ws:
                rows.setdefault(round(w['top'] / 2), []).append(w)
            for k in sorted(rows):
                lines_all.append(sorted(rows[k], key=lambda w: w['x0']))
        # column right edges: cluster x1 of numbers on All rows
        xs = sorted(w['x1'] for ln in lines_all if ln and ln[0]['text'] == 'All' for w in ln[1:] if NUM.match(w['text']))
        cols = []
        for x in xs:
            if not cols or x - cols[-1][-1] > 6: cols.append([x])
            else: cols[-1].append(x)
        edges = [sum(c) / len(c) for c in cols]
        hunt = None
        for ln in lines_all:
            t = ln[0]['text']
            if re.match(r'^\d{4,5}$', t) and ln[0]['x0'] < 60:
                hunt = int(t); continue
            if t in ('All', 'Res', 'NonRes') and hunt is not None:
                vals = [None] * len(edges)
                for w in ln[1:]:
                    if not NUM.match(w['text']): continue
                    i = min(range(len(edges)), key=lambda j: abs(edges[j] - w['x1']))
                    vals[i] = float(w['text'])
                out.setdefault(hunt, {})[t] = vals
    return out, len(edges)
if __name__ == '__main__':
    for p in sys.argv[1:]:
        o, n = parse(p)
        print(p.split('/')[-1], 'hunts', len(o), 'cols', n, o.get(3115) or o.get(1001))
