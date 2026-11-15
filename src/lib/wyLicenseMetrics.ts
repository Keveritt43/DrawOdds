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
export function withoutUnvalidatedWyLicenseMetrics<T extends Row>(row:T):T {
  if (row.state !== 'WY' || !['ELK','PRONGHORN'].includes(row.species)) return row;
  return {...row, success5:null, successLast:null, hunters5:null, harvest5:null, huntersSqMi:null,
    daysPerHunter5:null, daysPerHarvest5:null, resTagAndFill:null, nrTagAndFill:null,
    scoreQuality:null, scoreSuccess:null, scoreAccess:null, scoreCrowd:null, scoreOppRes:null, scoreOppNr:null} as T;
}
