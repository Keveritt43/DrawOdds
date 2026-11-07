import { changePresets, presetHref, presetName, readPresets, PRESET_KEY, type FilterPreset } from './filterPresets';
export const BROWSER_PRESET_KEY = 'drawodds:filter-presets';
export function browserPresets(): FilterPreset[] {
  try { return readPresets({[PRESET_KEY]:JSON.parse(localStorage.getItem(BROWSER_PRESET_KEY) ?? '[]')}); }
  catch { return []; }
}
export function changeBrowserPreset(change: {name:string;href:string|null;replace?:boolean}) {
  const name = presetName(change.name);
  const href = change.href === null ? null : presetHref(change.href);
  if (!name || (change.href !== null && !href)) return {error:'Enter a valid preset name and search.'};
  const result = changePresets(browserPresets(), {...change,name,href});
  if (result.presets) {
    localStorage.setItem(BROWSER_PRESET_KEY,JSON.stringify(result.presets));
    window.dispatchEvent(new Event('drawodds:presets'));
  }
  return result;
}
