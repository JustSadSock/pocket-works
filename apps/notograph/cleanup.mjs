// Optional and reversible; model amplitudes are not calibrated probabilities.
export function cleanNotes(events,{threshold=.5,minDuration=.12,maxGap=.035}={}){
 const merged=[];
 for(const event of [...events].sort((a,b)=>a.pitch-b.pitch||a.start-b.start)){
  const n={...event},prev=merged.at(-1);
  if(prev&&prev.pitch===n.pitch&&n.start-prev.end<=maxGap){
   prev.end=Math.max(prev.end,n.end);prev.confidence=Math.max(prev.confidence,n.confidence);
  }else merged.push(n);
 }
 return merged.filter(n=>n.confidence>=threshold&&n.end-n.start>=minDuration).sort((a,b)=>a.start-b.start||a.pitch-b.pitch);
}
