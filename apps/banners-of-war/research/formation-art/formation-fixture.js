// Existing physical engine and the prior valley seed-selection criteria, no map editing.
import {E} from '../../engine.js';
export function recordFormation(){
 let chosen=null,best=-Infinity;
 for(let i=31;i<45;i++){let s=E.create('reference valley '+i,['spear'],['spear'],'adaptive','valley'),y=s.terrain.ford,x=E.riverX(s.terrain,y),center={x:x-36,y:y+5},score=0;
 for(let dx of [-65,-40,-15,15,40,65])for(let dy of [-55,-25,25,55]){let q=E.sample(s.terrain,center.x+dx,center.y+dy);score+=(q.wood?3:0)+(q.road?1:0)+Math.abs(q.h-E.sample(s.terrain,center.x,center.y).h)*.13}
 if(score>best){best=score;chosen=s}}
 let s=chosen,x=E.riverX(s.terrain,s.terrain.ford)-35,y=s.terrain.ford+5,a=.24;
 for(let u of s.units){if(u.type==='guard'){u.x=x+(u.side?110:-110);u.y=y+145;continue}let sign=u.side?1:-1;u.x=x+sign*Math.cos(a)*21;u.y=y+sign*Math.sin(a)*21;u.a=a+(u.side?Math.PI:0);u.form=u.side?'shield':'spears';u.cols=E.forms[u.form].cols}
 s.objective={kind:'power',seconds:120};let frames=[],ordersLog=[];
 for(let round=0;round<4&&!s.result;round++){let orders={};for(let u of s.units.filter(E.alive)){let enemy=s.units.find(v=>v.side!==u.side&&v.type==='spear'&&E.alive(v));orders[u.id]=u.type==='guard'||!enemy?{kind:'hold',path:[]}:{kind:u.side&&round===0?'hold':'attack',path:[],target:enemy.id,a:u.a}}
 let rr=E.resolve(s,orders,false);frames.push(...rr.frames.slice(round?1:0));s=rr.state;ordersLog.push(orders)}
 let chosenIndex=0,score=-Infinity;for(let i=0;i<frames.length;i++){let u=frames[i].units.filter(u=>u.type==='spear'),contacts=u.reduce((n,u)=>n+(u.contact>0),0),cohesion=u.reduce((n,u)=>n+u.cohesion,0)/u.length,loss=u.reduce((n,u)=>n+u.initial-u.n,0);let v=contacts*100+Math.min(loss,45)*.7+Math.min(25,100-cohesion)*1.3-(u.some(u=>u.rout)?150:0);if(v>score){score=v;chosenIndex=i}}
 let counts=frames.map(f=>f.units.filter(u=>u.type==='spear'));return {id:'infantry',F:E,frames,best:chosenIndex,history:ordersLog,measure:{count:2,peakContact:Math.max(...counts.map(a=>a.filter(u=>u.contact>0).length)),loss:counts[0].reduce((n,u)=>n+u.n,0)-counts.at(-1).reduce((n,u)=>n+u.n,0),minCohesion:Math.min(...counts.flatMap(a=>a.map(u=>u.cohesion))),seed:chosen.seed}}
}
