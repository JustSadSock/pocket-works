const FORWARD={player:-1,enemy:1};
const HEAVY_STEP=.1;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const living=member=>member&&member.state!=='fallen'&&member.hp>0;
const active=member=>living(member)&&member.state!=='rout';
const squads=army=>[...(army?.infantry||[]),...(army?.archers||[])];
const memberCache=new WeakMap();
const members=army=>{
  if(!army)return[];
  let list=memberCache.get(army);
  if(!list){list=squads(army).flatMap(squad=>squad.members||[]);memberCache.set(army,list);}
  return list;
};
const hash=value=>{let h=2166136261;for(const char of String(value)){h^=char.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;};

function initialise(state){
  if(!state||state.__combatClarity)return state;
  state.__combatClarity={eventCursor:state.events?.length||0,heavyClock:0};
  for(const army of[state.player,state.enemy])for(const squad of squads(army))for(const member of squad.members||[]){
    const seed=hash(member.id);
    member.clarityJitterX=((seed&255)/255-.5)*5.2;
    member.clarityJitterY=(((seed>>>8)&255)/255-.5)*3.4;
    member.facingY=-1;
    member.visualRank=member.index<Math.ceil((squad.maxStrength||squad.members.length)/2)?'front':'rear';
  }
  return state;
}

function keepWarriorsUpright(state){
  for(const army of[state.player,state.enemy])for(const member of members(army))member.facingY=-1;
}

function separateFriendly(army){
  for(const squad of squads(army)){
    const list=(squad.members||[]).filter(active);
    for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++){
      const a=list[i],b=list[j],dx=a.x-b.x,dy=a.y-b.y,d2=dx*dx+dy*dy,min=a.type==='archer'?18:16;
      if(d2<=0||d2>=min*min)continue;
      const d=Math.sqrt(d2),push=(min-d)*.23,nx=dx/d,ny=dy/d;
      a.x+=nx*push;a.y+=ny*push;b.x-=nx*push;b.y-=ny*push;
    }
  }
}

function stabiliseFront(state){
  const player=members(state.player).filter(member=>active(member)&&member.type==='infantry');
  const enemy=members(state.enemy).filter(member=>active(member)&&member.type==='infantry');
  for(const p of player)for(const e of enemy){
    const dx=p.x-e.x,dy=p.y-e.y,d2=dx*dx+dy*dy;
    if(d2>784)continue;
    const desiredY=15;
    if(p.y-e.y<desiredY){const push=(desiredY-(p.y-e.y))*.36;p.y+=push;e.y-=push;}
    if(Math.abs(dx)<11){const direction=(hash(p.id+e.id)&1)?1:-1,push=(11-Math.abs(dx))*.18;p.x+=direction*push;e.x-=direction*push;}
    p.x=clamp(p.x,18,702);e.x=clamp(e.x,18,702);p.y=clamp(p.y,28,1092);e.y=clamp(e.y,28,1092);
  }
}

function limitDogpiles(state){
  for(const army of[state.player,state.enemy]){
    const byTarget=new Map();
    for(const member of members(army)){
      if(!active(member)||member.type!=='infantry'||!member.targetId)continue;
      const list=byTarget.get(member.targetId)||[];list.push(member);byTarget.set(member.targetId,list);
    }
    for(const list of byTarget.values())if(list.length>2){
      list.sort((a,b)=>a.index-b.index);
      for(const member of list.slice(2)){member.targetId=null;member.vx+=(member.index%2?1:-1)*2.1;}
    }
  }
}

function addFormationLife(state){
  for(const army of[state.player,state.enemy])for(const squad of squads(army))for(const member of squad.members||[]){
    if(!active(member)||member.state==='fighting'||member.state==='drawing'||member.state==='shooting')continue;
    const tx=(member.slotX||member.x)+(member.clarityJitterX||0)+Math.sin(state.time*1.7+member.phase)*.75;
    const ty=(member.slotY||member.y)+(member.clarityJitterY||0);
    member.x+=clamp(tx-member.x,-.42,.42);
    member.y+=clamp(ty-member.y,-.32,.32);
  }
}

function emphasiseVolleys(state){
  const clarity=state.__combatClarity;
  const fresh=(state.events||[]).slice(clarity.eventCursor);
  clarity.eventCursor=state.events?.length||0;
  for(const event of fresh){
    if(event.rule!=='volley')continue;
    const targetArmy=event.side==='player'?state.enemy:state.player;
    const target=(targetArmy.infantry||[]).find(squad=>squad.id===event.targetSquadId)||targetArmy.infantry?.find(squad=>!squad.broken);
    const victims=(target?.members||[]).filter(active).slice(0,4);
    for(const [index,member] of victims.entries()){
      state.effects?.push({type:'arrow-hit',x:member.x+(index-1.5)*3,y:member.y,life:.34+index*.025});
      member.hitFlash=Math.max(member.hitFlash||0,.16);
    }
    state.impact=Math.max(state.impact||0,.11);
  }
}

export function applyCombatClarity(state,dt=.05){
  initialise(state);
  keepWarriorsUpright(state);
  addFormationLife(state);
  const clarity=state.__combatClarity;
  clarity.heavyClock-=dt;
  if(clarity.heavyClock<=0){
    clarity.heavyClock+=HEAVY_STEP;
    separateFriendly(state.player);separateFriendly(state.enemy);
    stabiliseFront(state);limitDogpiles(state);
  }
  emphasiseVolleys(state);
  return state;
}

export function createBattleState(baseCreate,...args){return initialise(baseCreate(...args));}
export function stepBattle(baseStep,state,dt=.05){baseStep(state,dt);return applyCombatClarity(state,dt);}
export function simulateBattle(baseCreate,baseStep,baseSummarize,a,b,seed=1,max=110){
  const state=createBattleState(baseCreate,a,b,seed,{captureReplay:false});
  while(state.status==='running'&&state.time<max)stepBattle(baseStep,state,.05);
  return baseSummarize(state);
}
export function botAudit(randomDoctrine,baseCreate,baseStep,baseSummarize,iterations=100,seed=1){
  const result={player:0,enemy:0,averageDuration:0,timeouts:0};
  for(let i=0;i<iterations;i++){
    const a=randomDoctrine(seed+i*31,4),b=randomDoctrine(seed+i*31+7,4);
    const first=simulateBattle(baseCreate,baseStep,baseSummarize,a,b,seed+i*97),second=simulateBattle(baseCreate,baseStep,baseSummarize,b,a,seed+i*97);
    result[first.winner]++;result[second.winner==='player'?'enemy':'player']++;
    result.averageDuration+=first.duration+second.duration;
    if(first.duration>=105)result.timeouts++;if(second.duration>=105)result.timeouts++;
  }
  result.averageDuration=Math.round(result.averageDuration/(iterations*2)*10)/10;
  return result;
}
