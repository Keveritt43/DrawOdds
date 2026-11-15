/** Presentation metadata only; score classification lives in trophyTiers.ts. */
export function trophyPresentation(score: number | null): {label:string;color:string;icon:boolean;description:string} {
  switch(score) {
    case 100: return {label:'Elite',color:'#805500',icon:true,description:'Highest trophy tier; evidence can be provisional and does not guarantee animal size'};
    case 80: return {label:'Excellent',color:'#805500',icon:true,description:'Recognized opportunity; demand does not measure animal size, and missing evidence can make a tier provisional'};
    case 65: return {label:'Good',color:'#5e6e73',icon:true,description:'Recognized unit or hunt; evidence can be provisional'};
    case 50: return {label:'Standard',color:'#666666',icon:false,description:'No higher designation is established; missing evidence can make this provisional, not evidence of low trophy potential'};
    default: return {label:'N/A',color:'#a6a6a6',icon:false,description:'No trophy rating for antlerless or ineligible hunts'};
  }
}
