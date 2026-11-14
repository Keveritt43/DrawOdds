/** Presentation metadata only; score classification lives in trophyTiers.ts. */
export function trophyPresentation(score: number | null): {label:string;color:string;icon:boolean;description:string} {
  switch(score) {
    case 100: return {label:'Unicorn',color:'#805500',icon:true,description:'Exceptional recognized trophy opportunity; season eligibility applies'};
    case 80: return {label:'Trophy',color:'#405e80',icon:true,description:'Established premium trophy potential'};
    case 65: return {label:'Recognized Unit',color:'#356950',icon:true,description:'Unit associated with a recognized area; records are not located to an exact unit'};
    case 50: return {label:'Unclassified',color:'#666666',icon:false,description:'Neutral: no documented designation, not low trophy potential'};
    default: return {label:'N/A',color:'#a6a6a6',icon:false,description:'No trophy rating for antlerless or ineligible hunts'};
  }
}
