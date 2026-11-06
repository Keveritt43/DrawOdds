/**
 * CPW's report links (cpw.widen.net share pages), from the deer and elk statistics pages:
 * https://cpw.state.co.us/activities/hunting/big-game/hunting-deer/deer-statistics
 * https://cpw.state.co.us/activities/hunting/big-game/hunting-elk/elk-statistics
 * CPW renames the files every year, so a new year means adding its link here (the draw is in May).
 */
export interface ReportLink {
  species: 'DEER' | 'ELK';
  year: number;
  url: string;
}

import catalog from '../../../data/co-reports.json';
import pronghornCatalog from '../../../data/co-pronghorn-reports.json';
export const REPORT_CATALOG = catalog as (ReportLink & { kind: string; label: string })[];
export const PRONGHORN_REPORT_CATALOG = pronghornCatalog as (Omit<ReportLink, 'species'> & { species: 'PRONGHORN'; kind: string; label: string })[];
const links = (kind: string) => REPORT_CATALOG.filter((r) => r.kind === kind);
export const DRAW_RECAPS = links('draw');
export const DRAWN_OUT = links('drawn-out');
export const SECONDARY = links('secondary');
export const OTC_SALES = links('otc-sales');

/** The widen.net share page links to the original PDF; this finds that link. */
export function originalPdfUrl(sharePageHtml: string): string | null {
  const m = sharePageHtml.match(/content\/[a-z0-9]+\/original\/[^"'\s<\\]+/i);
  return m ? `https://cpw.widen.net/${m[0].replace(/&amp;/g, '&')}` : null;
}

/** Harvest estimates (2025 on by hunt code; earlier by unit and season). From the deer statistics page. */
export const HARVEST = links('harvest');
export const POPULATION = links('population');

/** Chapter W-2, big game regulations (units per hunt code, licenses, season dates). Newest first. */
export const REGS = [{ year: 2026, url: 'https://cpw.widen.net/s/s97gq9wqrf/chapter-w-2---big-game-regulations' }];

/**
 * Where a report link's PDF actually is. cpw.widen.net share pages link to the original; the newer
 * cpw.widencollective.com pages load it through Widen's viewer API (the same anonymous calls the page makes).
 */
export async function resolvePdf(
  url: string,
  getText: (u: string, headers?: Record<string, string>) => Promise<string>,
): Promise<string | null> {
  const wc = /widencollective\.com\/assets\/share\/asset\/([a-z0-9]+)/i.exec(url);
  if (wc) {
    const j = JSON.parse(
      await getText(`https://cpw.widencollective.com/albert/viewer/anonymous/asset/widen:assets:asset:CPWZZ:${wc[1]}`, {
        accept: 'application/json',
        'x-widen-albert-client': 'einstein',
        'x-widen-context-actor': 'widen:users:visitor:CPWZZ:anonymous',
        'x-widen-context-tracking': 'doNotTrack=false; anonymous=true',
      }),
    ) as { document_previews?: { uri?: string }; download_source?: string };
    return j.document_previews?.uri ?? j.download_source ?? null;
  }
  return originalPdfUrl(await getText(url));
}

/** CPW big game GMU boundaries (Colorado's game management units, with each unit's herd per species). */
export const CO_GMU_LAYER = 'https://services5.arcgis.com/ttNGmDvKQA7oeDQ3/ArcGIS/rest/services/CPWAdminData/FeatureServer/6/query';
