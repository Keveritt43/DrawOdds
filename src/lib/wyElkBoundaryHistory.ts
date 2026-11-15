/** WGFD changed these elk area boundaries in 2024 and 2025. Historical counts
 * remain in the stored record, but pre-change areas do not describe today's hunt.
 * Sources: WGFD 2024 hunt forecast; 2025 Sheridan changes and Black Hills JCR.
 */
type BoundaryRow = { state:string; species:string; units:string[]; pointOdds:unknown; acres?:number|null;
  resOdds5?:number|null; nrOdds5?:number|null };
type Harvest = {year:number; hunters:number; harvest:number; days?:number|null};
const startYear:Record<string,number> = { E54:2024, E65:2024, E117:2025, E123:2025, E126:2025 };

export function withWyElkBoundaryHistory<T extends BoundaryRow>(row:T):T {
  if (row.state !== 'WY' || row.species !== 'ELK') return row;
  const cutoff = Math.max(0, ...row.units.map(unit => startYear[unit] ?? 0));
  if (!cutoff) return row;
  const po = row.pointOdds as {harvest?:unknown; harvestPriorBoundaryAudit?:unknown} | null;
  if (!po || !Array.isArray(po.harvest)) return {...row,success5:null,successLast:null,hunters5:null,harvest5:null,harvestYears:0,harvestLastYear:null,huntersSqMi:null,daysPerHunter5:null,resTagAndFill:null,nrTagAndFill:null} as T;
  const rows = (po.harvest as Harvest[]).filter(h => Number.isInteger(h.year) && h.year >= cutoff && Number.isFinite(h.hunters) && h.hunters > 0 && Number.isFinite(h.harvest) && h.harvest >= 0 && h.harvest <= h.hunters).sort((a,b)=>a.year-b.year).slice(-5);
  const n = rows.reduce((a,h)=>a+h.hunters,0), k = rows.reduce((a,h)=>a+h.harvest,0), last=rows.at(-1);
  const density = n && rows.length && typeof row.acres === 'number' && row.acres > 0 ? n / rows.length / (row.acres / 640) : null;
  return {...row,pointOdds:{...po,harvest:rows,harvestPriorBoundaryAudit:po.harvestPriorBoundaryAudit ?? po.harvest,harvestBoundaryNote:`WGFD changed this hunt area's boundaries; only ${cutoff} and later harvest is included.`},
    success5:n?k/n:null,successLast:last?last.harvest/last.hunters:null,hunters5:n||null,harvest5:n?k:null,harvestYears:rows.length,harvestLastYear:last?.year??null,
    huntersSqMi:density,daysPerHunter5:n&&rows.every(h=>typeof h.days==='number'&&Number.isFinite(h.days))?rows.reduce((a,h)=>a+(h.days??0),0)/n:null,
    daysPerHarvest5:null,smallSample:!n||n/rows.length<20,resTagAndFill:null,nrTagAndFill:null} as T;
}
