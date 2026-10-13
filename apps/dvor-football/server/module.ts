// DVOR: deterministic small-sided football rules shared by local and authoritative modes.
const FIELD={w:1080,h:620,left:54,right:1026,top:56,bottom:564,goal:104};
const limit=(v,a,b)=>Math.max(a,Math.min(b,v));
const norm=(x,y)=>{const d=Math.hypot(x,y)||1;return {x:x/d,y:y/d};};
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const DEFAULT={name:'Форвард',hair:0,skin:1,kit:0,number:9,stats:{pace:5,shot:5,control:5,pass:5}};
const kits=['#1276aa','#ec754d','#e7bb4e','#70a07b','#9d79bb'];
const skins=['#f2c79e','#d49b77','#9b6449','#6e4436'];
const hairs=['#392e26','#9b5c2c','#22232b','#e3c075'];
function safeProfile(v){
 const raw=v&&typeof v==='object'?v:{},s=raw.stats&&typeof raw.stats==='object'?raw.stats:{};
 const stats={};let remaining=8;
 for(const key of ['pace','shot','control','pass']){
  const wanted=limit(Math.floor(Number(s[key])||3),3,7);
  const value=3+Math.min(wanted-3,remaining);stats[key]=value;remaining-=value-3;
 }
 return {name:String(raw.name||'Форвард').replace(/[<>]/g,'').slice(0,18),hair:limit(Math.floor(Number(raw.hair)||0),0,3),skin:limit(Math.floor(Number(raw.skin)||0),0,3),
  kit:limit(Math.floor(Number(raw.kit)||0),0,4),number:limit(Math.floor(Number(raw.number)||9),1,99),stats};
}
function spawn(side,index){
 const offsets=[-136,-42,58,143];return {x:side?786:294,y:310+offsets[index],vx:0,vy:0,fx:side?-1:1,fy:0,cd:0,stun:0};
}
function newGame(){
 const players=[];
 for(let side=0;side<2;side++)for(let i=0;i<4;i++)players.push({id:side*4+i,side,...spawn(side,i),...safeProfile({name:['МЯЧ','РИКОШЕТ','СМЕЛЫЙ','БОЦМАН'][i],kit:side?1:0,number:7+i,stats:{pace:5,shot:5,control:5,pass:5}})});
 return {phase:'play',remain:300,elapsed:0,score:[0,0],players,controlled:{'0':true},ball:{x:540,y:310,vx:0,vy:0,spin:0},keepers:[{x:82,y:310},{x:998,y:310}],hold:1.0,event:'СТАРТ',eventId:0,tactics:[0,0],revision:0};
}
function resetKickoff(s){
 for(const p of s.players)Object.assign(p,spawn(p.side,p.id%4));
 s.ball={x:540,y:310,vx:0,vy:0,spin:0};s.keepers=[{x:82,y:310},{x:998,y:310}];s.hold=1.25;
}
function kickBall(s,p,kind,angle,power=1){
 if(dist(p,s.ball)>48)return false;
 const b=s.ball,guide=norm(Math.cos(angle),Math.sin(angle));
 let dx=guide.x,dy=guide.y,force=0;
 if(kind==='pass'){
  const mates=s.players.filter(o=>o.side===p.side&&o.id!==p.id);
  let best=null,bestValue=-Infinity;
  for(const m of mates){
   const d=dist(m,p),u=norm(m.x-p.x,m.y-p.y),alignment=u.x*dx+u.y*dy;
   const value=alignment*2-(d/750);
   if(alignment>.05&&value>bestValue){best=m;bestValue=value;}
  }
  if(best){const lead=.25;const u=norm(best.x+best.vx*lead-p.x,best.y+best.vy*lead-p.y);dx=u.x;dy=u.y;}
  force=(280+p.stats.pass*30)*limit(power,.5,1.2);
 }else force=(355+p.stats.shot*43)*limit(power,.35,1.2);
 b.x=p.x+dx*31;b.y=p.y+dy*31;b.vx=dx*force+p.vx*.22;b.vy=dy*force+p.vy*.22;
 b.spin=dy*.22;p.cd=.32;
 return true;
}
function tickGame(s,inputs,dt){
 if(s.phase!=='play')return;
 dt=limit(Number(dt)||0,0,.065);if(dt<=0)return;
 if(s.hold>0){s.hold=Math.max(0,s.hold-dt);return;}
 s.elapsed+=dt;s.remain=Math.max(0,300-s.elapsed);
 if(s.remain===0){s.phase='done';s.event='ФИНАЛ';s.eventId++;return;}
 const b=s.ball;
 // Alternate per-frame priority prevents the left-side AI from winning ties every tick.
 for(const p of (Math.floor(s.elapsed*8)%2?s.players.slice().reverse():s.players)){
  const team=s.players.filter(q=>q.side===p.side);
  const chaser=team.reduce((a,q)=>dist(q,b)<dist(a,b)?q:a,team[0]);
  const ctl=s.controlled[p.id]?inputs?.[p.id]:null;
  let mx=0,my=0;
  if(s.controlled[p.id]){
   mx=limit(Number(ctl?.x)||0,-1,1);my=limit(Number(ctl?.y)||0,-1,1);
  }else{
   const idx=p.id%4,sign=p.side?-1:1,attacking=b.x>(p.side?540:300)&&b.x<(p.side?780:1050);
   const tactic=s.tactics[p.side]||0;
   const target=(p.id===chaser.id)?{x:b.x+(p.side?21:-21),y:b.y}:{x:limit((p.side?774:306)+(attacking?sign*120:0)+tactic*sign*65+(idx-1.5)*24,160,920),y:310+[-150,-55,62,158][idx]+(b.y-310)*.27};
   const u=norm(target.x-p.x,target.y-p.y),mag=Math.hypot(target.x-p.x,target.y-p.y);
   if(mag>13){mx=u.x;my=u.y;}
   p.cd=Math.max(0,p.cd-dt);
   if(p.cd<=0&&dist(p,b)<39){
    const goalX=p.side?FIELD.left:FIELD.right;
    const nearNet=Math.abs(goalX-p.x)<390;
    const action=nearNet?'shot':'pass';
    const aim=nearNet?Math.atan2((310+(p.id%4%2?72:-72)-b.y)*.75,goalX-p.x):Math.atan2((b.y-310)*-.26,goalX-p.x);
    if(kickBall(s,p,action,aim,nearNet?.83:.7))p.cd=nearNet?.72:1.1;
   }
  }
  const dir=norm(mx,my),moving=Math.hypot(mx,my)>.08,pace=115+p.stats.pace*12;
  const blend=Math.min(1,dt*(p.stats.control+7));
  p.vx+=(dir.x*(moving?pace:0)-p.vx)*blend;
  p.vy+=(dir.y*(moving?pace:0)-p.vy)*blend;
  p.x=limit(p.x+p.vx*dt,76,1004);p.y=limit(p.y+p.vy*dt,79,541);
  if(moving){p.fx=dir.x;p.fy=dir.y;}
  p.cd=Math.max(0,p.cd-dt);
  if(ctl?.action&&p.cd<=0){
   const theta=Number.isFinite(Number(ctl.angle))?Number(ctl.angle):Math.atan2(p.fy,p.fx);
   kickBall(s,p,ctl.action==='pass'?'pass':'shot',theta,Number(ctl.power)||1);
   ctl.action=null;
  }
  const d=dist(p,b),min=27;
  if(d<min+7){
   const u=norm(b.x-p.x,b.y-p.y);
   const push=Math.max(0,min-d)*6;
   b.vx+=u.x*push*dt*10+p.vx*(.07+p.stats.control*.012);
   b.vy+=u.y*push*dt*10+p.vy*(.07+p.stats.control*.012);
   b.x=p.x+u.x*Math.max(min,d);b.y=p.y+u.y*Math.max(min,d);
  }
 }
 for(let i=0;i<s.players.length;i++)for(let j=i+1;j<s.players.length;j++){
  const a=s.players[i],c=s.players[j],d=dist(a,c);
  if(d<28&&d>.001){
   const u=norm(c.x-a.x,c.y-a.y),shift=(28-d)*.5;
   a.x-=u.x*shift;a.y-=u.y*shift;c.x+=u.x*shift;c.y+=u.y*shift;
  }
 }
 for(let i=0;i<2;i++){
  const k=s.keepers[i],x=i?998:82;
  k.y+=limit(b.y-k.y,-115*dt,115*dt);k.y=limit(k.y,235,385);
  if(Math.abs(b.x-x)<30&&Math.abs(b.y-k.y)<25){
   const sign=i?-1:1;b.x=x+sign*31;
   b.vx=sign*Math.max(245,Math.abs(b.vx)*.8);b.vy=(b.y-k.y)*6;
   s.event='СЕЙВ!';s.eventId++;
  }
 }
 b.x+=b.vx*dt;b.y+=b.vy*dt;
 b.vy+=b.spin*b.vx*.001*dt;b.spin*=Math.exp(-2*dt);
 const drag=Math.exp(-.94*dt);b.vx*=drag;b.vy*=drag;
 const speed=Math.hypot(b.vx,b.vy);if(speed>840){b.vx*=840/speed;b.vy*=840/speed;}
 if(b.y<FIELD.top+12){b.y=FIELD.top+12;b.vy=Math.abs(b.vy)*.83;}
 if(b.y>FIELD.bottom-12){b.y=FIELD.bottom-12;b.vy=-Math.abs(b.vy)*.83;}
 const insideGoal=Math.abs(b.y-310)<FIELD.goal-12;
 if(b.x<FIELD.left+4||b.x>FIELD.right-4){
  if(insideGoal){
   const scorer=b.x<FIELD.left?1:0;s.score[scorer]++;s.event='ГОЛ!';s.eventId++;resetKickoff(s);
  }else{
   b.x=limit(b.x,FIELD.left+14,FIELD.right-14);b.vx=-b.vx*.83;
  }
 }
 if(Math.hypot(b.vx,b.vy)<3){b.vx=0;b.vy=0;}
}
function advanceGame(s,inputs,dt){
 let left=limit(dt,0,.24);
 while(left>.000001&&s.phase==='play'){const part=Math.min(left,1/50);tickGame(s,inputs,part);left-=part;}
 s.revision++;
}

export const MIN_PLAYERS=2,MAX_PLAYERS=8,RULESET_VERSION=1;
function payloadState(s){return {host:s.host,phase:s.phase,members:s.members,match:s.match,revision:s.revision};}
function events(s){return [{type:'state',payload:payloadState(s)}];}
function note(id,message){return [{type:'notice',to:id,payload:message}];}
function countTeam(m,side){return m.filter(p=>p.side===side).length;}
function assign(m,person,side){
 const used=new Set(m.filter(p=>p.side===side).map(p=>p.slot));
 const slot=[0,1,2,3].find(x=>!used.has(x));
 if(slot===undefined)throw Error('team_full');
 return {id:person.id,name:person.name,side,slot,profile:safeProfile({name:person.name.replace(/^Гость · /,''),kit:side})};
}
function refreshPlayers(s){
 for(const p of s.match.players){
  const owner=s.members.find(m=>m.side===p.side&&m.slot===p.id%4);
  p.name=owner?.name.replace(/^Гость · /,'')||['РЫВОК','ФИНТ','ПАС','ЗВЕЗДА'][p.id%4];
  Object.assign(p,owner?.profile||safeProfile({name:p.name,kit:p.side,number:p.id+7,stats:{pace:5,shot:5,control:5,pass:5}}));
 }
 s.match.controlled={};
 for(const m of s.members)s.match.controlled[m.side*4+m.slot]=true;
}
function start(s){
 s.match=newGame();refreshPlayers(s);s.match.controlled={};
 for(const m of s.members)s.match.controlled[m.side*4+m.slot]=true;
 s.inputs={};s.clock=Date.now();s.phase='play';s.revision++;
}
function advanceServer(s){
 if(s.phase!=='play')return;
 const t=Date.now(),delta=limit((t-s.clock)/1000,0,1800),dt=Math.min(delta,.24);s.clock=t;
 if(delta>dt&&s.match.phase==='play'){
  s.match.elapsed=Math.min(300,s.match.elapsed+delta-dt);
  s.match.remain=Math.max(0,300-s.match.elapsed);
  if(s.match.remain===0){s.match.phase='done';s.match.event='ФИНАЛ';s.match.eventId++;s.phase='done';}
 }
 if(dt>0&&s.match.phase==='play')advanceGame(s.match,s.inputs,dt);
 for(const value of Object.values(s.inputs))if(value)value.action=null;
 if(s.match.phase==='done')s.phase='done';
}
const module={
 protocolVersion:1,
 createRoom({player}){
  const member=assign([],player,0);
  return {state:{host:player.id,phase:'lobby',members:[member],match:newGame(),inputs:{},clock:Date.now(),revision:0}};
 },
 onJoin({state,player,players}){
  if(state.phase!=='lobby')throw Error('match_in_progress');
  if(players.length>MAX_PLAYERS)throw Error('room_full');
  if(!state.members.some(p=>p.id===player.id)){
   const side=countTeam(state.members,0)<=countTeam(state.members,1)?0:1;
   state.members.push(assign(state.members,player,side));
  }
  state.revision++;return {state,events:events(state)};
 },
 onLeave({state,player,players}){
  advanceServer(state);
  const leaving=state.members.find(m=>m.id===player.id);
  state.members=state.members.filter(m=>m.id!==player.id);
  if(state.host===player.id)state.host=players[0]?.id||'';
  if(leaving)delete state.inputs[leaving.side*4+leaving.slot];
  if(state.phase==='play')refreshPlayers(state);
  if(!state.members.length)state.phase='lobby';
  state.revision++;return {state,events:events(state)};
 },
 onMessage({state,player,payload}){
  const v=payload&&typeof payload==='object'&&!Array.isArray(payload)?payload:{};
  const m=state.members.find(item=>item.id===player.id);if(!m)return {state,events:[]};
  if(v.type==='sync')return {state,events:[{type:'state',to:player.id,payload:payloadState(state)}]};
  if(v.type==='profile'&&state.phase==='lobby'){
   m.profile=safeProfile(v.profile);m.profile.name=player.name.replace(/^Гость · /,'').slice(0,18);state.revision++;
   return {state,events:events(state)};
  }
  if(v.type==='team'&&state.phase==='lobby'){
   const side=v.side===1?1:0;
   if(m.side!==side){
    const others=state.members.filter(x=>x.id!==m.id);
    if(countTeam(others,side)>=4)return {state,events:note(player.id,'Эта команда заполнена.')};
    const seat=assign(others,{id:m.id,name:m.name},side);m.side=seat.side;m.slot=seat.slot;m.profile.kit=side;
   }
   state.revision++;return {state,events:events(state)};
  }
  if(v.type==='tactic'&&state.phase==='play'){
   const tactic=Number(v.value);
   if(!Number.isInteger(tactic)||tactic<-1||tactic>1)return {state,events:[]};
   state.match.tactics[m.side]=tactic;state.revision++;
   return {state,events:events(state)};
  }
  if(v.type==='start'&&state.phase!=='play'&&state.host===player.id){
   if(state.members.length<2||!countTeam(state.members,0)||!countTeam(state.members,1))
    return {state,events:note(player.id,'Нужно хотя бы по одному игроку с каждой стороны.')};
   start(state);return {state,events:events(state)};
  }
  if(v.type==='input'&&state.phase==='play'){
   const x=Number(v.x),y=Number(v.y),angle=Number(v.angle),power=Number(v.power);
   if(!Number.isFinite(x)||!Number.isFinite(y)||Math.hypot(x,y)>1.1||!Number.isFinite(angle)||Math.abs(angle)>30||!Number.isFinite(power)||power<.3||power>1.3)return {state,events:[]};
   const slot=m.side*4+m.slot;
   const old=state.inputs[slot]||{};
   state.inputs[slot]={x,y,angle,power,action:v.action==='pass'||v.action==='shot'?v.action:old.action||null};
   advanceServer(state);state.revision++;
   return {state,events:events(state)};
  }
  return {state,events:[]};
 }
};
export default module;
