const FORWARD={player:-1,enemy:1};
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const living=member=>member&&member.state!=='fallen'&&member.hp>0;
const active=member=>living(member)&&member.state!=='rout';
const hash=value=>{let h=2166136261;for(const char of String(value)){h^=char.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;};

function cached(army,key,create){
  if(!army)return[];
  if(!army[key])Object.defineProperty(army,key,{value:create(),configurable:true});
  return army[key];
}
function squads(army){return cached(army,'__claritySquads',()=>[...(army.infantry||[]),...(army.archers||[])]);}
function members(army){return cached(army,'__clarityMembers',()=>squads(army).flatMap(squad=>squad.members||[]));}
function infantryMembers(army){return cached(army,'__clarityInfantry',()=>[...(army.infantry||[])].flatMap(squad=>squad.members||[]));}

function initialise(state){
  if(!state)return state;
  if(!state.__combatClarity)state.__combatClarity={eventCursor:state.events?.length||0,settleClock:0};
  else{
    state.__combatClarity.eventCursor??=state.events?.length||0;
    state.__combatClarity.settleClock??=0;
  }
  for(const army of[state.player,state.enemy])for(const squad of squads(army))for(const member of squad.members||[]){
    if(member.clarityJitterX===undefined){
      const seed=hash(member.id);
      member.clarityJitterX=((seed&255)/255-.5)*5.2;
      member.clarityJitterY=(((seed>>>8)&255)/255-.5)*3.4;
      member.visualRank=member.index<Math.ceil((squad.maxStrength||squad.members.length)/2)?'front':'rear';
    }
    member.facingY=FORWARD[member.side]||member.facingY||-1;
  }
  return state;
}

function separateFriendly(army){
  for(const squad of squads(army)){
    const list=squad.members||[];
    for(let i=0;i<list.length;i++){
      const a=list[i];if(!active(a))continue;
      for(let j=i+1;j<list.length;j++){
        const b=list[j];if(!active(b))continue;
        const dx=a.x-b.x,dy=a.y-b.y,d2=dx*dx+dy*dy,min=a.type==='archer'?18:16;
        if(d2<=.0001||d2>=min*min)continue;
        const d=Math.sqrt(d2),push=(min-d)*.23,nx=dx/d,ny=dy/d;
        a.x+=nx*push;a.y+=ny*push;b.x-=nx*push;b.y-=ny*push;
      }
    }
  }
}

function stabiliseFront(state){
  const buckets=new Map(),bucketSize=36;
  for(const e of infantryMembers(state.enemy))if(active(e)){
    const key=Math.floor(e.x/bucketSize),list=buckets.get(key);
    if(list)list.push(e);else buckets.set(key,[e]);
  }
  for(const p of infantryMembers(state.player)){
    if(!active(p))continue;
    const base=Math.floor(p.x/bucketSize);
    for(let key=base-1;key<=base+1;key++)for(const e of buckets.get(key)||[]){
      const dx=p.x-e.x,dy=p.y-e.y,d2=dx*dx+dy*dy;
      if(d2>784)continue;
      const desiredY=15;
      if(dy<desiredY){const push=(desiredY-dy)*.36;p.y+=push;e.y-=push;}
      if(Math.abs(dx)<11){const direction=(hash(p.id+e.id)&1)?1:-1,push=(11-Math.abs(dx))*.18;p.x+=direction*push;e.x-=direction*push;}
      p.x=clamp(p.x,18,702);e.x=clamp(e.x,18,702);p.y=clamp(p.y,28,1092);e.y=clamp(e.y,28,1092);
    }
  }
}

function limitDogpiles(state){
  for(const army of[state.player,state.enemy]){
    const byTarget=new Map();
    for(const member of infantryMembers(army)){
      if(!active(member)||!member.targetId)continue;
      const list=byTarget.get(member.targetId);
      if(list)list.push(member);else byTarget.set(member.targetId,[member]);
    }
    for(const list of byTarget.values())if(list.length>2){
      list.sort((a,b)=>a.index-b.index);
      for(let i=2;i<list.length;i++){const member=list[i];member.targetId=null;member.vx+=(member.index%2?1:-1)*2.1;}
    }
  }
}

function addFormationLife(state){
  for(const army of[state.player,state.enemy])for(const member of members(army)){
    member.facingY=FORWARD[member.side]||member.facingY||-1;
    if(!active(member)||member.state==='fighting'||member.state==='drawing'||member.state==='shooting')continue;
    const tx=(member.slotX||member.x)+(member.clarityJitterX||0)+Math.sin(state.time*1.7+member.phase)*.75;
    const ty=(member.slotY||member.y)+(member.clarityJitterY||0);
    member.x+=clamp(tx-member.x,-.42,.42);
    member.y+=clamp(ty-member.y,-.32,.32);
  }
}

function emphasiseVolleys(state){
  const clarity=state.__combatClarity,events=state.events||[],start=clarity.eventCursor;
  clarity.eventCursor=events.length;
  for(let eventIndex=start;eventIndex<events.length;eventIndex++){
    const event=events[eventIndex];if(event.rule!=='volley')continue;
    const targetArmy=event.side==='player'?state.enemy:state.player;
    const target=(targetArmy.infantry||[]).find(squad=>squad.id===event.targetSquadId)||targetArmy.infantry?.find(squad=>!squad.broken);
    let victimIndex=0;
    for(const member of target?.members||[]){
      if(!active(member))continue;
      state.effects?.push({type:'arrow-hit',x:member.x+(victimIndex-1.5)*3,y:member.y,life:.34+victimIndex*.025});
      member.hitFlash=Math.max(member.hitFlash||0,.16);
      if(++victimIndex===4)break;
    }
    state.impact=Math.max(state.impact||0,.11);
  }
}

export function applyCombatClarity(state,dt=.05){
  initialise(state);
  const clarity=state.__combatClarity;
  clarity.settleClock-=dt;
  if(clarity.settleClock<=0){
    separateFriendly(state.player);separateFriendly(state.enemy);stabiliseFront(state);limitDogpiles(state);
    clarity.settleClock+=.1;
  }
  addFormationLife(state);emphasiseVolleys(state);
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
