#!/usr/bin/env python3
"""Build data/or/units.json and data/or/land.json: Oregon's wildlife management units (WMUs) and its 2026 Eastern
Oregon deer hunt areas, with display outlines, acreage and land ownership shares.

Usage: python3 -I scripts/or_build_land.py <or-gis-5070.json>

Input, saved from Claude in Chrome on 2026-11-17 (neither shell can reach the agency servers; see CLAUDE.md), all
in EPSG:5070 (Esri JSON rings):
  wmu        ODFW nrimp.dfw.state.or.us ODFW_Admin/WildlifeManagementUnits/FeatureServer/0 (69 features: 67 hunting
             units, plus 0 Warm Springs Reservation and 1 Crater Lake National Park, which are not hunt units),
             maxAllowableOffset 10 m
  deerAreas  ORHAM/ODFW_Eastern_Oregon_Deer_Hunt_Areas/FeatureServer/0 (43 hunt areas, new for 2026: they replace
             WMUs for Eastern Oregon deer), 10 m
  ah         ORHAM/Access_and_Habitat_Areas (Oregon's private-land access program), 10 m
  sma        BLM national Surface Management Agency (BLM_Natl_SMA_LimitedScale/MapServer/1), every non-private,
             non-undetermined feature intersecting Oregon's box, rings kept where their box meets the WMUs' box +3 km,
             maxAllowableOffset 30 m

Method: Montana's (scripts/mt_build_land.py, imported here): 100 m equal-area raster, a cell belongs to a parcel
when its centre is inside it, parcels drawn largest first so inholdings overwrite. Cells no public, tribal or
undetermined parcel covers are private (private features were not fetched: they're the remainder). Ownership is
not access.

Checks (the build stops if any fails):
  - each unit's raster area is within 1% of its polygon area (units under 20 mi² exempt);
  - across Oregon (the union of the hunting WMUs), federal land 50-56% and state land 2-5%. Published: the federal
    government owns ~53% of Oregon (USFS ~25%, BLM ~25%), the state ~3%.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from mt_build_land import AGENCY as MT_AGENCY, CLASSES, CODE, FEDERAL, PUBLIC, RES, Grid, display_geometry, poly_area, window  # noqa: E402

SMALL_SQMI = 20.0
AGENCY = dict(MT_AGENCY, BPA='OTHER', FAA='OTHER', USCG='OTHER', FHA='OTHER')
NOT_HUNT_UNITS = {0, 1}  # Warm Springs Reservation, Crater Lake National Park


def signed(r):
    a = 0.0
    for (x1, y1), (x2, y2) in zip(r, r[1:] + r[:1]):
        a += x1 * y2 - x2 * y1
    return a / 2


def inside(pt, ring):
    x, y = pt
    c = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            c = not c
    return c


def esri_polys(rings):
    """Esri rings -> [[exterior, hole, ...], ...]: exteriors run clockwise (negative signed area with y up)."""
    ext, holes = [], []
    for r in rings:
        if len(r) < 4:
            continue
        r = [(float(x), float(y)) for x, y in r]
        (ext if signed(r) < 0 else holes).append(r)
    if not ext:  # some services write all rings one way: treat them all as exteriors
        ext, holes = holes, []
    boxes = [(min(x for x, _ in e), min(y for _, y in e), max(x for x, _ in e), max(y for _, y in e)) for e in ext]
    polys = [[e] for e in ext]
    for h in holes:
        px, py = h[0]
        best = None
        for i, (a, b, c, d) in enumerate(boxes):
            if a <= px <= c and b <= py <= d and inside((px, py), ext[i]):
                if best is None or abs(signed(ext[i])) < abs(signed(ext[best])):
                    best = i
        if best is not None:
            polys[best].append(h)
    return polys


def geojson(polys):
    return {'type': 'MultiPolygon', 'coordinates': [[[list(p) for p in ring] for ring in poly] for poly in polys]}


def measure(grid, own_a, key, ps, errors):
    mask, ox, oy = window(grid, ps)
    n = int(mask.sum())
    exact = sum(poly_area(p) for p in ps) / 2.589988e6
    if n == 0:
        if exact >= SMALL_SQMI:
            errors.append(f'{key}: empty raster')
        return None
    sqmi = n * RES * RES / 2.589988e6
    if exact >= SMALL_SQMI and abs(sqmi - exact) / exact > 0.01:
        errors.append(f'{key}: raster {sqmi:.1f} mi² vs polygon {exact:.1f}')
    vals = own_a[oy:oy + mask.shape[0], ox:ox + mask.shape[1]][mask]
    counts = np.bincount(vals, minlength=len(CLASSES))
    counts[CODE['PRIVATE']] += counts[0]  # uncovered = private
    counts[0] = 0
    pct = {CLASSES[i]: round(100 * counts[i] / n, 2) for i in range(1, len(CLASSES)) if counts[i]}
    return {'acres': round(exact * 640), 'sqmi': round(exact, 1),
            'publicPct': round(sum(v for k, v in pct.items() if k in PUBLIC), 1),
            'privatePct': round(pct.get('PRIVATE', 0.0), 1), 'tribalPct': round(pct.get('TRIBAL', 0.0), 1), 'ownership': pct}


def main(path: str) -> None:
    g = json.load(open(path))
    wmus = [f for f in g['wmu'] if int(f['attributes']['UNIT_NUM'] if 'UNIT_NUM' in f['attributes'] else f['attributes']['UNIT_NUMBER']) not in NOT_HUNT_UNITS]
    areas = g['deerAreas']
    feats = [('wmu', f) for f in wmus] + [('deerArea', f) for f in areas]
    shapes = {id(f): esri_polys(f['geometry']['rings']) for _, f in feats}
    xs = [x for ps in shapes.values() for p in ps for x, _ in p[0]]
    ys = [y for ps in shapes.values() for p in ps for _, y in p[0]]
    grid = Grid(min(xs) - 1000, min(ys) - 1000, max(xs) + 1000, max(ys) + 1000)
    print(f'grid {grid.w} x {grid.h} cells at {RES:.0f} m')

    parts, unknown = [], set()
    for f in g['sma']:
        cls = AGENCY.get(f['a'].get('ADMIN_AGENCY_CODE'))
        if cls is None:
            unknown.add(f['a'].get('ADMIN_AGENCY_CODE'))
            continue
        for p in esri_polys(f['rings']):
            parts.append((poly_area(p), CODE[cls], p))
    if unknown:
        raise SystemExit(f'unmapped ADMIN_AGENCY_CODE values: {sorted(map(str, unknown))}')
    parts.sort(key=lambda t: -t[0])
    own_a = np.zeros((grid.h, grid.w), dtype=np.uint8)
    for _, code, p in parts:
        grid.fill(own_a, [p], code)
    print(f'ownership: {len(parts)} parcels drawn')

    st = np.zeros((grid.h, grid.w), dtype=bool)
    for f in wmus:
        grid.fill(st, shapes[id(f)], True)
    sc = np.bincount(own_a[st], minlength=len(CLASSES))
    tot = int(st.sum())
    fed = sum(sc[CODE[c]] for c in FEDERAL) / tot
    sta = sc[CODE['STATE']] / tot
    statewide = {'sqmi': round(tot * RES * RES / 2.589988e6), 'federalPct': round(100 * fed, 1), 'statePct': round(100 * sta, 1),
                 'tribalPct': round(100 * sc[CODE['TRIBAL']] / tot, 1),
                 'pct': {CLASSES[i]: round(100 * sc[i] / tot, 2) for i in range(1, len(CLASSES)) if sc[i]}}
    print('statewide:', json.dumps(statewide))
    errors = []
    if not 0.50 <= fed <= 0.56:
        errors.append(f'statewide federal share {fed:.1%} outside 50-56%')
    if not 0.02 <= sta <= 0.05:
        errors.append(f'statewide state share {sta:.1%} outside 2-5%')

    # Access & Habitat areas: share of each unit
    ah = np.zeros((grid.h, grid.w), dtype=bool)
    for f in g['ah']:
        grid.fill(ah, esri_polys(f['geometry']['rings']), True)

    info, units = {}, []
    for kind, f in feats:
        a = f['attributes']
        if kind == 'wmu':
            num = int(a.get('UNIT_NUM', a.get('UNIT_NUMBER')))
            name, label = str(num), str(a.get('UNIT_NAME') or '').strip().title()
        else:
            name = a['HuntArea'].strip()
            label = f"{a['HerdRange'].strip()} {name.split('-')[1]}"
        if name in info:
            errors.append(f'{kind} {name}: two features')
        ps = shapes[id(f)]
        rec = measure(grid, own_a, f'{kind} {name} {label}', ps, errors)
        mask, ox, oy = window(grid, ps)
        ah_pct = round(100 * float(ah[oy:oy + mask.shape[0], ox:ox + mask.shape[1]][mask].mean()), 2) if mask.sum() else 0.0
        info[name] = dict(rec or {}, accessPct=ah_pct)
        geom = display_geometry(geojson(ps), eps=60.0)
        lon = [c[0] for q in geom['coordinates'] for c in q[0]]
        lat = [c[1] for q in geom['coordinates'] for c in q[0]]
        u = {'name': name, 'kind': kind, 'label': label, 'acres': rec['acres'] if rec else round(sum(poly_area(q) for q in ps) / 4046.8564224),
             'bbox': [round(min(lon), 5), round(min(lat), 5), round(max(lon), 5), round(max(lat), 5)], 'geometry': geom}
        if kind == 'deerArea':
            u['herdRange'] = a['HerdRange'].strip()
            u['side'] = 'EAST'
        else:
            u['side'] = str(a.get('REGION') or '').upper() or None
        if rec:
            u['publicPct'], u['privatePct'] = rec['publicPct'], rec['privatePct']
            u['accessPct'] = ah_pct
            u['ownership'] = [{'manager': k, 'pct': v} for k, v in sorted(rec['ownership'].items(), key=lambda kv: -kv[1])]
        units.append(u)
    if errors:
        raise SystemExit('land checks failed:\n' + '\n'.join(errors[:40]))

    out = Path(__file__).resolve().parent.parent / 'data' / 'or'
    out.mkdir(parents=True, exist_ok=True)
    (out / 'land.json').write_text(json.dumps({
        'source': 'BLM national Surface Management Agency x ODFW WMUs and 2026 Eastern Oregon deer hunt areas, fetched 2026-11-17',
        'resolutionM': RES, 'public': sorted(PUBLIC), 'statewide': statewide, 'units': info}, separators=(',', ':')) + '\n')
    (out / 'units.json').write_text(json.dumps({
        'source': {'agency': 'Oregon Department of Fish and Wildlife',
                   'wmu': 'nrimp.dfw.state.or.us/arcgis/rest/services/ODFW_Admin/WildlifeManagementUnits/FeatureServer/0',
                   'deerAreas': 'nrimp.dfw.state.or.us/arcgis/rest/services/ORHAM/ODFW_Eastern_Oregon_Deer_Hunt_Areas/FeatureServer/0',
                   'fetched': '2026-11-17'},
        'units': sorted(units, key=lambda u: (u['kind'] != 'wmu', int(u['name']) if u['name'].isdigit() else 0, u['name']))}, separators=(',', ':')) + '\n')
    print(f"units: {sum(u['kind'] == 'wmu' for u in units)} WMUs, {sum(u['kind'] == 'deerArea' for u in units)} deer hunt areas")


if __name__ == '__main__':
    main(sys.argv[1])
