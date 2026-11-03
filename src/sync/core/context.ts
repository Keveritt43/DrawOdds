import { PrismaClient } from '@prisma/client';

export const db = new PrismaClient();

export const ODDS_BASE = 'https://fishandgame.idaho.gov/ifwis/huntplanner/api/1.1/odds/';
export const STATS_BASE = 'https://fishandgame.idaho.gov/ifwis/huntplanner/stats/';
export const HP_BASE = 'https://fishandgame.idaho.gov/ifwis/huntplanner/';
export const GMU_LAYER =
  'https://services.arcgis.com/FjJI5xHF2dUPVrgK/ArcGIS/rest/services/GameManagementUnits/FeatureServer/0/query';
export const HUNTING_MAPSERVER = 'https://gisportal-idfg.idaho.gov/hosting/rest/services/Hunting/MapServer';

/**
 * code = odds API / hunt list BigGameID; game = harvest stats page name(s) (bighorns are published as two pages,
 * California and Rocky Mountain); title = the word the page title uses; general = has general seasons.
 * Moose, bighorn sheep and mountain goat are a separate drawing (April) from deer, elk and pronghorn (May-June).
 */
export const SPECIES = [
  { code: 1, species: 'DEER' as const, game: ['deer'], title: 'Deer', general: true },
  { code: 2, species: 'ELK' as const, game: ['elk'], title: 'Elk', general: true },
  { code: 3, species: 'PRONGHORN' as const, game: ['antelope'], title: 'Antelope', general: false }, // controlled hunts only
  { code: 6, species: 'MOOSE' as const, game: ['moose'], title: 'Moose', general: false },
  { code: 7, species: 'BIGHORN' as const, game: ['rocky mountain sheep', 'california sheep'], title: 'Sheep', general: false },
  { code: 8, species: 'GOAT' as const, game: ['goat'], title: 'Goat', general: false },
];

export const FIRST_ODDS_YEAR = 1998;
export const FIRST_HARVEST_YEAR = 2010;
export const thisYear = () => new Date().getFullYear();

export interface StepResult {
  rows: number;
  status?: 'OK' | 'CHECK' | 'ERROR';
  details?: string[];
}

export interface StepOptions {
  full: boolean;
}

/** Runs one step and records it in SyncLog, so a failed night is visible in the app's admin page. */
export async function runStep(name: string, fn: () => Promise<StepResult>): Promise<StepResult> {
  const log = await db.syncLog.create({ data: { step: name, status: 'RUNNING' } });
  const t0 = Date.now();
  try {
    const r = await fn();
    const status = r.status ?? (r.details?.length ? 'CHECK' : 'OK');
    await db.syncLog.update({
      where: { id: log.id },
      data: { status, rows: r.rows, details: (r.details ?? []).join('\n').slice(0, 8000), finishedAt: new Date() },
    });
    console.log(`[${name}] ${status} rows=${r.rows} (${Math.round((Date.now() - t0) / 1000)}s)`);
    r.details?.slice(0, 20).forEach((d) => console.log(`  - ${d}`));
    return { ...r, status };
  } catch (e) {
    const msg = e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e);
    await db.syncLog.update({ where: { id: log.id }, data: { status: 'ERROR', details: msg.slice(0, 8000), finishedAt: new Date() } });
    console.error(`[${name}] ERROR`, e);
    return { rows: 0, status: 'ERROR', details: [msg] };
  }
}

/** Years to (re)fetch: always the last two; older years only if missing or on --full. */
export function yearsToFetch(first: number, have: Set<number>, full: boolean): number[] {
  const out: number[] = [];
  for (let y = first; y <= thisYear(); y++) if (full || y >= thisYear() - 1 || !have.has(y)) out.push(y);
  return out;
}

export function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}
