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
// Solo AI never reads the player's secret five-action plan. The same tactical
// hypotheses are used for all candidate moves; harder tiers search more and
// rank strictly by score rather than randomly selecting among the top 50.
function predictPlan(match,side,style,random){
 const opponent=side==='A'?'B':'A',mine=copy(match.units[side]),rival=copy(match.units[opponent]);
 const commands=[],moved=new Set();let shield=false,attack=false;
 for(let beat=0;beat<STEPS;beat++){
  const available=dirs.filter(d=>!commands.some(a=>typeof a==='object'&&a.dirs.includes(d)));
  const dist=Math.abs(mine.x-rival.x)+Math.abs(mine.y-rival.y);
  const validAttack=dirs.filter(d=>!moved.has(d));
  const attacking=validAttack.length&&(!attack)&&(dist<=1&&random()<(style==='aggressive'?.78:.44)||dist===2&&style==='ambush'&&random()<.24);
  let action;
  if(attacking){
   const ordered=validAttack.slice().sort((a,b)=>{
    const cell=d=>Math.abs(mine.x+DIRECTIONS[d][0]-rival.x)+Math.abs(mine.y+DIRECTIONS[d][1]-rival.y);
    return cell(a)-cell(b);
   });
   action={type:'attack',dirs:style==='aggressive'?ordered:ordered.slice(0,1+Math.floor(random()*Math.min(3,ordered.length)))};
   attack=true;
  }else if(!shield&&(dist<=1||style==='guard')&&random()<(style==='guard'?.58:.23)){
   action='shield';shield=true;
  }else{
   const moves=available.map(d=>{
    const x=Math.max(0,Math.min(4,mine.x+DIRECTIONS[d][0])),y=Math.max(0,Math.min(4,mine.y+DIRECTIONS[d][1]));
    const target=Math.abs(x-rival.x)+Math.abs(y-rival.y);
    const peril=match.edgesCollapsed&&(x===0||x===4||y===0||y===4)?20:0;
    const edgeRisk=match.round===4&&beat===0&&(x===0||x===4||y===0||y===4)?15:0;
    return {d,score:(style==='evasive'? -target: target)*(style==='random'?0:1)+peril+edgeRisk+(random()-.5)*(style==='random'?16:style==='evasive'?2:3)};
   });
   moves.sort((a,b)=>a.score-b.score);
   action=moves[0]?.d||(!shield?'shield':dirs.find(d=>!moved.has(d))||'up');
   if(action==='shield')shield=true;
  }
  commands.push(action);
  if(typeof action==='string'&&DIRECTIONS[action]){moved.add(action);move(mine,action,match.edgesCollapsed)}
  // Opponent hypotheses are deliberately imperfect; avoid using actual orders.
  if(beat<STEPS-1&&style==='aggressive'&&random()<.42){
   const choices=dirs.filter(d=>{
    const [dx,dy]=DIRECTIONS[d],x=rival.x+dx,y=rival.y+dy;
    return x>=0&&x<=4&&y>=0&&y<=4;
   });
   if(choices.length){const toward=choices.sort((a,b)=>{
    const delta=d=>{const [dx,dy]=DIRECTIONS[d];return Math.abs(rival.x+dx-mine.x)+Math.abs(rival.y+dy-mine.y)};
    return delta(a)-delta(b);
   })[0];move(rival,toward,false);}
  }
 }
 return validatePlan(commands)?['up','down','left','right','shield']:commands;
}
function evaluatePlan(match,plan,opponents,difficulty){
 const scores=[];
 for(const sample of opponents){
  const next=simulateRound(match,{A:sample,B:plan}).match;
  const a=next.units.A,b=next.units.B;
  let score=next.outcome==='B'?260:next.outcome==='A'?-280:next.outcome==='draw'?-16:0;
  if(b.alive&&a.alive){
   const distance=Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
   score+=12-distance*1.6;
   if(distance===1)score+=4;
   if(next.round===4&&edge(b))score-=30;
  }
  scores.push(score);
 }
 const mean=scores.reduce((a,b)=>a+b,0)/scores.length;
 // On top difficulty, reward consistent survival instead of accidental lucky wins.
 const risk={easy:0,normal:0,hard:.06,expert:.12,insane:.18}[difficulty]||0;
 return mean*(1-risk)+Math.min(...scores)*risk;
}
export function aiPlan(match,_hiddenPlayerPlan,difficulty='normal',random=Math.random){
 const levels={
  easy:{candidates:24,predictions:3,noise:22,policies:['random','aggressive']},
  normal:{candidates:60,predictions:4,noise:9,policies:['random','aggressive','ambush']},
  hard:{candidates:130,predictions:6,noise:3,policies:['aggressive','ambush','guard','evasive']},
  expert:{candidates:240,predictions:9,noise:.6,policies:['aggressive','ambush','guard','evasive']},
  insane:{candidates:360,predictions:12,noise:0,policies:['aggressive','ambush','guard','evasive']}
 };
 const config=levels[difficulty]||levels.normal;
 const hypotheses=Array.from({length:config.predictions},(_,i)=>predictPlan(match,'A',['aggressive','ambush','guard','random'][i%4],random));
 let best=null,bestScore=-Infinity;
 for(let i=0;i<config.candidates;i++){
  const policy=config.policies[Math.floor(random()*config.policies.length)];
  const candidate=predictPlan(match,'B',policy,random);
  const score=evaluatePlan(match,candidate,hypotheses,difficulty)+(random()-.5)*config.noise;
  if(score>bestScore){bestScore=score;best=candidate}
 }
 return best||['up','down','left','right','shield'];
}
