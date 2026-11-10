/**
 * Private-land-only hunts: the license is valid only on private land, so the hunter needs landowner permission.
 * One shared rule for every state (StateConfig.privateLandOnly says what each state counts). The finder hides these
 * by default; `priv=1` shows them. Client-safe: no database, no large data imports.
 *
 * Colorado and Wyoming store the flag on HuntSummary.privateOnly at import. Idaho's rows predate the flag and
 * production Idaho rows are not rewritten for it (AGENTS.md safeguards), so Idaho is flagged here by hunt number from
 * IDFG's 2026 Seasons & Rules notes. tests/privateLand.test.ts re-derives this list from
 * data/controlled-hunts-2026.json, so a regulation update that changes it fails the test instead of drifting.
 * Not flagged: "on or within 1 mile of private agricultural lands" and "very limited access" hunts (public land
 * still qualifies). Idaho moose, sheep and goat hunts are not in that file and are not flagged.
 */
export const ID_PRIVATE_ONLY_2026 = ['ELK:2168', 'ELK:2171', 'ELK:2174', 'ELK:2285', 'ELK:2286', 'ELK:2287'] as const;
const ID_SET = new Set<string>(ID_PRIVATE_ONLY_2026);

export type PrivateLandRow = { state: string; privateOnly: boolean; species: string; type?: string; huntNumber: number | null };

export function isPrivateOnly(r: PrivateLandRow): boolean {
  if (r.privateOnly) return true;
  return r.state === 'ID' && r.type !== 'GENERAL' && r.huntNumber !== null && ID_SET.has(`${r.species}:${r.huntNumber}`);
}

/** URL: `priv=1` shows private-land-only hunts. `wyPriv=1` is the old Wyoming-only key, kept so saved links work. */
export const showPrivate = (get: (k: string) => string | null | undefined) => get('priv') === '1' || get('wyPriv') === '1';

/** Prisma filter for the single-state Idaho finder (rows from one state). */
export function privateOnlyExclusion(state: string) {
  return state === 'ID'
    ? [{ privateOnly: false }, { NOT: { type: 'CONTROLLED' as const, OR: ID_PRIVATE_ONLY_2026.map(k => { const [species, n] = k.split(':'); return { species: species as 'ELK', huntNumber: Number(n) }; }) } }]
    : [{ privateOnly: false }];
}
