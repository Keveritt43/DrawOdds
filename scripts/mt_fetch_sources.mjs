// Build the Montana drawing-statistics manifest.
//
// The report list on https://myfwp.mt.gov/fwpPub/drawingStatistics is not in the
// page HTML. The species <select> (#repositoryObjectId) drives an AJAX reload via
// the page's own callReload('reloadReportResultsDiv'). The workspace shell cannot
// reach myfwp.mt.gov, so this runs IN THE PAGE (Claude in Chrome javascript_tool,
// or paste into devtools on that page) and prints CSV to copy into
// data/mt/draw-sources.csv.
//
// Usage in page:  await mtFetchSources()
//
// Output columns: objectID,year,category,kind,licenseType,title
// `kind` is 'detail' for the point-level reports, 'summary' for the per-LPT
// totals, 'multiyear' for the rolled-up NR combination files, '' if unknown.

const CATEGORIES = {
  28561: 'ANTELOPE',
  28562: 'ELK',
  28563: 'GOAT',
  28564: 'MOOSE',
  94776: 'NRCOMBO',
  94777: 'OTHER',
  28565: 'SHEEP',
  28566: 'DEER',
};

// Titles drift year to year, so classify on content, not on a URL or id pattern.
// Seen so far: "Detailed Bonus Point Drawing Statistics" (2006-2021, 2018,
// 2023-2026), "Bonus Point Drawing Statistics" (2022 - the word "Detailed" was
// dropped), "Bonus Points Drawing Statistics Report" (2022 Elk B).
function classify(title) {
  const t = title.toLowerCase();
  if (/through\s+\d{4}/.test(t)) return 'multiyear';
  if (t.includes('bonus point') || t.includes('preference point')) return 'detail';
  if (t.includes('drawing statistic') || t.includes('drawing statics')) return 'summary';
  return '';
}

// "2016 Antelope B Drawing Statics Report" -> licenseType "Antelope B".
// Note the typo "Statics" in the 2016 listing; match it deliberately.
function licenseType(title) {
  return title
    .replace(/^\d{4}\s+/, '')
    .replace(/\s*\(.*?\)\s*$/, '')
    .replace(/\s*(Detailed\s+)?(Bonus|Preference)\s+Points?\s+Drawing\s+Statistics?(\s+Report)?/i, '')
    .replace(/\s*Drawing\s+Stat(istic|ic)s?(\s+Report)?/i, '')
    .replace(/\s*(License\s+)?Statistics$/i, '')
    .trim();
}

export async function mtFetchSources({ sinceYear = 2006 } = {}) {
  const select = document.querySelector('#repositoryObjectId');
  if (!select) throw new Error('not on the drawingStatistics page');
  if (typeof callReload !== 'function') throw new Error('callReload() missing — page not fully loaded');

  const rows = [];
  const seen = new Set();

  for (const [id, category] of Object.entries(CATEGORIES)) {
    select.value = id;
    callReload('reloadReportResultsDiv');
    // The reload swaps the results div in place; there is no promise to await.
    await new Promise((r) => setTimeout(r, 2600));

    const links = [...document.querySelectorAll('a')]
      .map((a) => {
        const href = a.getAttribute('href') || '';
        const m = href.match(/objectID=(\d+)/);
        if (!m) return null;
        // Trailing " 348.2 KB" is the file size, not part of the title.
        const title = a.textContent.trim().replace(/\s+/g, ' ').replace(/ \d+(\.\d+)? [KM]B$/, '');
        return { objectID: m[1], title };
      })
      .filter(Boolean);

    if (!links.length) throw new Error(`no reports returned for ${category} (${id})`);

    for (const { objectID, title } of links) {
      const year = Number((title.match(/^(\d{4})/) || [])[1]);
      if (!year || year < sinceYear) continue;
      // The combined "Deer, Elk and Antelope" files are listed under all three
      // categories. Keep the first and record it once.
      if (seen.has(objectID)) continue;
      seen.add(objectID);
      rows.push({ objectID, year, category, kind: classify(title), licenseType: licenseType(title), title });
    }
  }

  rows.sort((a, b) => a.year - b.year || a.category.localeCompare(b.category) || a.title.localeCompare(b.title));

  const esc = (s) => (/[",]/.test(s) ? `"${String(s).replace(/"/g, '""')}"` : s);
  const csv = ['objectID,year,category,kind,licenseType,title']
    .concat(rows.map((r) => [r.objectID, r.year, r.category, r.kind, esc(r.licenseType), esc(r.title)].join(',')))
    .join('\n');

  return { count: rows.length, csv };
}

globalThis.mtFetchSources = mtFetchSources;
