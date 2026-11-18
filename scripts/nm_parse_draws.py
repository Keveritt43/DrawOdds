#!/usr/bin/env python3
"""Parse NMDOW Complete Drawing Odds reports (Excel) into data/nm/draws.json.

Usage: python3 -I scripts/nm_parse_draws.py data/nm/source data/nm/draws.json

Each year's sheet has a pre-draw block (applicants by choice, per pool) and a
post-draw block (successes by choice, per pool). Column positions differ by year,
so they are read from the year's own header rows. Every row is checked: pool
applicants must sum to the hunt total, and pool successes to the hunt total.
"""
import json, re, sys, glob, os
import openpyxl

POOLS = {'hunt total': 'all', 'hunt code total': 'all', 'resident': 'res', 'non-resident': 'nr', 'nonresident': 'nr', 'outfitter': 'out', 'outiftter': 'out'}
CODE = re.compile(r'^(DER|ELK)-\d-\d{3}$')
ANY_CODE = re.compile(r'^[A-Z]{3}-\d-\d{3}$')

def norm(x):
    return re.sub(r'\s+', ' ', str(x or '').replace('\xa0', ' ')).strip().lower()

def layout(g, s):
    """Map (section, pool, field) -> column from a group row g and subheader row s."""
    split = [j for j, v in enumerate(s) if norm(v) in ('hunt', 'hunt code')]
    post0 = split[1]
    cols, cur = {}, None
    for j in range(len(s)):
        gv = norm(g[j]) if j < len(g) else ''
        if gv in POOLS: cur = POOLS[gv]
        elif gv == 'distribution': cur = 'dist'
        sv = norm(s[j])
        sec = 'pre' if j < post0 else 'post'
        if sv in ('licenses', 'lic.'): cols[(sec, 'lic')] = j
        if sv == 'bag': cols[(sec, 'bag')] = j
        if sv in ('unit description', 'unit/description', 'unit decription'): cols[('pre', 'desc')] = j
        if sv in ('1st', '2nd', '3rd', '4th', 't', 'total') and cur in ('all', 'res', 'nr', 'out'):
            f = {'t': 'total'}.get(sv, sv)
            cols[(sec, cur, f)] = j
        # 2024+: post-draw per-pool quota columns sit under the "Hunt Total" group
        if sec == 'post' and sv in ('resident', 'nonresident', 'non-resident', 'outfitter', 'outiftter'):
            cols[('quota', POOLS[sv])] = j
    cols['post0'] = post0
    return cols

def num(v):
    if v is None or v == '': return 0
    return int(round(float(v)))

def parse_year(path, year):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    rows = [list(r) for r in wb.worksheets[0].iter_rows(values_only=True)]
    out, problems, cols, lastg = {}, [], None, None
    for i, r in enumerate(rows):
        c0 = norm(r[0]) if r else ''
        if c0 in ('hunt', 'hunt code'):
            g = next((rows[k] for k in range(i - 1, max(i - 4, -1), -1) if any(norm(v) in POOLS for v in rows[k])), None)
            if g is None: g = lastg  # 2021: species blocks repeat the subheader but not the pool row
            if g is None: problems.append(f'{year} row {i}: header without pool row'); cols = None; continue
            lastg = g
            cols = layout(g, r)
            continue
        code = str(r[0] or '').strip()
        if not ANY_CODE.match(code) or not CODE.match(code):
            continue
        if cols is None: problems.append(f'{year} {code}: no header'); continue
        pc = str(r[cols['post0']] or '').strip()
        if pc != code:
            problems.append(f'{year} {code}: post-draw block names {pc!r}')
            continue
        rec = {'code': code, 'desc': str(r[cols[('pre', 'desc')]] or '').strip(), 'licenses': num(r[cols[('pre', 'lic')]])}
        bag = cols.get(('pre', 'bag')) or cols.get(('post', 'bag'))
        if bag is not None: rec['bag'] = str(r[bag] or '').strip() or None
        app, drew = {}, {}
        for p in ('all', 'res', 'nr', 'out'):
            app[p] = [num(r[cols[('pre', p, k)]]) for k in ('1st', '2nd', '3rd')]
            if ('post', p, '1st') in cols:
                drew[p] = [num(r[cols[('post', p, k)]]) for k in ('1st', '2nd', '3rd', '4th')]
        # 2024+: "Resident / Non-Resident / Outfitter" under the post-draw Hunt Total are licenses
        # issued per pool (not quotas: undersubscribed hunts show less than the hunt's licenses).
        for p in ('res', 'nr', 'out'):
            if ('quota', p) in cols and num(r[cols[('quota', p)]]) != sum(drew[p]):
                problems.append(f'{year} {code}: {p} issued {num(r[cols[("quota", p)]])} != choice sum {sum(drew[p])}')
        rec['applicants'] = {p: v for p, v in app.items() if p != 'all'}
        rec['drawn'] = {p: v for p, v in drew.items() if p != 'all'}
        # reconcile pools with hunt totals
        for k in range(3):
            s = sum(app[p][k] for p in ('res', 'nr', 'out'))
            if s != app['all'][k]: problems.append(f'{year} {code}: applicants choice {k+1} pools {s} != total {app["all"][k]}')
        if 'all' in drew:
            for k in range(4):
                s = sum(drew[p][k] for p in ('res', 'nr', 'out'))
                if s != drew['all'][k]: problems.append(f'{year} {code}: drawn choice {k+1} pools {s} != total {drew["all"][k]}')
        for p in ('all', 'res', 'nr', 'out'):
            if ('post', p, 'total') in cols and p in drew:
                if sum(drew[p]) != num(r[cols[('post', p, 'total')]]): problems.append(f'{year} {code}: {p} drawn sum != printed total')
        if ('post', 'all', 'total') in cols:
            t = num(r[cols[('post', 'all', 'total')]])
            s = sum(sum(drew[p]) for p in ('res', 'nr', 'out'))
            if s != t: problems.append(f'{year} {code}: drawn pools {s} != printed hunt total {t}')

        for p in ('res', 'nr', 'out'):
            if drew[p][0] > app[p][0]: problems.append(f'{year} {code}: {p} 1st drawn {drew[p][0]} > applicants {app[p][0]}')
        if code in out: problems.append(f'{year} {code}: duplicate row')
        out[code] = rec
    return out, problems

def main(src, dst):
    years, problems = {}, []
    for path in sorted(glob.glob(os.path.join(src, 'complete-*.xlsx'))):
        y = re.search(r'(\d{4})', os.path.basename(path)).group(1)
        hunts, pr = parse_year(path, y)
        years[y] = hunts
        problems += pr
    doc = {
        'source': 'NMDOW Complete Drawing Odds reports (Excel), 2019-2026, wildlife.dgf.nm.gov "How New Mexico\'s Draw Works" > Odds Reports; fetched Nov 17, 2026',
        'pools': {'res': 'resident', 'nr': 'nonresident without outfitter (6%)', 'out': 'resident or nonresident with a New Mexico outfitter (10%)'},
        'fields': 'applicants[pool] = [1st,2nd,3rd choice]; drawn[pool] = [1st,2nd,3rd,4th choice]. NMDOW does not print per-pool quotas.',
        'problems': problems,
        'years': years,
    }
    json.dump(doc, open(dst, 'w'), indent=None, separators=(',', ':'))
    for y, h in years.items():
        print(y, len(h), 'deer', sum(c.startswith('DER') for c in h), 'elk', sum(c.startswith('ELK') for c in h))
    print('problems', len(problems)); print('\n'.join(problems[:30]))

if __name__ == '__main__':
    main(*sys.argv[1:3])
