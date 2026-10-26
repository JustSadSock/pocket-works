import {apply, legal, POINTS, scoreOfRegions} from './core.js';

// Local, deterministic game-tree opponents. All search uses public state only.
const AI=1, HUMAN=0;
const levels={easy:1,normal:2,hard:3};
const tier=x=>levels[x]||2;
const terminal=s=>s.finished?(s.winner===AI?1000000:s.winner===HUMAN?-1000000:0):null;
const result=(s,action)=>{const r=apply(s,action);return r.ok?r.state:null};
const winningScore=s=>terminal(s);
const compare=(a,b)=>b.score-a.score||a.order-b.order;
function best(items){items.sort(compare);return items[0]||null}

function neighboursHex(id){
  const row=Math.floor(id/7),col=id%7;
  const dirs=row%2?[[0,-1],[0,1],[-1,0],[-1,1],[1,0],[1,1]]:[[0,-1],[0,1],[-1,-1],[-1,0],[1,-1],[1,0]];
  return dirs.map(([dr,dc])=>[row+dr,col+dc]).filter(([r,c])=>r>=0&&r<7&&c>=0&&c<7).map(([r,c])=>7*r+c);
}
function hexDistance(s,p){
  const dist=Array(49).fill(999),used=Array(49).fill(false);
  for(let i=0;i<7;i++){
    const id=p===0?i*7:i,cell=s.cells[id];
    if(cell!==1-p)dist[id]=cell===p?0:1;
  }
  for(let step=0;step<49;step++){
    let id=-1;for(let i=0;i<49;i++)if(!used[i]&&(id<0||dist[i]<dist[id]))id=i;
    if(id<0||dist[id]>=999)break;used[id]=true;
    if(p===0&&id%7===6||p===1&&Math.floor(id/7)===6)return dist[id];
    for(const next of neighboursHex(id))if(s.cells[next]!==1-p)dist[next]=Math.min(dist[next],dist[id]+(s.cells[next]===p?0:1));
  }
  return 999;
}
function bridgeValue(s){
  const win=terminal(s);if(win!==null)return win;
  const mine=hexDistance(s,AI),theirs=hexDistance(s,HUMAN);
  const support=s.cells.reduce((v,c,i)=>v+(c===AI?1:c===HUMAN?-1:0)*(3-Math.abs(i%7-3))*0.3,0);
  return (theirs-mine)*120+support;
}
function bridge(s,level){
  const options=legal(s).map(id=>{
    const n=result(s,{id});
    return {action:{id},score:bridgeValue(n),state:n,order:Math.abs(id%7-3)+Math.abs(Math.floor(id/7)-3)+id/100};
  });
  options.sort(compare);
  if(level===1)return options[0].action;
  const candidates=options.slice(0,level===3?12:5);
  for(const option of candidates){
    if(option.state.finished)continue;
    let oppBest=Infinity;
    for(const id of legal(option.state)){
      const after=result(option.state,{id});
      const value=bridgeValue(after);
      if(value<oppBest)oppBest=value;
    }
    option.score=0.7*oppBest+0.3*option.score;
  }
  return best(candidates).action;
}

function infectionValue(s){
  const winner=terminal(s);if(winner!==null)return winner;
  const cells=s.cells,empty=cells.filter(v=>v===-1).length;
  const corners=[0,7,56,63];let positional=0;
  for(let i=0;i<64;i++){
    const v=cells[i];if(v<0)continue;
    const sign=v===AI?1:-1,r=Math.floor(i/8),c=i%8;
    positional+=sign*(corners.includes(i)?125:(r===0||r===7||c===0||c===7)?15:0);
  }
  for(const corner of corners)if(cells[corner]===-1){
    const r=Math.floor(corner/8),c=corner%8;
    for(const a of [r*8+(c===0?1:6),(r===0?8:48)+c,(r===0?8:48)+(c===0?1:6)]){
      if(cells[a]!==-1)positional+=(cells[a]===AI?-1:1)*22;
    }
  }
  const disks=cells.reduce((v,c)=>v+(c===AI?1:c===HUMAN?-1:0),0);
  let mobility=0;
  // legal() searches only the current player; use turn-adjusted copies.
  for(const p of [HUMAN,AI]){
    const a={...s,turn:p};
    mobility+=(p===AI?1:-1)*legal(a).length;
  }
  return positional + mobility*9+disks*(empty<16?5:0.4);
}
function infectionSearch(s,depth,alpha,beta,cache){
  const immediate=terminal(s);if(immediate!==null)return immediate;
  if(depth<=0)return infectionValue(s);
  const key=s.cells.join('')+'|'+s.turn+'|'+depth;
  if(cache.has(key))return cache.get(key);
  const isMax=s.turn===AI;
  let value=isMax?-Infinity:Infinity;
  const choices=legal(s).map(id=>({id,heur:infectionValue(result(s,{id}))}));
  choices.sort((a,b)=>isMax?b.heur-a.heur:a.heur-b.heur);
  for(const {id} of choices){
    const n=result(s,{id}),v=infectionSearch(n,depth-1,alpha,beta,cache);
    value=isMax?Math.max(value,v):Math.min(value,v);
    if(isMax)alpha=Math.max(alpha,value);else beta=Math.min(beta,value);
    if(beta<=alpha)break;
  }
  if(!choices.length)value=infectionValue(s);
  // Only exact values are cached; bounds from pruned nodes must not be reused.
  if(beta>alpha)cache.set(key,value);
  return value;
}
function infection(s,level){
  const moves=legal(s),depth=level===3?(moves.length<6?4:3):level===2?2:1,cache=new Map();
  const sorted=moves.map(id=>{
    const n=result(s,{id});
    return {action:{id},score:depth===1?infectionValue(n):infectionSearch(n,depth-1,-Infinity,Infinity,cache),order:id};
  });
  return best(sorted).action;
}

const orth=[[1,0],[-1,0],[0,1],[0,-1]];
const neighbours=(id,n)=>orth.map(([dr,dc])=>[Math.floor(id/n)+dr,id%n+dc]).filter(([r,c])=>r>=0&&c>=0&&r<n&&c<n).map(([r,c])=>r*n+c);
function reach(s,p){
  const start=s.cells.indexOf(p),q=[start],dist=Array(49).fill(Infinity);
  dist[start]=0;
  for(let i=0;i<q.length;i++)for(const j of neighbours(q[i],7))if(s.cells[j]===-1&&dist[j]===Infinity){dist[j]=dist[q[i]]+1;q.push(j)}
  return dist;
}
function voidValue(s){
  const win=terminal(s);if(win!==null)return win;
  const own=reach(s,AI),foe=reach(s,HUMAN);
  let value=0,freeMine=0,freeFoe=0;
  for(let i=0;i<49;i++)if(s.cells[i]===-1){
    if(Number.isFinite(own[i]))freeMine++;
    if(Number.isFinite(foe[i]))freeFoe++;
    if(own[i]<foe[i])value+=6;
    else if(foe[i]<own[i])value-=6;
  }
  const mobility=(legal({...s,turn:AI}).length-legal({...s,turn:HUMAN}).length);
  return value+(freeMine-freeFoe)*1.3+mobility*9;
}
function voidSearch(s,depth,alpha,beta){
  const win=terminal(s);if(win!==null)return win;
  if(depth===0)return voidValue(s);
  const max=s.turn===AI;
  let out=max?-Infinity:Infinity;
  for(const id of legal(s)){
    const n=result(s,{id}),v=voidSearch(n,depth-1,alpha,beta);
    out=max?Math.max(out,v):Math.min(out,v);
    if(max)alpha=Math.max(alpha,out);else beta=Math.min(beta,out);
    if(alpha>=beta)break;
  }
  return Number.isFinite(out)?out:voidValue(s);
}
function voidAI(s,level){
  const depth=level===3?7:level===2?5:2;
  return best(legal(s).map(id=>({action:{id},score:voidSearch(result(s,{id}),depth-1,-Infinity,Infinity),order:id}))).action;
}
function rotateValue(s){
  const win=terminal(s);if(win!==null)return win;
  const mine=s.cells.indexOf(AI),human=s.cells.indexOf(HUMAN);
  const mc=mine%6,hc=human%6;
  const freedomAI=neighbours(mine,6).filter(id=>s.cells[id]===-1).length;
  const freedomHuman=neighbours(human,6).filter(id=>s.cells[id]===-1).length;
  return ((5-mc)-hc)*70+(freedomAI-freedomHuman)*2;
}
function moveOptions(s){
  if(s.finished)return [{end:s,second:null}];
  return legal(s).map(id=>({end:result(s,{type:'move',id}),second:{type:'move',id}}));
}
function rotateTurn(s){
  const out=[];
  if(s.stage==='move')return moveOptions(s).map((v,i)=>({...v,first:v.second,order:i}));
  for(let block=0;block<9;block++)for(const dir of [1,-1]){
    const first={type:'rotate',block,dir},n=result(s,first);
    if(!n)continue;
    for(const item of moveOptions(n))out.push({first,second:item.second,end:item.end,order:block*2+(dir===1?0:1)});
  }
  return out;
}
function rotate(s,level){
  const candidates=rotateTurn(s).map(o=>({...o,score:rotateValue(o.end)}));
  candidates.sort(compare);
  if(level>=2){
    for(const o of candidates.slice(0,level===3?9:4)){
      if(o.end.finished)continue;
      const responses=rotateTurn(o.end);
      let danger=Infinity;
      for(const x of responses)danger=Math.min(danger,rotateValue(x.end));
      o.score=o.score*0.15+danger*0.85;
    }
  }
  return best(candidates)?.first||null;
}

function allocations(total=3,parts=5){
  const out=[];
  function walk(arr,remaining){
    if(arr.length===parts-1){out.push([...arr,remaining]);return}
    for(let i=0;i<=remaining;i++)walk([...arr,i],remaining-i);
  }
  walk([],total);return out;
}
const ALLOCS=allocations();
function regionValue(regions,remaining){
  let sum=0;
  for(const [a,b] of regions){
    const margin=b-a;
    sum+=Math.tanh(margin/Math.max(1,remaining*1.4))*115;
    if(remaining===0)sum+=(Math.sign(margin))*400;
  }
  return sum;
}
function influenceAI(s,level){
  // Never inspect s.pending[0]: the human plan is still secret.
  const predictedHuman=s.last?.[0]||null,remaining=7-s.round;
  const rows=ALLOCS.map((mine,index)=>{
    let weighted=0,worst=Infinity,total=0;
    for(const human of ALLOCS){
      const simulated=s.regions.map(([r,b],i)=>[r+human[i],b+mine[i]]);
      const value=regionValue(simulated,remaining);
      const historyBonus=predictedHuman&&human.every((n,i)=>n===predictedHuman[i])?7:0;
      const weight=1+historyBonus;
      weighted+=weight*value;total+=weight;worst=Math.min(worst,value);
    }
    const expect=weighted/total;
    const spread=mine.filter(x=>x>0).length;
    return{action:{type:'submit',alloc:mine},order:(index+s.round*11)%ALLOCS.length,score:level===1?regionValue(s.regions.map(([r,b],i)=>[r,b+mine[i]]),remaining)-spread:level===3?expect*.75+worst*.25:expect};
  });
  return best(rows).action;
}

const dirs=['up','down','left','right','stay'];
const movements={up:[-1,0],down:[1,0],left:[0,-1],right:[0,1],stay:[0,0]};
const plans=dirs.flatMap(a=>dirs.map(b=>[a,b]));
const follow=(id,dir)=>{
  const [dr,dc]=movements[dir],r=Math.floor(id/5)+dr,c=id%5+dc;
  return r<0||r>4||c<0||c>4?id:r*5+c;
};
function simulateProtocol(s,human,ai){
  const positions=s.positions.slice(),gains=[0,0];
  for(let i=0;i<2;i++){
    const next=[follow(positions[0],human[i]),follow(positions[1],ai[i])];
    if(next[0]===next[1]||(next[0]===positions[1]&&next[1]===positions[0]))continue;
    for(let p=0;p<2;p++)if(next[p]!==positions[p]&&POINTS.includes(next[p]))gains[p]++;
    positions[0]=next[0];positions[1]=next[1];
  }
  return {positions,gains};
}
function nearPoint(id){
  return Math.min(...POINTS.map(x=>Math.abs(Math.floor(x/5)-Math.floor(id/5))+Math.abs(x%5-id%5)));
}
function planPotential(out,p){
  return out.gains[p]*130-nearPoint(out.positions[p])*16;
}
function protocolAI(s,level){
  // Future rival commands cannot be read, even after the human submitted.
  const history=s.last?.plans?.[0];
  const humanModel=plans.map(p=>{
    const alone=simulateProtocol(s,p,['stay','stay']);
    const goodness=planPotential(alone,0);
    return {plan:p,weight:1+Math.max(0,goodness+80)/50+(history&&history[0]===p[0]&&history[1]===p[1]?5:0)};
  });
  const choices=plans.map((ai,index)=>{
    const solo=simulateProtocol(s,['stay','stay'],ai);
    const simple=planPotential(solo,1);
    let score=0,weight=0,worst=Infinity;
    for(const h of humanModel){
      const out=simulateProtocol(s,h.plan,ai);
      const merit=(out.gains[1]-out.gains[0])*135
        + (nearPoint(out.positions[0])-nearPoint(out.positions[1]))*14;
      score+=merit*h.weight;weight+=h.weight;worst=Math.min(worst,merit);
    }
    const expected=score/weight;
    return {action:{type:'submit',commands:ai},score:level===1?simple:level===3?expected*.85+worst*.15:expected,order:(index+s.round*3)%25};
  });
  return best(choices).action;
}

export function chooseAIAction(state,difficulty='normal'){
  if(!state||state.finished)return null;
  const level=tier(difficulty);
  if(['influence','protocol'].includes(state.kind)){
    if(state.phase==='pass'&&state.planner===1)return {type:'continue'};
    if(state.phase!=='plan'||state.planner!==1)return null;
    return state.kind==='influence'?influenceAI(state,level):protocolAI(state,level);
  }
  if(state.turn!==AI)return null;
  if(state.kind==='bridge')return bridge(state,level);
  if(state.kind==='infection')return infection(state,level);
  if(state.kind==='void')return voidAI(state,level);
  if(state.kind==='rotate')return rotate(state,level);
  return null;
}
export function isAITurn(state){
  if(!state||state.opponent!=='ai'||state.finished)return false;
  if(state.kind==='influence'||state.kind==='protocol')
    return state.planner===1&&(state.phase==='pass'||state.phase==='plan');
  return state.turn===AI;
}
