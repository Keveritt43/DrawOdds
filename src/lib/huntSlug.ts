/** Readable hunt addresses: /hunts/deer-1016, /hunts/elk-unit-39-general-archery, /hunts/salmon-zone-elk-b-tag. */

const SPECIES_WORD: Record<string, string> = { DEER: 'deer', ELK: 'elk', PRONGHORN: 'pronghorn', MOOSE: 'moose', BIGHORN: 'bighorn-sheep', GOAT: 'mountain-goat' };
const WEAPON_WORD: Record<string, string> = { ANY: 'any-weapon', ARCHERY: 'archery', MUZZLELOADER: 'muzzleloader', SHORT_RANGE: 'short-range' };

export const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** The slug a summary row should get (before de-duplication). */
export function baseSlug(r: { id: string; species: string; huntNumber?: number | null; unit?: string | null; weapon: string; name: string }): string {
  const sp = SPECIES_WORD[r.species] ?? slugify(r.species);
  if (r.id.startsWith('c:') && r.huntNumber) return `${sp}-${r.huntNumber}`;
  if (r.id.startsWith('g:') && r.unit) return `${sp}-unit-${slugify(r.unit)}-general-${WEAPON_WORD[r.weapon] ?? slugify(r.weapon)}`;
  return slugify(r.name);
}

/** Gives every row a unique slug: a clash gets -2, -3 ... in the order rows arrive. */
export function assignSlugs<T extends { id: string; species: string; huntNumber?: number | null; unit?: string | null; weapon: string; name: string; slug?: string | null }>(rows: T[]): void {
  const seen = new Map<string, number>();
  for (const r of rows) {
    const b = baseSlug(r);
    const n = (seen.get(b) ?? 0) + 1;
    seen.set(b, n);
    r.slug = n === 1 ? b : `${b}-${n}`;
  }
}

/** Link to a hunt page: the readable slug when the row has one, else its id. */
export const huntHref = (r: { id: string; slug?: string | null }) => `/hunts/${encodeURIComponent(r.slug || r.id)}`;
