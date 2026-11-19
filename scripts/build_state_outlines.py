"""Build public/state-outlines.json: US state borders (lower 48) for the maps, as line features drawn once each, plus
one label point per state.

Source: data/source/us-atlas-states-10m.json, the us-atlas npm package (v3, ISC licence; data/source/us-atlas-LICENSE):
the Census Bureau's 2017 cartographic boundary file at 1:10,000,000 as TopoJSON. Generalized: a border can sit up to
~1 km off the true line, so the maps fade it out once you zoom in to unit level, where each agency's own unit
boundaries are the precise edge.
Usage: python3 -I scripts/build_state_outlines.py
"""
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
T = json.load(open(ROOT / 'data/source/us-atlas-states-10m.json'))
sx, sy = T['transform']['scale']; tx, ty = T['transform']['translate']
def arc(i):
    a = T['arcs'][i if i >= 0 else ~i]
    x = y = 0; pts = []
    for dx, dy in a:
        x += dx; y += dy
        pts.append([round(x * sx + tx, 4), round(y * sy + ty, 4)])
    return pts if i >= 0 else pts[::-1]
OUT = {'02', '15', '60', '66', '69', '72', '78'}  # Alaska, Hawaii, territories
used, labels = {}, []
for g in T['objects']['states']['geometries']:
    if g['id'] in OUT: continue
    polys = g['arcs'] if g['type'] == 'MultiPolygon' else [g['arcs']]
    best = None
    for poly in polys:
        for ring in poly:
            for i in ring:
                k = i if i >= 0 else ~i
                used.setdefault(k, set()).add(g['properties']['name'])
        outer = [p for i in poly[0] for p in arc(i)]
        a = sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(outer, outer[1:] + outer[:1])) / 2
        if best is None or abs(a) > abs(best[0]): best = (a, outer)
    a, ring = best
    cx = sum((x1 + x2) * (x1 * y2 - x2 * y1) for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1])) / (6 * a)
    cy = sum((y1 + y2) * (x1 * y2 - x2 * y1) for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1])) / (6 * a)
    if g['id'] == '11': continue  # no label for DC
    labels.append({'type': 'Feature', 'properties': {'name': g['properties']['name'].upper()}, 'geometry': {'type': 'Point', 'coordinates': [round(cx, 3), round(cy, 3)]}})
lines = [{'type': 'Feature', 'properties': {'shared': len(s) > 1}, 'geometry': {'type': 'LineString', 'coordinates': arc(k)}} for k, s in sorted(used.items())]
out = {'type': 'FeatureCollection', 'source': 'US Census Bureau 2017 cartographic boundary file, 1:10,000,000, via the us-atlas package', 'features': lines + labels}
(ROOT / 'public/state-outlines.json').write_text(json.dumps(out, separators=(',', ':')))
print(len(lines), 'border lines,', len(labels), 'labels,', (ROOT / 'public/state-outlines.json').stat().st_size, 'bytes')
