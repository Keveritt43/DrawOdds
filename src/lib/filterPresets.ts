import { validFinderReturn } from './huntNavigation';
import { CO_RESTRICTIONS, ID_RESTRICTIONS, searchStates } from './searchStates';
import { DEFAULT_STATE, enabledStates } from './states';

export const PRESET_KEY = '_hunt_presets';
export const PRESET_LIMIT = 20;
export const PRESET_NAME_LIMIT = 60;
export type FilterPreset = { name: string; href: string };

const filterKeys = new Set([
  'species', 'type', 'weapon', 'method', 'antler', 'sex', 'draw', 'sort', 'view',
  'month', 'from', 'to', 'dmode', 'minScore', 'minOpp', 'minOdds', 'minPublic',
  'minSuccess', 'minSucc', 'minTags', 'maxDensity', 'youth', 'unit', 'q', 'odds', 'priv',
  ...ID_RESTRICTIONS, ...CO_RESTRICTIONS,
]);

export function presetName(raw: unknown): string | null {
  if (typeof raw !== 'string' || /[\x00-\x1f\x7f]/.test(raw)) return null;
  const name = raw.trim().replace(/ {2,}/g, ' ');
  return name.length > 0 && name.length <= PRESET_NAME_LIMIT ? name : null;
}

export const presetNameKey = (name: string) => name.normalize('NFC').toLowerCase();

export function presetHref(raw: unknown): string | null {
  const back = validFinderReturn(raw);
  if (!back || back.length > 3000) return null;
  const p = new URLSearchParams(back.split('?').slice(1).join('?'));
  const out = new URLSearchParams();
  if (p.has('states')) {
    out.set('states', searchStates(p.getAll('states'), DEFAULT_STATE).join(','));
  } else {
    const state = p.get('state');
    if (!enabledStates().some(s => s.code === state)) return null;
    out.set('state', state!);
    out.set('restore', '1');
  }
  for (const [key, value] of p) if (filterKeys.has(key)) out.append(key, value);
  return '/hunts?' + out.toString();
}

export function readPresets(points: unknown): FilterPreset[] {
  const raw = (points as Record<string, unknown> | null)?.[PRESET_KEY];
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, PRESET_LIMIT).flatMap(p => {
    const name = presetName(p?.name);
    const href = presetHref(p?.href);
    return name && href ? [{ name, href }] : [];
  });
}

export function changePresets(current: FilterPreset[], change: { name: string; href: string | null; replace?: boolean }) {
  const key = presetNameKey(change.name);
  const exists = current.some(p => presetNameKey(p.name) === key);
  if (change.href && exists && !change.replace) return { error: 'A preset already has that name.' } as const;
  if (change.href && !exists && current.length >= PRESET_LIMIT) {
    return { error: 'You can save up to ' + PRESET_LIMIT + ' presets. Delete one to add another.' } as const;
  }
  const presets = current.filter(p => presetNameKey(p.name) !== key);
  if (change.href) presets.push({ name: change.name, href: change.href });
  return { presets: presets.sort((a, b) => a.name.localeCompare(b.name)) } as const;
}
