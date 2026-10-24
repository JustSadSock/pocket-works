// Pure presentation of an actual microphone time-domain signal.
// No synthetic motion: silence stays flat. Audio is not copied to speakers.
export function meterHeights(samples,count=7){
 const size=Math.max(1,Math.min(20,Math.trunc(count)||7));
 if(!samples?.length)return Array(size).fill(3);
 let energy=0;
 for(const value of samples){
  const normalized=(value-128)/128;
  energy+=normalized*normalized;
 }
 const level=Math.min(1,Math.sqrt(energy/samples.length)*9);
 return Array.from({length:size},(_,i)=>{
  const shape=1-.1*Math.abs(i-(size-1)/2);
  return Math.max(3,Math.round(3+level*17*shape));
 });
}
