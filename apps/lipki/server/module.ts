
const W=1180,H=660,GROUND=566,R=24;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const LEVELS=[
 {name:'ПЕРВЫЙ СТЕЖОК',hint:'Прыгайте через разрыв',gaps:[[350,475]],blocks:[{x:218,y:455,w:132,h:19}]},
 {name:'НА ВЫСОТЕ',hint:'Липните к стенам',gaps:[[375,528]],blocks:[{x:290,y:433,w:105,h:18},{x:607,y:455,w:154,h:18}]},
 {name:'КОМУ ТЯЖЕЛО',hint:'Шар открывает дверь',balls:[{x:300,y:520}],pads:[655],gate:915,blocks:[]},
 {name:'КАТУШЕЧНЫЙ ПЕРЕХОД',hint:'Пользуйтесь пружиной',gaps:[[450,622]],springs:[{x:382,y:553}],blocks:[{x:490,y:440,w:122,h:18}]},
 {name:'ДВА ПАЛЬЦА',hint:'Удерживайте две кнопки',balls:[{x:340,y:520}],pads:[575,720],gate:930,blocks:[{x:365,y:459,w:112,h:18}]},
 {name:'МЯГКИЙ ОБРЫВ',hint:'Прилипнуть — значит спастись',gaps:[[260,412],[665,797]],blocks:[{x:325,y:461,w:86,h:18},{x:605,y:408,w:100,h:18}]},
 {name:'КАТАПУЛЬТА',hint:'Пружина бросает выше',springs:[{x:310,y:553}],blocks:[{x:425,y:450,w:270,h:24},{x:742,y:418,w:120,h:18}]},
 {name:'КРУГОВАЯ ПОРУКА',hint:'Прилипните друг к другу',gaps:[[440,596]],balls:[{x:300,y:520}],blocks:[{x:488,y:464,w:93,h:18}]},
 {name:'ПУГОВИЧНАЯ ДВЕРЬ',hint:'Толкайте и держите',balls:[{x:270,y:520}],pads:[775],gate:952,springs:[{x:540,y:553}],blocks:[]},
 {name:'ДВА БЕРЕГА',hint:'Найди точку опоры',gaps:[[338,503],[708,858]],springs:[{x:275,y:553}],blocks:[{x:370,y:450,w:105,h:18},{x:770,y:441,w:96,h:18}]},
 {name:'ДВОЙНАЯ ЗАДВИЖКА',hint:'Две кнопки одновременно',balls:[{x:300,y:520},{x:455,y:520}],pads:[705,815],gate:979,blocks:[{x:530,y:446,w:105,h:18}]},
 {name:'ПОСЛЕДНИЙ УЗОР',hint:'Все должны добраться',gaps:[[338,498],[682,843]],balls:[{x:290,y:520}],pads:[905],gate:1018,springs:[{x:580,y:553}],blocks:[{x:379,y:451,w:105,h:18},{x:730,y:445,w:105,h:18}]}
];
const COLORS=['#ef876e','#64b8ad','#e8bb59','#a28bcb'];
function terrain(w){
 const def=LEVELS[w.level]||LEVELS[0], solids=[];
 let start=0;
 for(const [a,b] of def.gaps||[]){
  if(a>start)solids.push({x:start,y:GROUND,w:a-start,h:H-GROUND+100,type:'floor'});
  start=b;
 }
 if(start<W)solids.push({x:start,y:GROUND,w:W-start,h:H-GROUND+100,type:'floor'});
 for(const b of def.blocks||[])solids.push({...b,type:'block'});
 const padActive=(def.pads||[]).map(x=>w.players.some(p=>Math.abs(p.x-x)<36&&Math.abs(p.y+R-GROUND)<34)||
 w.balls.some(b=>Math.abs(b.x-x)<40&&Math.abs(b.y+b.r-GROUND)<37));
 if(def.gate&&!padActive.every(Boolean))solids.push({x:def.gate,y:363,w:32,h:GROUND-363,type:'gate'});
 return {solids,padActive,def};
}
function makeWorld(ids=['solo'],lev=0){
 const level=clamp(Math.floor(lev)||0,0,LEVELS.length-1),def=LEVELS[level];
 return {level,phase:'play',time:0,revision:0,players:ids.map((id,i)=>({id,x:92+i*52,y:GROUND-R-2,vx:0,vy:0,grounded:true,coyote:.105,jumpHeld:false,grabHeld:false,grab:null,face:1,squash:0})),
 balls:(def.balls||[]).map((b,i)=>({id:'b'+i,x:b.x,y:b.y,vx:0,vy:0,r:28})),pads:[],exit:{x:1114,y:GROUND-R-2},particles:0};
}
function rectHit(b,box){
 const nx=clamp(b.x,box.x,box.x+box.w),ny=clamp(b.y,box.y,box.y+box.h),dx=b.x-nx,dy=b.y-ny,d=Math.hypot(dx,dy);
 if(d>=b.r)return null;
 if(d>0.0001)return {nx:dx/d,ny:dy/d,depth:b.r-d};
 const dl=b.x-box.x,dr=box.x+box.w-b.x,dt=b.y-box.y,db=box.y+box.h-b.y;
 const m=Math.min(dl,dr,dt,db);
 if(m===dt)return {nx:0,ny:-1,depth:b.r+dt};
 if(m===db)return {nx:0,ny:1,depth:b.r+db};
 if(m===dl)return {nx:-1,ny:0,depth:b.r+dl};
 return {nx:1,ny:0,depth:b.r+dr};
}
function findGrab(w,p,solids){
 let best=null,dist=62;
 for(const o of w.players){
  if(o===p)continue;
  const d=Math.hypot(p.x-o.x,p.y-o.y);
  if(d<dist){dist=d;best={kind:'player',id:o.id,dx:p.x-o.x,dy:p.y-o.y};}
 }
 for(const o of w.balls){
  const d=Math.hypot(p.x-o.x,p.y-o.y);
  if(d<dist){dist=d;best={kind:'ball',id:o.id,dx:p.x-o.x,dy:p.y-o.y};}
 }
 for(const rect of solids){
  if(rect.type==='floor')continue;
  const x=clamp(p.x,rect.x,rect.x+rect.w),y=clamp(p.y,rect.y,rect.y+rect.h),d=Math.hypot(x-p.x,y-p.y);
  if(d<dist){dist=d;best={kind:'wall',x:p.x,y:p.y};}
 }
 return best;
}
function solveCircle(b,solids,dt){
 b.grounded=false;
 for(const box of solids){
  const h=rectHit(b,box);if(!h)continue;
  b.x+=h.nx*(h.depth+.01);b.y+=h.ny*(h.depth+.01);
  const v=b.vx*h.nx+b.vy*h.ny;
  if(v<0){b.vx-=h.nx*v*(b.r===R?1:1.24);b.vy-=h.ny*v*(b.r===R?1:1.24);}
  if(h.ny<-.5){b.grounded=true;if(Math.abs(b.vy)<60)b.vy=0;}
 }
}
function simulateOne(w,dt,inputs){
 if(w.phase!=='play')return;
 const {solids,padActive,def}=terrain(w);
 w.pads=padActive;
 for(const p of w.players){
  const input=inputs[p.id]||{},dx=clamp(Number(input.x)||0,-1,1),jump=!!input.jump,grab=!!input.grab;
  const attached=p.grab&&(p.grab.kind==='wall'||w.players.some(a=>a.id===p.grab.id)||w.balls.some(a=>a.id===p.grab.id));
  if(grab&&!p.grabHeld){if(attached){p.grab=null}else p.grab=findGrab(w,p,solids);}
  p.grabHeld=grab;
  if(p.grab?.kind==='wall'){
   p.vx*=.45;p.vy*=.45;p.x+=(p.grab.x-p.x)*.72;p.y+=(p.grab.y-p.y)*.72;
  }else{
   const desired=dx*252;
   p.vx+=(desired-p.vx)*Math.min(1,dt*(p.grounded?16:7));
   p.vy+=1280*dt;
  }
  p.coyote=p.grounded?.105:Math.max(0,p.coyote-dt);
  if(jump&&!p.jumpHeld&&(p.coyote>0||p.grab)){
   p.vy=-525;p.vx+=dx*72;p.grab=null;p.coyote=0;p.grounded=false;p.squash=1;
  }
  p.jumpHeld=jump;
  if(dx) p.face=dx>0?1:-1;
  p.x+=p.vx*dt;p.y+=p.vy*dt;
  p.r=R;
  solveCircle(p,solids,dt);
  if(p.x<R){p.x=R;p.vx=0;}if(p.x>W-R){p.x=W-R;p.vx=0;}
  if(p.y>H+92){p.x=90;p.y=GROUND-R-3;p.vx=p.vy=0;p.grab=null;p.squash=1.2;}
  p.squash=Math.max(0,p.squash-dt*4);
 }
 for(const b of w.balls){
  b.vy+=1280*dt;b.vx*=Math.pow(.35,dt);b.x+=b.vx*dt;b.y+=b.vy*dt;
  solveCircle(b,solids,dt);
  if(b.y>H+100){b.x=300;b.y=GROUND-b.r-5;b.vx=b.vy=0;}
 }
 const all=[...w.players,...w.balls];
 for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++){
  const a=all[i],b=all[j],r=(a.r||R)+(b.r||R),dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||1;
  if(d>=r)continue;
  const nx=dx/d,ny=dy/d,over=(r-d)*.51;
  a.x-=nx*over;b.x+=nx*over;
  const relative=(a.vx-b.vx)*nx+(a.vy-b.vy)*ny;
  if(relative>0){const force=relative*.67;a.vx-=nx*force;b.vx+=nx*force;a.vy-=ny*force;b.vy+=ny*force;}
 }
 for(const p of w.players){
  if(!p.grab)continue;
  if(p.grab.kind==='wall')continue;
  const o=[...w.players,...w.balls].find(b=>b.id===p.grab.id);
  if(!o){p.grab=null;continue;}
  const dx=(o.x+p.grab.dx)-p.x,dy=(o.y+p.grab.dy)-p.y;
  p.vx+=clamp(dx*14,-520,520)*dt;p.vy+=clamp(dy*14,-520,520)*dt;
  p.x+=dx*.22;p.y+=dy*.22;
  o.x-=dx*.10;o.y-=dy*.10;
 }
 for(const spring of def.springs||[]){
  for(const p of w.players){
   if(Math.abs(p.x-spring.x)<41 && Math.abs(p.y+R-spring.y)<19 && p.vy>=-30){
    p.vy=-850;p.squash=1.5;p.grab=null;
   }
  }
  for(const b of w.balls)if(Math.abs(b.x-spring.x)<41&&Math.abs(b.y+b.r-spring.y)<22&&b.vy>=0)b.vy=-660;
 }
 w.pads=terrain(w).padActive;
 const clear=w.players.length>0&&w.players.every(p=>Math.hypot(p.x-w.exit.x,p.y-w.exit.y)<76);
 if(clear){w.phase='cleared';w.revision++;}
 w.time+=dt;
}
function tickWorld(w,delta,inputs={}){
 if(!w||w.phase!=='play')return w;
 const span=clamp(Number(delta)||0,0,.13),n=Math.max(1,Math.ceil(span/(1/60))),dt=span/n;
 for(let i=0;i<n;i++)simulateOne(w,dt,inputs);
 w.revision++;return w;
}

const MIN_PLAYERS=2,MAX_PLAYERS=4;
function snapshot(s){return {phase:s.phase,host:s.host,players:s.players,world:s.world,level:s.world.level,revision:s.world.revision,levels:LEVELS.length};}
const emit=s=>[{type:'state',payload:snapshot(s)}];
const notice=(id,msg)=>[{type:'notice',to:id,payload:msg}];
const module={
 protocolVersion:1,
 createRoom({player}){return {state:{host:player.id,players:[player],phase:'lobby',world:makeWorld([player.id],0),inputs:{},lastTick:Date.now(),lastInput:{}}};},
 onJoin({state,players}){
  if(state.phase!=='lobby')throw Error('match_in_progress');
  if(players.length>MAX_PLAYERS)throw Error('room_full');
  state.players=players;state.world=makeWorld(players.map(p=>p.id),state.world.level);return {state,events:emit(state)};
 },
 onLeave({state,players}){
  state.players=players;state.host=players.some(p=>p.id===state.host)?state.host:(players[0]?.id||'');
  state.world.players=state.world.players.filter(p=>players.some(u=>u.id===p.id));
  for(const id of Object.keys(state.inputs))if(!players.some(p=>p.id===id))delete state.inputs[id];
  if(players.length<MIN_PLAYERS&&state.phase==='play'){state.phase='lobby';state.inputs={};}
  return {state,events:emit(state)};
 },
 onMessage({state,player,payload}){
  const a=payload&&typeof payload==='object'&&!Array.isArray(payload)?payload:{},now=Date.now();
  if(a.type==='sync')return {state,events:[{type:'state',to:player.id,payload:snapshot(state)}]};
  if(a.type==='start'&&player.id===state.host&&state.phase==='lobby'){
   if(state.players.length<MIN_PLAYERS)return {state,events:notice(player.id,'Нужно минимум два игрока.')};
   state.world=makeWorld(state.players.map(p=>p.id),0);state.inputs={};state.lastTick=now;state.phase='play';return {state,events:emit(state)};
  }
  if(a.type==='restart'&&player.id===state.host&&['play','cleared','finished'].includes(state.phase)){
   state.world=makeWorld(state.players.map(p=>p.id),state.world.level);state.inputs={};state.lastTick=now;state.phase='play';return {state,events:emit(state)};
  }
  if(a.type==='next'&&player.id===state.host&&(state.phase==='cleared'||state.phase==='finished')){
   const next=state.world.level+1;if(next>=LEVELS.length){state.phase='finished';return {state,events:emit(state)};}
   state.world=makeWorld(state.players.map(p=>p.id),next);state.inputs={};state.lastTick=now;state.phase='play';return {state,events:emit(state)};
  }
  if(a.type==='again'&&player.id===state.host&&state.phase==='finished'){
   state.world=makeWorld(state.players.map(p=>p.id),0);state.inputs={};state.lastTick=now;state.phase='play';return {state,events:emit(state)};
  }
  if(a.type!=='input'||state.phase!=='play')return {state,events:[]};
  if(now-(state.lastInput[player.id]||0)<55)return {state,events:[]};
  state.lastInput[player.id]=now;
  const x=Number(a.x);
  if(!Number.isFinite(x)||x< -1||x>1)return {state,events:[]};
  state.inputs[player.id]={x,jump:a.jump===true,grab:a.grab===true};
  tickWorld(state.world,Math.min(.115,Math.max(0,(now-state.lastTick)/1000)),state.inputs);
  state.lastTick=now;
  if(state.world.phase==='cleared')state.phase=state.world.level===LEVELS.length-1?'finished':'cleared';
  return {state,events:emit(state)};
 }
};
export default module;
