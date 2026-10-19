// MEAT.EXE v1.9.5: measured, opt-in-exportable field telemetry.
// No trackers, network requests, device fingerprinting or fabricated benchmarks.
const bound=(x,lo,hi,otherwise=0)=>Number.isFinite(x)?Math.max(lo,Math.min(hi,x)):otherwise;
const integer=(x,lo,hi,otherwise=0)=>Math.floor(bound(x,lo,hi,otherwise));
// Rendering cadence must use actual elapsed wall time. Game physics is
// separately capped to 0.1 s so hitch recovery does not tunnel entities.
export function presentationDelta(ms){
 return Number.isFinite(ms)?Math.max(0,Math.min(2000,ms))/1000:0;
}
export function emptyFieldTelemetry(){
 return {windows:0,seconds:0,weightedFps:0,minFps:null,slowWindows:0,
  peakGeometries:0,peakDrawCalls:0,peakInstances:0,budgetWarnings:0};
}
export function sanitizeFieldTelemetry(input){
 const value=input&&typeof input==='object'?input:{};
 const windows=integer(value.windows,0,18000);
 const seconds=integer(value.seconds,0,72000);
 return {windows,seconds,weightedFps:integer(value.weightedFps,0,12000000),
  minFps:windows&&Number.isFinite(value.minFps)?Math.round(bound(value.minFps,0,240)*10)/10:null,
  slowWindows:integer(value.slowWindows,0,windows),
  peakGeometries:integer(value.peakGeometries,0,10000),
  peakDrawCalls:integer(value.peakDrawCalls,0,10000),
  peakInstances:integer(value.peakInstances,0,10000),
  budgetWarnings:integer(value.budgetWarnings,0,windows)};
}
export function recordFieldWindow(input,fps,seconds,runtime){
 const report=sanitizeFieldTelemetry(input);
 if(!Number.isFinite(fps)||fps<0||fps>240||!Number.isFinite(seconds)||seconds<2||seconds>20)return report;
 // Keep only grouped four-second samples, not frame-by-frame timelines.
 const dt=integer(seconds,2,20);
 const observed=Math.round(fps*10)/10;
 report.windows=Math.min(18000,report.windows+1);
 report.seconds=Math.min(72000,report.seconds+dt);
 report.weightedFps=Math.min(12000000,report.weightedFps+Math.round(observed*dt));
 report.minFps=report.minFps===null?observed:Math.min(report.minFps,observed);
 report.slowWindows=Math.min(report.windows,report.slowWindows+(observed<30?1:0));
 report.peakGeometries=Math.max(report.peakGeometries,integer(runtime?.gpuGeometries,0,10000));
 report.peakDrawCalls=Math.max(report.peakDrawCalls,integer(runtime?.drawCalls,0,10000));
 report.peakInstances=Math.max(report.peakInstances,integer(runtime?.instancedLive,0,10000));
 report.budgetWarnings=Math.min(report.windows,report.budgetWarnings+(runtime?.budgetOk===false?1:0));
 return report;
}
export function fieldPerformance(input){
 const t=sanitizeFieldTelemetry(input);
 return {seconds:t.seconds,windows:t.windows,
  averageFps:t.seconds?Math.round(t.weightedFps/t.seconds*10)/10:null,
  minimumFps:t.minFps,slowWindows:t.slowWindows,budgetWarnings:t.budgetWarnings,
  peakGeometries:t.peakGeometries,peakDrawCalls:t.peakDrawCalls,peakInstances:t.peakInstances,
  reliable:t.windows>=3&&t.seconds>=12};
}
const median=values=>{
 if(!values.length)return null;
 const sorted=[...values].sort((a,b)=>a-b),middle=Math.floor(sorted.length/2);
 return sorted.length%2?sorted[middle]:Math.round((sorted[middle-1]+sorted[middle])/2);
};
export function observedBalance(history){
 const rows=(Array.isArray(history)?history:[]).slice(-12).filter(r=>r&&typeof r==='object');
 const wins=rows.filter(r=>r.victory===true&&Number.isFinite(r.elapsed)&&r.elapsed>=0);
 const all=rows.filter(r=>Number.isFinite(r.elapsed)&&r.elapsed>=0);
 const byProtocol=['normal','fever','fragile','siege'].map(protocol=>{
  const group=all.filter(r=>r.protocol===protocol);
  return {protocol,runs:group.length,wins:group.filter(r=>r.victory===true).length};
 });
 const medianVictorySeconds=median(wins.map(r=>integer(r.elapsed,0,99999)));
 const inTarget=wins.filter(r=>r.elapsed>=900&&r.elapsed<=1500).length;
 const perf=all.filter(r=>fieldPerformance(r.telemetry).reliable).map(r=>fieldPerformance(r.telemetry));
 return {attempts:all.length,wins:wins.length,winRate:all.length?Math.round(wins.length/all.length*100):null,
  medianVictorySeconds,measuredWins:wins.length,
  targetShare:wins.length?Math.round(inTarget/wins.length*100):null,
  hasSufficientTimingData:wins.length>=3,
  performanceSamples:perf.length,
  medianObservedFps:median(perf.map(p=>p.averageFps)),
  byProtocol};
}
export function buildFieldExport(history,current=null){
 const rows=(Array.isArray(history)?history:[]).slice(-12).filter(r=>r&&typeof r==='object');
 const safeRows=rows.map(r=>({
  elapsed:integer(r.elapsed,0,99999),wave:integer(r.wave,1,5,1),
  victory:r.victory===true,kills:integer(r.kills,0,9999),
  score:integer(r.score,0,99999999),damageTaken:integer(r.damageTaken,0,9999),
  peakCombo:integer(r.peakCombo,0,12),protocol:['normal','fever','fragile','siege'].includes(r.protocol)?r.protocol:'normal',
  stageTimes:Array.isArray(r.stageTimes)?r.stageTimes.slice(0,5).map(n=>integer(n,0,99999)):[],
  telemetry:sanitizeFieldTelemetry(r.telemetry)
 }));
 return {format:'meat-exe-field-report',schema:1,notice:'Local anonymous measurements; no names, addresses, hardware IDs or network telemetry.',
  balance:observedBalance(safeRows),history:safeRows,
  current:current?sanitizeFieldTelemetry(current):null};
}
