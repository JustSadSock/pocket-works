// Combat Forge 0.4: seeded tactical combat with configurable objectives and material rules.
import {validateCombatRules} from './combat-rules.mjs';
export const CW=800,CH=480,DT=1/30;
export const ARENAS=[
 {id:'open',name:'Арена',description:'Манёвренный бой без укрытий'},
 {id:'cover',name:'Крепость',description:'Барьеры и укрытия'},
 {id:'hazards',name:'Испытание',description:'Опасные участки и подвижные укрытия'}
];
export const SKILLS={
 bolt:{label:'Импульс',cooldown:.68,cost:12,kind:'shot'},
 dash:{label:'Рывок',cooldown:2.6,cost:23,kind:'movement'},
 shield:{label:'Щит',cooldown:3.4,cost:25,kind:'defense'},
 strike:{label:'Удар',cooldown:1.2,cost:18,kind:'melee'},
 mine:{label:'Мина',cooldown:4.0,cost:26,kind:'trap'},
 heal:{label:'Ремонт',cooldown:5.0,cost:30,kind:'support'}
};
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const norm=(x,y)=>{const k=Math.hypot(x,y)||1;return [x/k,y/k]};
export function rand(seed=1){let s=(seed>>>0)||1;return ()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296}};
export function arenaWalls(type='cover',ticks=0){
 if(type==='open')return [];
 const walls=[{x:365,y:85,w:70,h:115},{x:365,y:280,w:70,h:115}];
 if(type==='hazards')walls.push({x:365+95*Math.sin(ticks*DT*1.5),y:225,w:70,h:30});
 return walls;
}
const touchesWall=(x,y,r,ws)=>ws.some(w=>x+r>w.x&&x-r<w.x+w.w&&y+r>w.y&&y-r<w.y+w.h);
const lineBlocked=(a,b,ws)=>{
 const steps=Math.max(2,Math.ceil(Math.hypot(a.x-b.x,a.y-b.y)/16));
 for(let i=1;i<steps;i++){const t=i/steps;if(touchesWall(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t,2,ws))return true;}return false;
};
export const LOADOUTS={
 skirmisher:['bolt','dash','mine'],
 guardian:['bolt','shield','heal'],
 bruiser:['bolt','strike','dash'],
 tactician:['bolt','mine','shield']
};
export function makePolicy(type='balanced',seed=5){
 const random=rand(seed);
 const fixed={
  balanced:[.5,.48,.57,.65,.35,.5,.7,.6],
  aggressive:[.92,.23,.86,.65,.25,.45,.95,.27],
  evasive:[.26,.97,.31,.36,.95,.82,.41,.83],
  support:[.37,.75,.35,.72,.58,.62,.41,.89]
 };
 const p=(fixed[type]||fixed.balanced).slice();
 return {type:'combat-policy',version:1,name:type,weights:p.map(v=>clamp(v+(random()-.5)*.05,0,1))};
}
export function validPolicy(p){
 return !!p&&p.type==='combat-policy'&&p.version===1&&Array.isArray(p.weights)&&p.weights.length===8&&p.weights.every(x=>Number.isFinite(x)&&x>=0&&x<=1);
}
export function mutatePolicy(policy,seed,scale=.16){
 if(!validPolicy(policy))throw Error('Некорректная политика');
 const random=rand(seed);
 return {...policy,weights:policy.weights.map(v=>clamp(v+(random()+random()-1)*scale,0,1))};
}
export function createBattle({arena='cover',teamSize=1,seed=1,loadouts=['skirmisher','guardian'],policies=null,maxSeconds=55,rules=null}={}){
 if(!ARENAS.some(x=>x.id===arena)||![1,2].includes(teamSize))throw Error('Некорректная арена');
 const custom=rules?validateCombatRules(rules):null;
 const rng=rand(seed),agents=[];
 for(let side=0;side<2;side++)for(let slot=0;slot<teamSize;slot++){
  const id=side*teamSize+slot,requested=loadouts[side],loadout=Array.isArray(requested)?requested.filter(x=>Object.hasOwn(SKILLS,x)).slice(0,4):(LOADOUTS[requested]||LOADOUTS.skirmisher);
  if(!loadout.length)throw Error('У бойца должна быть хотя бы одна способность');
  agents.push({id,team:side,slot,x:side===0?110:690,y:teamSize===1?240:slot===0?163:317,
   vx:0,vy:0,face:side===0?0:Math.PI,hp:custom?.teams[side].hp??120,maxHp:custom?.teams[side].hp??120,
   topSpeed:custom?.teams[side].speed??140,energyRegen:custom?.teams[side].energyRegen??14,
   energy:100,shield:0,damage:0,kills:0,alive:true,
   loadout:loadout.slice(),cd:{bolt:0,dash:0,shield:0,strike:0,mine:0,heal:0},policy:validPolicy(policies?.[side])?policies[side]:makePolicy(side?'balanced':'aggressive',seed+id*13)});
 }
 return {version:2,arena,seed,teamSize,agents,shots:[],mines:[],events:[],ticks:0,time:0,
   maxSeconds:custom?custom.limitSeconds:maxSeconds,rules:custom,objectives:[0,0],
   done:false,winner:null,randomState:Math.floor(rng()*0xffffffff),scores:[0,0],hazardHits:[0,0]};
}
export function battleWalls(state){return [...arenaWalls(state.arena,state.ticks),...(state.rules?.walls||[])];}
const safe=battleWalls;
function move(agent,dx,dy,walls){
 const r=15;
 const x=clamp(agent.x+dx,r,CW-r),y=clamp(agent.y+dy,r,CH-r);
 if(!touchesWall(x,agent.y,r,walls))agent.x=x;
 if(!touchesWall(agent.x,y,r,walls))agent.y=y;
}
function injure(s,a,damage,attacker){
 if(!a.alive)return;
 const blocked=Math.min(a.shield,damage);a.shield-=blocked;
 const dealt=Math.max(0,damage-blocked);a.hp=Math.max(0,a.hp-dealt);
 if(attacker&&attacker.team!==a.team){attacker.damage+=dealt;s.scores[attacker.team]+=dealt;}
 if(a.hp<=0){a.alive=false;s.events.push({kind:'down',x:a.x,y:a.y,team:a.team});if(attacker)attacker.kills++;}
}
function enemies(s,a){return s.agents.filter(b=>b.alive&&b.team!==a.team);}
function targetFor(s,a,walls){
 let seen=null,dist=Infinity;
 for(const b of enemies(s,a)){const d=Math.hypot(b.x-a.x,b.y-a.y);if(d<dist){seen=b;dist=d;}}
 return seen;
}
function cast(s,a,skill,t,dx,dy,walls){
 const entry=SKILLS[skill];
 if(!entry||!a.loadout.includes(skill)||a.cd[skill]>0||a.energy<entry.cost)return false;
 const dir=norm(dx,dy);
 if(skill==='strike'&&Math.hypot(t.x-a.x,t.y-a.y)>78)return false;
 if(skill==='heal'&&a.hp>a.maxHp-8)return false;
 if(skill==='mine'&&s.mines.filter(m=>m.owner===a.id).length>=3)return false;
 a.energy-=entry.cost;a.cd[skill]=entry.cooldown;
 const power=id=>s.rules?.skillPower?.[id]??{bolt:19,dash:70,shield:38,strike:31,mine:29,heal:35}[id];
 if(skill==='bolt'&&s.shots.length<90)s.shots.push({x:a.x+dir[0]*19,y:a.y+dir[1]*19,vx:dir[0]*440,vy:dir[1]*440,life:1.8,owner:a.id,damage:power('bolt')});
 else if(skill==='dash'){move(a,dir[0]*power('dash'),dir[1]*power('dash'),walls);s.events.push({kind:'dash',x:a.x,y:a.y,team:a.team});}
 else if(skill==='shield')a.shield=Math.min(100,a.shield+power('shield'));
 else if(skill==='strike')injure(s,t,power('strike'),a);
 else if(skill==='heal')a.hp=Math.min(a.maxHp,a.hp+power('heal'));
 else if(skill==='mine')s.mines.push({x:a.x,y:a.y,owner:a.id,life:9,r:46,damage:power('mine')});
 s.events.push({kind:skill,x:a.x,y:a.y,team:a.team});return true;
}
function policyControl(s,a,t,walls){
 const p=a.policy.weights,dx=t.x-a.x,dy=t.y-a.y,d=Math.hypot(dx,dy)||1,ux=dx/d,uy=dy/d;
 const side=a.team?1:-1,orbit=p[1]*2-1;
 let forward=d>150?-1:1;
 if(d>175)forward=1;else if(d<80)forward=-1;else forward=(p[0]-.5)*1.3;
 const spread=p[3]*90+55;
 if(d<spread)forward=-.8;
 let mx=ux*forward+(-uy)*orbit*.85*side,my=uy*forward+ux*orbit*.85*side;
 const cw=walls.find(w=>Math.hypot(w.x+w.w/2-a.x,w.y+w.h/2-a.y)<145);
 if(cw&&lineBlocked(a,t,walls)){mx+=-uy*.5;my+=ux*.5;}
 const strength=p[2]*.3+.7;
 const energyBias=p[6],healthBias=p[7];
 const skillOrder=a.hp<a.maxHp*.38&&healthBias>.44?['heal','shield','bolt','dash','mine','strike']:
  d<90&&energyBias>.5?['strike','dash','bolt','mine','shield','heal']:
  d<180?['bolt','mine','shield','dash','strike','heal']:
  ['bolt','dash','mine','shield','heal','strike'];
 const urge=p[4]+(a.hp<65?.24:0);
 for(const skill of skillOrder){
  if(skill==='shield'&&a.shield>25)continue;
  if(skill==='dash'&&(d>220||d<70||urge<.35))continue;
  if(skill==='mine'&&d>240)continue;
  if(skill==='heal'&&a.hp>a.maxHp*.68)continue;
  if(skill==='bolt'&&lineBlocked(a,t,walls))continue;
  if(skill==='strike'&&d>78)continue;
  if(cast(s,a,skill,t,dx,dy,walls))break;
 }
 return {mx:mx*strength,my:my*strength};
}
export function stepBattle(s){
 if(s.done)return s;
 s.events=[];s.ticks++;s.time=s.ticks*DT;const walls=safe(s);
 for(const a of s.agents){
  if(!a.alive)continue;
  for(const k of Object.keys(a.cd))a.cd[k]=Math.max(0,a.cd[k]-DT);
  a.energy=clamp(a.energy+a.energyRegen*DT,0,100);
  const t=targetFor(s,a,walls);if(!t)continue;
  const dx=t.x-a.x,dy=t.y-a.y;
  a.face=Math.atan2(dy,dx);
  const control=policyControl(s,a,t,walls),v=a.topSpeed*(a.loadout.includes('dash')?1.08:1);
  a.vx+=((control.mx*v)-a.vx)*Math.min(1,DT*8);
  a.vy+=((control.my*v)-a.vy)*Math.min(1,DT*8);
  move(a,a.vx*DT,a.vy*DT,walls);
  const zones=s.rules?.zones||(s.arena==='hazards'?[{x:400,y:240,r:84,dps:11}]:[]);
  for(const z of zones){
    if(Math.hypot(a.x-z.x,a.y-z.y)<z.r){injure(s,a,z.dps*DT,null);s.hazardHits[a.team]++;}
  }
 }
 for(let i=s.shots.length-1;i>=0;i--){
  const p=s.shots[i];p.life-=DT;p.x+=p.vx*DT;p.y+=p.vy*DT;
  if(p.life<=0||p.x<0||p.y<0||p.x>CW||p.y>CH||touchesWall(p.x,p.y,4,walls)){s.shots.splice(i,1);continue;}
  const shooter=s.agents.find(a=>a.id===p.owner);
  const hit=s.agents.find(a=>a.alive&&a.team!==shooter.team&&Math.hypot(a.x-p.x,a.y-p.y)<20);
  if(hit){injure(s,hit,p.damage,shooter);s.events.push({kind:'impact',x:p.x,y:p.y,team:shooter.team});s.shots.splice(i,1);}
 }
 for(let i=s.mines.length-1;i>=0;i--){
  const m=s.mines[i];m.life-=DT;const owner=s.agents[m.owner];
  const hits=s.agents.filter(a=>a.alive&&a.team!==owner.team&&Math.hypot(a.x-m.x,a.y-m.y)<m.r);
  if(hits.length){for(const hit of hits)injure(s,hit,m.damage??29,owner);s.events.push({kind:'mine-hit',x:m.x,y:m.y,team:owner.team});s.mines.splice(i,1);}
  else if(m.life<=0)s.mines.splice(i,1);
 }
 const alive=[0,1].map(team=>s.agents.some(a=>a.team===team&&a.alive));
 if(s.rules?.mode==='control'){
  const point=s.rules.point;
  const occupied=[0,1].map(team=>s.agents.some(a=>a.alive&&a.team===team&&Math.hypot(a.x-point.x,a.y-point.y)<=point.r));
  // Only an uncontested point accumulates occupation progress.
  for(const team of [0,1])if(occupied[team]&&!occupied[1-team])s.objectives[team]+=DT*3;
 }
 if(s.rules?.mode==='score')s.objectives=s.scores.slice();
 const completedObjective=s.rules?.mode!=='elimination'&&s.rules?.mode!=null&&s.objectives.some(value=>value>=s.rules.targetScore);
 if(!alive[0]||!alive[1]||completedObjective||s.time>=s.maxSeconds){
  s.done=true;
  if(alive[0]!==alive[1])s.winner=alive[0]?0:1;
  else if(s.rules&&s.rules.mode!=='elimination'&&Math.abs(s.objectives[0]-s.objectives[1])>1e-6)
   s.winner=s.objectives[0]>s.objectives[1]?0:1;
  else {
   const score=[0,1].map(team=>s.agents.filter(a=>a.team===team).reduce((sum,a)=>sum+a.hp+a.shield*.5,0)+s.scores[team]*.2);
   s.winner=Math.abs(score[0]-score[1])<.001?-1:score[0]>score[1]?0:1;
  }
  s.events.push({kind:'finish',winner:s.winner});
 }
 return s;
}
export function battleSummary(s){
 return {winner:s.winner,seconds:Math.round(s.time*10)/10,damage:s.scores.slice(),hp:[0,1].map(team=>Math.round(s.agents.filter(a=>a.team===team).reduce((x,a)=>x+a.hp,0))),kills:[0,1].map(team=>s.agents.filter(a=>a.team===team).reduce((x,a)=>x+a.kills,0)),hazards:s.hazardHits.slice(),objectives:s.objectives.slice(),mode:s.rules?.mode||'elimination'};
}
export function simulateBattle(options={},record=false){
 const s=createBattle(options),frames=[];
 while(!s.done){stepBattle(s);if(record&&s.ticks%3===0&&frames.length<800)frames.push(snapshotBattle(s));}
 return {summary:battleSummary(s),frames};
}
export function snapshotBattle(s){return {time:s.time,agents:s.agents.map(a=>({id:a.id,team:a.team,x:a.x,y:a.y,hp:a.hp,shield:a.shield,energy:a.energy,alive:a.alive,face:a.face})),shots:s.shots.map(p=>({x:p.x,y:p.y,team:s.agents[p.owner].team})),mines:s.mines.map(m=>({x:m.x,y:m.y,team:s.agents[m.owner].team})),events:s.events.slice(),winner:s.winner,objectives:s.objectives.slice(),walls:battleWalls(s).map(w=>({...w})),zones:(s.rules?.zones||(s.arena==='hazards'?[{x:400,y:240,r:84,dps:11}]:[])).map(z=>({...z})),point:s.rules?.mode==='control'?{...s.rules.point}:null,maxHp:s.agents[0]?.maxHp||120};}
