"""
Arizona deer and elk: AZGFD sources -> data/az/hunts.json.   python3 -I scripts/az_build_hunts.py

Inputs (all in data/az/, built by the az_parse_* scripts from AZGFD PDFs saved through Claude in Chrome on Nov 18, 2026;
the PDFs are on the owner's PC, Downloads\\huntapp\\az):
  source/regs-deer-2026.json, source/regs-elk-2026.json  hunt tables of the 2026-27 Arizona Hunting Regulations (deer,
        Commission Order 2) and the 2026 Pronghorn and Elk Regulations (elk, Commission Order 4): the hunts, dates,
        open areas, legal animal and permits the latest draws were held for.
  draws.json      Bonus Point Reports + Bonus Pass / 1-2 Pass draw reports: deer 2022-2026, elk 2021-2026.
  crosswalk.json  the same hunt in earlier years (AZGFD renumbers every year), from the yearly Draw Odds reports.
  harvest.json    draw-hunt harvest summaries: deer 2021-2025, elk 2021 and 2023-2025.
  land.json, units.json  AZGFD GMUs x BLM SMA.
Odds: scripts/az_model.py fitted to the 2026 draw, per hunt and residency. No projection: the roll-forward lost to
repeating the last draw in nearly every species, residency and year (data/az/backtest.json), so pages show the 2026
draw, labelled. The next draws are elk in February 2027 and deer in June 2027, for hunt lists AZGFD hasn't published.
"""
import collections, json, re, sys
from datetime import date
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'scripts'))
from az_model import fit, table, odds_at  # noqa: E402
from az_crosswalk import kind as kind_of, legal as legal_of, units as units_of, area_name  # noqa: E402
D = ROOT / 'data' / 'az'
LAST = 2026
MON = {m: i for i, m in enumerate(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], 1)}
KIND = {  # crosswalk kind -> (weapon enum, hunter label, filter key)
    'general': ('ANY', 'General', 'general'), 'youth': ('ANY', 'Youth-only', 'youth'), 'youth-muzz': ('MUZZLELOADER', 'Youth-only muzzleloader', 'youth'),
    'muzz': ('MUZZLELOADER', 'Muzzleloader', 'muzzleloader'), 'archery': ('ARCHERY', 'Archery', 'archery'),
    'champ': ('ANY', 'CHAMP (mobility permit)', 'champ'), 'lo-general': ('ANY', 'Limited opportunity', 'lo'),
    'lo-ham': ('SHORT_RANGE', 'Limited opportunity HAM (handgun, archery, muzzleloader)', 'lo'), 'lo-archery': ('ARCHERY', 'Limited opportunity archery', 'lo'),
}
def iso(d, end=False):
    m = re.match(r'([A-Z][a-z]{2}) (\d{1,2})(?:, (\d{4}))? - ([A-Z][a-z]{2}) (\d{1,2}), (\d{4})', d)
    a, ad, ay, b, bd, by = m.groups()
    by = int(by); ay = int(ay) if ay else (by - 1 if MON[a] > MON[b] else by)
    return f'{ay}-{MON[a]:02d}-{int(ad):02d}', f'{by}-{MON[b]:02d}-{int(bd):02d}'
def gmus(ustr, known):
    out = []
    for t in ustr.split('/'):
        if not t: continue
        g = t if t in known else t[:-1] if t[:-1] in known else t[:-2] if t[:-2] in known else None
        if g is None: return None
        if g not in out: out.append(g)
    return out
def clean_area(a):
    a = re.sub(r'\(Special Restrictions Apply[^)]*\)?', '', a)
    a = re.sub(r'\s+', ' ', a).strip(' ,')
    return a
def main():
    known = {u['name'] for u in json.load(open(D / 'units.json'))['units']}
    land = json.load(open(D / 'land.json'))['gmus']
    draws = json.load(open(D / 'draws.json'))['draws']
    cw = json.load(open(D / 'crosswalk.json'))
    harv = json.load(open(D / 'harvest.json'))
    odds_hist = json.load(open(D / 'source' / 'odds-ids-2021-2025.json'))
    out, problems, skipped = [], [], []
    for sp, f in (('DEER', 'regs-deer-2026.json'), ('ELK', 'regs-elk-2026.json')):
        regs = {r['hunt']: r for r in json.load(open(D / 'source' / f))}
        for h, r in sorted(regs.items()):
            if (sp == 'DEER' and h >= 1800) or (sp == 'ELK' and h >= 3800): continue
            if not r['dates']: problems.append(f'{h}: no dates'); continue
            nm = area_name(r, sp)
            ustr = units_of(nm or r['areas'])
            us = gmus(ustr, known)
            if not us: problems.append(f'{h}: units {ustr!r} from {r["areas"]!r}'); continue
            k = kind_of(r['section']); lg = legal_of(r['legal'], sp)
            weapon, klabel, lic = KIND[k]
            d = draws[sp].get(str(LAST), {}).get(str(h))
            if d is None: skipped.append(f'{h}: not in the {LAST} draw'); continue
            mres, mnr = fit(d, 'res'), fit(d, 'nr')
            nrcap = d.get('nrCap')
            last = {}
            if mres: last['res'] = table(mres)
            if mnr and nrcap != 0: last['nr'] = table(mnr)
            # monotone guard: with more points, odds never fall
            for p, a in last.items():
                for i in range(1, len(a)): a[i] = max(a[i], a[i - 1])
            def first(res):
                i1 = 1 if res == 'res' else 2
                apps = sum(x[i1] for x in d['rows'])
                b = (d['bonus'] or {}).get(res) or []; p = (d['pass12'] or {}).get(res) or []
                drew = (b[5] or 0) + (p[5] or 0) if len(b) > 5 and len(p) > 5 and b[5] is not None and p[5] is not None else None
                return apps, drew
            ra, rd = first('res'); na, nd = first('nr')
            # history: the same hunt in earlier draws (crosswalk), first-choice applicants and permits
            hist = {}
            for y, hy in sorted(cw[sp]['years'].get(str(h), {}).items()):
                dy = draws[sp].get(y, {}).get(str(hy)); oy = odds_hist.get(sp, {}).get(y, {}).get(str(hy))
                if dy:
                    hist[y] = {'hunt': hy, 'permits': dy['auth'], 'resApps': sum(x[1] for x in dy['rows']), 'nrApps': sum(x[2] for x in dy['rows'])}
                elif oy:
                    hist[y] = {'hunt': hy, 'permits': oy['permits'], 'apps': oy['apps1']}
            # harvest: the matched hunt's AZGFD harvest summary, pooled over surveyed seasons
            hy_rows = []
            for y, hy in sorted(cw[sp]['years'].get(str(h), {}).items()):
                x = harv.get(sp, {}).get(y, {}).get(str(hy))
                if x and x['hunters'] > 0: hy_rows.append((int(y), x))
            hu = sum(x['hunters'] for _, x in hy_rows); hv = sum(x['harvest'] for _, x in hy_rows)
            dys = sum(x['days'] for _, x in hy_rows)
            wt = sum(x['parts'][2] + x['parts'][3] for _, x in hy_rows) if sp == 'DEER' else 0
            pt = sum(sum(x['parts']) for _, x in hy_rows)
            hvst = {'success5': hv / hu if hu else None, 'hunters5': hu or None, 'harvest5': hv if hu else None, 'harvestYears': len(hy_rows),
                    'harvestLastYear': hy_rows[-1][0] if hy_rows else None, 'successLast': hy_rows[-1][1]['harvest'] / hy_rows[-1][1]['hunters'] if hy_rows else None,
                    'daysPerHunter5': dys / hu if hu else None, 'smallSample': hu < 30}
            # land: acre-weighted over the hunt's GMUs; a hunt area that is a portion of a GMU (5B North, 12A West)
            # takes the whole GMU's shares, labelled on the hunt page
            recs = [land.get(u) for u in us]
            if any(x is None for x in recs): problems.append(f'{h}: land missing for {us}'); continue
            ac = sum(x['acres'] for x in recs)
            w = lambda key: round(sum(x[key] * x['acres'] for x in recs) / ac, 1)
            ln = {'acres': ac, 'publicPct': w('publicPct'), 'privatePct': w('privatePct'), 'huntablePct': w('huntablePct'), 'tribalPct': w('tribalPct')}
            portion = bool(re.search(r'\d[A-Z]?[NSEW]\b|\b(North|South|East|West)\b', (nm or r['areas']))) or bool(nm)
            opn, cls = iso(r['dates'])
            area = nm + f" (Unit{'s' if len(us) > 1 else ''} {', '.join(us)})" if nm else clean_area(r['areas'])
            legal = r['legal'].strip()
            antler = 'ANTLERLESS' if lg == 'antlerless' else 'EITHER' if lg == 'any' else 'ANTLERED'
            deer_type = ('MULE' if lg == 'mule' else 'WHITETAIL' if lg == 'wt' else 'MIXED') if sp == 'DEER' else None
            rec = {
                'id': f'AZ:{h}', 'slug': f'az-{h}', 'state': 'AZ', 'species': sp, 'type': 'CONTROLLED', 'tagCode': str(h),
                'name': f"{'Units' if len(us) > 1 or ',' in area or ' and ' in area else 'Unit'} {area} · {legal} · {klabel}" if not nm else f'{area} · {legal} · {klabel}',
                'areaName': area, 'description': f'{legal}, {klabel.lower()}', 'huntCategory': k, 'units': us, 'weapon': weapon,
                'antlerClass': antler, 'takeMethod': legal, 'deerType': deer_type, 'openDate': opn, 'closeDate': cls, 'tags': r['permits'],
                'privateOnly': False, 'youthOnly': k in ('youth', 'youth-muzz'),
                'oddsLastYear': LAST, 'oddsYears': len(hist) + 1,
                'resOddsLast': rd / ra if ra and rd is not None else None, 'nrOddsLast': nd / na if na and nd is not None and nrcap != 0 else (0.0 if nrcap == 0 and na else None),
                'resAppsLast': ra, 'nrAppsLast': na, 'appsLast': ra + na, 'permitsLast': d['auth'], 'nrPermitsLast': nrcap,
                **hvst, **ln,
                'oddsByPts': {'proj': {}, 'last': last},
                'pointOdds': {'state': 'AZ', 'kind': 'bonus', 'year': LAST, 'projected': False, 'category': k, 'license': lic,
                              'restricted': k == 'champ', 'legal': lg, 'nrCap': nrcap, 'portion': portion,
                              'pointsMeaning': 'Group bonus points: bonus points for the species plus the loyalty and hunter education points. Each point is one more random number in the draw; AZGFD keeps the lowest.',
                              'cut': {p: (m['cut'], round(m['s'], 4)) for p, m in (('res', mres), ('nr', mnr)) if m and m['cut'] is not None},
                              'pools': {p: {'levels': [[x[0], x[1 if p == 'res' else 2], x[3 if p == 'res' else 4], x[5 if p == 'res' else 6], x[7 if p == 'res' else 8]] for x in d['rows']]} for p in ('res', 'nr')},
                              'history': hist, 'notes': r['notes'],
                              'harvest': [{'year': y, 'hunt': cw[sp]['years'][str(h)][str(y)], 'hunters': x['hunters'], 'harvest': x['harvest'], 'days': x['days'], 'parts': x['parts']} for y, x in hy_rows]},
                'tagSeasons': {'year': LAST, 'seasons': [{'weapon': weapon, 'sex': legal, 'dates': [{'open': opn, 'close': cls}], 'notes': klabel}]},
            }
            if sp == 'DEER' and pt >= 20: rec['whitetailPct5'] = wt / pt
            sq = ac / 640
            rec['huntersSqMi'] = (hu / len(hy_rows) / sq) if hu and hy_rows and sq else None
            out.append(rec)
    (D / 'hunts.json').write_text(json.dumps({'generated': date.today().isoformat(), 'drawYear': LAST, 'regsYear': LAST,
                                              'problems': problems, 'skipped': skipped, 'hunts': out}, separators=(',', ':')) + '\n')
    c = collections.Counter((h['species'], h['huntCategory']) for h in out)
    print(f'wrote {len(out)} hunts; problems {len(problems)}; skipped {len(skipped)}')
    for p in problems[:20]: print('  problem:', p)
    for p in skipped[:20]: print('  skipped:', p)
    print(dict(c))
    print('with harvest', sum(1 for h in out if h['success5'] is not None), 'nr tables', sum(1 for h in out if 'nr' in h['oddsByPts']['last']))
if __name__ == '__main__':
    main()
