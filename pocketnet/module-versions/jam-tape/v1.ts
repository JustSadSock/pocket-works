// ЛЕНТА / authoritative PocketNet loop studio.
export const MAX_PLAYERS=4;
const INST=['keys','bass','drums','lead','bell'];
const AVATARS=['clay','moss','ink','sun','wave','ember','plum','stone'];
const validClip=c=>c&&typeof c.id==='string'&&c.id.length>0&&c.id.length<43&&INST.includes(c.inst)&&Number.isInteger(c.a)&&Number.isInteger(c.b)&&c.a>=0&&c.b<=64&&c.b>c.a&&Array.isArray(c.notes)&&c.notes.length<=96&&c.notes.every(n=>Array.isArray(n)&&n.length===4&&n.every(Number.isInteger)&&n[0]>=0&&n[0]<64&&n[1]>=0&&n[1]<8&&n[2]>=1&&n[2]<=16&&n[3]>=10&&n[3]<=100);
const clip=c=>({id:c.id,inst:c.inst,a:c.a,b:c.b,notes:c.notes.map(n=>n.slice())});
const player=(p,avatar,inst)=>({id:p.id,name:String(p.name||'Музыкант').slice(0,24),avatar:AVATARS.includes(avatar)?avatar:null,inst:INST.includes(inst)?inst:'keys',air:true,online:true});
const stateEvents=s=>[{type:'state',payload:s}];
const warn=(id,msg)=>[{type:'notice',to:id,payload:msg}];
function edit(s,id,a){
 const p=s.players.find(x=>x.id===id),track=s.tracks[id];
 if(!p||!track||!a||typeof a!=='object')return false;
 if(a.kind==='inst'){if(!INST.includes(a.inst))return false;p.inst=a.inst;}
 else if(a.kind==='air'){if(typeof a.air!=='boolean')return false;p.air=a.air;}
 else if(a.kind==='clip-add'){
  if(track.length>=6||!validClip(a.clip)||!a.clip.notes.length||track.some(c=>c.id===a.clip.id))return false;
  track.push(clip(a.clip));
 }else if(a.kind==='clip-update'){
  const c=track.find(x=>x.id===a.id);
  if(!c||!validClip(a.clip)||a.clip.id!==a.id||!a.clip.notes.length)return false;
  Object.assign(c,clip(a.clip));
 }else if(a.kind==='clip-trim'){
  const c=track.find(x=>x.id===a.id);
  if(!c||!Number.isInteger(a.a)||!Number.isInteger(a.b)||a.a<0||a.b>64||a.b<=a.a)return false;
  c.a=a.a;c.b=a.b;
 }else if(a.kind==='clip-delete'){
  const i=track.findIndex(x=>x.id===a.id);if(i<0)return false;track.splice(i,1);
 }else if(a.kind==='transport'){
  if(typeof a.playing!=='boolean')return false;
  if(a.playing&&!s.playing)s.anchor=Date.now()+250;
  s.playing=a.playing;
 }else if(a.kind==='tempo'){
  if(id!==s.host||!Number.isInteger(a.bpm)||a.bpm<60||a.bpm>180)return false;
  if(s.playing)s.anchor=Date.now()-(Date.now()-s.anchor)*s.bpm/a.bpm;
  s.bpm=a.bpm;
 }else if(a.kind==='reset'){
  if(id!==s.host)return false;
  for(const person of s.players)s.tracks[person.id]=[];
  s.playing=false;s.anchor=0;
 }else return false;
 s.rev++;return true;
}
const module={
 protocolVersion:1,
 createRoom({player:p,payload}){
  const own=player(p,payload?.avatar,payload?.inst);
  const initial=(Array.isArray(payload?.clips)?payload.clips:[]).slice(0,6).filter(validClip).filter(c=>c.notes.length).map(clip);
  const unique=initial.filter((c,i)=>initial.findIndex(x=>x.id===c.id)===i);
  return {state:{phase:'lobby',host:p.id,bpm:Number.isInteger(payload?.bpm)&&payload.bpm>=60&&payload.bpm<=180?payload.bpm:108,playing:false,anchor:0,players:[own],tracks:{[p.id]:unique},rev:1}};
 },
 onJoin({state:s,player:p,players}){
  let found=s.players.find(x=>x.id===p.id);
  if(found){found.online=true;found.name=String(p.name||'Музыкант').slice(0,24);}
  else{
   if(players.length>MAX_PLAYERS)throw Error('room_full');
   if(s.players.length>=MAX_PLAYERS){
    const i=s.players.findIndex(x=>!x.online&&!players.some(a=>a.id===x.id));
    if(i<0)throw Error('room_full');
    const [removed]=s.players.splice(i,1);delete s.tracks[removed.id];
   }
   s.players.push(player(p));s.tracks[p.id]=[];
  }
  s.rev++;return {state:s,events:stateEvents(s)};
 },
 onLeave({state:s,players}){
  const active=new Set(players.map(p=>p.id));
  s.players.forEach(p=>{p.online=active.has(p.id)});
  if(!active.has(s.host))s.host=players[0]?.id||'';
  if(!players.length)s.playing=false;
  s.rev++;return {state:s,events:stateEvents(s)};
 },
 onMessage({state:s,player:p,payload:v}){
  if(!v||typeof v!=='object')return {state:s,events:[]};
  if(v.type==='sync')return {state:s,events:[{type:'state',to:p.id,payload:s}]};
  if(v.type==='clock-probe'&&Number.isFinite(v.t))return {state:s,events:[{type:'clock-reply',to:p.id,payload:{t:v.t,server:Date.now()}}]};
  if(v.type==='profile'){
   const own=s.players.find(x=>x.id===p.id);
   if(own){own.avatar=AVATARS.includes(v.avatar)?v.avatar:null;if(INST.includes(v.inst))own.inst=v.inst;s.rev++;return {state:s,events:stateEvents(s)};}
  }
  if(v.type==='edit')return edit(s,p.id,v.action)?{state:s,events:stateEvents(s)}:{state:s,events:warn(p.id,'Действие недоступно или дорожка заполнена.')};
  if(v.type==='live-on'||v.type==='live-off'){
   const own=s.players.find(x=>x.id===p.id),d=v.data;
   if(!own?.air||!d||typeof d.uid!=='string'||d.uid.length>63)return {state:s,events:[]};
   if(v.type==='live-on'&&(!INST.includes(d.inst)||!Number.isInteger(d.pitch)||d.pitch<0||d.pitch>7))return {state:s,events:[]};
   return {state:s,events:s.players.filter(x=>x.id!==p.id&&x.online).map(x=>({type:v.type,to:x.id,payload:{owner:p.id,uid:d.uid,inst:d.inst,pitch:d.pitch,vel:Math.max(10,Math.min(100,Number(d.vel)||85))}}))};
  }
  return {state:s,events:[]};
 }
};
export default module;
