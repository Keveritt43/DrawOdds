# Migration study import

Rebuilds `data/migrations/<slug>/{meta.json,routes.geojson}` from the study folders
(`<Species>/<Study>/` holding the report PDF and `onX_export/*.kml`).

```
export MIG_SRC=/path/to/Screenshots      # Mule Deer/, Elk/, Pronghorn/
export MIG_UNITS=/path/to/units.json      # unit outlines (GeoJSON, properties.name), e.g. saved from /api/units
cd scripts/migrations
python3 dump.py && python3 parse.py       # PDF text -> pdftext.json -> parsed.json
python3 build_all.py                      # per-unit acres by use class -> geo_all.json
python3 gen.py                            # writes data/migrations/
```
Then deploy with `SYNC_ON_START=migrations` (the `migrations` sync step loads the folders).

Rules kept in `gen.py` so a rebuild can't undo a decision:
- `DROP_CLS`: Mountain Home pronghorn's yellow class was a 139-acre stray in Boise (the report gives that class no acres); never imported, even if the layer reappears.
- `SKIP_GEO` / `TEXT_UNITS`: studies whose maps are known to be misplaced (empty now).
- Only the Pioneer Reservoir-BLM Road mule deer tracing is used; the `Pioneer_Reservoir` folder (a second tracing of the same map) has no PDF and is skipped.
