// MEAT.EXE v1.9.3 / adaptive quality with hysteresis.
// Windowed measurements are data, not a fake FPS animation.
export function initialAutoQuality(){
 return {lowSamples:0,fastSamples:0,secondsSinceSwitch:100,samples:0,observedFps:null};
}
export function autoQualityWindow(state,current,fps,seconds,conservative=false){
 const s={...state};
 if(!Number.isFinite(fps)||fps<0||!Number.isFinite(seconds)||seconds<2)return {state:s,quality:current};
 s.secondsSinceSwitch=Math.min(1000,s.secondsSinceSwitch+seconds);
 s.samples++;
 s.observedFps=Math.round(fps*10)/10;
 if(conservative){
   s.lowSamples=0;s.fastSamples=0;
   if(current!=='low'){s.secondsSinceSwitch=0;return {state:s,quality:'low'};}
   return {state:s,quality:current};
 }
 if(current==='medium'){
   s.lowSamples=fps<38?s.lowSamples+1:0;s.fastSamples=0;
   if(s.lowSamples>=2&&s.secondsSinceSwitch>=8){
     s.lowSamples=0;s.secondsSinceSwitch=0;return {state:s,quality:'low'};
   }
 }else if(current==='low'){
   // Low mode intentionally paints no faster than 50 FPS. Recovery needs
   // >=46 *presented* frames/s, not the impossible old >=57 threshold.
   s.fastSamples=fps>=46?s.fastSamples+1:0;s.lowSamples=0;
   // A slow PC that manages low at 60 FPS should not oscillate
   // between low at 60 and medium at 35 every eight seconds.
   if(s.fastSamples>=4&&s.secondsSinceSwitch>=32){
     s.fastSamples=0;s.secondsSinceSwitch=0;return {state:s,quality:'medium'};
   }
 }
 return {state:s,quality:current};
}
export function runtimeBudget(stats){
 if(!stats||!Number.isFinite(stats.visibleChunks)||!Number.isFinite(stats.instancedLive))return {ok:false,reason:'missing'};
 if(stats.visibleChunks>9)return {ok:false,reason:'chunks'};
 if(stats.instancedLive<0||stats.instancedLive>420)return {ok:false,reason:'gpu-instances'};
 if(stats.gpuGeometries>320)return {ok:false,reason:'gpu-geometries'};
 if(stats.layoutCache>125||stats.tissueCache>120)return {ok:false,reason:'cache'};
 return {ok:true,reason:'bounded'};
}
