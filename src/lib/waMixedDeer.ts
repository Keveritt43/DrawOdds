/** WDFW 2026 special permits allow any buck, plus antlerless whitetail.
 * The earlier importer saw "antlerless" and mislabeled these as antlerless-only.
 * https://wdfw.wa.gov/sites/default/files/publications/02706/wdfw02706.pdf
 */
export const isWaMixedBuckPermit = (text:string|null|undefined) =>
  /^\s*any\s+buck\s*,\s*white[ -]*tailed\s+antlerless\s*$/i.test(text??'');

export function withWaMixedBuckPermit<T extends {state:string;species:string;type:string;antlerClass:string;takeMethod?:string|null;tagSeasons?:unknown}>(row:T):T {
  const seasons=row.tagSeasons as {year?:number}|null;
  if(row.state!=='WA'||row.species!=='DEER'||row.type!=='CONTROLLED'||row.antlerClass!=='ANTLERLESS'||seasons?.year!==2026||!isWaMixedBuckPermit(row.takeMethod))return row;
  return {...row,antlerClass:'EITHER'};
}
