/** A descriptive demand screen, not a measurement of animal size or draw probability. */
export interface DemandPeer {
  /** Stable, state-scoped hunt identity; one observation per hunt and draw year. */
  id: string;
  state: string;
  species: string;
  year: number;
  /** Same draw, applicant population, choice, season and access restrictions. */
  peerGroup: string;
  applications: number | null;
}

export interface DemandThreshold {
  state: string;
  species: string;
  year: number;
  peerGroup: string;
  sampleSize: number;
  /** Nearest-rank 95th percentile, calculated from observed comparable hunts. */
  threshold: number;
}

const valid = (r: DemandPeer) => !!r.id && !!r.state && !!r.species && !!r.peerGroup &&
  Number.isInteger(r.year) && r.year > 0 && typeof r.applications === 'number' &&
  Number.isSafeInteger(r.applications) && r.applications >= 0;

/** Reject conflicting duplicates instead of counting one hunt twice or guessing its applications. */
export function exceptionalDemandThreshold(peers: DemandPeer[]): DemandThreshold | null {
  if (!peers.length) return null;
  const first = peers[0];
  if (peers.some(p => p.state !== first.state || p.species !== first.species || p.year !== first.year || p.peerGroup !== first.peerGroup)) return null;
  const observations = new Map<string, number>();
  for (const p of peers) {
    if (!valid(p)) continue;
    const value = p.applications as number;
    if (observations.has(p.id) && observations.get(p.id) !== value) return null;
    observations.set(p.id, value);
  }
  const values = [...observations.values()].sort((a, b) => a - b);
  if (values.length < 20) return null;
  return { state: first.state, species: first.species, year: first.year, peerGroup: first.peerGroup,
    sampleSize: values.length, threshold: values[Math.ceil(values.length * 0.95) - 1] };
}

/** Unknown and mismatched populations are not evidence of exceptional demand. */
export function hasExceptionalDemand(hunt: DemandPeer, benchmark: DemandThreshold | null): boolean {
  return !!benchmark && valid(hunt) && benchmark.sampleSize >= 20 && Number.isSafeInteger(benchmark.threshold) &&
    benchmark.threshold > 0 && hunt.state === benchmark.state && hunt.species === benchmark.species &&
    hunt.year === benchmark.year && hunt.peerGroup === benchmark.peerGroup &&
    (hunt.applications as number) >= benchmark.threshold;
}
