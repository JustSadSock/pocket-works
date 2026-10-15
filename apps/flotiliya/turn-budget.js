/**
 * Флотилия — per-ship movement/action points for one simultaneous turn.
 * 1 action point moves approximately 35 world units along a planned course.
 * Both action stages share the same budget and form one continuous 4.5-second course.
 */
export const ACTION_COST=Object.freeze({hold:1,shoot:2,board:3,evade:2});
export const MOVE_STEP=35;
export const PHASE_HALF=2.25;
export const TURN_SECONDS=PHASE_HALF*2;
export const MAX_ROUTE_NODES=36;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export function maxPoints(ship){
 const base=Math.max(5,Math.min(11,Math.round(2.3+Number(ship.turn||.8)*4.9)));
 const oars=Math.max(0,Math.min(100,Number.isFinite(ship.oars)?ship.oars:100));
 // Lost rows of oars lower how many maneuvers can be carried out per phase.
 return Math.max(3,base-Math.ceil((100-oars)/34));
}
export function routeOrigin(ship,orders,index){
 if(index===0)return {x:ship.x,y:ship.y};
 const first=orders[0]?.route||[];
 return first.length?first[first.length-1]:{x:ship.x,y:ship.y};
}
export function stagePathLength(ship,orders,index){
 let origin=routeOrigin(ship,orders,index),length=0;
 for(const point of orders[index]?.route||[]){length+=distance(origin,point);origin=point;}
 return length;
}
export function stagePoints(ship,orders,index){
 const order=orders[index]||{kind:'hold',route:[]};
 const action=ACTION_COST[order.kind]??1;
 const length=stagePathLength(ship,orders,index);
 const movement=Math.ceil(Math.max(0,length-0.001)/MOVE_STEP);
 return {action,movement,spent:action+movement,length};
}
export function getBudget(ship,orders=ship.orders){
 const stages=[stagePoints(ship,orders,0),stagePoints(ship,orders,1)];
 const total=maxPoints(ship),spent=stages[0].spent+stages[1].spent;
 return {total,spent,remaining:total-spent,stages,valid:spent<=total};
}
export function stageRange(ship){
 return ship.speed*TURN_SECONDS*1.14;
}
export function canPlan(ship,orders){
 const b=getBudget(ship,orders);
 // Each order can spend the whole turn on navigation. There is no mid-turn
 // speed boost for the first stage or compulsory stop after 2.25 seconds.
 return b.valid && b.stages.reduce((n,v)=>n+v.length,0)<=stageRange(ship)+0.001;
}
export function availableActions(ship,stage){
 const result={};
 for(const kind of Object.keys(ACTION_COST)){
  const orders=ship.orders.map(o=>({kind:o.kind,targetId:o.targetId,route:[...o.route]}));
  orders[stage].kind=kind;result[kind]=canPlan(ship,orders);
 }
 return result;
}
