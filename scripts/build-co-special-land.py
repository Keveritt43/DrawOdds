"""Intersect CPW sheep/goat GMUs with the cached BLM inputs from build-co-land.py."""
import json, pathlib, sys
from shapely import make_valid, STRtree, union_all
from shapely.geometry import shape

def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))['features']

def main():
    cache = pathlib.Path(sys.argv[1])
    root = pathlib.Path('out/special')
    sma = [f for p in sorted(cache.glob('sma-*.json')) for f in read(p) if f['geometry']]
    if not sma:
        raise ValueError('Missing BLM surface management cache')
    ids = [f['properties']['adm_code'] or 'UNKNOWN' for f in sma]
    polys = [make_valid(shape(f['geometry'])) for f in sma]
    tree = STRtree(polys)
    public = {'BLM','BOR','DOD','USFS_NG','NPS','OTHER','STA','USFS_LU','LOCAL','USFS','USFW','BLM_LU'}
    units = {}
    for layer, key in [(7,'BSGMU'),(8,'MGGMU')]:
        for f in read(root / f'gis-{layer}-5070.json'):
            units.setdefault(f['properties'][key], []).append(make_valid(shape(f['geometry'])))
    result = {}
    for key, parts in sorted(units.items()):
        geom = union_all(parts)
        pieces = {}
        for i in tree.query(geom, predicate='intersects'):
            piece = geom.intersection(polys[i])
            if not piece.is_empty:
                pieces.setdefault(ids[i], []).append(piece)
        merged = {k: union_all(p) for k,p in pieces.items()}
        coverage = union_all(list(merged.values())).area / geom.area
        if coverage < .95 or coverage > 1.001 or sum(p.area for p in merged.values()) / geom.area - coverage > .01:
            raise ValueError((key, 'Invalid land coverage', coverage))
        percent = lambda p: p.area / geom.area * 100 if p is not None else 0
        pub = percent(union_all([p for k,p in merged.items() if k in public]))
        priv = percent(merged.get('PRI'))
        tribal = percent(merged.get('BIA'))
        result[key] = dict(acres=round(geom.area/4046.8564224,2), publicPct=round(pub,3),
            privatePct=round(priv,3), tribalPct=round(tribal,3), unknownPct=round(max(0,100-pub-priv-tribal),3),
            coverage=round(coverage,6), ownership={k:round(percent(p),3) for k,p in merged.items()})
        print(key, flush=True)
    pathlib.Path('data/co-special-land.json').write_text(json.dumps(result, indent=2)+'\n')
if __name__ == '__main__':
    main()
