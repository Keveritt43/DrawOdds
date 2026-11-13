"""Build data/ut/walkin.json: Utah Walk-in Access (WIA) land open to big-game hunting, per DWR hunt boundary.

WIA is DWR's program that leases hunting / fishing access on private land (R657-56; a free annual authorization
number is required). Source: DWR's public property layer, the one behind the map on DWR's Walk-in Access page
(services.arcgis.com/ZzrwjTRez6FJiOq4/.../ULTRA_Properties_3_view/FeatureServer/0, type_ = 'Walk In Access'),
saved as data/ut/source/walkin-access-2026.geojson (fetched Nov 12, 2026, outSR 4326, ~10 m generalisation).
DWR's own WIA service (dwrmapserv ram_WIA_PROD_v2) needs a token, so it is not used.

Counted: properties whose lease purpose names big game (typos included: "gig game", "bag game", "bi game") and
that don't say "no hunting". Purpose just "hunting" is ambiguous and not counted. "No elk hunting" drops the
property for elk. Muzzleloader-only leases are counted and flagged.

Acres are WIA land not already public: BLM's Surface Management Agency layer (the same file and public classes as
scripts/ut_build_land.py) is subtracted, so a state parcel inside a lease isn't counted twice. Area is measured in
EPSG:5070 (equal area).

Check: DWR reported 49,597 acres enrolled for 2025 (news release, May 13, 2026). The layer holds 84,606 acres,
of which ~25,000 are big-game leases established in 2026 (Prohibition Springs, Double Cone, Cotton Thomas), so it
is read as the 2026 enrolment. The layer has no expiry field; a lease that lapsed and wasn't removed would be
counted.

Run: python3 -I scripts/ut_build_walkin.py <ut-guidebooks-and-sma.json>
"""
import json
import math
import re
import sys
from pathlib import Path

from shapely.geometry import shape, mapping
from shapely.ops import transform, unary_union
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from mt_build_land import AGENCY, PUBLIC, _A, _E2, _E, _q, _C, _N, _R0, _L0  # noqa: E402

D = ROOT.parent / "data" / "ut"
BIG = re.compile(r"\b(big|gig|bag|bi)\s+game", re.I)
SPECIES = ("DEER", "ELK", "PRONGHORN", "BISON")


def to_5070(lon, lat, z=None):
    """EPSG:5070 forward (Snyder 14-1..14-4), the inverse of mt_build_land.to_lonlat."""
    phi = math.radians(lat)
    rho = _A * math.sqrt(_C - _N * _q(phi)) / _N
    theta = _N * (math.radians(lon) - _L0)
    return rho * math.sin(theta), _R0 - rho * math.cos(theta)


def proj(g):
    return transform(lambda xs, ys, zs=None: tuple(zip(*[to_5070(x, y) for x, y in zip(xs, ys)])) or ((), ()), g)


def main(sma_path: str) -> None:
    src = json.load(open(D / "source" / "walkin-access-2026.geojson"))["features"]
    sma = json.load(open(sma_path))["sma"]["features"]
    public = [shape(f["geometry"]).buffer(0) for f in sma if AGENCY.get(f["properties"].get("ADMIN_AGENCY_CODE")) in PUBLIC]
    pub_tree = STRtree(public)

    props, counted = [], []
    for f in src:
        p = f["properties"]
        purpose = (p.get("purpose") or "").strip()
        restr = (p.get("restrictions") or "").strip()
        big = bool(BIG.search(purpose)) and not re.search(r"\bno hunting\b", restr, re.I)
        g = proj(shape(f["geometry"]).buffer(0)).buffer(0)
        near = [public[i] for i in pub_tree.query(g)]
        priv = g.difference(unary_union(near)) if near else g
        rec = {"id": p.get("id"), "name": p.get("name"), "county": p.get("county"), "region": p.get("region"),
               "purpose": purpose, "restrictions": restr, "closure": (p.get("closureDates") or "").strip(),
               "acres": round(g.area / 4046.8564224), "privateAcres": round(priv.area / 4046.8564224), "bigGame": big,
               "noElk": bool(re.search(r"\bno elk\b", restr, re.I)), "muzzleloaderOnly": bool(re.search(r"muzzle ?loader", restr, re.I)),
               "ambiguous": not big and purpose.lower() in ("hunting", "hunting and fishing access")}
        props.append(rec)
        if big:
            counted.append((rec, priv))

    units = json.load(open(D / "units.json"))
    tree = STRtree([c[1] for c in counted])
    out = {}
    for u in units["units"]:
        g = proj(shape(u["geometry"]).buffer(0)).buffer(0)
        if g.is_empty:
            continue
        hits = []
        for i in tree.query(g):
            rec, priv = counted[i]
            a = g.intersection(priv).area / 4046.8564224
            if a >= 1:
                hits.append((rec, a))
        if not hits:
            continue
        bys = {}
        for sp in SPECIES:
            hs = [(r, a) for r, a in hits if not (sp == "ELK" and r["noElk"])]
            if hs:
                bys[sp] = {"acres": round(sum(a for _, a in hs)), "n": len(hs)}
        out[u["name"]] = {"acres": round(sum(a for _, a in hits)), "pct": round(100 * sum(a for _, a in hits) / (g.area / 4046.8564224), 2),
                          "n": len(hits), "species": bys,
                          "properties": sorted(({"id": r["id"], "name": r["name"], "acres": round(a), "muzzleloaderOnly": r["muzzleloaderOnly"] or None,
                                                 "noElk": r["noElk"] or None, "closure": r["closure"] or None} for r, a in hits), key=lambda x: -x["acres"])}
    for v in out.values():
        for p in v["properties"]:
            for k in [k for k, x in p.items() if x is None]:
                del p[k]
    total = sum(r["acres"] for r in props)
    bg = [r for r in props if r["bigGame"]]
    (D / "walkin.json").write_text(json.dumps({
        "source": {"layer": "https://services.arcgis.com/ZzrwjTRez6FJiOq4/arcgis/rest/services/ULTRA_Properties_3_view/FeatureServer/0",
                   "where": "type_ = 'Walk In Access'", "checked": "2026-11-12", "page": "https://wildlife.utah.gov/hunting/walk-in-access.html"},
        "summary": {"properties": len(props), "acres": total, "bigGame": len(bg), "bigGameAcres": sum(r["acres"] for r in bg),
                    "bigGamePrivateAcres": sum(r["privateAcres"] for r in bg), "ambiguous": [r["name"] for r in props if r["ambiguous"]]},
        "boundaries": out}, separators=(",", ":")) + "\n")
    print(json.dumps({"properties": len(props), "acres": total, "bigGame": len(bg), "bigGameAcres": sum(r["acres"] for r in bg),
                      "bigGamePrivate": sum(r["privateAcres"] for r in bg), "boundaries": len(out)}))
    print("top boundaries:", sorted(((b, v["acres"], v["pct"]) for b, v in out.items()), key=lambda x: -x[1])[:6])


if __name__ == "__main__":
    main(sys.argv[1])
