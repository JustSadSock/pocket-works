// Staged adapter for Banners of War's Living Battlefield research contract.
// No built-in assets, no game branch mutation, no implicit AudioContext creation.
import {createBudgetedAudioScene} from '../../../shared/capabilities/virtual-audio.js';
const kinds=new Set(['step','hoof','armor','contact','volley','signal','retreat']);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const finite=(v,fallback=0)=>Number.isFinite(v)?v:fallback;
export function deriveBattleMusic({F,s,cam,audible}){
 let contacts=0,opponents=0,moving=0,units=0;
 for(const u of s.units){
  if(!audible(F,s,u))continue;
  const distance=Math.hypot(u.x-cam.x,u.y-cam.y);
  if(distance>540)continue;
  units++;
  if(u.side!==0)opponents++;
  if(Math.abs(finite(u.v))>.18)moving++;
  contacts+=Math.max(0,finite(u.contact));
 }
 return {battle:contacts>0,tension:opponents>0,intensity:clamp(.12+Math.min(.7,contacts*.07)+Math.min(.18,opponents*.03)+Math.min(.12,moving*.015),0,1),units};
}
export function createBannersAudioAdapter({context,destination=context?.destination,F,soundEvents,audible,assets,settings={},budget={total:24,events:12,music:4},fetcher,createScene=createBudgetedAudioScene}={}){
 if(!context||!F||typeof soundEvents!=='function'||typeof audible!=='function'||typeof F.sample!=='function'||typeof F.riverX!=='function')throw Error('Missing battlefield audio contract');
 // Approval is an explicit caller assertion, not an automated artistic review.
 if(!assets||assets.approved!==true)throw Error('Approved audio asset configuration required');
 const families=assets.families??{},ambient=assets.ambient??{},score=assets.score;
 for(const id of Object.keys(families))if(!kinds.has(id)&&!/^((step|hoof|armor|contact|volley|signal|retreat):[0-3])$/.test(id))throw Error('Unknown battlefield family '+id);
 for(const id of Object.keys(ambient))if(!['wind','water','forest'].includes(id))throw Error('Unknown battlefield ambience '+id);
 if(score&&(!['peace','tension','battle','aftermath'].every(id=>Object.hasOwn(score.graph?.states??{},id))||score.graph.initial!=='peace'))throw Error('Invalid battlefield score states');
 const scene=createScene({context,destination,budget,families,score,stingers:assets.stingers,fetcher});
 const preferences={muted:!!settings.muted,fx:clamp(finite(settings.fx,.65),0,1),ambient:clamp(finite(settings.ambient,.4),0,1),music:clamp(finite(settings.music,.55),0,1)};
 let prior=new Map(),latestAudible=new Set(),last=null,epoch=0,closed=false,enabled=false,busy=false,visible=true,playingNow=false,aftermathUntil=-Infinity,battleSeen=false,result=null,resultPlayed=false,desired='peace',intensity=0;
 const counts=Object.create(null);
 function volumes(){
  const gate=visible&&!preferences.muted?1:0;
  scene.mixer.setBusVolume('events',gate*preferences.fx);
  scene.mixer.setBusVolume('world',gate*preferences.ambient);
  scene.mixer.setBusVolume('music',gate*preferences.music);
 }
 function resetEvents(){epoch++;prior.clear();latestAudible.clear();last=null;scene.events.stopAll();}
 function resetMusic(){battleSeen=false;aftermathUntil=-Infinity;result=null;resultPlayed=false;desired='peace';intensity=0;scene.music?.stop();}
 function updateMusic(observation,t,outcome){
  const music=scene.music;
  if(!music)return;
  music.update();
  if(outcome&&result===null){
   result=outcome;aftermathUntil=t+6;
   // Public outcomes are caller events, never inferred from hidden unit losses.
  }
  if(observation.battle){battleSeen=true;aftermathUntil=t+6;}
  else if(battleSeen&&t>=aftermathUntil)battleSeen=false;
  const next=result!==null?'aftermath':observation.battle?'battle':battleSeen?'aftermath':observation.tension?'tension':'peace';
  desired=next;
  const state=music.state;
  if(!state.pending&&state.current&&state.current!==next){
   const edges=score.graph.edges[state.current]??[];
   // A battle must pass through its authored aftermath before returning to peace.
   const target=edges.includes(next)?next:edges.includes('aftermath')?'aftermath':null;
   if(target)music.request(target,{quantize:'beat',fadeSeconds:.3});
  }
  if(result&&!resultPlayed&&!preferences.muted&&!state.pending&&state.current==='aftermath'&&context.currentTime>=(state.bridgeUntil??0)&&Object.hasOwn(assets.stingers??{},result)){
   resultPlayed=true;void scene.playStinger(result);
  }
  const target=result!==null?.2:observation.intensity;
  if(Math.abs(target-intensity)>=.08){intensity=target;music.setIntensity(target,{quantize:'beat',fadeSeconds:.3});}
 }
 return {
  async unlock(){
   if(closed)return false;
   if(context.state==='suspended'||context.state==='interrupted')await context.resume();
   if(closed||context.state!=='running')return false;
   enabled=true;volumes();
   if(scene.music&&!scene.music.state.current)await scene.music.start();
   return !closed;
  },
  configure(next={}){
   if(closed)return;
   if('muted'in next)preferences.muted=!!next.muted;
   for(const k of ['fx','ambient','music'])if(k in next)preferences[k]=clamp(finite(next[k],preferences[k]),0,1);
   if(preferences.muted)resetEvents();
   volumes();
  },
  reset(){if(closed)return;resetEvents();resetMusic();},
  async update(s,cam,{active=true,playing=false,speed=1,outcome}={}){
   if(closed||!enabled||busy)return false;
   if(!s||!Array.isArray(s.units)||!Number.isFinite(s.time)||!cam||!Number.isFinite(cam.x)||!Number.isFinite(cam.y)||!Number.isFinite(speed)||speed<=0||speed>100||outcome!==undefined&&!['victory','defeat'].includes(outcome))throw Error('Invalid battlefield snapshot');
   busy=true;
   try{
    const t=s.time,dt=last===null?0:t-last;
    if(dt<0||dt>Math.max(1.5,speed*.7)){resetEvents();resetMusic();}
    if(visible!==!!active){visible=!!active;volumes();}
    if(playingNow&&!playing||!active)resetEvents();
    playingNow=!!playing;
    const q=F.sample(s.terrain,clamp(cam.x,0,F.W),clamp(cam.y,0,F.H));
    const river=s.terrain.hasRiver===false?Infinity:Math.abs(cam.x-F.riverX(s.terrain,cam.y));
    const levels={wind:.21,water:clamp(1-river/160,0,1)*.32,forest:clamp(finite(q.canopy),0,1)*.36};
    const tickEpoch=epoch;
    await scene.world.reconcile({listener:{x:0,y:0},sources:active?Object.entries(ambient).map(([id,buffer])=>({id,buffer,position:{x:0,y:0},volume:levels[id]})):[]});
    if(closed||tickEpoch!==epoch)return false;
    if(!active||!playing){
     last=null;scene.music?.update();
     // The simulation normally stops when a public battle result appears.
     // Keep the outcome transition/stinger alive while the result screen is visible.
     if(active&&(outcome||result!==null))updateMusic(deriveBattleMusic({F,s,cam,audible}),t,outcome);
     return true;
    }
    if(scene.music&&!scene.music.state.current)await scene.music.start();
    if(closed||tickEpoch!==epoch)return false;
    const elapsed=last===null?0:t-last;
    latestAudible=new Set(s.units.filter(u=>audible(F,s,u)).map(u=>u.id));
    if(last===null||elapsed>0){
     const snapshot=soundEvents(F,s,cam,prior,elapsed);prior=snapshot.next;
     const token=epoch;
     if(elapsed>0&&!preferences.muted){
      for(const e of snapshot.events.slice(0,8)){
       if(!kinds.has(e.kind)||!latestAudible.has(e.id))continue;
       const variant=e.kind+':'+e.variant,key=Object.hasOwn(families,variant)?variant:e.kind;
       if(!Object.hasOwn(families,key))continue;
       void scene.events.play(key,{gain:clamp(finite(e.gain)/Math.sqrt(Math.max(1,speed)),0,1),pan:clamp(finite(e.pan),-1,1),rate:Math.min(1.6,Math.sqrt(speed)),priority:e.kind==='volley'||e.kind==='signal'?3:1,canStart:()=>!closed&&token===epoch&&visible&&!preferences.muted&&latestAudible.has(e.id)}).then(ok=>{if(ok&&token===epoch)counts[e.kind]=(counts[e.kind]??0)+1;},()=>{});
      }
     }
    }
    if(closed)return false;
    last=t;
    updateMusic(deriveBattleMusic({F,s,cam,audible}),t,outcome);
    return true;
   }finally{busy=false;}
  },
  destroy(){if(closed)return;closed=true;epoch++;scene.destroy();prior.clear();},
  status(){return {enabled:enabled&&!closed,settings:{...preferences},counts:{...counts},desired,intensity,busy,scene:scene.stats,music:scene.music?.state??null}}
 };
}
