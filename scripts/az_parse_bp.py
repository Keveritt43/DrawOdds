"""Parse AZGFD Bonus Point Reports (pdftotext -layout) -> rows per hunt x group bonus points."""
import re, subprocess, sys, json
ROW = re.compile(r'^\s*(\d{4,5})\s+(All|\d+)\s+((?:-?\d+\s+){14}-?\d+)\s*$')
def parse(path):
    txt = subprocess.run(['pdftotext','-layout',path,'-'],capture_output=True,text=True).stdout
    rows, bad = [], []
    for ln in txt.splitlines():
        m = ROW.match(ln)
        if m:
            v = list(map(int, m.group(3).split()))
            rows.append({'hunt': int(m.group(1)), 'pts': m.group(2), 'v': v})
        elif re.match(r'^\s*\d{4,5}\s+(All|\d+)\s', ln):
            bad.append(ln.strip())
    return rows, bad
if __name__ == '__main__':
    for p in sys.argv[1:]:
        r, b = parse(p)
        print(p.split('/')[-1], len(r), 'rows', len({x['hunt'] for x in r}), 'hunts', 'bad', len(b), b[:2])
