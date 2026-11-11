/*
 * Which big-game species each Montana Block Management Area (BMA) is open to, read from FWP's 2026 Block
 * Management guide. The GIS layers (scripts/mt_build_bma.browser.js) carry the permission type but no species,
 * and BMAs differ: #3-132 is antelope only, #3-87 white-tailed deer and birds, #6-132 upland birds only.
 *
 * Run in a tab on https://fwp.mt.gov/ (the PDF has no CORS for other hosts), after loading pdf.js 4.4.168 from
 * cdnjs as window.pdfjsLib: `window.mtGuideSpecies = await mtBmaGuide.run()`. Then paste
 * mt_build_bma.browser.js into the same tab (fwp-gis.mt.gov and gis.blm.gov answer cross-site requests) and
 * `await mtBma.run(mtGuideSpecies)`.
 *
 * The guide's tables are printed sideways (text at -90 degrees), so positions are rotated back first. A page can
 * hold several county tables, each under its own "REGION n BLOCK MANAGEMENT AREA" title and header; a BMA that
 * spans counties is listed once per county and the rows are merged. Cells are assigned by the column headers;
 * the multi-line cells are vertically centred, so a row runs from midway after the previous BMA number to midway
 * before the next. Region 3 starts its district text left of the "Hunting Districts" header, so column edges use
 * the leftmost of each header's two lines, less a margin.
 *
 * Species come from the "Primary Hunting Opportunities" column (FWP calls it "a general guide"), then two kinds of
 * explicit prohibition in the other text cells override it: "All species except X are prohibited" and
 * "no deer hunting" / "deer hunting is prohibited". Checked 2026-11-11: 892 BMAs; 855 list deer, 273 elk,
 * 623 antelope; 8 list none of the three (bird-only BMAs, #1-19 "Antlerless" with no species, #3-1 blank).
 */
(function () {
  const URL_ = '/binaries/content/assets/fwp/hunt/access/block-management/2026-fwpblockmanegment-finalproof.pdf';
  const SP = { deer: /deer|\bWT\b|\bMD\b|mule|white-?tail/i, elk: /\belk\b/i, ant: /antelope|pronghorn/i };

  async function pages() {
    const doc = await window.pdfjsLib.getDocument(URL_).promise;
    const out = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const pg = await doc.getPage(i);
      const vp = pg.getViewport({ scale: 1 });
      const tc = await pg.getTextContent();
      out.push(tc.items.filter((t) => t.str.trim()).map((t) => {
        const m = window.pdfjsLib.Util.transform(vp.transform, t.transform);
        return { s: t.str.trim(), dir: Math.round((Math.atan2(m[1], m[0]) * 180) / Math.PI), rx: vp.height - m[5], ry: m[4] };
      }).filter((t) => t.dir === -90));
    }
    return out;
  }

  function rows(pgs) {
    const out = [];
    let region = null;
    pgs.forEach((all, pi) => {
      const titles = all.filter((t) => /REGION\s*\d.*BLOCK/i.test(t.s)).sort((a, b) => a.ry - b.ry);
      const segs = titles.length
        ? titles.map((t, i) => [t.ry - 2, i + 1 < titles.length ? titles[i + 1].ry - 2 : 1e9, Number(t.s.match(/REGION\s*(\d)/i)[1])])
        : [[-1, 1e9, region]];
      for (const [s0, s1, reg] of segs) {
        region = reg;
        const its = all.filter((t) => t.ry >= s0 && t.ry < s1);
        const H = (re, after) => its.filter((t) => re.test(t.s) && (!after || t.rx > after.rx)).sort((a, b) => a.ry - b.ry)[0];
        const hPrim = H(/^Primary/i), hOpp = H(/^Opportunit/i), hDist = hPrim && H(/^Hunting/i, hPrim), hDist2 = H(/^Districts?$/i);
        const hAdd = H(/^Additional/i), hType = H(/^BMA Type/i), hName = H(/^BMA Name/i), hAcres = H(/^Acres/i), hDates = H(/^Dates/i), hGen = H(/^General/i);
        if (!hPrim || !hDist || !hAdd || !hType || !hName || !hAcres || !hDates) continue;
        const top = Math.max(...its.filter((t) => /^(No\.|Location|to Hunting|Opportunities|Districts?)$/i.test(t.s)).map((t) => t.ry)) + 4;
        const anchors = its.filter((t) => t.rx < hName.rx - 3 && /^\d{1,3}$/.test(t.s) && t.ry > top).sort((a, b) => a.ry - b.ry);
        const pS = Math.min(hPrim.rx, hOpp?.rx ?? 1e9) - 8, dS = Math.min(hDist.rx, hDist2?.rx ?? 1e9) - 12;
        const cols = [['name', hName.rx - 6, (hGen?.rx ?? hAcres.rx) - 8], ['acres', hAcres.rx - 15, hDates.rx - 6], ['dates', hDates.rx - 6, hType.rx - 6],
          ['type', hType.rx - 6, pS], ['prim', pS, dS], ['dist', dS, hAdd.rx - 6], ['add', hAdd.rx - 6, 9999]];
        anchors.forEach((a, i) => {
          const lo = i === 0 ? top : (anchors[i - 1].ry + a.ry) / 2;
          const hi = i === anchors.length - 1 ? Math.min(s1, a.ry + (a.ry - lo) + 2) : (a.ry + anchors[i + 1].ry) / 2;
          const r = { region, num: Number(a.s), page: pi + 1 };
          for (const [c, x0, x1] of cols) {
            r[c] = its.filter((t) => t.ry >= lo && t.ry < hi && t.rx >= x0 && t.rx < x1).sort((u, v) => u.ry - v.ry || u.rx - v.rx).map((t) => t.s).join(' ').replace(/\s+/g, ' ').trim();
          }
          out.push(r);
        });
      }
    });
    return out;
  }

  function merge(rs) {
    const by = {};
    for (const r of rs) {
      const k = `${r.region}-${r.num}`;
      const o = by[k];
      if (!o) { by[k] = { ...r, pages: [r.page] }; continue; }
      o.pages.push(r.page);
      if (r.prim.length > o.prim.length) o.prim = r.prim;
      if (!o.dist.includes(r.dist)) o.dist += ' ' + r.dist;
      if (r.add.length > o.add.length) o.add = r.add;
    }
    return by;
  }

  function species(r) {
    const s = {};
    for (const [n, re] of Object.entries(SP)) s[n] = re.test(r.prim);
    const text = `${r.dist} ${r.add}`; // Region 3's additional text overlaps the district column
    const ex = text.match(/all species (?:except|other than) ([^.]*?) (?:are|is) prohibited/i);
    if (ex) for (const n of Object.keys(SP)) if (!SP[n].test(ex[1])) s[n] = false;
    for (const [n, re] of Object.entries(SP)) {
      if (new RegExp(`(?:\\bno\\s+(?:${re.source})\\s+hunting|(?:${re.source})\\s+hunting\\s+(?:is\\s+)?(?:prohibited|not allowed|closed))`, 'i').test(text)) s[n] = false;
    }
    return s;
  }

  async function run() {
    const by = merge(rows(await pages()));
    window.mtGuideRows = by;
    return Object.fromEntries(Object.entries(by).map(([k, r]) => [k, species(r)]));
  }

  window.mtBmaGuide = { run, rows, merge, species };
})();
