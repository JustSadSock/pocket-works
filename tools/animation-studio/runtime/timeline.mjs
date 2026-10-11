// Copy into the owning app, or bundle at build time. No global clock or renderer.
const number=(n,min,max)=>typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max;
const name=n=>typeof n==='string'&&/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(n);
export function validateClip(value){
 const c=structuredClone(value);
 if(c.version!==1||!name(c.id)||!number(c.duration,.001,600)||typeof c.loop!=='boolean'||!Array.isArray(c.events)||c.events.length>256||!Array.isArray(c.tracks)||c.tracks.length>64)throw Error('Invalid clip');
 let previous=-1;const ids=new Set();
 for(const e of c.events){if(!name(e.name)||!number(e.time,0,c.duration)||e.time<previous)throw Error('Invalid ordered event');previous=e.time;}
 for(const t of c.tracks){
  if(!name(t.id)||ids.has(t.id)||!['frames','skeletal','value'].includes(t.type))throw Error('Invalid track');ids.add(t.id);
  if(t.type==='frames'){
   if(!Array.isArray(t.frames)||!t.frames.length||t.frames.length>256)throw Error('Invalid frames');
   let end=0;for(const f of t.frames){if(!number(f.duration,.001,600)||!Array.isArray(f.rect)||f.rect.length!==4||f.rect.some(n=>!Number.isInteger(n)||n<0)||!f.rect[2]||!f.rect[3])throw Error('Invalid frame');end+=f.duration;}
   if(Math.abs(end-c.duration)>1e-6)throw Error('Frame duration differs from clip');
  }else if(t.type==='skeletal'){
   if(!name(t.action)||!number(t.fps,1,240)||!number(t.startFrame,0,100000))throw Error('Invalid skeletal binding');
  }else{
   if(!Array.isArray(t.keys)||!t.keys.length||t.keys.length>256)throw Error('Invalid keys');
   let at=-1;for(const k of t.keys){if(!number(k.time,0,c.duration)||k.time<=at||!number(k.value,-1e6,1e6)||!['linear','smooth','hold'].includes(k.ease||'linear'))throw Error('Invalid key');at=k.time;}
  }
 }
 return c;
}
export function sampleClip(clip,time){
 const at=Math.max(0,Math.min(clip.duration,time));
 return Object.fromEntries(clip.tracks.map(t=>{
  if(t.type==='skeletal')return [t.id,{type:t.type,action:t.action,frame:t.startFrame+at*t.fps}];
  if(t.type==='frames'){let end=0,index=t.frames.length-1;for(let i=0;i<t.frames.length;i++){end+=t.frames[i].duration;if(at<end){index=i;break;}}return [t.id,{type:t.type,index,rect:t.frames[index].rect}];}
  let a=t.keys[0],b=a;for(const k of t.keys){if(k.time<=at)a=k;else{b=k;break;}b=a;}
  let u=b===a?0:Math.max(0,Math.min(1,(at-a.time)/(b.time-a.time)));
  if(a.ease==='hold')u=0;else if(a.ease==='smooth')u=u*u*(3-2*u);
  return [t.id,{type:'value',value:a.value+(b.value-a.value)*u}];
 }));
}
export class Timeline{
 constructor({onEvent=()=>{},onCancel=()=>{}}={}){this.onEvent=onEvent;this.onCancel=onCancel;this.state=null;this.previous=null;this.paused=false;this.speed=1;this.generation=0;this.droppedTime=0;}
 play(value,{fade=.12}={}){
  const clip=validateClip(value);if(!number(fade,0,2))throw Error('Invalid fade');
  const old=this.state;
  this.cancel('replace');this.previous=old&&fade>0?{clip:old.clip,time:old.time,left:fade,duration:fade}:null;
  this.state={clip,time:0,cycle:0,completed:false};this.paused=false;
  const token=this.generation;for(const e of clip.events.filter(e=>e.time===0)){if(token!==this.generation)break;this.onEvent({...e,clip:clip.id,cycle:0,generation:token});}
  return this.snapshot();
 }
 cancel(reason='cancel'){
  const old=this.state;this.state=null;this.previous=null;this.generation++;
  if(old)this.onCancel({clip:old.clip.id,generation:this.generation-1,reason});
 }
 pause(){this.paused=true;}
 resume(){this.paused=false;}
 setSpeed(value){if(!number(value,.05,4))throw Error('Invalid speed');this.speed=value;}
 seek(time){if(!this.state||!number(time,0,this.state.clip.duration))throw Error('Invalid seek');this.state.time=time;this.state.completed=false;this.previous=null;return this.snapshot();}
 advance(seconds){
  if(!number(seconds,0,86400))throw Error('Invalid elapsed time');
  if(this.paused||!this.state||this.state.completed)return this.snapshot();
  // Discard suspension debt: never deliver minutes of stale footsteps/impacts.
  this.droppedTime+=Math.max(0,seconds-.25);let remaining=Math.min(seconds,.25)*this.speed;
  if(this.previous){this.previous.left=Math.max(0,this.previous.left-remaining);if(!this.previous.left)this.previous=null;}
  const token=this.generation,s=this.state,c=s.clip;
  while(remaining>1e-10&&token===this.generation){
   const end=Math.min(c.duration,s.time+remaining),used=end-s.time;
   for(const e of c.events){if(token!==this.generation)break;if(e.time>s.time&&e.time<=end)this.onEvent({...e,clip:c.id,cycle:s.cycle,generation:token});}
   if(token!==this.generation)break;s.time=end;remaining-=used;
   if(end>=c.duration){if(!c.loop){s.completed=true;break;}s.time=0;s.cycle++;for(const e of c.events.filter(e=>e.time===0)){if(token!==this.generation)break;this.onEvent({...e,clip:c.id,cycle:s.cycle,generation:token});}}
  }
  return this.snapshot();
 }
 snapshot(){
  if(!this.state)return null;const s=this.state,current=sampleClip(s.clip,s.time);
  const weight=this.previous?1-this.previous.left/this.previous.duration:1;
  const outgoing=this.previous?sampleClip(this.previous.clip,this.previous.time):null;
  const values={};for(const [id,v] of Object.entries(current))if(v.type==='value'){const old=outgoing?.[id];values[id]=old?.type==='value'?old.value*(1-weight)+v.value*weight:v.value;}
  return {clip:s.clip.id,time:s.time,cycle:s.cycle,completed:s.completed,tracks:current,outgoing,weight,values,generation:this.generation};
 }
}
