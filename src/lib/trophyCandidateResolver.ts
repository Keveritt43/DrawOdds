/** Review-only resolver. Do not substitute this for stored or displayed scores until rollout. */
import source from '../../data/trophy-source-western-v3.json';
import crosswalk from '../../data/trophy-ut-wmu-crosswalk.json';
import demand from '../../data/trophy-demand-review-2026.json';
import { candidateTier, type CandidateTier } from './trophyCandidateTier';

type Row = typeof source.records[number];
const unit = (value: string) => value.trim().toUpperCase().replace(/^(UNIT|GMU|HD)\s*/, '');
const key = (state: string, species: string, value: string) => `${state}|${species}|${value}`;
const sources = new Map<string, Row[]>();
for (const r of source.records) {
  const k = key(r.state, r.species, unit(r.unit));
  const rows = sources.get(k) ?? []; rows.push(r); sources.set(k, rows);
}
const utLinks = new Map(crosswalk.links.map(r => [key('UT', r.species, r.huntBoundary), r]));
const units = new Map(demand.unitDemand.map(r => [key(r.state, r.species, r.unit), r]));

export interface CandidateHunt {
  state: string;
  species: string;
  unit: string;
  huntCode?: string | null;
  drawYear?: number | null;
  applications?: number | null;
  deerType?: string | null;
}

export function resolveTrophyCandidate(h: CandidateHunt): CandidateTier & { sourceIds: string[] } {
  const state = h.state.toUpperCase(), species = h.species.toUpperCase(), boundary = unit(h.unit);
  const link = state === 'UT' ? utLinks.get(key(state, species, boundary)) : undefined;
  if (state === 'UT' && !link)
    return {score:50, provisional:true, reason:'No verified Utah management-to-hunt-boundary association', sourceIds:[]};
  let sourceUnit = state === 'UT' ? link?.managementUnit : boundary;
  // Wyoming's finder prefixes hunt areas by species; the supplied file does not.
  if (state === 'WY') sourceUnit = sourceUnit?.replace(/^[DEA](?=\d)/, '');
  // Montana antelope district keys are A-prefixed; N/S portions share the parent HD.
  if (state === 'MT' && species === 'PRONGHORN') sourceUnit = sourceUnit?.replace(/^A(?=\d)/, '').replace(/(?<=\d)[NS]$/, '');
  let rows = sourceUnit ? sources.get(key(state, species, sourceUnit)) ?? [] : [];
  if (rows.some(r => r.activeStatus !== 'Active'))
    return {score:50, provisional:true, reason:'Source record has a conditional or inactive status that needs review', sourceIds:rows.map(r => r.id)};
  if (species === 'DEER') {
    const deerType = (h.deerType ?? '').toUpperCase();
    if (deerType === 'WHITETAIL') rows = rows.filter(r => /whitetail/i.test(r.subspecies));
    else if (deerType === 'MULE') rows = rows.filter(r => /mule/i.test(r.subspecies));
  }
  // Distinct subspecies records cannot be collapsed without an identified population.
  if (new Set(rows.map(r => r.subspecies)).size > 1)
    return {score:50, provisional:true, reason:'The matching source records cover multiple subspecies; the hunt population is unknown', sourceIds:rows.map(r => r.id)};
  const tags = new Set(rows.flatMap(r => r.sourceTags.map(t => t.trim().toLowerCase())));
  const named = [...tags].filter(t => t !== 'bc' && t !== 'bc_top_counties');
  const bc = tags.has('bc') || tags.has('bc_top_counties') || rows.some(r => !!r.county && r.bcPast10Years !== null);
  // Conflicting source tiers stay unknown; do not select whichever looks most favorable.
  const singleTier = (values: (number | null)[]): 1 | 2 | 3 | 4 | null => {
    const nonNull = [...new Set(values.filter((v): v is number => v !== null))];
    return nonNull.length === 1 && [1, 2, 3, 4].includes(nonNull[0]) ? nonNull[0] as 1|2|3|4 : null;
  };
  const measured = units.get(key(state, species, boundary));
  const high = measured && h.drawYear === measured.year ? measured.high : null;
  const exceptional = demand.candidates.find(r => r.state === state && r.species === species && r.unit === boundary &&
    r.year === h.drawYear && r.code === h.huntCode && r.apps === h.applications);
  const result = candidateTier({ listed: rows.length > 0, sourceCount: named.length + Number(bc), bcOnly: bc && !named.length,
    overallPast10Tier: singleTier(rows.map(r => r.overallPast10Tier)), statePast10Tier: singleTier(rows.map(r => r.statePast10Tier)),
    highUnitDemand: high, exceptionalHuntDemand: exceptional ? true : null });
  const parentPortion = state === 'MT' && species === 'PRONGHORN' && /^A\d+[NS]$/.test(boundary);
  return { ...result, provisional: result.provisional || parentPortion,
    reason: parentPortion ? `${result.reason}; source describes the parent district, not this portion` : result.reason,
    sourceIds: rows.map(r => r.id) };
}
