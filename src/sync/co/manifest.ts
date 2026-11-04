/**
 * CPW's report links (cpw.widen.net share pages), from the deer and elk statistics pages:
 * https://cpw.state.co.us/activities/hunting/big-game/hunting-deer/deer-statistics
 * https://cpw.state.co.us/activities/hunting/big-game/hunting-elk/elk-statistics
 * CPW renames the files every year, so a new year means adding its link here (the draw is in May).
 */
export interface ReportLink { species: 'DEER' | 'ELK'; year: number; url: string }

export const DRAW_RECAPS: ReportLink[] = [
  { species: 'DEER', year: 2026, url: 'https://cpw.widen.net/s/5j2x8x6fdd/postdrawrecapreport_deer-26_05112026_1505' },
  { species: 'DEER', year: 2025, url: 'https://cpw.widen.net/s/r9bjfnqlbc/postdrawrecapreport_deer-25_05102025_1540' },
  { species: 'DEER', year: 2024, url: 'https://cpw.widen.net/s/drbww92qtk/2024-primary-deer-post-draw-report' },
  { species: 'DEER', year: 2023, url: 'https://cpw.widen.net/s/7bcmqkddrn/2023deerdrawrecap' },
  { species: 'DEER', year: 2022, url: 'https://cpw.widen.net/s/srqhwvssqn/2022deerdrawrecap' },
  { species: 'DEER', year: 2021, url: 'https://cpw.widen.net/s/t5dp6nvfrv/2021deerdrawrecap' },
];

/** The widen.net share page links to the original PDF; this finds that link. */
export function originalPdfUrl(sharePageHtml: string): string | null {
  const m = sharePageHtml.match(/content\/[a-z0-9]+\/original\/[^"'\s<\\]+/i);
  return m ? `https://cpw.widen.net/${m[0].replace(/&amp;/g, '&')}` : null;
}

/** Harvest estimates (2025 on by hunt code; earlier by unit and season). From the deer statistics page. */
export const HARVEST: ReportLink[] = [
  { species: 'DEER', year: 2025, url: 'https://cpw.widencollective.com/assets/share/asset/wp8zjwayji' },
  { species: 'DEER', year: 2024, url: 'https://cpw.widencollective.com/assets/share/asset/pdnoekykc6' },
  { species: 'DEER', year: 2023, url: 'https://cpw.widen.net/s/vczl7tkhxr/2023statewidedeerhuntingharvestestimates' },
  { species: 'DEER', year: 2022, url: 'https://cpw.widen.net/s/lkpnmjwk9m/2022statewidedeerharvest' },
  { species: 'DEER', year: 2021, url: 'https://cpw.widen.net/s/zskvhjdmq5/2021statewidedeerharvest' },
  { species: 'DEER', year: 2020, url: 'https://cpw.widen.net/s/8hx8lnprk6/2020statewidedeerharvest' },
  { species: 'DEER', year: 2019, url: 'https://cpw.widen.net/s/r2ns9grsqh/2019statewidedeerharvest' },
];

/** Chapter W-2, big game regulations (units per hunt code, licenses, season dates). Newest first. */
export const REGS = [{ year: 2026, url: 'https://cpw.widen.net/s/s97gq9wqrf/chapter-w-2---big-game-regulations' }];

/**
 * Where a report link's PDF actually is. cpw.widen.net share pages link to the original; the newer
 * cpw.widencollective.com pages load it through Widen's viewer API (the same anonymous calls the page makes).
 */
export async function resolvePdf(url: string, getText: (u: string, headers?: Record<string, string>) => Promise<string>): Promise<string | null> {
  const wc = /widencollective\.com\/assets\/share\/asset\/([a-z0-9]+)/i.exec(url);
  if (wc) {
    const j = JSON.parse(await getText(`https://cpw.widencollective.com/albert/viewer/anonymous/asset/widen:assets:asset:CPWZZ:${wc[1]}`, {
      accept: 'application/json', 'x-widen-albert-client': 'einstein', 'x-widen-context-actor': 'widen:users:visitor:CPWZZ:anonymous', 'x-widen-context-tracking': 'doNotTrack=false; anonymous=true',
    })) as { document_previews?: { uri?: string }; download_source?: string };
    return j.document_previews?.uri ?? j.download_source ?? null;
  }
  return originalPdfUrl(await getText(url));
}

/** CPW big game GMU boundaries (Colorado's game management units, with each unit's herd per species). */
export const CO_GMU_LAYER = 'https://services5.arcgis.com/ttNGmDvKQA7oeDQ3/ArcGIS/rest/services/CPWAdminData/FeatureServer/6/query';
