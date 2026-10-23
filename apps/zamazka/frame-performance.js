// Optional browser-only performance diagnostics for the painting surface.
// Measurements contain no artworks, coordinates, room IDs or user details.
export function createCanvasFrameTelemetry(report,{batchSize=120}={}){
 if(typeof report!=='function')throw new TypeError('report callback required');
 const target=Math.max(10,Math.floor(batchSize)||120);
 let durations=[],skipped=0,started=null,previous=null,largestGap=0;
 return {
  record(now,duration,drew=true){
   if(!Number.isFinite(now)||!Number.isFinite(duration)||duration<0)return;
   if(started===null)started=now;
   if(previous!==null)largestGap=Math.max(largestGap,Math.max(0,now-previous));
   previous=now;
   if(drew)durations.push(duration);
   else skipped++;
   if(durations.length+skipped<target)return;
   const sorted=durations.slice().sort((a,b)=>a-b);
   const percentile=p=>sorted[Math.max(0,Math.ceil(sorted.length*p)-1)]||0;
   const rounded=n=>Math.round(n*100)/100;
   const elapsed=Math.max(1,now-started);
   report({
    sampledFrames:durations.length+skipped,
    paintedFrames:durations.length,
    skippedFrames:skipped,
    drawP50Ms:rounded(percentile(.5)),
    drawP95Ms:rounded(percentile(.95)),
    drawP99Ms:rounded(percentile(.99)),
    drawMaxMs:rounded(percentile(1)),
    maxFrameGapMs:rounded(largestGap),
    paintedUpdatesPerSecond:rounded(durations.length*1000/elapsed)
   });
   durations=[];skipped=0;started=null;previous=null;largestGap=0;
  }
 };
}
