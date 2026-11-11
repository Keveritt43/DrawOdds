#!/usr/bin/env python3
"""Build data/mt/land.json: land ownership in each Montana deer/elk hunting district, and copy the public and
private shares onto the deer-elk districts in data/mt/units.json (for the map and district pages).

Usage: python3 -I scripts/mt_build_land.py <gis_dir>

Inputs, saved from a browser on 2026-11-11 because neither the workspace nor the owner's PC shell can reach
the agency servers (see CLAUDE.md):
  <gis_dir>/mt-blm-sma-5070.geojson
      BLM national Surface Management Agency, the same source as Colorado and Wyoming:
      gis.blm.gov/arcgis/rest/services/lands/BLM_Natl_SMA_LimitedScale/MapServer/1
      query?where=ADMIN_ST='MT'&outFields=ADMIN_AGENCY_CODE,ADMIN_UNIT_NAME&outSR=5070&geometryPrecision=0&f=geojson
      (one request per feature; 43 features, each a whole agency's holdings as one multipolygon). ADMIN_ST is the
      administering state office, so some features reach into the Dakotas and Wyoming (BLM's Montana/Dakotas
      office, Custer Gallatin NF, BIA's Rocky Mountain region). The raster only reads cells inside Montana's
      districts, so that does not matter. Private land is mapped (PVT), not inferred from gaps.
  <gis_dir>/mt-deer-elk-districts-5070.geojson
      FWP huntingDistricts/MapServer/11, outSR=5070, geometryPrecision=0, maxAllowableOffset=10 (10 m: well under
      the 100 m cells; data/mt/units.json is ~100 m generalized for display and must not be used for acreage).

Method: Wyoming's (scripts/wy_build_areas.py), 100 m raster in EPSG:5070 (equal-area), with one fix. PIL's
polygon fill includes every cell an edge touches, so a 10x10-cell square fills 121 cells and a 4x4 one 25: small
parcels come out 20-60% too big, and Montana's scattered 640-acre state sections would be overstated. Here a
cell belongs to a polygon when its centre is inside it (even-odd scanline fill in numpy), which has no such
bias. Each multipolygon is split into its parts and parts are drawn largest first, so inholdings overwrite the
land around them; a hole leaves whatever was drawn beneath it. Checks (the build stops if any fails):
  - each district's raster area is within 2% of its exact polygon area (3.5% under 200 mi²);
  - ownership covers >= 97% of each district's cells;
  - across all deer/elk districts, federal land is 29-34% and state land 5.5-8%. The districts cover ~131,700
    mi², not Montana's ~147,000: they leave out the Indian reservations and Glacier and Yellowstone parks. So the
    published statewide shares (~29% federal, ~6% state) do not apply directly. Expected inside the districts:
    ~17.0M acres Forest Service + ~8.0M BLM + ~1.1M Fish & Wildlife + small agencies = ~31% of ~84.3M acres;
    ~5.2M acres state trust land + FWP lands = ~6.5%. Built 2026-11-11: 31.5% federal (Forest Service 20.2%,
    BLM 9.6%), 6.7% state; drawing the parcels in reverse order gives the same shares to 0.01%, so the SMA
    parcels do not overlap.
Public = Colorado's and Wyoming's classes: BLM, Forest Service, NPS, FWS, Reclamation, Defense, other federal
(incl. Corps of Engineers and USDA research land), state (trust land and FWP), local government. Not public:
private, tribal (BIA trust land), and "undetermined" (UND), which BLM has not attributed and which we will
not guess at. Ownership is not access: state trust land and Corps land have their own access rules, and
public land with no public road to it is still counted here, as in the other states.
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np

RES = 100.0
ACRES_PER_CELL = RES * RES / 4046.8564224
CLASSES = ["NONE", "BLM", "USFS", "NPS", "FWS", "BOR", "DOD", "OTHER", "STATE", "LOCAL", "PRIVATE", "TRIBAL", "UNDETERMINED"]
CODE = {c: i for i, c in enumerate(CLASSES)}
PUBLIC = {"BLM", "USFS", "NPS", "FWS", "BOR", "DOD", "OTHER", "STATE", "LOCAL"}
FEDERAL = {"BLM", "USFS", "NPS", "FWS", "BOR", "DOD", "OTHER"}
AGENCY = {
    "BLM": "BLM", "USFS": "USFS", "NPS": "NPS", "FWS": "FWS", "USBR": "BOR", "DOD": "DOD",
    "USACE": "OTHER", "USDA": "OTHER", "DOE": "OTHER", "GSA": "OTHER", "VA": "OTHER", "OTHFE": "OTHER",
    "ST": "STATE", "LG": "LOCAL", "PVT": "PRIVATE", "BIA": "TRIBAL", "UND": "UNDETERMINED",
}


def polys(geom):
    if geom is None:
        return []
    ps = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]] if geom["type"] == "Polygon" else []
    return [p for p in ps if p and p[0]]


def ring_area(r):
    a = 0.0
    for (x1, y1), (x2, y2) in zip(r, r[1:] + r[:1]):
        a += x1 * y2 - x2 * y1
    return abs(a) / 2


def poly_area(p):
    return ring_area(p[0]) - sum(ring_area(h) for h in p[1:])


class Grid:
    def __init__(self, x0, y0, x1, y1):
        self.x0, self.y1 = x0, y1
        self.w = int(math.ceil((x1 - x0) / RES)) + 1
        self.h = int(math.ceil((y1 - y0) / RES)) + 1

    def fill(self, arr, ps, value, ox=0, oy=0):
        """Set every cell of arr whose centre lies inside the polygons (even-odd, holes included) to value.
        arr is a window of the grid whose top-left cell is (ox, oy)."""
        segs = []
        for p in ps:
            for r in p:
                a = np.asarray(r, dtype=np.float64)
                if len(a) < 3:
                    continue
                c = np.column_stack(((a[:, 0] - self.x0) / RES - ox, (self.y1 - a[:, 1]) / RES - oy))
                segs.append(np.column_stack((c, np.roll(c, -1, axis=0))))
        if not segs:
            return
        e = np.concatenate(segs)
        x0, y0, x1, y1 = e[:, 0], e[:, 1], e[:, 2], e[:, 3]
        # rows whose centre (row + 0.5) lies in [min(y0,y1), max(y0,y1))
        lo = np.ceil(np.minimum(y0, y1) - 0.5).astype(np.int64)
        hi = np.ceil(np.maximum(y0, y1) - 0.5).astype(np.int64)
        n = np.clip(hi - lo, 0, None)
        if n.sum() == 0:
            return
        idx = np.repeat(np.arange(len(e)), n)
        rows = np.repeat(lo, n) + (np.arange(n.sum()) - np.repeat(np.cumsum(n) - n, n))
        yc = rows + 0.5
        t = (yc - y0[idx]) / (y1[idx] - y0[idx])
        xc = x0[idx] + t * (x1[idx] - x0[idx])
        order = np.lexsort((xc, rows))
        rows, xc = rows[order], xc[order]
        # crossings pair up within a row: fill cells whose centre x + 0.5 is in [xa, xb)
        ra, xa, xb = rows[0::2], xc[0::2], xc[1::2]
        ca = np.ceil(xa - 0.5).astype(np.int64)
        cb = np.ceil(xb - 0.5).astype(np.int64)
        h, w = arr.shape
        ok = (ra >= 0) & (ra < h)
        for r_, a_, b_ in zip(ra[ok], np.clip(ca[ok], 0, w), np.clip(cb[ok], 0, w)):
            if b_ > a_:
                arr[r_, a_:b_] = value


def load(path):
    return json.load(open(path))["features"]


# EPSG:5070 (NAD83 / Conus Albers) inverse, Snyder (1987) eq. 14-18..14-21, GRS80. Used only to give the two
# Region 7 antelope portions display outlines in lon/lat; tested against FWP's own 4326 outlines in tests/mtLand.test.ts.
_A, _E2 = 6378137.0, 0.0066943800229
_E = math.sqrt(_E2)


def _q(phi):
    s = math.sin(phi)
    return (1 - _E2) * (s / (1 - _E2 * s * s) - (1 / (2 * _E)) * math.log((1 - _E * s) / (1 + _E * s)))


def _m(phi):
    return math.cos(phi) / math.sqrt(1 - _E2 * math.sin(phi) ** 2)


_P1, _P2, _P0, _L0 = map(math.radians, (29.5, 45.5, 23.0, -96.0))
_N = (_m(_P1) ** 2 - _m(_P2) ** 2) / (_q(_P2) - _q(_P1))
_C = _m(_P1) ** 2 + _N * _q(_P1)
_R0 = _A * math.sqrt(_C - _N * _q(_P0)) / _N


def to_lonlat(x, y):
    rho = math.hypot(x, _R0 - y)
    theta = math.atan2(x, _R0 - y)
    q = (_C - (rho * _N / _A) ** 2) / _N
    phi = math.asin(q / 2)
    for _ in range(10):
        s = math.sin(phi)
        phi += (1 - _E2 * s * s) ** 2 / (2 * math.cos(phi)) * (
            q / (1 - _E2) - s / (1 - _E2 * s * s) + (1 / (2 * _E)) * math.log((1 - _E * s) / (1 + _E * s)))
    return math.degrees(_L0 + theta / _N), math.degrees(phi)


def display_geometry(geom, eps=40.0):
    """5070 polygons -> lon/lat MultiPolygon, simplified to ~40 m (the units.json outlines are ~100 m)."""
    out = []
    for p in polys(geom):
        rings_ = []
        for r in p:
            keep = rdp(r, eps)
            if len(keep) >= 4:
                rings_.append([[round(c, 5) for c in to_lonlat(x, y)] for x, y in keep])
        if rings_:
            out.append(rings_)
    return {"type": "MultiPolygon", "coordinates": out}


def rdp(points, eps):
    if len(points) < 5:
        return points
    pts = np.asarray(points, dtype=float)
    keep = np.zeros(len(pts), dtype=bool)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        if b <= a + 1:
            continue
        seg = pts[b] - pts[a]
        n = np.hypot(*seg)
        rel = pts[a + 1:b] - pts[a]
        d = np.abs(seg[0] * rel[:, 1] - seg[1] * rel[:, 0]) / n if n else np.hypot(rel[:, 0], rel[:, 1])
        i = int(np.argmax(d))
        if d[i] > eps:
            keep[a + 1 + i] = True
            stack += [(a, a + 1 + i), (a + 1 + i, b)]
    return pts[keep].tolist()


def window(grid, ps):
    bx = [x for p in ps for x, _ in p[0]]
    by = [y for p in ps for _, y in p[0]]
    ox, oy = int((min(bx) - grid.x0) / RES) - 1, int((grid.y1 - max(by)) / RES) - 1
    w, h = int((max(bx) - min(bx)) / RES) + 3, int((max(by) - min(by)) / RES) + 3
    mask = np.zeros((h, w), dtype=bool)
    grid.fill(mask, ps, True, ox=ox, oy=oy)
    return mask, ox, oy


def measure(grid, own_a, key, ps, errors):
    """Ownership shares inside one district (or portion), with the raster-area and coverage checks."""
    mask, ox, oy = window(grid, ps)
    n = int(mask.sum())
    if n == 0:
        errors.append(f"{key}: empty raster")
        return None
    sqmi = n * RES * RES / 2.589988e6
    exact = sum(poly_area(p) for p in ps) / 2.589988e6
    if abs(sqmi - exact) / exact > 0.01:  # centre sampling is unbiased, so this is tighter than Wyoming's 2-3.5%
        errors.append(f"{key}: raster {sqmi:.1f} mi² vs polygon {exact:.1f}")
    vals = own_a[oy:oy + mask.shape[0], ox:ox + mask.shape[1]][mask]
    counts = np.bincount(vals, minlength=len(CLASSES))
    covered = n - int(counts[0])
    if covered / n < 0.97:
        errors.append(f"{key}: ownership covers {covered / n:.1%}")
    pct = {CLASSES[i]: round(100 * counts[i] / covered, 2) for i in range(1, len(CLASSES)) if counts[i]}
    return {"acres": round(n * ACRES_PER_CELL), "sqmi": round(sqmi, 1),
            "publicPct": round(sum(v for k, v in pct.items() if k in PUBLIC), 1),
            "privatePct": round(pct.get("PRIVATE", 0.0), 1), "tribalPct": round(pct.get("TRIBAL", 0.0), 1),
            "undeterminedPct": round(pct.get("UNDETERMINED", 0.0), 1), "ownership": pct}


PORTION = {"North": "N", "South": "S"}
STABLE_IOU = 0.98  # a past outline counts as the same district when it overlaps today's by >= 98% (intersection / union)


def portion_key(props):
    side = next(v for k, v in PORTION.items() if k in props["PORTIONNAME"])
    return f"{props['DISTRICT']}{side}"


def antelope_history(grid, current, past, errors):
    """For each 2026 antelope district, which regulation years (FWP sets them for two seasons) drew it the same.
    Harvest from a season counts only when that season's district matched today's (docs/states/mt-onboarding.md §13)."""
    by_year = {}
    for f in past:
        p = f["properties"]
        if p.get("HARVTYPE") == "Special" and p.get("DISTRICT"):
            by_year.setdefault(int(p["REGYEAR"]), {}).setdefault(str(p["DISTRICT"]), []).append(f)
    out = {}
    for hd, f in current.items():
        ps = polys(f["geometry"])
        rec = {}
        for ry in sorted(by_year):
            fs = by_year[ry].get(hd)
            if not fs:
                rec[str(ry)] = None
                continue
            pp = [p for x in fs for p in polys(x["geometry"])]
            # one window around both outlines, so a past district that reached further still counts against the overlap
            both, ox, oy = window(grid, ps + pp)
            cur = np.zeros_like(both)
            grid.fill(cur, ps, True, ox=ox, oy=oy)
            a = np.zeros_like(both)
            for x in fs:
                grid.fill(a, polys(x["geometry"]), True, ox=ox, oy=oy)
            rec[str(ry)] = round(float((a & cur).sum() / (a | cur).sum()), 4)
        if rec.get("2026") is None or rec["2026"] < 0.999:
            errors.append(f"antelope {hd}: the past-years layer's 2026 outline does not match the current layer ({rec.get('2026')})")
        out[hd] = rec
    return out


def main(gis: str) -> None:
    g = Path(gis)
    districts = load(g / "mt-deer-elk-districts-5070.geojson")
    an = json.load(open(g / "mt-antelope-districts-5070.json"))
    an_cur = {str(f["properties"]["DISTRICT"]).strip(): f for f in an["current"]["features"]}
    an_por = {portion_key(f["properties"]): f for f in an["portions"]["features"]}
    xs = [x for f in districts for p in polys(f["geometry"]) for x, _ in p[0]]
    ys = [y for f in districts for p in polys(f["geometry"]) for _, y in p[0]]
    # The cell grid stays aligned to the deer/elk districts, as in the first build (so their shares don't move);
    # a whole number of extra cells on every side makes room for antelope districts and old outlines.
    pad = 600 * RES
    grid = Grid(min(xs) - 1000 - pad, min(ys) - 1000 - pad, max(xs) + 1000 + pad, max(ys) + 1000 + pad)
    for f in list(an_cur.values()) + an["past"]["features"]:
        for p in polys(f["geometry"]):
            if min(x for x, _ in p[0]) < grid.x0 or max(y for _, y in p[0]) > grid.y1:
                raise SystemExit("an antelope outline falls outside the grid; raise pad")
    print(f"grid {grid.w} x {grid.h} cells at {RES:.0f} m")

    parts, unknown = [], set()
    for f in load(g / "mt-blm-sma-5070.geojson"):
        code = f["properties"].get("ADMIN_AGENCY_CODE")
        cls = AGENCY.get(code)
        if cls is None:
            unknown.add(code)
            continue
        for p in polys(f["geometry"]):
            parts.append((poly_area(p), CODE[cls], p))
    if unknown:
        raise SystemExit(f"unmapped ADMIN_AGENCY_CODE values: {sorted(map(str, unknown))}")
    parts.sort(key=lambda t: -t[0])
    own_a = np.zeros((grid.h, grid.w), dtype=np.uint8)
    for _, code, p in parts:
        grid.fill(own_a, [p], code)
    print(f"ownership: {len(parts)} parcels drawn")

    st = np.zeros((grid.h, grid.w), dtype=bool)
    for f in districts:
        grid.fill(st, polys(f["geometry"]), True)
    sc = np.bincount(own_a[st], minlength=len(CLASSES))
    tot = int(st.sum())
    fed = sum(sc[CODE[c]] for c in FEDERAL) / tot
    sta = sc[CODE["STATE"]] / tot
    cov = 1 - sc[0] / tot
    statewide = {"sqmi": round(tot * RES * RES / 2.589988e6), "federalPct": round(100 * fed, 1), "statePct": round(100 * sta, 1),
                 "coveragePct": round(100 * cov, 1),
                 "pct": {CLASSES[i]: round(100 * sc[i] / tot, 2) for i in range(1, len(CLASSES)) if sc[i]}}
    print("statewide:", json.dumps(statewide))
    errors = []
    if not 0.29 <= fed <= 0.34:
        errors.append(f"district-wide federal share {fed:.1%} outside 29-34%")
    if not 0.055 <= sta <= 0.08:
        errors.append(f"district-wide state share {sta:.1%} outside 5.5-8%")

    info = {}
    for f in districts:
        hd = str(f["properties"]["DISTRICT"]).strip()
        if hd in info:
            errors.append(f"{hd}: two district features")
        info[hd] = measure(grid, own_a, hd, polys(f["geometry"]), errors)
    ant = {}
    for hd, f in an_cur.items():
        ant[hd] = measure(grid, own_a, f"antelope {hd}", polys(f["geometry"]), errors)
    for k, f in an_por.items():
        ant[k] = measure(grid, own_a, f"antelope portion {k}", polys(f["geometry"]), errors)
    for hd in {k[:-1] for k in an_por}:  # the two portions of a district make up the district
        both = sum(ant[k]["acres"] for k in an_por if k[:-1] == hd)
        if abs(both - ant[hd]["acres"]) / ant[hd]["acres"] > 0.01:
            errors.append(f"antelope {hd}: portions {both} acres vs district {ant[hd]['acres']}")
    history = antelope_history(grid, an_cur, an["past"]["features"], errors)
    if errors:
        raise SystemExit("land checks failed:\n" + "\n".join(errors[:40]))

    out = Path(__file__).resolve().parent.parent / "data" / "mt"
    (out / "land.json").write_text(json.dumps({
        "source": "BLM national Surface Management Agency (ADMIN_ST=MT) x FWP deer/elk and antelope hunting districts, fetched 2026-11-11",
        "resolutionM": RES, "public": sorted(PUBLIC), "statewide": statewide,
        "districts": dict(sorted(info.items())), "antelope": dict(sorted(ant.items()))}, separators=(",", ":")) + "\n")
    (out / "district-history.json").write_text(json.dumps({
        "source": "FWP Antelope Hunting Districts All Past Years (services3.arcgis.com/Cdxz8r11hT0MGzg1), REGYEAR 2014-2026, "
                  "compared with the 2026 districts on the 100 m raster",
        "measure": "intersection over union of the regulation year's outline with the 2026 outline; null = no district of that number",
        "stableIou": STABLE_IOU,
        "antelope": dict(sorted(history.items()))}, indent=1) + "\n")

    up = out / "units.json"
    units = json.loads(up.read_text())
    units["units"] = [u for u in units["units"] if not u.get("portionOf")]  # rebuilt below, so a rerun is idempotent
    missing = []
    for u in units["units"]:
        rec = (info if u["species"] == "deer-elk" else ant).get(u["name"])
        if rec is None:
            missing.append(f"{u['species']} {u['name']}")
            continue
        u["publicPct"], u["privatePct"] = rec["publicPct"], rec["privatePct"]
        u["ownership"] = [{"manager": k, "pct": v} for k, v in sorted(rec["ownership"].items(), key=lambda kv: -kv[1])]
    for k, f in sorted(an_por.items()):
        rec = ant[k]
        geom = display_geometry(f["geometry"])
        xs_ = [c[0] for p in geom["coordinates"] for c in p[0]]
        ys_ = [c[1] for p in geom["coordinates"] for c in p[0]]
        units["units"].append({
            "name": k, "species": "antelope", "portionOf": k[:-1], "portionName": f["properties"]["PORTIONNAME"],
            "region": str(f["properties"].get("REG") or ""), "regYear": str(f["properties"].get("REGYEAR") or ""),
            "acres": rec["acres"], "bbox": [round(min(xs_), 5), round(min(ys_), 5), round(max(xs_), 5), round(max(ys_), 5)],
            "geometry": geom, "publicPct": rec["publicPct"], "privatePct": rec["privatePct"],
            "ownership": [{"manager": a, "pct": v} for a, v in sorted(rec["ownership"].items(), key=lambda kv: -kv[1])]})
    if missing:
        raise SystemExit(f"units.json districts with no land record: {missing}")
    up.write_text(json.dumps(units, separators=(",", ":")) + "\n")
    print(f"wrote land.json ({len(info)} deer/elk, {len(ant)} antelope incl. portions), district-history.json, units.json")


if __name__ == "__main__":
    main(sys.argv[1])
