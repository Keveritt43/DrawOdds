/** Presentation metadata only; score classification lives in trophyTiers.ts. */
export function trophyPresentation(score: number | null): {label:string;color:string;icon:boolean;description:string} {
  switch(score) {
    case 100: return {label:'Elite',color:'#805500',icon:true,description:'Highest trophy tier; not a guarantee of animal size'};
    case 80: return {label:'Excellent',color:'#805500',icon:true,description:'Recognized premium opportunity; demand alone does not measure animal size'};
    case 65: return {label:'Good',color:'#5e6e73',icon:true,description:'Recognized unit or hunt'};
    case 50: return {label:'Standard',color:'#666666',icon:false,description:'No higher designation is documented; not evidence of low trophy potential'};
    default: return {label:'N/A',color:'#a6a6a6',icon:false,description:'No trophy rating for antlerless or ineligible hunts'};
  }
}
