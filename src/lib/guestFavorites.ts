export const GUEST_FAVORITES_COOKIE = 'saved_items';
export const GUEST_FAVORITES_LIMIT = 80;
export type GuestFavorites = { hunts: number[]; units: string[] };
export function parseGuestFavorites(raw?: string): GuestFavorites {
  try {
    const value = JSON.parse(raw ?? '{}');
    return {
      hunts: Array.isArray(value.hunts) ? [...new Set<number>(value.hunts.filter((n:unknown) => typeof n === 'number' && Number.isSafeInteger(n)))].slice(0,GUEST_FAVORITES_LIMIT) : [],
      units: Array.isArray(value.units) ? [...new Set<string>(value.units.filter((s:unknown) => typeof s === 'string' && /^(?:co-)?[a-zA-Z0-9]{1,8}$/.test(s)))].slice(0,GUEST_FAVORITES_LIMIT) : [],
    };
  } catch { return {hunts:[],units:[]}; }
}
