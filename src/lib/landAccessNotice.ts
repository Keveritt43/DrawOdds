type Row={state:string;privateOnly:boolean;publicPct:number|null;huntablePct:number|null};
const valid=(n:number|null):n is number=>n!==null&&Number.isFinite(n)&&n>=0&&n<=100;
const below50=(n:number)=>n>=49.95?'just under 50%':`about ${Math.round(n*10)/10}%`;
/** A land-access warning only; never changes trophy or Quality scores. */
export function landAccessNotice(r:Row):string|null {
  if(r.privateOnly)return 'Private-land-only hunt; check landowner permission and access rules.';
  // Utah currently stores public ownership as huntablePct but has no enrolled
  // private-access layer, so it must use the incomplete-mapping wording below.
  if(['ID','MT'].includes(r.state)&&valid(r.huntablePct)){
    if(r.huntablePct>=50)return null;
    return `Mapped public and enrolled access covers ${below50(r.huntablePct)} of this area; other private access may be available.`;
  }
  if(valid(r.publicPct)&&r.publicPct<50)
    return `Public ownership covers ${below50(r.publicPct)} of this area; private access may be available but is not fully mapped.`;
  return null;
}
