"""AZGFD Bonus Point Reports + 1-2 Pass reports -> data/az/draws.json (deer 1xxx, elk 3xxx).
Usage: python3 -I az_parse_draws.py <pdf_dir> <out.json>
Res/NonRes columns are people. 2022's Total columns count applications (groups), so Totals are not used."""
import sys, os, json, glob
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from az_parse_bp import parse as parse_bp
from az_parse_pass import parse as parse_pass
D = sys.argv[1]
FILES = {  # year, draw: (bonus point report, 1-2 pass report)
 (2021,'M'):('2021-Elk-and-Pronghorn-Draw-Report-Bonus-Point-Report.pdf','2021-Elk-and-Pronghorn-Draw-Report-1-2-Pass.pdf'),
 (2022,'M'):('2022-Elk-and-Pronghorn-Bonus-Point-Report.pdf','2022-Elk-and-Pronghorn-Draw-Report-1-2-Pass.pdf'),
 (2023,'M'):('2023_Mid_Bonus-Point-Report.pdf','2023_Mid_Draw-Report_1-2-Pass.pdf'),
 (2024,'M'):('2024-Elk-Pronghorn-Bonus-Point-Report.pdf','2024-Elk-Pronghorn-Draw-Report-1-2-Pass.pdf'),
 (2025,'M'):('2025-Bonus-Point-Report.pdf','2025-Elk-Pronghorn-Draw-Report-1-2-Pass.pdf'),
 (2026,'M'):('2026-M-Bonus-Point-Report.pdf','2026-M-Draw-Report-1-2-Pass.pdf'),
 (2022,'F'):('2022-Fall-Draw-Report-Bonus-Point-Report.pdf','2022-Fall-Draw-Report-1-2-Pass.pdf'),
 (2023,'F'):('2023-Fall-Draw-Bonus-Point-Report.pdf','2023-Fall-Draw-Report-1-2-Pass.pdf'),
 (2024,'F'):('2024-Fall-Bonus-Point-Report.pdf','2024-Fall-Draw-Report-1-2-Pass.pdf'),
 (2025,'F'):('2025-Fall-Bonus-Point-Report.pdf','2025-Fall-Draw-1-2-Pass.pdf'),
 (2026,'F'):('2026-F-Bonus-Point-Report.pdf','2026-F-Draw-Report-1-2-Pass.pdf'),
}
BONUS = {(2021,'M'):'2021-Elk-and-Pronghorn-Draw-Report-Bonus-Pass.pdf',(2022,'M'):'2022-Elk-and-Pronghorn-Draw-Report-Bonus-Pass.pdf',
 (2023,'M'):'2023_Mid_Draw-Report_Bonus-Pass.pdf',(2024,'M'):'2024-Elk-Pronghorn-Draw-Report-Bonus-Pass.pdf',
 (2025,'M'):'2025-Elk-Pronghorn-Draw-Report-Bonus-Pass.pdf',(2026,'M'):'2026-M-Draw-Report-Bonus-Pass.pdf',
 (2022,'F'):'2022-Fall-Draw-Report-Bonus-Point-Pass.pdf',(2023,'F'):'2023-Fall-Draw-Report-Bonus-Pass.pdf',
 (2024,'F'):'2024-Fall-Draw-Report-Bonus-Pass.pdf',(2025,'F'):'2025-Fall-Draw-Bonus-Pass.pdf',(2026,'F'):'2026-F-Draw-Report-Bonus-Point-Pass.pdf'}
def passcols(p, key):
    # [authorized, available, 1st apps, 2nd apps, 1+2 apps, 1st drawn, 2nd drawn, ...]
    r = p.get(key, [])
    return [None if x is None else int(x) for x in r[:9]] if len(r) >= 9 else None
out, problems = {}, []
for (yr, draw), (bpf, pf) in sorted(FILES.items()):
    sp = 'ELK' if draw == 'M' else 'DEER'
    lo, hi = (3001, 3999) if sp == 'ELK' else (1001, 1999)
    bp, _ = parse_bp(os.path.join(D, bpf)); ps = parse_pass(os.path.join(D, pf))[0]; bs = parse_pass(os.path.join(D, BONUS[(yr, draw)]))[0] if (yr, draw) in BONUS else {}
    hunts = {}
    for r in bp:
        h = r['hunt']
        if not (lo <= h <= hi) or r['pts'] == 'All': continue
        v = r['v']  # 1st T R N, 2nd T R N, 1+2 T R N, bonus T R N, bonus+12 T R N
        hunts.setdefault(h, []).append([int(r['pts']), v[1], v[2], v[4], v[5], v[10], v[11], v[13], v[14]])
    for h, rows in hunts.items():
        p = ps.get(h, {})
        a, n = p.get('All', []), p.get('NonRes', [])
        auth = int(a[0]) if a and a[0] is not None else None
        nrcap = int(n[0]) if n and n[0] is not None else None
        if auth is None: problems.append(f'{yr}{draw} {h}: no 1-2 pass row')
        rows.sort()
        issued = sum(x[7] + x[8] for x in rows)
        if auth is not None and issued > auth: problems.append(f'{yr}{draw} {h}: issued {issued} > auth {auth}')
        b = bs.get(h, {})
        rec = {'auth': auth, 'nrCap': nrcap, 'rows': rows,
               'bonus': {k: passcols(b, K) for k, K in (('res','Res'),('nr','NonRes'))},
               'pass12': {k: passcols(p, K) for k, K in (('res','Res'),('nr','NonRes'))}}
        out.setdefault(sp, {}).setdefault(str(yr), {})[str(h)] = rec
json.dump({'source': {k[0]: v for k, v in []}, 'columns': ['pts','f1Res','f1Nr','f2Res','f2Nr','bonusRes','bonusNr','b12Res','b12Nr'],
           'files': {f'{y}{d}': v for (y, d), v in FILES.items()}, 'draws': out}, open(sys.argv[2], 'w'), separators=(',', ':'))
for sp in out:
    for y in sorted(out[sp]): print(sp, y, len(out[sp][y]), 'hunts', sum(len(h['rows']) for h in out[sp][y].values()), 'rows')
print(len(problems), 'problems', problems[:8])
