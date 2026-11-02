import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DIR = () => join(process.cwd(), 'data');

/** Newest data/<prefix>-<year>.json, if any. */
export function latestDataFile<T>(prefix: string): { year: number; data: T } | null {
  if (!existsSync(DIR())) return null;
  const years = readdirSync(DIR())
    .map((f) => f.match(new RegExp(`^${prefix}-(\\d{4})\\.json$`))?.[1])
    .filter(Boolean)
    .map(Number)
    .sort((a, b) => b - a);
  return years.length ? { year: years[0], data: JSON.parse(readFileSync(join(DIR(), `${prefix}-${years[0]}.json`), 'utf8')) as T } : null;
}

export interface ElkZone {
  zone: string;
  units: string[];
  tags: { tag: 'A' | 'B'; code: string; quota: number; capped: boolean }[];
}
/** Elk zones, their units, nonresident hunt codes and quotas (data/nr-elk-zones.json). */
export function loadElkZones(): { quotaYear: number; zones: ElkZone[] } {
  return JSON.parse(readFileSync(join(DIR(), 'nr-elk-zones.json'), 'utf8'));
}

export interface TagSeason {
  weapon: 'ANY' | 'ARCHERY' | 'MUZZLELOADER' | 'SHORT_RANGE';
  sex: string;
  dates: { open: string; close: string }[];
  notes: string;
}
/** Elk general-season A/B tag seasons by zone (scripts/parse_elk_tags.py -> data/elk-tag-seasons-<year>.json). */
export function loadElkTagSeasons(): { year: number; zones: { zone: string; tags: Record<string, { available: boolean; seasons: TagSeason[] }> }[] } | null {
  const f = latestDataFile<{ zones: { zone: string; tags: Record<string, { available: boolean; seasons: TagSeason[] }> }[] }>('elk-tag-seasons');
  return f ? { year: f.year, zones: f.data.zones } : null;
}

/** Deer general-season seasons by tag (RD / WD) and unit (scripts/parse_deer_tags.py -> data/deer-tag-seasons-<year>.json). */
export function loadDeerTagSeasons(): { year: number; tags: Record<'RD' | 'WD', Record<string, (TagSeason & { qualifier?: string })[]>> } | null {
  const f = latestDataFile<{ tags: Record<'RD' | 'WD', Record<string, (TagSeason & { qualifier?: string })[]>> }>('deer-tag-seasons');
  return f ? { year: f.year, tags: f.data.tags } : null;
}
