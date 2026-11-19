"""Match each 2026 hunt to the same hunt in earlier years. AZGFD renumbers hunts every year (5A/5B general deer was
1007 in 2025 and 1006 in 2026), so the key is what the hunt is: method, open area, legal animal, and its order by
opening date among hunts that share those three. Tribal (18xx/38xx) and Camp Navajo/military (19xx/39xx) hunts are
left out: AZGFD prints them as '----' in the regulations."""
import json, re, sys, datetime as dt
from collections import defaultdict
MON = {m: i for i, m in enumerate(['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'], 1)}
def kind(s):
    s = s.lower()
    youth = 'youth' in s
    if 'champ' in s: return 'champ'
    if 'ham' in s: return 'lo-ham'
    lo = 'limited' in s or s.startswith('lo ') or s.startswith('(')
    if 'muzzle' in s: return 'youth-muzz' if youth else 'muzz'
    if 'archery' in s: return 'lo-archery' if lo else 'archery'
    if youth: return 'youth'
    if lo: return 'lo-general'
    return 'general'
def legal(s, sp):
    s = s.lower()
    if sp == 'ELK':
        if 'antlerless' in s or 'cow' in s: return 'antlerless'
        if 'bull' in s: return 'bull'
        return 'any'
    if 'antlerless' in s: return 'antlerless'
    if 'mule' in s: return 'mule'
    if 'whitetail' in s or 'white-tail' in s: return 'wt'
    if 'antlered' in s: return 'antlered'
    return 'any'
SUB = {'north': 'N', 'south': 'S', 'east': 'E', 'west': 'W'}
# Named hunt areas in the 2026 regulations, and the units AZGFD's draw-odds reports print for the same hunts
SPECIAL = {'escudilla-auger canyon': '1', 'kachina peaks': '7E', 'zeniff hunt area and dry lake': '3A/4B', 'zeniff': '3A',
           'dry lake': '4B', 'alpine hunt area': '1/27', 'twin arrows': '5BN', 'black mountain': '27', 'coon canyon': '1',
           'flat top': '1', 'antelope mountain': '1', 'sunset': '5A', 'show low creek': '3B/3C'}
# Hunt-area footnotes in the 2026 Pronghorn and Elk regulations: note number -> area name. The cell text wraps across
# neighbouring rows when several hunts share an area, so the note is the reliable key.
NOTE_AREA = {46: 'Escudilla-Auger Canyon Hunt Area', 48: 'Kachina Peaks Wilderness Hunt Area', 49: 'East Sunset and West Sunset Hunt Areas',
             51: 'Twin Arrows Hunt Area', 61: 'Black Mountain Hunt Area', 67: 'Antelope Mountain Hunt Area', 71: 'Show Low Creek Hunt Area',
             163: 'Alpine Hunt Area'}
NOTE_PAIR = {(68, 69): 'Coon Canyon and Flat Top Hunt Areas', (156, 158): 'Zeniff Hunt Area and Dry Lake Hunt Area'}
def area_name(r, sp):
    if sp != 'ELK': return None
    n = set(r['notes'])
    for k, v in NOTE_PAIR.items():
        if set(k) <= n: return v
    for k, v in NOTE_AREA.items():
        if k in n: return v
    return None
def units(s):
    for k, v in SPECIAL.items():
        if k in s.lower(): return v
    s = re.sub(r'\((?:excluding|except|special restrictions)[^)]*\)', ' ', s, flags=re.I)
    s = re.sub(r'See Notes? [\d and,]+', ' ', s, flags=re.I)
    s = re.sub(r'\bportions? of\b', ' ', s, flags=re.I)
    s = re.sub(r'\b(north|south|east|west)\b', lambda m: SUB[m.group(1).lower()], s, flags=re.I)
    s = re.sub(r'(\d+[A-Z]?)\s+([NSEW])\b', r'\1\2', s)
    toks = re.findall(r'\b0*(\d{1,2}[A-Z]{0,2})\b', s.upper())
    return '/'.join(sorted(set(toks), key=lambda t: (int(re.match(r'\d+', t).group()), t)))
def mmdd(d):
    m, dd = d.split('/')[:2]
    return int(m) * 100 + int(dd)
def regs_open(d):
    m = re.match(r'([A-Z][a-z]{2}) (\d{1,2})', d)
    return MON[m.group(1)] * 100 + int(m.group(2))
def build(regs, odds, sp):
    def keyed(rows):
        g = defaultdict(list)
        for h, r in rows.items(): g[(r['kind'], r['units'], r['legal'])].append((r['open'], h))
        out = {}
        for k, v in g.items():
            for i, (o, h) in enumerate(sorted(v)): out[h] = (k, i, len(v), o)
        return out
    cur = {}
    for r in regs:
        h = r['hunt']
        if h >= 1800 and sp == 'DEER' or h >= 3800 and sp == 'ELK' or not r['dates']: continue
        nm = area_name(r, sp)
        cur[h] = {'kind': kind(r['section']), 'units': units(nm or r['areas']), 'legal': legal(r['legal'], sp), 'open': regs_open(r['dates']),
                  'area': nm}
    ck = keyed(cur)
    res = {h: {'2026': h} for h in cur}
    stats = {}
    for y, rows in odds.items():
        prev = {}
        for h, r in rows.items():
            h = int(h)
            if h >= 1800 and sp == 'DEER' or h >= 3800 and sp == 'ELK': continue
            prev[h] = {'kind': kind(r['method']), 'units': units(r['units']), 'legal': legal(r['type'], sp), 'open': mmdd(r['open'])}
        pk = keyed(prev)
        byk = defaultdict(list)
        for h, (k, i, n, o) in pk.items(): byk[k].append((i, n, o, h))
        used = set(); n_ok = 0
        for h, (k, i, n, o) in ck.items():
            cands = [c for c in byk.get(k, []) if c[3] not in used]
            if not cands: continue
            # same count in both years: match by order; otherwise nearest opening date within 21 days
            if all(c[1] == n for c in cands) and len(byk[k]) == n:
                c = [c for c in cands if c[0] == i]
            else:
                c = sorted(cands, key=lambda c: abs(c[2] - o))
                c = [c[0]] if c and abs(c[0][2] - o) <= 21 else []
            if c: res[h][y] = c[0][3]; used.add(c[0][3]); n_ok += 1
        # second pass: same method and area, a legal label the older report wrote more loosely (2022 deer prints
        # 'Deer' for both any-antlered and mule-deer hunts), opening within 21 days
        for h, (k, i, n, o) in ck.items():
            if y in res[h]: continue
            cands = [(abs(ph[3] - o), q) for q, ph in pk.items() if q not in used and ph[0][0] == k[0] and ph[0][1] == k[1]
                     and (ph[0][2] == k[2] or ph[0][2] == 'any' and k[2] in ('antlered', 'mule'))]
            cands = [c for c in sorted(cands) if c[0] <= 21]
            if cands: res[h][y] = cands[0][1]; used.add(cands[0][1]); n_ok += 1
        stats[y] = (n_ok, len(cur), len(prev))
    return cur, res, stats
if __name__ == '__main__':
    odds = json.load(open(sys.argv[1]))
    out = {}
    for sp, f in (('DEER', sys.argv[2]), ('ELK', sys.argv[3])):
        cur, res, stats = build(json.load(open(f)), odds[sp], sp)
        out[sp] = {'hunts': cur, 'years': res}
        print(sp, {y: s for y, s in sorted(stats.items())})
    json.dump(out, open(sys.argv[4], 'w'), indent=0)
