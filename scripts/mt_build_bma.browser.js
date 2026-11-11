/*
 * Montana Block Management (BMA) acres per hunting district, computed in a browser tab on fwp-gis.mt.gov.
 *
 * Why a browser: neither the workspace shell nor the owner's PC shell can reach FWP or BLM (CLAUDE.md), and the
 * results are small. Paste this file into the console of any https://fwp-gis.mt.gov/ page (Claude in Chrome
 * javascript_tool), then `await mtBma.run()`; the result is left in `window.mtBmaResult` and read out in pieces.
 *
 * Method: the same 100 m equal-area raster as scripts/mt_build_land.py (EPSG:5070, cell centre inside polygon,
 * even-odd scanline fill, ownership parcels drawn largest first, grid aligned to the deer/elk districts the same
 * way), so a district's public share here reproduces data/mt/land.json; run() checks that before reporting.
 *
 * BMA classes per cell:
 *   1 = Type 1 (hunters administer their own permission: sign-in box, roster, or no sign-in),
 *   2 = Type 2 (permission issued by the landowner or FWP; often reservations and hunter limits).
 * Sources, all FWP wild/hpNewBMA_MIL/MapServer, the 2026-27 season enrollment:
 *   5 Block Management Boundary (PTYPE 1/2),
 *   4 Boundary - Access Closed or Restricted (those BMAs are left out entirely),
 *   3 Restricted Areas: "Not in BMA (No Trespassing)" and "Safety Zone (No Trespassing, No Hunting)" are cut out,
 *     and so is "No Shooting Area" (no hunting with a gun or bow there). Weapon and species restriction areas
 *     stay in (hunting is allowed, with limits).
 * A BMA is identified by REGION + BMANUM: BMA numbers repeat across regions.
 * BMAs enroll public land too (state trust and federal parcels inside the ranch). So the figure that is added to
 * public land is BMA land that is NOT already public: private, tribal, undetermined or unmapped cells.
 */
(function () {
  const RES = 100;
  const ACRES = (RES * RES) / 4046.8564224;
  const CLASSES = ['NONE', 'BLM', 'USFS', 'NPS', 'FWS', 'BOR', 'DOD', 'OTHER', 'STATE', 'LOCAL', 'PRIVATE', 'TRIBAL', 'UNDETERMINED'];
  const CODE = Object.fromEntries(CLASSES.map((c, i) => [c, i]));
  const PUBLIC = new Set(['BLM', 'USFS', 'NPS', 'FWS', 'BOR', 'DOD', 'OTHER', 'STATE', 'LOCAL'].map((c) => CODE[c]));
  const AGENCY = { BLM: 'BLM', USFS: 'USFS', NPS: 'NPS', FWS: 'FWS', USBR: 'BOR', DOD: 'DOD', USACE: 'OTHER', USDA: 'OTHER', DOE: 'OTHER',
    GSA: 'OTHER', VA: 'OTHER', OTHFE: 'OTHER', ST: 'STATE', LG: 'LOCAL', PVT: 'PRIVATE', BIA: 'TRIBAL', UND: 'UNDETERMINED' };
  const CUT = new Set(['Not in BMA (No Trespassing)', 'Safety Zone (No Trespassing, No Hunting)', 'No Shooting Area']);
  const HD = '/arcgis/rest/services/admbnd/huntingDistricts/MapServer/';
  const BMA = '/arcgis/rest/services/wild/hpNewBMA_MIL/MapServer/';
  const SMA = 'https://gis.blm.gov/arcgis/rest/services/lands/BLM_Natl_SMA_LimitedScale/MapServer/1/query?';

  const polys = (g) => !g ? [] : g.type === 'MultiPolygon' ? g.coordinates : g.type === 'Polygon' ? [g.coordinates] : [];
  const ringArea = (r) => { let a = 0; for (let i = 0; i < r.length; i++) { const [x1, y1] = r[i], [x2, y2] = r[(i + 1) % r.length]; a += x1 * y2 - x2 * y1; } return Math.abs(a) / 2; };
  const polyArea = (p) => ringArea(p[0]) - p.slice(1).reduce((s, h) => s + ringArea(h), 0);

  const cache = (window.mtBmaCache ??= {}); // reruns in the same tab skip the downloads
  async function getAll(url, params) {
    const ck = url + JSON.stringify(params);
    if (cache[ck]) return cache[ck];
    const ids = (await fetch(url + new URLSearchParams({ ...params, returnIdsOnly: true, f: 'json' })).then((r) => r.json())).objectIds || [];
    ids.sort((a, b) => a - b);
    const out = [];
    for (let i = 0; i < ids.length; i += 50) {
      const q = { ...params, objectIds: ids.slice(i, i + 50).join(','), outSR: 5070, geometryPrecision: 0, f: 'geojson' };
      delete q.where;
      const j = await fetch(url + new URLSearchParams(q)).then((r) => r.json());
      if (!j.features) throw new Error('fetch failed: ' + url + ' ' + JSON.stringify(j).slice(0, 200));
      for (const x of j.features) out.push(x);
    }
    return (cache[ck] = out);
  }

  class Grid {
    constructor(x0, y0, x1, y1) { this.x0 = x0; this.y1 = y1; this.w = Math.ceil((x1 - x0) / RES) + 1; this.h = Math.ceil((y1 - y0) / RES) + 1; }
    // calls cb(row, a, b) for every run of cells [a, b) whose centre lies inside ps (even-odd), clipped to the grid
    runs(ps, cb) {
      const rows = new Map();
      for (const p of ps) for (const r of p) {
        if (r.length < 3) continue;
        for (let i = 0; i < r.length; i++) {
          const ax = (r[i][0] - this.x0) / RES, ay = (this.y1 - r[i][1]) / RES;
          const j = (i + 1) % r.length, bx = (r[j][0] - this.x0) / RES, by = (this.y1 - r[j][1]) / RES;
          const lo = Math.ceil(Math.min(ay, by) - 0.5), hi = Math.ceil(Math.max(ay, by) - 0.5);
          for (let row = lo; row < hi; row++) {
            const yc = row + 0.5, x = ax + ((yc - ay) / (by - ay)) * (bx - ax);
            let l = rows.get(row); if (!l) rows.set(row, (l = [])); l.push(x);
          }
        }
      }
      for (const [row, xs] of rows) {
        if (row < 0 || row >= this.h) continue;
        xs.sort((a, b) => a - b);
        for (let k = 0; k + 1 < xs.length; k += 2) {
          const a = Math.max(0, Math.ceil(xs[k] - 0.5)), b = Math.min(this.w, Math.ceil(xs[k + 1] - 0.5));
          if (b > a) cb(row, a, b);
        }
      }
    }
    fill(arr, ps, v) { this.runs(ps, (row, a, b) => arr.fill(v, row * this.w + a, row * this.w + b)); }
  }

  async function run() {
    const log = [];
    const de = await getAll(HD + '11/query?', { where: '1=1', outFields: 'DISTRICT', maxAllowableOffset: 10 });
    const an = await getAll(HD + '3/query?', { where: '1=1', outFields: 'DISTRICT', maxAllowableOffset: 10 });
    const por = (await getAll(HD + '4/query?', { where: '1=1', outFields: '*', maxAllowableOffset: 10 }))
      .filter((f) => /North|South/.test(f.properties.PORTIONNAME || ''));
    log.push(`districts: deer/elk ${de.length}, antelope ${an.length}, portions ${por.length}`);

    let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity; // no Math.min(...xs): too many args
    for (const f of de) for (const p of polys(f.geometry)) for (const [x, y] of p[0]) {
      if (x < mnx) mnx = x; if (x > mxx) mxx = x; if (y < mny) mny = y; if (y > mxy) mxy = y;
    }
    const pad = 600 * RES;
    const grid = new Grid(mnx - 1000 - pad, mny - 1000 - pad, mxx + 1000 + pad, mxy + 1000 + pad);
    log.push(`grid ${grid.w} x ${grid.h}`);

    // ownership, largest parcel first (as mt_build_land.py)
    const smaIds = (await fetch(SMA + new URLSearchParams({ where: "ADMIN_ST='MT'", returnIdsOnly: true, f: 'json' })).then((r) => r.json())).objectIds;
    const parts = [];
    for (const id of smaIds) {
      const j = (cache['sma' + id] ??= await fetch(SMA + new URLSearchParams({ objectIds: id, outFields: 'ADMIN_AGENCY_CODE', outSR: 5070, geometryPrecision: 0, f: 'geojson' })).then((r) => r.json()));
      for (const f of j.features) {
        const cls = AGENCY[f.properties.ADMIN_AGENCY_CODE];
        if (!cls) throw new Error('unmapped agency ' + f.properties.ADMIN_AGENCY_CODE);
        for (const p of polys(f.geometry)) parts.push([polyArea(p), CODE[cls], p]);
      }
    }
    parts.sort((a, b) => b[0] - a[0]);
    const own = new Uint8Array(grid.w * grid.h);
    for (const [, c, p] of parts) grid.fill(own, [p], c);
    log.push(`ownership parcels ${parts.length}`);

    // BMAs: Type 2 first, then Type 1 on top (a cell in both counts as Type 1, the surer access)
    const bmaAll = await getAll(BMA + '5/query?', { where: '1=1', outFields: 'BMANUM,BMANAME,PTYPE,REGION' });
    const closed = new Set((await getAll(BMA + '4/query?', { where: '1=1', outFields: 'BMANUM,REGION' })).map((f) => `${f.properties.REGION}-${f.properties.BMANUM}`));
    const cuts = (await getAll(BMA + '3/query?', { where: '1=1', outFields: 'CLASS' })).filter((f) => CUT.has(f.properties.CLASS));
    const bma = bmaAll.filter((f) => !closed.has(`${f.properties.REGION}-${f.properties.BMANUM}`));
    const types = {};
    for (const f of bma) types[f.properties.PTYPE] = (types[f.properties.PTYPE] || 0) + 1;
    log.push(`BMA features ${bmaAll.length}, closed BMAs ${closed.size}, kept ${bma.length} ${JSON.stringify(types)}, cut-outs ${cuts.length}`);
    if (Object.keys(types).some((t) => t !== '1' && t !== '2')) throw new Error('unexpected PTYPE ' + JSON.stringify(types));

    const typ = new Uint8Array(grid.w * grid.h);
    const ids = new Int32Array(grid.w * grid.h).fill(-1); // index into bmaList of the BMA that owns the cell
    const keyOf = (f) => `${f.properties.REGION}-${f.properties.BMANUM}`;
    const bmaList = [...new Set(bma.map(keyOf))].sort();
    const bmaIdx = Object.fromEntries(bmaList.map((k, i) => [k, i]));
    const exact = { 1: 0, 2: 0 };
    for (const t of [2, 1]) for (const f of bma.filter((g) => g.properties.PTYPE === t)) {
      const ps = polys(f.geometry);
      exact[t] += ps.reduce((s, p) => s + polyArea(p), 0) / 4046.8564224;
      const i = bmaIdx[keyOf(f)];
      grid.runs(ps, (row, a, b) => { const o = row * grid.w; typ.fill(t, o + a, o + b); ids.fill(i, o + a, o + b); });
    }
    let cut = 0;
    for (const f of cuts) grid.runs(polys(f.geometry), (row, a, b) => { const o = row * grid.w; for (let k = o + a; k < o + b; k++) if (typ[k]) { typ[k] = 0; ids[k] = -1; cut++; } });
    let cells = { 1: 0, 2: 0 }, priv = { 1: 0, 2: 0 };
    for (let k = 0; k < typ.length; k++) if (typ[k]) { cells[typ[k]]++; if (!PUBLIC.has(own[k])) priv[typ[k]]++; }
    const statewide = {
      bmas: bmaList.length,
      type1: { acres: Math.round(cells[1] * ACRES), notPublicAcres: Math.round(priv[1] * ACRES), polygonAcres: Math.round(exact[1]) },
      type2: { acres: Math.round(cells[2] * ACRES), notPublicAcres: Math.round(priv[2] * ACRES), polygonAcres: Math.round(exact[2]) },
      cutAcres: Math.round(cut * ACRES),
    };
    log.push('statewide ' + JSON.stringify(statewide));

    // per district / portion
    const measure = (ps) => {
      let n = 0, pub = 0, cov = 0;
      const c = { 1: 0, 2: 0 }, cp = { 1: 0, 2: 0 }, seen = { 1: new Set(), 2: new Set() };
      grid.runs(ps, (row, a, b) => {
        const o = row * grid.w;
        for (let k = o + a; k < o + b; k++) {
          n++;
          const ow = own[k];
          if (ow) cov++;
          if (PUBLIC.has(ow)) pub++;
          const t = typ[k];
          if (t) { c[t]++; seen[t].add(ids[k]); if (!PUBLIC.has(ow)) cp[t]++; }
        }
      });
      const pct = (x) => Math.round((1000 * x) / n) / 10;
      return {
        acres: Math.round(n * ACRES), publicPct: Math.round((1000 * pub) / cov) / 10,
        bma1Acres: Math.round(cp[1] * ACRES), bma1Pct: pct(cp[1]), bma1AllAcres: Math.round(c[1] * ACRES), bma1Count: seen[1].size,
        bma2Acres: Math.round(cp[2] * ACRES), bma2Pct: pct(cp[2]), bma2AllAcres: Math.round(c[2] * ACRES), bma2Count: seen[2].size,
        bma1Ids: [...seen[1]].map((i) => bmaList[i]).sort(), bma2Ids: [...seen[2]].map((i) => bmaList[i]).sort(),
      };
    };
    const districts = {}, antelope = {};
    for (const f of de) districts[String(f.properties.DISTRICT).trim()] = measure(polys(f.geometry));
    for (const f of an) antelope[String(f.properties.DISTRICT).trim()] = measure(polys(f.geometry));
    for (const f of por) {
      const side = /North/.test(f.properties.PORTIONNAME) ? 'N' : 'S';
      antelope[`${f.properties.DISTRICT}${side}`] = measure(polys(f.geometry));
    }
    // one row per BMA, for map popups and checks
    const meta = {};
    for (const f of bmaAll) {
      const k = keyOf(f);
      meta[k] = { name: f.properties.BMANAME, type: f.properties.PTYPE, region: f.properties.REGION, closed: closed.has(k) };
    }
    window.mtBmaResult = { statewide, districts, antelope, bmas: meta, log };
    return log.join('\n');
  }

  window.mtBma = { run };
})();
