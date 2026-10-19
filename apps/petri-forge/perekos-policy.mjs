// PetriForge 0.5 · compact, transferable tactical policy (not a neural network).
import {RUNES} from '../perekos/runes.mjs';
import {MAGES} from '../perekos/mages.mjs';
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
 const target=92+w[index.preferredRange]*190,distBias=distance>target+25?1:distance<target-35?-1:0;
 const pressure=.55+w[index.pressure]*.7;
 let mx=nx*distBias*pressure-ny*(w[index.orbit]*1.9-.95)*side;
 let my=ny*distBias*pressure+nx*(w[index.orbit]*1.9-.95)*side;
 const threat=nearestThreat(o,player);
 const danger=!!(threat&&threat.distance<42+w[index.anticipation]*40&&threat.t<.52);
 if(danger){
  const mag=vec(-threat.vy,threat.vx),sign=((s.x*400-threat.shot.x*400)*mag[0]+(s.y*620-threat.shot.y*620)*mag[1])>=0?1:-1;
  mx=mx*(1-w[index.dodge])+mag[0]*sign*2*w[index.dodge];
  my=my*(1-w[index.dodge])+mag[1]*sign*2*w[index.dodge];
 }
 const centerDist=Math.hypot((s.x-.5)*400,(s.y-.5)*620),ring=o.arena.ring;
 if(o.remaining<10&&centerDist>ring-35){
  const [cx,cy]=vec(.5-s.x,.5-s.y);
  mx=mx*.25+cx*1.7;my=my*.25+cy*1.7;
 }
 const n=Math.max(1,Math.hypot(mx,my));mx/=n;my/=n;
 const lead=clamp(w[index.leadAim]*.12,0,.12);
 const aimX=e.x*400+e.vx*lead,aimY=e.y*620+e.vy*lead;
 const jitter=Math.sin(tick*.041+player*3)*w[index.jitter]*20;
 const fire=e.hp>0&&s.cast<=.05&&s.heat<w[index.cooling]*.5+.49&&distance<(210+w[index.shotDiscipline]*290);
 const critical=danger&&threat.distance<45;
 return {x:mx,y:my,attack:fire,shield:critical&&s.shieldReady<=0&&w[index.guard]>.22,
  dash:critical&&threat.t<.22&&s.dashReady<=0&&w[index.dash]>.35,
  aim:{x:clamp(aimX+jitter,1,399),y:clamp(aimY-jitter,1,619)},
  meta:{distance:Math.round(distance),danger:!!danger,pressure:Math.round(pressure*100),preferred:Math.round(target)}};
}
export function tacticalTransfer(combat){
 if(!Array.isArray(combat?.weights)||combat.weights.length!==8||combat.weights.some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0||v>1))throw Error('Неподдерживаемый боевой мозг');
 const a=combat.weights;
 return {kind:'perekos-policy',version:POLICY_VERSION,source:'heuristic-transfer',
  weights:[a[0],a[1],a[3],a[6],a[2],a[1],a[4],a[7],a[7],a[6],a[7],a[5],a[2],.1]};
}
export const MAGE_CHOICES=MAGES.map(({id,name,school})=>({id,name,school}));
