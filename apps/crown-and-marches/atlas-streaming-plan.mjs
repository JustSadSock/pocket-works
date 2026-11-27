// Exact camera/receipt semantics are independent of speculative preparation.
import {covers,regionKey} from './atlas-surface-requests.mjs';
export function samePreparationKnowledge(job,current){return !!current&&job.intent===current.intent&&job.knowledge===current.knowledge;}
export function eligibleTerrain(job,terrain,current){return samePreparationKnowledge(job,current)&&job.revision===current.revision&&covers(terrain.bounds,current.visible)&&terrain.detail===current.detail&&terrain.stats?.contours?.detail===current.contourDetail;}
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const area=b=>Math.max(0,b[2]-b[0])*Math.max(0,b[3]-b[1]);
export function streamBounds(visible,world,quantum,margin,dx=0,dy=0){
 return [Math.max(0,Math.floor((visible[0]-margin+Math.min(0,dx))/quantum)*quantum),Math.max(0,Math.floor((visible[1]-margin+Math.min(0,dy))/quantum)*quantum),Math.min(world[0],Math.ceil((visible[2]+margin+Math.max(0,dx))/quantum)*quantum),Math.min(world[1],Math.ceil((visible[3]+margin+Math.max(0,dy))/quantum)*quantum)];
}
export function chooseStreamJob(current,active,previous,{world,quantum,margin,identity,cacheLimit=64*1024*1024}){
 const {visible,view}=current,usable=active?.revision===current.revision&&covers(active.bounds,visible);
 const dx=previous?clamp((view.x-previous.x)*8,-quantum*2,quantum*2):0,dy=previous?clamp((view.y-previous.y)*8,-quantum*2,quantum*2):0,ratio=previous?.s>0?view.s/previous.s:1;
 const moving=Math.abs(dx)+Math.abs(dy)>.01,zooming=Math.abs(ratio-1)>.0001;
 const bounded=(bounds,detail)=>area(bounds)>0&&(bounds[2]-bounds[0])*detail+1<=4096&&(bounds[3]-bounds[1])*detail+1<=4096&&((bounds[2]-bounds[0])*detail+1)*((bounds[3]-bounds[1])*detail+1)*112<=cacheLimit/2;
 const predicted=streamBounds(visible,world,quantum,margin,dx,dy);
 // Demand wins. A modest directional reserve is admitted only if bounded.
 if(!usable){const bounds=bounded(predicted,current.detail)?predicted:current.bounds;return {...current,bounds,reason:'demand'};}
 if(zooming){
  const target=view.s*Math.pow(ratio,8),threshold=identity?58:32,detail=target<9?2:8,contourDetail=target<9?2:target>=threshold?16:8;
  if(detail!==current.detail||contourDetail!==current.contourDetail){
   const factor=view.s/target,forecast=[clamp(Math.floor(view.x+(visible[0]-view.x)*factor),0,world[0]),clamp(Math.floor(view.y+(visible[1]-view.y)*factor),0,world[1]),clamp(Math.ceil(view.x+(visible[2]-view.x)*factor),0,world[0]),clamp(Math.ceil(view.y+(visible[3]-view.y)*factor),0,world[1])];
   const envelope=[Math.min(visible[0],forecast[0]),Math.min(visible[1],forecast[1]),Math.max(visible[2],forecast[2]),Math.max(visible[3],forecast[3])],bounds=streamBounds(envelope,world,quantum,margin,dx,dy);
   if(bounded(bounds,detail))return {...current,detail,contourDetail,revision:[current.knowledge,detail,contourDetail].join(':'),bounds,reason:'scale-prefetch'};
  }
 }
 if(moving&&!covers(active.bounds,predicted)&&bounded(predicted,current.detail)&&area(predicted)<=area(current.bounds)*2)return {...current,bounds:predicted,reason:'region-prefetch'};
 return null;
}
export function findCoveringTerrain(cache,current){
 for(const [key,item] of cache.items){if(!key.startsWith(current.revision+'|'))continue;const t=item.value;if(covers(t.bounds,current.visible)&&t.detail===current.detail&&t.stats?.contours?.detail===current.contourDetail)return {key,terrain:cache.get(key)};}
 return null;
}
