#!/usr/bin/env python3
"""Build data/mt/bma.json: Montana Block Management (BMA) land in each hunting district, by permission type and
species, from the two readouts saved from the browser run (scripts/mt_build_bma.browser.js with the species table
from scripts/mt_parse_bma_guide.browser.js; neither shell can reach FWP, see CLAUDE.md).

Usage: python3 -I scripts/mt_build_bma.py

Inputs (data/mt/source/, read out of the tab on 2026-11-11 and checked against an in-tab checksum):
  bma-2026-districts.txt  D<hd>|A<hd>, t1, t1All, n1, t2, t2All, n2           (every BMA, any species)
  bma-2026-species.txt    D<hd>: deer t1, n1, t2, n2, elk t1, n1, t2, n2; A<hd>: antelope t1, n1, t2, n2
t1/t2 are acres of Type 1 / Type 2 BMA on land that is NOT already public (BLM's SMA: private, tribal,
undetermined), so they can be added to the public share without counting enrolled state or federal parcels twice.
t1All/t2All include the enrolled public parcels. n = number of BMAs touching the district (a BMA that crosses two
districts counts in each). A cell in both a Type 1 and a Type 2 BMA counts as Type 1.

Type 1: hunters give themselves permission (sign-in box, roster, or no sign-in). FWP: "Area where hunters
administer their own permission." Type 2: "Area where someone other than the hunter issues permission" (landowner
or FWP; often reservations, pasture assignments and hunter limits), so it is not a sure way in.

Districts with no BMA are absent from the readouts and get zeros here; every district in data/mt/land.json is
present in the output.
"""
from __future__ import annotations

import json
from pathlib import Path

D = Path(__file__).resolve().parent.parent / "data" / "mt"
SRC = D / "source"


def rows(name: str) -> dict[str, list[int]]:
    out = {}
    for r in (SRC / name).read_text().strip().split(";"):
        k, *v = r.split(",")
        out[k] = [int(x) for x in v]
    return out


def main() -> None:
    land = json.loads((D / "land.json").read_text())
    allr, spr = rows("bma-2026-districts.txt"), rows("bma-2026-species.txt")
    checks = {"bma-2026-districts.txt": (182, 24475979), "bma-2026-species.txt": (181, 11928389)}
    for name, r in (("bma-2026-districts.txt", allr), ("bma-2026-species.txt", spr)):
        n, total = checks[name]
        got = (len(r), sum(sum(v) for v in r.values()))
        assert got == (n, total), f"{name}: {got} != in-tab checksum {(n, total)}"

    def rec(key: str, acres: int, kind: str) -> dict:
        a = allr.get(key, [0] * 6)
        s = spr.get(key, [0] * (8 if kind == "D" else 4))
        out = {"acres": acres, "all": {"t1": a[0], "t1All": a[1], "n1": a[2], "t2": a[3], "t2All": a[4], "n2": a[5]}}
        names = ("deer", "elk") if kind == "D" else ("antelope",)
        for i, sp in enumerate(names):
            t1, n1, t2, n2 = s[4 * i: 4 * i + 4]
            # a species can only have land the "any species" figure also has
            assert t1 <= a[0] and t2 <= a[3] and n1 <= a[2] and n2 <= a[5], f"{key} {sp} exceeds all-species BMA"
            out[sp] = {"t1": t1, "n1": n1, "t2": t2, "n2": n2}
        assert a[0] <= acres and a[3] <= acres, f"{key}: BMA larger than the district"
        return out

    districts = {k: rec(f"D{k}", v["acres"], "D") for k, v in sorted(land["districts"].items())}
    antelope = {f"A{k}": rec(f"A{k}", v["acres"], "A") for k, v in sorted(land["antelope"].items())}
    unknown = set(allr) - {f"D{k}" for k in districts} - set(antelope)
    assert not unknown, f"readout districts with no land record: {sorted(unknown)}"
    out = {
        "source": {
            "boundaries": "FWP wild/hpNewBMA_MIL/MapServer layers 5 (BMA boundary, PTYPE 1/2), 4 (BMAs with access "
                          "closed or restricted: left out) and 3 (restricted areas: 'Not in BMA (No Trespassing)', safety "
                          "zones and no-shooting areas cut out), fetched 2026-11-11",
            "species": "FWP 2026 Block Management guide (2026-fwpblockmanegment-finalproof.pdf), Primary Hunting "
                       "Opportunities column, with explicit prohibitions in the other columns",
            "ownership": "BLM national Surface Management Agency, as data/mt/land.json",
            "method": "100 m equal-area raster, the grid of scripts/mt_build_land.py (public shares reproduce land.json "
                      "within 0.1 point in all 204 districts)",
            "enrollment": "2026-27 hunting season",
            "checked": "2026-11-11",
        },
        "statewide": {
            "bmas": 905, "type1Bmas": 673, "type2Bmas": 272, "closedBmas": 1,
            "type1Acres": 4689529, "type1NotPublicAcres": 3933179,
            "type2Acres": 2000442, "type2NotPublicAcres": 1627621, "cutOutAcres": 113147,
            # FWP: "almost 7 million acres" in 2026; boundary polygons sum to 6.81M before cut-outs
            "fwpReported": "almost 7 million acres (2026)",
        },
        "guide": {
            "bmas": 892, "deer": 855, "elk": 273, "antelope": 623,
            # open BMAs on the map but not in the printed guide (late enrollments): they count for no species
            "notInGuide": ["3-5", "4-80", "4-84", "4-87", "4-89", "4-90", "6-213", "6-214", "6-215", "6-218", "6-240",
                           "6-241", "6-245", "7-272", "7-273", "7-276", "7-277", "7-279"],
            # in the guide but list none of deer, elk, antelope: 1-19 ("Antlerless" only), 3-1 (blank), and six
            # bird-only BMAs (6-132, 6-225, 7-140, 7-292, 7-294, 7-375)
            "noBigGame": ["1-19", "3-1", "6-132", "6-225", "7-140", "7-292", "7-294", "7-375"],
            "prohibited": {"2-46": "deer", "6-148": "deer", "3-143": "deer"},
        },
        "regionCheck": {
            "note": "BMA count and acres inside the districts vs FWP's regional pages, 2026",
            "6": {"measured": [212, 1464094], "fwp": [210, 1253110], "note": "17% more acres than FWP prints; not explained"},
            "7": {"measured": [244, 1945552], "fwp": [245, 1985409]},
        },
        "districts": districts,
        "antelope": antelope,
    }
    (D / "bma.json").write_text(json.dumps(out, indent=1) + "\n")
    with_t1 = sum(1 for v in districts.values() if v["all"]["t1"]) + sum(1 for v in antelope.values() if v["all"]["t1"])
    print(f"bma.json: {len(districts)} deer/elk + {len(antelope)} antelope districts, {with_t1} with Type 1 BMA land")


if __name__ == "__main__":
    main()
