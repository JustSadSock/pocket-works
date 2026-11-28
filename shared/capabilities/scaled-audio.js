// Opt-in spatial planning layer, not another audio engine. Outputs existing world emitters.
import {spatialProfile} from './spatial-audio.js';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const smooth=x=>{x=clamp(x,0,1);return x*x*(3-2*x)};
const finite=(n,label)=>{if(typeof n!=='number'||!Number.isFinite(n))throw Error('Invalid '+label);return n};
const str=(x,label)=>{if(typeof x!=='string'||!x||x.length>80||!/^[a-zA-Z0-9_.-]+$/.test(x))throw Error('Invalid '+label);return x};
// Logical inputs are settlements, regions, formations or personal emitters, never individual soldiers.
// Region IDs and asset keys are stable authored identities independent of camera movement.
export function planScaledAudio({listener,zoom,entities,buffers,maxEmitters=8,referenceDistance=12,maxDistance=120}={}){
  if(!Array.isArray(entities)||entities.length>16384||!Number.isInteger(maxEmitters)||maxEmitters<1||maxEmitters>64)throw Error('Invalid scaled scene budget');
  finite(listener?.x,'listener x');finite(listener?.y,'listener y');finite(zoom,'zoom');if(zoom<0||zoom>1)throw Error('Invalid zoom');
  const detail=smooth((zoom-.22)/.56),broad=1-detail,regions=new Map(),local=[],seen=new Set();
  const ordered=[...entities].sort((a,b)=>String(a.id).localeCompare(String(b.id),'en'));
  const weight=e=>Math.sqrt(clamp(e.activity,0,1))*Math.min(1,Math.log1p(e.density)/Math.log(101));
  for(const e of ordered){
    const id=str(e.id,'id'),region=str(e.region,'region'),family=str(e.family,'family'),detailAsset=str(e.detailAsset,'detail asset'),regionalAsset=str(e.regionalAsset,'regional asset');
    if(seen.has(id))throw Error('Duplicate logical source');seen.add(id);
    finite(e.x,'x');finite(e.y,'y');finite(e.activity,'activity');finite(e.density,'density');
    if(e.activity<0||e.activity>1||e.density<0)throw Error('Invalid activity/density');
    const priority=finite(e.priority??1,'priority');if(priority<0||priority>10)throw Error('Invalid priority');
    const w=weight(e);if(!w||!priority)continue;
    const k=region+':'+family+':'+regionalAsset;const r=regions.get(k)??{x:0,y:0,power:0,priority:0,asset:regionalAsset,key:k};
    r.x+=e.x*w*w;r.y+=e.y*w*w;r.power+=w*w;r.priority=Math.max(r.priority,priority);regions.set(k,r);
    local.push({id:'detail:'+id,asset:detailAsset,position:{x:e.x,y:e.y},volume:w*Math.sqrt(detail),priority,occlusion:e.occlusion??0,referenceDistance,maxDistance});
  }
  const regional=[...regions.values()].map(r=>({id:'region:'+r.key,asset:r.asset,position:{x:r.x/r.power,y:r.y/r.power},volume:Math.min(1,Math.sqrt(r.power))*Math.sqrt(broad),priority:r.priority,occlusion:0,referenceDistance:referenceDistance*2,maxDistance:maxDistance*2}));
  const candidates=[...local,...regional].filter(e=>e.volume>.001).map(e=>{
    const buffer=buffers[e.asset];if(!buffer)throw Error('Missing scale asset '+e.asset);
    const spatial={source:e.position,listener,referenceDistance:e.referenceDistance,maxDistance:e.maxDistance,occlusion:e.occlusion};
    return {...e,buffer,score:e.volume*e.priority*spatialProfile(spatial).gain};
  });
  candidates.sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id,'en'));
  return {zoom,detail,broad,logical:entities.length,regionalGroups:regions.size,candidates:candidates.length,sources:candidates.slice(0,maxEmitters).map(({score,asset,...e})=>e)};
}
export function createScaledAudioPlanner({smoothingSeconds=.35,...options}={}){
  if(!Number.isFinite(smoothingSeconds)||smoothingSeconds<=0||smoothingSeconds>5)throw Error('Invalid LOD smoothing');
  let previous=null;
  return {plan({zoom,deltaSeconds,...input}){finite(deltaSeconds,'elapsed seconds');finite(zoom,'zoom');if(deltaSeconds<0||zoom<0||zoom>1)throw Error('Invalid scale input');const z=previous===null?zoom:previous+(zoom-previous)*(1-Math.exp(-deltaSeconds/smoothingSeconds));const result=planScaledAudio({...options,...input,zoom:z});previous=z;return result},reset(){previous=null}};
}
