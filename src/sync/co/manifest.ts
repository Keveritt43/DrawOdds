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

/** CPW big game GMU boundaries (Colorado's game management units, with each unit's herd per species). */
export const CO_GMU_LAYER = 'https://services5.arcgis.com/ttNGmDvKQA7oeDQ3/ArcGIS/rest/services/CPWAdminData/FeatureServer/6/query';
