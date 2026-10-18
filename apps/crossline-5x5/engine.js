// 5x5 Arena / Crossline — original five-beat simultaneous combat adapted for Pocket Works.
// This ruleset is deliberately self-contained so PocketNet can pin it immutably.
export const DIRECTIONS={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]};
export const STEPS=5,MAX_ROUNDS=4;
const dirs=Object.keys(DIRECTIONS);
const copy=o=>JSON.parse(JSON.stringify(o));
const edge=p=>p.x===0||p.x===4||p.y===0||p.y===4;
export function initialMatch(){
 return {round:1,edgesCollapsed:false,units:{A:{x:0,y:2,alive:true},B:{x:4,y:2,alive:true}},outcome:null,replays:[],revision:0};
}
export function validatePlan(value){
 if(!Array.isArray(value)||value.length!==STEPS)return 'exactly_five_actions';
 const moved=new Set(),attackDirs=new Set();let attacks=0,shields=0;
 for(const action of value){
  if(typeof action==='string'){
   if(action==='shield'){if(++shields>1)return 'one_shield_only';continue;}
   if(!Object.hasOwn(DIRECTIONS,action))return 'unknown_action';
   if(attackDirs.has(action))return 'attack_direction_conflict';
   moved.add(action); // As in the original, movement directions MAY repeat.
  }else{
   if(!action||Array.isArray(action)||action.type!=='attack'||!Array.isArray(action.dirs))return 'unknown_action';
   if(++attacks>1)return 'one_attack_only';
   if(!action.dirs.length||action.dirs.length>4||new Set(action.dirs).size!==action.dirs.length)return 'invalid_attack_directions';
   for(const d of action.dirs){
    if(!dirs.includes(d)||moved.has(d))return 'attack_direction_conflict';
    attackDirs.add(d);
   }
  }
 }
 return null;
}
function result(units){
 if(!units.A.alive&&!units.B.alive)return 'draw';
 if(!units.A.alive)return 'B';
 if(!units.B.alive)return 'A';
 return null;
}
function move(u,action,collapsed){
 if(!u.alive||typeof action!=='string'||!Object.hasOwn(DIRECTIONS,action))return null;
 const [dx,dy]=DIRECTIONS[action],dest={x:Math.max(0,Math.min(4,u.x+dx)),y:Math.max(0,Math.min(4,u.y+dy))};
 if(collapsed&&edge(dest)){u.alive=false;return {type:'fall',at:dest};}
 const from={x:u.x,y:u.y};u.x=dest.x;u.y=dest.y;
 return {type:'move',from,to:dest};
}
export function simulateRound(match,plans){
 if(match.outcome)throw Error('match_complete');
 if(validatePlan(plans?.A)||validatePlan(plans?.B))throw Error('invalid_plan');
 const next=copy(match),begin=copy(next.units),frames=[],round=next.round;
 for(let beat=0;beat<STEPS;beat++){
  const actions={A:plans.A[beat],B:plans.B[beat]},events=[];
  for(const side of ['A','B']){
   const action=move(next.units[side],actions[side],next.edgesCollapsed);
   if(action)events.push({side,...action});
  }
  // Attacks read the same post-movement positions. Both living attackers fire
  // even if the opponent's simultaneous attack also lands.
  const targeted={A:false,B:false},blocked=[];
  for(const side of ['A','B']){
   const action=actions[side],attacker=next.units[side],defenderSide=side==='A'?'B':'A',defender=next.units[defenderSide];
   if(!attacker.alive||!defender.alive||typeof action!=='object')continue;
   const cells=[{x:attacker.x,y:attacker.y},...action.dirs.map(d=>({x:attacker.x+DIRECTIONS[d][0],y:attacker.y+DIRECTIONS[d][1]}))].filter(p=>p.x>=0&&p.x<=4&&p.y>=0&&p.y<=4);
   events.push({side,type:'attack',cells});
   if(cells.some(p=>p.x===defender.x&&p.y===defender.y)){
    if(actions[defenderSide]==='shield'){blocked.push(defenderSide);events.push({side:defenderSide,type:'block'});}
    else targeted[defenderSide]=true;
   }
  }
  for(const side of ['A','B']){
   if(actions[side]==='shield'&&next.units[side].alive)events.push({side,type:'shield'});
   if(targeted[side]){next.units[side].alive=false;events.push({side,type:'hit'});}
  }
  if(round===4&&beat===0&&!next.edgesCollapsed){
   next.edgesCollapsed=true;events.push({type:'collapse'});
   for(const side of ['A','B'])if(next.units[side].alive&&edge(next.units[side])){
    next.units[side].alive=false;events.push({side,type:'fall',at:{x:next.units[side].x,y:next.units[side].y}});
   }
  }
  const outcome=result(next.units);
  frames.push({beat:beat+1,units:copy(next.units),edgesCollapsed:next.edgesCollapsed,actions:copy(actions),events,outcome});
  if(outcome){next.outcome=outcome;break;}
 }
 if(!next.outcome){if(round>=MAX_ROUNDS)next.outcome='draw';else next.round++;}
 const record={round,begin,plans:copy(plans),frames,outcome:next.outcome,roundEnd:copy(next.units)};
 next.replays.push(record);next.revision++;
 return {match:next,record};
}
export function aiPlan(match,opponentPlan,difficulty='normal',random=Math.random){
 const config={easy:[30,.45,.28,8],normal:[60,.25,.16,5],hard:[150,.10,.05,2],expert:[300,.05,.02,1],insane:[500,.02,.01,0]}[difficulty]||[60,.25,.16,5];
 const [samples,randomness,mistakes,noise]=config;
 const opponent=opponentPlan, candidates=[];
 for(let n=0;n<samples;n++){
  const usedMoves=new Set(),usedAttackDirs=new Set();let attack=0,shield=0;
  const plan=[];let provisional=copy(match);
  for(let i=0;i<STEPS;i++){
   const me=provisional.units.B,enemy=provisional.units.A;
   const available=dirs.filter(d=>!usedAttackDirs.has(d)&&me.x+DIRECTIONS[d][0]>=0&&me.x+DIRECTIONS[d][0]<=4&&me.y+DIRECTIONS[d][1]>=0&&me.y+DIRECTIONS[d][1]<=4);
   const best=[...available].sort((a,b)=>{
    const dist=d=>Math.abs(me.x+DIRECTIONS[d][0]-enemy.x)+Math.abs(me.y+DIRECTIONS[d][1]-enemy.y);
    return dist(a)-dist(b);
   })[0];
   let action;
   const adjacent=dirs.find(d=>me.x+DIRECTIONS[d][0]===enemy.x&&me.y+DIRECTIONS[d][1]===enemy.y&&!usedMoves.has(d));
   if(!attack&&adjacent&&random()>randomness)action={type:'attack',dirs:[adjacent]};
   else if(best&&random()>randomness)action=best;
   else if(!shield&&random()<.28)action='shield';
   else if(available.length)action=available[Math.floor(random()*available.length)];
   else if(!attack)action={type:'attack',dirs:dirs.filter(d=>!usedMoves.has(d))};
   else action='shield';
   if(typeof action==='object'){attack++;action.dirs=action.dirs.length?action.dirs:[dirs.find(d=>!usedMoves.has(d))];action.dirs.forEach(d=>usedAttackDirs.add(d));}
   else if(action==='shield')shield++;
   else usedMoves.add(action);
   if(shield>1){action=available[0]||'up';shield=1;if(action!=='up'||!usedAttackDirs.has('up'))usedMoves.add(action);}
   plan.push(action);
   // Preview a single simultaneous beat to inform the next AI action.
   const dummy={...provisional,round:1,edgesCollapsed:provisional.edgesCollapsed,replays:[],outcome:null};
   const pA=Array(5).fill('shield').map((v,k)=>k===0?opponent[i]:'up');
   const pB=Array(5).fill('up').map((v,k)=>k===0?action:'down');
   // Preview movement only; combat evaluation occurs for complete candidates below.
   const oldA=dummy.units.A,oldB=dummy.units.B;
   move(oldA,opponent[i],dummy.edgesCollapsed);move(oldB,action,dummy.edgesCollapsed);
   if(!oldB.alive)break;
  }
  // If a candidate dies before five beats, fill its remaining slots legally.
  while(plan.length<5){
   const choices=dirs.filter(d=>!usedAttackDirs.has(d));
   const a=choices[0]||(!shield?'shield':null);
   if(!a)break;
   plan.push(a);if(a==='shield')shield++;else usedMoves.add(a);
  }
  if(validatePlan(plan))continue;
  const result=simulateRound(match,{A:opponent,B:plan}).match;
  const a=result.units.A,b=result.units.B;
  let value=!b.alive&&!a.alive?-50:!b.alive?-100:!a.alive?200:10-Math.abs(a.x-b.x)-Math.abs(a.y-b.y);
  if(a.alive&&b.alive&&Math.abs(a.x-b.x)+Math.abs(a.y-b.y)===1)value+=20;
  if(result.edgesCollapsed&&edge(b))value-=40;
  value+=(random()*2-1)*(noise+random()*noise*.5);
  if(random()<mistakes)value+=(random()-.5)*14;
  candidates.push({plan,value});
 }
 candidates.sort((a,b)=>b.value-a.value);
 const count=Math.max(1,Math.round(1/randomness));
 return copy(candidates[Math.floor(random()*Math.min(candidates.length,count))]?.plan||['up','down','left','right','shield']);
}
