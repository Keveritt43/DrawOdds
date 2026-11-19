"""AZGFD '<year> AZ Deer/Elk Draw Odds' PDFs -> per hunt: units, method, open, close, hunt type, apps, permits."""
import re, subprocess, sys, json, glob, os
ROW = re.compile(r'^\s*(.+?)\s+([13]\d{3})\s+(20\d\d)\s+(.+?)\s+(\d{1,2}/\d{1,2}/\d{4})\s+(\d{1,2}/\d{1,2}/\d{4})\s+(.+?)\s+(\d+)?\s*(\d+)\s+(\d+)\s+([\d.]+|#DIV/0!)\s*$')
def parse(path):
    txt = subprocess.run(['pdftotext', '-layout', path, '-'], capture_output=True, text=True).stdout
    out, bad = {}, []
    for ln in txt.splitlines():
        m = ROW.match(ln)
        if m:
            u, h, y, meth, o, c, typ, a1, a2, p, odds = m.groups()
            out[int(h)] = {'units': u.strip(), 'method': meth.strip().title(), 'open': o, 'close': c, 'type': typ.strip().title(),
                           'apps1': int(a1) if a1 else 0, 'apps2': int(a2), 'permits': int(p), 'odds': None if odds.startswith('#') else float(odds)}
        elif re.search(r'\s[13]\d{3}\s+20\d\d\s', ln): bad.append(ln.strip())
    return out, bad
if __name__ == '__main__':
    res = {}
    for p in sorted(glob.glob(os.path.join(sys.argv[1], '20??-AZ-*Draw-Odds*.pdf'))):
        sp = 'ELK' if '-Elk-' in p else 'DEER' if '-Deer-' in p else None
        if not sp: continue
        y = os.path.basename(p)[:4]
        o, b = parse(p)
        res.setdefault(sp, {})[y] = o
        import collections
        print(sp, y, len(o), 'bad', len(b), b[:2], collections.Counter(x['method'] for x in o.values()).most_common(8))
    json.dump(res, open(sys.argv[2], 'w'), indent=0)
