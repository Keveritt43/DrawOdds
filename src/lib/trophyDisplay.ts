/** Presentation metadata only; score classification lives in trophyTiers.ts. */
export function trophyPresentation(score: number | null): {label:string;color:string;icon:boolean;description:string} {
  switch(score) {
    case 100: return {label:'Unicorn',color:'#c99b36',icon:true,description:'Exceptional recognized trophy opportunity; season eligibility applies'};
    case 80: return {label:'Trophy',color:'#91a8c4',icon:true,description:'Established premium trophy potential'};
    case 65: return {label:'Trophy County',color:'#73a590',icon:true,description:'Verified trophy county association'};
    case 50: return {label:'Unclassified',color:'#a6a6a6',icon:false,description:'Neutral: no documented designation, not low trophy potential'};
    default: return {label:'N/A',color:'#a6a6a6',icon:false,description:'No trophy rating for antlerless or ineligible hunts'};
  }
}
