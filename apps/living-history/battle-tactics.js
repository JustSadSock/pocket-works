// Real 25-metre cells and real people: no fictional soldiers or combat arena.
// All scores are derived read-only from a settled daily shift and site terrain.
import {walkPath,walkable} from './navigation.js';

const SIDE=160;
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
const round=n=>Math.round(n*1000)/1000;
const xy=i=>({x:i%SIDE,y:Math.floor(i/SIDE)});
const cell=(x,y)=>y*SIDE+x;
const SIDES=['claimants','owners'];

function ground(world,site){
 const pos=xy(site);
 let treeEdges=0,rockEdges=0,clearEdges=0;
 for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
  if(!dx&&!dy||!dx&&Math.abs(dy)>1)continue;
  const x=pos.x+dx,y=pos.y+dy;
  if(x<0||x>=SIDE||y<0||y>=SIDE)continue;
  const at=cell(x,y);
  if((world.forest?.[at]||0)>10)treeEdges++;
  if(world.terrain?.[at]===2)rockEdges++;
  if((world.traffic?.[at]||0)>55)clearEdges++;
 }
 // This measures protective edges, not a fabricated height-map or hill bonus.
 const cover=round(clamp(treeEdges*.037+rockEdges*.027,0,.22));
 const footing=round(clamp(1-rockEdges*.023-clearEdges*.008,.72,1));
 return {treeEdges,rockEdges,clearEdges,cover,footing,
  label:cover>.12?'Опушка и каменистые межи':cover>.045?'Неровные межи':'Открытое поле'};
}
function reached(world,conflict,side){
 return conflict[side].map(id=>world.people.find(p=>p.id===id)).filter(p=>
  p?.alive&&p.combatDutyDay===world.day&&p.dailyShift?.day===world.day&&p.dailyShift.workHours>0);
}
function routeApproach(world,home,site){
 const path=walkPath(world,home,xy(site));
 if(path.length<2)return null;
 const a=path[path.length-2],b=path[path.length-1];
 return {x:b.x-a.x,y:b.y-a.y};
}
function flankingMove(world,conflict,people,score){
 if(people.length<2||score.morale<.52)return null;
 const claimantHome=world.households.find(h=>h.id===conflict.claimantId);
 if(!claimantHome)return null;
 const approach=routeApproach(world,claimantHome,conflict.cell);
 if(!approach)return null;
 const p=xy(conflict.cell);
 // Exactly one identifiable villager can reposition into an actual adjacent
 // walkable cell, perpendicular to the family's real approach route.
 for(const direction of [1,-1]){
  const nx=p.x-approach.y*direction,ny=p.y+approach.x*direction;
  if(!walkable(world,nx,ny))continue;
  const site=cell(nx,ny);
  const path=walkPath(world,p,{x:nx,y:ny});
  if(path.length!==2)continue;
  const flanker=people.slice().sort((a,b)=>b.health-a.health||a.id-b.id)[0];
  return {personId:flanker.id,fromCell:conflict.cell,toCell:site,routeCells:path.map(q=>cell(q.x,q.y))};
 }
 return null;
}
export function assessFieldTactics(world,conflict,left,right){
 const terrain=ground(world,conflict.cell);
 const arrivals={claimants:reached(world,conflict,'claimants'),owners:reached(world,conflict,'owners')};
 // Do not fabricate a maneuver for a person absent from the real roster.
 const flank=flankingMove(world,conflict,arrivals.claimants,left);
 const side=(measure,people,defending)=>{
  const cohesion=round(clamp(.62*measure.morale+.38*Math.min(1,people.length/3),0,1));
  const formation=people.length<=1?'одиночка':cohesion<.46?'рассеянная группа':
   people.length>=3?'плотный ряд':'пара';
  const terrainFactor=defending?1+terrain.cover:terrain.footing;
  const flankFactor=defending?1:flank?1.12:1;
  const power=round(measure.power*(.82+.18*cohesion)*terrainFactor*flankFactor);
  return {formation,cohesion,power,count:people.length};
 };
 const claimant=side(left,arrivals.claimants,false),owner=side(right,arrivals.owners,true);
 const total=claimant.power+owner.power;
 return {terrain,claimants:claimant,owners:owner,flank,advantage:total?
  round(claimant.power/total):0};
}
export function tacticalBreak(tactics,loserSide){
 if(!SIDES.includes(loserSide))return false;
 const loser=tactics[loserSide],other=tactics[loserSide==='claimants'?'owners':'claimants'];
 if(!loser.count||!other.count)return false;
 const share=loser.power/Math.max(.001,loser.power+other.power);
 return (share<.38&&loser.cohesion<.78)||(share<.45&&loser.cohesion<.50);
}
export function pursuitChance(tactics,winnerSide,loserSide){
 if(!SIDES.includes(winnerSide)||!SIDES.includes(loserSide)||winnerSide===loserSide)return 0;
 const winner=tactics[winnerSide],loser=tactics[loserSide];
 // An exhausted group without cohesion cannot chase fleeing villagers.
 return winner.count&&loser.count&&winner.cohesion>.56?
  round(clamp(.055+.18*(winner.cohesion-loser.cohesion),.02,.16)):0;
}
