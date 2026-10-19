// PetriForge 0.5 · compact, transferable tactical policy (not a neural network).
import {RUNES} from '../perekos/runes.mjs';
import {MAGES} from '../perekos/mages.mjs';
import {WALLS} from '../perekos/core.mjs';
export const PARAMS=Object.freeze(['pressure','orbit','preferredRange','shotDiscipline','leadAim','dodge','dash','guard','cooling','runeAttack','runeDefense','runeUtility','anticipation','jitter']);
export const POLICY_VERSION=1;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function seeded(seed=1){let s=(seed>>>0)||1;return ()=>{s=(Math.imul(1664525,s)+1013904223)>>>0;return s/4294967296;};}
export function createPerekosPolicy(seed=1,style='balanced'){
 const base=({
  balanced:[.53,.55,.52,.7,.45,.65,.6,.7,.75,.6,.48,.43,.6,.13],
  aggressive:[.9,.45,.72,.85,.55,.48,.7,.4,.36,.83,.25,.48,.5,.2],
  evasive:[.28,.92,.28,.69,.62,.98,.9,.94,.9,.4,.8,.69,.9,.07],
  defensive:[.43,.55,.46,.65,.4,.77,.65,.92,.75,.33,.92,.58,.75,.09]
 })[style]||null;
 if(!base)throw Error('Неизвестный стиль');
 const rng=seeded(seed);
 return {kind:'perekos-policy',version:POLICY_VERSION,source:'native',weights:base.map(v=>clamp(v+(rng()-.5)*.035,0,1))};
}
export function validatePerekosPolicy(p){
 return !!p&&p.kind==='perekos-policy'&&p.version===POLICY_VERSION&&Array.isArray(p.weights)&&p.weights.length===PARAMS.length&&p.weights.every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1);
}
export function mutatePerekosPolicy(p,seed,scale=.19){
 if(!validatePerekosPolicy(p))throw Error('Недопустимая модель Перекоса');
 const rng=seeded(seed);
 return {...p,source:'trained',weights:p.weights.map(v=>clamp(v+(rng()+rng()-1)*scale,0,1))};
}
const vec=(dx,dy)=>{const d=Math.hypot(dx,dy)||1;return [dx/d,dy/d];};

function crossing(ax,ay,bx,by){
 for(const wall of WALLS){
  const padded={x:wall.x-17,y:wall.y-17,w:wall.w+34,h:wall.h+34};
  let start=0,end=1;
  for(const [p,d,min,max] of [[ax,bx-ax,padded.x,padded.x+padded.w],[ay,by-ay,padded.y,padded.y+padded.h]]){
   if(Math.abs(d)<1e-9){if(p<min||p>max){start=2;break;}}
   else{const a=(min-p)/d,b=(max-p)/d;start=Math.max(start,Math.min(a,b));end=Math.min(end,Math.max(a,b));}
  }
  if(start<=end&&end>=0&&start<=1)return wall;
 }
 return null;
}
function bypass(ax,ay,bx,by,obstacle){
 const margin=25,points=[
 [obstacle.x-margin,obstacle.y-margin],[obstacle.x+obstacle.w+margin,obstacle.y-margin],
 [obstacle.x-margin,obstacle.y+obstacle.h+margin],[obstacle.x+obstacle.w+margin,obstacle.y+obstacle.h+margin]
 ];
 let best=null,score=Infinity;
 for(const [x,y] of points){
  if(x<32||x>368||y<32||y>588||crossing(ax,ay,x,y))continue;
  const cost=Math.hypot(ax-x,ay-y)+Math.hypot(bx-x,by-y)+(crossing(x,y,bx,by)?110:0);
  if(cost<score){score=cost;best=[x,y];}
 }
 return best;
}

const index=Object.fromEntries(PARAMS.map((k,i)=>[k,i]));
function nearestThreat(o,player){
 let best=null;
 for(const shot of o.shots){
  if(shot.owner===player)continue;
  const x=o.self.x*400-shot.x*400,y=o.self.y*620-shot.y*620;
  const vx=shot.vx,vy=shot.vy,speed=Math.max(1,vx*vx+vy*vy);
  const t=clamp((x*vx+y*vy)/speed,0,.7);
  const distance=Math.hypot(x-vx*t,y-vy*t);
  if(!best||distance<best.distance)best={distance,t,vx,vy,shot};
 }
 return best;
}
export function choosePerekosRune(o,p){
 if(!validatePerekosPolicy(p))throw Error('Неподдерживаемый мозг');
 const offers=o.offers||[];if(!offers.length)return null;
 const w=p.weights,existing=o.self.runes||[];
 const kinds={when:existing.filter(x=>RUNES.find(r=>r.id===x)?.type==='when').length,do:existing.filter(x=>RUNES.find(r=>r.id===x)?.type==='do').length,how:existing.filter(x=>RUNES.find(r=>r.id===x)?.type==='how').length};
 let best=offers[0],bestScore=-Infinity;
 for(let i=0;i<offers.length;i++){
  const id=offers[i],r=RUNES.find(v=>v.id===id);if(!r)continue;
  let score=0;
  if(['ball','blast','mine','strong','double','triple','on_hit','on_cast','as_fire'].includes(id))score+=w[index.runeAttack]*1.7;
  if(['armor','heal','wall','push','on_hurt','on_guard','on_break','as_stone'].includes(id))score+=w[index.runeDefense]*1.7;
  if(['blink','haste','cool','quick','cheap','fastshot','slow','as_storm'].includes(id))score+=w[index.runeUtility]*1.4;
  // Build syntactically useful chains: do not stack modifiers without triggers.
  if(r.type==='when')score+=kinds.when===0?2:.25;
  if(r.type==='do')score+=kinds.when>0&&kinds.do===0?1.8:.7;
  if(r.type==='how')score+=kinds.do>0?1:-.55;
  if(id==='cool'&&o.self.heat>.5)score+=2;
  if(id==='heal'&&o.self.hp<.5)score+=1;
  if(existing.includes(id))score-=5;
  score+=i*-.0001;
  if(score>bestScore){bestScore=score;best=id;}
 }
 return best;
}
export function perekosControl(o,p,player=0,tick=0){
 if(!validatePerekosPolicy(p))throw Error('Недопустимая модель Перекоса');
 const w=p.weights,s=o.self,e=o.opponent,dx=(e.x-s.x)*400,dy=(e.y-s.y)*620;
 const distance=Math.hypot(dx,dy)||1,[nx,ny]=vec(dx,dy),side=player===0?1:-1;
 const shotSpeed=({kindle:260,cinder:260,wire:365,coil:365,pebble:198,slate:205})[s.mageId]||252;
 const shotLifetime=shotSpeed<=205?1.32:shotSpeed>=350?.96:1.15;
 const effectiveRange=shotSpeed*shotLifetime-25;
 // Stay inside practical projectile lifetime, not the theoretical maximum map range.
 const target=Math.min(90+w[index.preferredRange]*155,effectiveRange-65);
 const distBias=distance>target+12?1:distance<target-43?-1:.15;
 const pressure=.75+w[index.pressure]*.7;
 let mx=nx*distBias*pressure-ny*(w[index.orbit]*1.9-.95)*side;
 let my=ny*distBias*pressure+nx*(w[index.orbit]*1.9-.95)*side;
 const ax=s.x*400,ay=s.y*620,bx=e.x*400,by=e.y*620;
 const blockingWall=crossing(ax,ay,bx,by);
 if(blockingWall){
  const route=bypass(ax,ay,bx,by,blockingWall);
  if(route){const [wx,wy]=vec(route[0]-ax,route[1]-ay);mx=wx*1.35;my=wy*1.35;}
  else{mx=-ny*(side||1);my=nx*(side||1);}
 }
 const threat=nearestThreat(o,player);
 const danger=!!(threat&&threat.distance<42+w[index.anticipation]*40&&threat.t<.52);
 if(danger){
  const mag=vec(-threat.vy,threat.vx),sign=((s.x*400-threat.shot.x*400)*mag[0]+(s.y*620-threat.shot.y*620)*mag[1])>=0?1:-1;
  mx=mx*(1-w[index.dodge])+mag[0]*sign*2*w[index.dodge];
  my=my*(1-w[index.dodge])+mag[1]*sign*2*w[index.dodge];
 }
 const centerDist=Math.hypot((s.x-.5)*400,(s.y-.5)*620),ring=o.arena.ring;
 if(o.remaining<12&&centerDist>ring-50){
  const [cx,cy]=vec(.5-s.x,.5-s.y);
  mx=mx*.25+cx*1.7;my=my*.25+cy*1.7;
 }
 const n=Math.max(1,Math.hypot(mx,my));mx/=n;my/=n;
 const lead=clamp((distance/shotSpeed)*(.55+w[index.leadAim]*.5),0,.72);
 const aimX=e.x*400+e.vx*lead,aimY=e.y*620+e.vy*lead;
 const jitter=Math.sin(tick*.041+player*3)*w[index.jitter]*20;
 const fire=e.hp>0&&!blockingWall&&s.cast<=.05&&s.heat<w[index.cooling]*.5+.49&&distance<effectiveRange*(.8+w[index.shotDiscipline]*.2);
 const critical=danger&&threat.distance<45;
 const dashAttack=!!(!critical&&!blockingWall&&distance>effectiveRange*.78&&distance<400&&s.dashReady<=0&&w[index.pressure]>.68&&w[index.dash]>.45);
 const canShield=critical&&s.shieldReady<=0&&w[index.guard]>.22;
 return {x:mx,y:my,attack:fire,shield:canShield,
  dash:(critical&&threat.t<.22&&s.dashReady<=0&&w[index.dash]>.35)||dashAttack,
  aim:{x:clamp(aimX+jitter,1,399),y:clamp(aimY-jitter,1,619)},
  meta:{distance:Math.round(distance),danger:!!danger,pressure:Math.round(pressure*100),preferred:Math.round(target),effectiveRange:Math.round(effectiveRange),blocked:!!blockingWall}};
}
export function tacticalTransfer(combat){
 if(!Array.isArray(combat?.weights)||combat.weights.length!==8||combat.weights.some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0||v>1))throw Error('Неподдерживаемый боевой мозг');
 const a=combat.weights;
 return {kind:'perekos-policy',version:POLICY_VERSION,source:'heuristic-transfer',
  weights:[a[0],a[1],a[3],a[6],a[2],a[1],a[4],a[7],a[7],a[6],a[7],a[5],a[2],.1]};
}
export const MAGE_CHOICES=MAGES.map(({id,name,school})=>({id,name,school}));
