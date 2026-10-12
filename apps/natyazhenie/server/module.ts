// НАТЯЖЕНИЕ — server-authoritative, fixed-substep multiplayer platformer.
// No timers required in Durable Objects: input heartbeats advance time while clients render at display Hz.
const W=1180,H=620,R=18,GROUND=540,GRAVITY=1050;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const rect=(x,y,w,h)=>({x,y,w,h});
export const LEVELS=[
 {name:'Все на места',hint:'Каждому — своя цветная кнопка',kind:'plates',pads:350,spread:400,floors:[[0,540,1180,80]],theme:0},
 {name:'Через край',hint:'Перепрыгните разрыв. Не дайте резинке утащить друга',kind:'gap',pads:685,spread:280,floors:[[0,540,442,80],[554,540,626,80]],theme:1},
 {name:'Выше головы',hint:'Пружины подбросят к двум искрам',kind:'stars',pads:730,spread:260,floors:[[0,540,1180,80]],springs:[340,700],stars:[[404,302],[758,290]],platforms:[[470,420,130,18],[790,409,105,18]],theme:2},
 {name:'До предела',hint:'Растяните резинку и удержите натяжение',kind:'stretch',pads:345,spread:435,floors:[[0,540,1180,80]],theme:3},
 {name:'Не расцепиться',hint:'Через островки, к искрам и кнопкам',kind:'islands',pads:755,spread:220,floors:[[0,540,314,80],[410,540,210,80],[712,540,468,80]],springs:[269,567],stars:[[464,330],[760,306]],platforms:[[350,442,73,18],[653,431,75,18]],theme:4},
 {name:'Последний рывок',hint:'Соберите искры, натяните связь и откройте выход',kind:'finale',pads:674,spread:304,floors:[[0,540,446,80],[561,540,619,80]],springs:[335],stars:[[394,304],[660,311]],platforms:[[470,410,112,18],[745,404,105,18]],theme:5}
];
export const MIN_PLAYERS=2,MAX_PLAYERS=5;
export function stageFor(index,count){
 const spec=LEVELS[clamp(index|0,0,LEVELS.length-1)],n=clamp(count|0,MIN_PLAYERS,MAX_PLAYERS);
 // Same chapter and same challenges; more teammates means more independent activation points.
 const spread=n===2?Math.min(spec.spread,244):spec.spread;
 const pads=Array.from({length:n},(_,i)=>({x:spec.pads+spread*i/(n-1),y:GROUND}));
 return {index,name:spec.name,hint:spec.hint,kind:spec.kind,theme:spec.theme,
  floors:spec.floors.map(a=>rect(...a)),platforms:(spec.platforms||[]).map(a=>rect(...a)),
  springs:(spec.springs||[]).map(x=>({x,y:GROUND})),
  stars:(spec.stars||[]).map(([x,y])=>({x,y})),pads,
  stretch:spec.kind==='stretch'?spread-24:spec.kind==='finale'?spread-40:0,
  gate:rect(1036,0,31,GROUND),finishX:1102};
}
function spawn(player,i){return {id:player.id,name:player.name||'Игрок',x:92+i*42,y:GROUND-R,vx:0,vy:0,ground:true,coyote:0,face:1,jumpHeld:false,squash:0,falls:0};}
export function worldFor(players,index=0){
 const stage=stageFor(index,players.length);
 return {level:index,stage,players:players.map(spawn),inputs:{},stars:stage.stars.map(()=>false),
  pads:stage.pads.map(()=>false),stretch:0,stretched:false,gateOpen:false,ticks:0,clock:0,finished:false,revision:0};
}
export function reset(world,index=world.level){
 const next=worldFor(world.players.map(p=>({id:p.id,name:p.name})),index);
 Object.assign(world,next);world.revision++;
}
function solids(world){return world.gateOpen?[...world.stage.floors,...world.stage.platforms]:[...world.stage.floors,...world.stage.platforms,world.stage.gate];}
function hit(q,s){return q.x+R>s.x&&q.x-R<s.x+s.w&&q.y+R>s.y&&q.y-R<s.y+s.h;}
function move(q,dt,blocks){
 const oldX=q.x,oldY=q.y;
 q.x+=q.vx*dt;
 for(const s of blocks)if(hit(q,s)){
  if(oldX+R<=s.x+4&&q.vx>0){q.x=s.x-R;q.vx=0;}
  else if(oldX-R>=s.x+s.w-4&&q.vx<0){q.x=s.x+s.w+R;q.vx=0;}
 }
 q.x=clamp(q.x,R,W-R);
 q.y+=q.vy*dt;q.ground=false;
 for(const s of blocks)if(hit(q,s)){
  if(oldY+R<=s.y+6&&q.vy>=0){q.y=s.y-R;q.vy=0;q.ground=true;q.squash=.5;}
  else if(oldY-R>=s.y+s.h-6&&q.vy<0){q.y=s.y+s.h+R;q.vy=0;}
  else if(s.y===0&&s.h>=GROUND){q.x=q.x<s.x+s.w/2?s.x-R:s.x+s.w+R;q.vx=0;}
  else if(q.y<s.y+s.h/2){q.y=s.y-R;q.vy=0;q.ground=true;}
  else {q.y=s.y+s.h+R;q.vy=0;}
 }
 q.y=Math.max(R,q.y);
}
function rope(world,dt){
 const a=world.players;
 for(let j=0;j<a.length-1;j++){
  const p=a[j],q=a[j+1],dx=q.x-p.x,dy=q.y-p.y,dist=Math.hypot(dx,dy)||1;
  if(dist>170){
   const stretch=dist-170;
   const force=Math.min(1150,stretch*6.2);
   const ax=dx/dist*force*dt,ay=dy/dist*force*dt;
   p.vx+=ax;q.vx-=ax;p.vy+=ay;q.vy-=ay;
   // Soft maximum extension, never teleport across a pit.
   if(dist>335){const extra=(dist-335)*.2;p.x+=dx/dist*extra;q.x-=dx/dist*extra;}
  }
 }
}
function evaluate(world,dt){
 const s=world.stage,ps=world.players;
 world.pads=s.pads.map(b=>ps.some(q=>q.ground&&Math.abs(q.x-b.x)<31&&Math.abs(q.y+R-b.y)<12));
 for(let i=0;i<s.stars.length;i++)if(!world.stars[i]&&ps.some(q=>Math.hypot(q.x-s.stars[i].x,q.y-s.stars[i].y)<38))world.stars[i]=true;
 if(s.stretch&&!world.stretched){
  const extent=Math.max(...ps.map(p=>p.x))-Math.min(...ps.map(p=>p.x));
  const valid=extent>=s.stretch&&ps.filter(p=>p.ground).length>=2;
  world.stretch=clamp(world.stretch+(valid?dt*1.9:-dt*.55),0,1);
  if(world.stretch>=1)world.stretched=true;
 }
 if(world.pads.every(Boolean)&&world.stars.every(Boolean)&&(!s.stretch||world.stretched))world.gateOpen=true;
 if(world.gateOpen&&ps.some(q=>q.x>s.finishX)&&ps.every(q=>q.x>s.finishX-133&&q.y<GROUND+R)){
  if(world.level===LEVELS.length-1)world.finished=true;
  else reset(world,world.level+1);
  return true;
 }
 return false;
}
export function simulate(world,seconds,now=Date.now()){
 let rest=clamp(seconds,0,.15);
 while(rest>0&&!world.finished){
  const dt=Math.min(1/90,rest);rest-=dt;world.clock+=dt;world.ticks++;
  const blocks=solids(world);
  for(const q of world.players){
   const raw=world.inputs[q.id]||{},fresh=now-(raw.at||0)<390;
   const dir=fresh?clamp(Number(raw.dir)||0,-1,1):0,jump=fresh&&raw.jump===true;
   q.squash=Math.max(0,q.squash-dt*3);
   q.coyote=q.ground?.105:Math.max(0,q.coyote-dt);
   if(jump&&!q.jumpHeld&&(q.ground||q.coyote>0)){
    q.vy=-515;q.y-=2;q.ground=false;q.coyote=0;q.squash=.75;
   }
   q.jumpHeld=jump;
   if(dir)q.face=dir>0?1:-1;
   const desired=dir*255,rate=dir?(q.ground?1800:1200):(q.ground?2050:390);
   q.vx+=clamp(desired-q.vx,-rate*dt,rate*dt);
   q.vy=clamp(q.vy+GRAVITY*dt,-890,760);
  }
  rope(world,dt);
  for(const q of world.players){
   q.vx=clamp(q.vx,-335,335);q.vy=clamp(q.vy,-850,760);
   move(q,dt,blocks);
   if(q.ground)for(const spring of world.stage.springs)if(Math.abs(q.x-spring.x)<33&&Math.abs(q.y+R-spring.y)<12){q.vy=-752;q.y-=3;q.ground=false;q.coyote=0;q.squash=1;break;}
   if(q.y>H+72){
    const idx=world.players.indexOf(q),falls=q.falls+1;
    Object.assign(q,spawn(q,idx));q.falls=falls;
   }
  }
  // Repulsive player bodies, but no stacking-based jump exploits are required for any puzzle.
  for(let i=0;i<world.players.length;i++)for(let j=i+1;j<world.players.length;j++){
   const a=world.players[i],b=world.players[j],dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||1;
   if(d<2*R-3){const overlap=(2*R-3-d)*.5;a.x-=dx/d*overlap;b.x+=dx/d*overlap;}
  }
  if(evaluate(world,dt))break;
 }
 world.revision++;
}
export function screen(world){return {
 level:world.level,stage:world.stage,players:world.players.map(p=>({
 id:p.id,name:p.name,x:+p.x.toFixed(2),y:+p.y.toFixed(2),
 vx:+p.vx.toFixed(2),vy:+p.vy.toFixed(2),face:p.face,ground:p.ground,squash:p.squash,falls:p.falls})),
 pads:world.pads,stars:world.stars,stretch:+world.stretch.toFixed(3),
 stretched:world.stretched,gateOpen:world.gateOpen,clock:+world.clock.toFixed(2),
 finished:world.finished,revision:world.revision};
}
const view=s=>({phase:s.phase,host:s.host,players:s.players,world:s.world?screen(s.world):null,levels:LEVELS.length});
const broadcast=s=>[{type:'state',payload:view(s)}];
function synchronize(s,players){
 s.players=players;
 if(s.world){
  s.world.players=s.world.players.filter(p=>players.some(m=>m.id===p.id));
  players.forEach((p,i)=>{if(!s.world.players.some(q=>q.id===p.id))s.world.players.push(spawn(p,i));});
 }
 if(!players.some(p=>p.id===s.host))s.host=players[0]?.id||'';
}
const game={
 protocolVersion:1,
 createRoom({player}){return {state:{host:player.id,players:[player],phase:'lobby',world:null,lastTick:Date.now(),lastBroadcast:0,lastInput:{}}};},
 onJoin({state,players}){
  if(state.phase!=='lobby')throw Error('match_in_progress');
  if(players.length>MAX_PLAYERS)throw Error('room_full');
  synchronize(state,players);return {state,events:broadcast(state)};
 },
 onLeave({state,players}){
  synchronize(state,players);
  if(state.phase==='play'&&players.length<MIN_PLAYERS){state.phase='lobby';state.world=null;}
  else if(state.phase==='play'&&state.world){
   // Existing run remains solvable after a dropout: rebuild the stage for the new count.
   const index=state.world.level;state.world=worldFor(state.players,index);state.lastTick=Date.now();
  }
  return {state,events:broadcast(state)};
 },
 onMessage({state,player,payload}){
  const a=payload&&typeof payload==='object'&&!Array.isArray(payload)?payload:{};
  if(a.type==='sync')return {state,events:[{type:'state',to:player.id,payload:view(state)}]};
  if(a.type==='start'&&player.id===state.host&&(state.phase==='lobby'||state.phase==='done')){
   if(state.players.length<MIN_PLAYERS||state.players.length>MAX_PLAYERS)return {state,events:[{type:'notice',to:player.id,payload:'Нужно 2–5 игроков'}]};
   state.world=worldFor(state.players);state.phase='play';state.lastTick=Date.now();state.lastInput={};
   return {state,events:broadcast(state)};
  }
  if(a.type==='restart'&&player.id===state.host&&state.phase==='play'){
   reset(state.world);state.lastTick=Date.now();return {state,events:broadcast(state)};
  }
  if(a.type==='input'&&state.phase==='play'){
   const now=Date.now(),last=state.lastInput[player.id]||0;
   if(now-last<34)return {state,events:[]};
   const dir=Number(a.dir);
   if(!Number.isFinite(dir)||Math.abs(dir)>1)return {state,events:[]};
   state.lastInput[player.id]=now;
   state.world.inputs[player.id]={dir,jump:a.jump===true,at:now};
   const prevLevel=state.world.level;
   const elapsed=clamp((now-state.lastTick)/1000,0,.15);state.lastTick=now;
   simulate(state.world,elapsed,now);
   if(state.world.finished)state.phase='done';
   if(now-state.lastBroadcast>=55||prevLevel!==state.world.level||state.phase==='done'){
    state.lastBroadcast=now;return {state,events:broadcast(state)};
   }
   return {state,events:[]};
  }
  return {state,events:[]};
 }
};
export default game;
// Geometry acceptance tests: every capacity must get unique reachable floor plates,
// no gap larger than a normal jump, all exit gates accessible from the right.
export function validateLayouts(){
 const issues=[];
 for(let count=MIN_PLAYERS;count<=MAX_PLAYERS;count++)for(let level=0;level<LEVELS.length;level++){
  const s=stageFor(level,count);
  if(s.pads.length!==count||s.pads.some((p,i)=>p.x<240||p.x>990||i&&p.x-s.pads[i-1].x<57))issues.push([count,level,'pads']);
  if(s.pads.some(p=>!s.floors.some(f=>p.x>=f.x+24&&p.x<=f.x+f.w-24&&f.y===GROUND)))issues.push([count,level,'pad floor']);
  const floors=s.floors.filter(f=>f.y===GROUND).sort((a,b)=>a.x-b.x);
  for(let i=1;i<floors.length;i++)if(floors[i].x-(floors[i-1].x+floors[i-1].w)>155)issues.push([count,level,'gap']);
  if(s.gate.x<s.pads.at(-1).x+28)issues.push([count,level,'gate']);
  if(s.stretch&&s.stretch>s.pads.at(-1).x-s.pads[0].x)issues.push([count,level,'stretch']);
  if(s.stars.some(st=>st.x>1000||st.y<240||st.y>510))issues.push([count,level,'star']);
 }
 return issues;
}
