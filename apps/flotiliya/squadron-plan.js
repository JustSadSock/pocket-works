import {canPlan,stageRange} from './turn-budget.js';

const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const order=(kind,targetId)=>({kind,targetId,route:[]});
function seaObstacle(point,islands,margin=1){
 return islands.some(land=>{
  const rotation=-(land.rotation||0),dx=point.x-land.x,dy=point.y-land.y;
  const x=dx*Math.cos(rotation)-dy*Math.sin(rotation);
  const y=dx*Math.sin(rotation)+dy*Math.cos(rotation);
  return Math.hypot(x/(land.rx+16),y/(land.ry+14))<margin;
 });
}
// Explicit tactical assistant. Every proposed waypoint passes exactly the
// same point and stage-range validation as hand-drawn player routes.
export function planSquadronShip(ship,target,{mission='battle',islands=[]}={}){
 const d=dist(ship,target);
 const board=ship.type==='heavy'&&d<82&&ship.morale>42&&ship.crew>ship.maxCrew*.6;
 const shooting=d<ship.range*.82;
 const orders=[order(shooting?'shoot':'hold',target.id),order(board?'board':shooting?'shoot':'hold',target.id)];
 const away=Math.atan2(ship.y-target.y,ship.x-target.x);
 const range=ship.range*(ship.type==='bow'?.60:.45);
 let objective=mission==='breakout'
  ?{x:ship.x,y:92}
  :{x:target.x+Math.cos(away)*range,y:target.y+Math.sin(away)*range};
 if(mission==='intercept')
  objective={x:(ship.x+target.x)*.5,y:Math.min(ship.y-90,Math.max(350,target.y+90))};
 let origin={x:ship.x,y:ship.y};
 for(let stage=0;stage<2;stage++){
  if(dist(origin,objective)<20)break;
  let theta=Math.atan2(objective.y-origin.y,objective.x-origin.x);
  const length=Math.min(stageRange(ship)*.84,stage===0?92:79,dist(origin,objective));
  if(length<16)break;
  let p={x:clamp(origin.x+Math.cos(theta)*length,43,617),
    y:clamp(origin.y+Math.sin(theta)*length,43,957)};
  if(seaObstacle(p,islands,1.32)){
   theta+=(ship.x<330?-1:1)*.62;
   p={x:clamp(origin.x+Math.cos(theta)*length*.75,43,617),
      y:clamp(origin.y+Math.sin(theta)*length*.75,43,957)};
  }
  if(!seaObstacle(p,islands,1.09)){
   orders[stage].route=[p];
   if(canPlan(ship,orders))origin=p;
   else orders[stage].route=[];
  }
 }
 for(let stage=1;stage>=0&&!canPlan(ship,orders);stage--){
  orders[stage].route=[];
  if(!canPlan(ship,orders))orders[stage].kind='hold';
 }
 return canPlan(ship,orders)?orders:[order('hold',target.id),order('hold',target.id)];
}
