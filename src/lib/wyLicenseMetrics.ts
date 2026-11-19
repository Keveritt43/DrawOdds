/** WGFD license-type rows count active licenses, not verified unique hunters. */
type Row = {state:string; species:string; pointOdds:unknown};
export function wyLicenseSeries(pointOdds:unknown) {
  const po = pointOdds as {harvest?:unknown}|null;
  if (!Array.isArray(po?.harvest)) return [];
  return po.harvest.flatMap((v:unknown) => {
    const r = v as {year?:unknown; hunters?:unknown; harvest?:unknown};
    if (!r || !Number.isInteger(r.year) || typeof r.hunters !== 'number' || !Number.isFinite(r.hunters) || r.hunters <= 0 || typeof r.harvest !== 'number' || !Number.isFinite(r.harvest) || r.harvest < 0 || r.harvest > r.hunters) return [];
    return [{year:r.year as number, hunters:r.hunters, harvest:r.harvest, success:r.harvest/r.hunters}];
  }).sort((a,b)=>a.year-b.year).slice(-5);
}
/** WGFD's by-area tables head the denominator "ACTIVE LICS/HTRS", and a person may hold one full-price license
 * per species from the initial drawing (WY Game & Fish Commission Ch. 2 §4), so a license-type row's harvest ÷ active
 * licenses is that license's hunter success, the same quantity Idaho shows per hunt. Only rows summed across hunt
 * areas (`harvestBasis`, nonresident region licenses) can repeat a holder; those stay withheld unless WGFD's own
 * region survey supplies them (`verifiedRegionHarvest`). Reversed Nov 18, 2026 from #181/#184, which withheld every row. */
export function withoutUnvalidatedWyLicenseMetrics<T extends Row>(row:T):T {
  if (row.state !== 'WY' || !['ELK','PRONGHORN'].includes(row.species)) return row;
  const po = row.pointOdds as {verifiedRegionHarvest?:boolean; harvestBasis?:string}|null;
  if (po?.verifiedRegionHarvest || !po?.harvestBasis) return row;
  return {...row, success5:null, successLast:null, hunters5:null, harvest5:null, huntersSqMi:null,
    daysPerHunter5:null, daysPerHarvest5:null, resTagAndFill:null, nrTagAndFill:null,
    scoreQuality:null, scoreSuccess:null, scoreAccess:null, scoreCrowd:null, scoreOppRes:null, scoreOppNr:null} as T;
}
