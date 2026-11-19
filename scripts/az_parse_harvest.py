"""AZGFD draw-hunt harvest summaries (deer or elk) -> per hunt number: kind, legal class, units text and harvest.
Deer numbers: permits auth, 1st apps, issued, hunters, days, mule buck, mule antlerless, wt buck, wt antlerless, total.
Elk numbers: permits auth, 1st apps, issued, hunters, days, bull, spike, cow, calf, total.
Rows after 'MULTI-UNIT BREAKDOWN' are per unit within a multi-unit hunt (kept separately)."""
import re, subprocess, sys, json
ROW = re.compile(r'^\s*(.*?)\s+(1\d{3}|3\d{3})\s+(\d[\d,]*(?:\s+[\d,]+%?|\s+\d+\.\d+%?)*)\s*$')
def parse(path, species):
    txt = subprocess.run(['pdftotext', '-layout', path, '-'], capture_output=True, text=True).stdout
    main, multi, kind, sub, inmulti = {}, [], None, None, False
    for ln in txt.splitlines():
        s = ln.strip()
        if not s: continue
        if 'MULTI-UNIT BREAKDOWN' in s: inmulti = True; continue
        if 'HARVEST SUMMARY' in s and 'MULTI' not in s: inmulti = False
        if re.match(r'^(General|Youth-[Oo]nly|Muzzleloader|Archery-Only|CHAMP|Limited Opportunity)', s) and not re.search(r'\d{2,}', s):
            k = s
            top = re.match(r'^(Youth-[Oo]nly \((?:General|Muzzleloader|Archery-Only)\)|CHAMP(?: \(?General\)?)?|Limited Opportunity(?: \((?:General|HAM|Archery-Only)\))?|General|Muzzleloader|Archery-Only)', k).group(1)
            kind = top.replace('Youth-only', 'Youth-Only').replace('CHAMP (General)', 'CHAMP General')
            sub = k[len(top):].strip() or sub if k != top else None
            continue
        if s.startswith('Total') or s.startswith('GRAND') or s.startswith('Grand'): continue
        m = ROW.match(ln)
        if not m: continue
        units, hunt = m.group(1).strip(), int(m.group(2))
        if species == 'DEER' and not 1001 <= hunt <= 1999: continue
        if species == 'ELK' and not 3001 <= hunt <= 3999: continue
        toks = m.group(3).split()
        nums = [t for t in toks if not t.endswith('%') and '.' not in t]
        nums = [int(t.replace(',', '')) for t in nums]
        pct = [t for t in toks if t.endswith('%')]
        if inmulti:
            # Hunt No. Unit Hunters Days harvest...: units column follows the hunt number here
            multi.append({'hunt': hunt, 'raw': s}); continue
        rec = {'hunt': hunt, 'kind': kind, 'sub': sub, 'units': units, 'nums': nums, 'toks': toks, 'success': pct[0] if pct else None}
        main[hunt] = rec
    return main, multi
if __name__ == '__main__':
    m, mu = parse(sys.argv[1], sys.argv[2])
    import collections
    print(len(m), 'hunts', len(mu), 'multi rows', collections.Counter((r['kind'], r['sub']) for r in m.values()).most_common(25))
    print([r for r in m.values() if len(r['nums']) < 5][:5])
    print(list(m.values())[:2])

def harvest_row(r, nparts=4):
    """auth, apps, issued, hunters, days, <nparts> harvest columns, total. Deer: mule buck, mule antlerless, whitetail
    buck, whitetail antlerless. Elk: bull, spike, cow, calf (2024: bull, spike, antlerless, so nparts=3). AZGFD's
    total can differ from the parts by a few animals (species or sex not reported); a larger gap means a misread row."""
    t = r['toks']
    v = [float(x.rstrip('%').replace(',', '')) for x in t]
    k = 5 + nparts
    if len(v) <= k:
        if len(v) >= 4 and v[3] == 0: return None
        return None
    parts = v[5:k]; tot = v[k]
    if tot < sum(parts) - 3 or tot > 1.25 * sum(parts) + 3: return 'bad'
    return {'auth': int(v[0]), 'apps': int(v[1]), 'issued': int(v[2]), 'hunters': int(v[3]), 'days': int(v[4]),
            'harvest': int(tot), 'parts': [int(x) for x in parts]}
