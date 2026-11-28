import {E} from '../../engine.js';
import {makeProject,flatTerrain,validateScenarioProject,sanitizeProject} from '../../laboratory.js';
export const names={infantry:"Столкновение пехоты",charge:"Кавалерийская атака",missiles:"Стрелковый обстрел",disorder:"Нарушение построения",withdraw:"Организованное отступление",reserve:"Вступление резерва",ford:"Бой за переправу"};
const unit=(type,x,y,side,patch={})=>{let t=E.types[type],form=t.horse?"wedge":t.range?"loose":type==="pike"?"spears":"line";return {type,name:t.name,n:t.n,form,cols:E.forms[form].cols,morale:t.morale,cohesion:100,fatigue:0,ammo:t.ammo||0,x,y,a:side?Math.PI:0,group:"Линия",...patch}};
export function projectFor(id){
 if(!names[id])throw Error("Unknown evidence case");let p=makeProject({seed:"Greyford-evidence-"+id});p.title=names[id];p.terrain=flatTerrain(p.width,p.height);p.seconds=120;p.notes="Контрольная ситуация визуализации, не новый игровой сценарий. Стандартные характеристики полков.";
 let blue=[],red=[],add=(side,type,x,y,patch)=> (side?red:blue).push(unit(type,x,y,side,patch));
 if(id==="infantry"||id==="disorder"){for(let i=0;i<3;i++){add(0,"spear",670,400+i*48);add(1,id==="disorder"?"sword":"spear",730,400+i*48)}if(id==="disorder"){add(1,"knight",660,540,{a:-Math.PI/2});add(1,"sword",610,400,{a:0})}}
 if(id==="charge"){add(0,"knight",620,450);add(0,"lightHorse",615,505);add(1,"sword",720,450);add(1,"spear",720,505)}
 if(id==="missiles"){for(let i=0;i<2;i++){add(0,i?"crossbow":"archer",650,425+i*75);add(1,"sword",725,425+i*75)}}
 if(id==="withdraw"){for(let i=0;i<3;i++){add(0,"spear",660,400+i*45);add(1,"sword",715,400+i*45)}}
 if(id==="reserve"){add(0,"spear",670,430);add(0,"sword",610,500,{arrival:12,group:"Резерв"});add(1,"spear",730,430);add(1,"sword",730,500)}
 if(id==="ford"){let t=p.terrain;for(let j=0;j<t.rows;j++)for(let i=0;i<t.cols;i++){let x=i*20,y=j*20,k=j*t.cols+i;if(Math.abs(x-700)<=20){t.waterMask[k]=1;if(Math.abs(y-450)<45)t.crossingMask[k]=1}}t.hasRiver=true;t.river=700;t.ford=450;for(let i=0;i<2;i++){add(0,"spear",660,430+i*40);add(1,"spear",740,430+i*40)}}
 p.armies[0].units=blue;p.armies[1].units=red;p.armies[0].guard={x:450,y:450,a:0};p.armies[1].guard={x:950,y:450,a:Math.PI};return sanitizeProject(p)
}
export function recordCase(id){
 const project=projectFor(id),valid=validateScenarioProject(project);if(valid.errors.length)throw Error(id+": "+valid.errors.join("; "));let s=valid.state,frames=[],history=[],orders={};
 for(let round=0;round<4&&!s.result;round++){
  orders={};for(let u of s.units){if(!E.alive(u)||u.rout||u.pendingArrival)continue;const enemy=s.units.filter(v=>v.side!==u.side&&v.type!=="guard"&&E.alive(v)&&!v.rout).sort((a,b)=>E.dist(u,a)-E.dist(u,b))[0];let kind="hold",path=[],target;
   if(u.type!=="guard"&&enemy){if(id==="missiles"){kind=E.spec(u).range?"shoot":"hold";if(kind==="shoot")target=enemy.id}
    else if(id==="withdraw"&&u.side===0){kind="retreat";path=[{x:Math.max(300,u.x-120),y:u.y}]}
    else if(id==="reserve"&&u.groupName==="Резерв"){kind="advance";path=[{x:700,y:u.y}]}
    else{kind=E.spec(u).horse?"charge":"attack";target=enemy.id}}
   orders[u.id]={kind,path,a:u.a,...(target===undefined?{}:{target})}
  }let rr=E.resolve(s,orders,false);frames.push(...rr.frames.slice(round?1:0));s=rr.state;history.push({round:round+1,time:s.time,orders})
 }
 const initial=frames[0],final=frames.at(-1),measure={contacts:Math.max(...frames.map(f=>f.units.filter(u=>u.contact>0).length)),shots:Math.max(...frames.map(f=>f.shots.length)),minCohesion:Math.min(...frames.flatMap(f=>f.units.filter(u=>u.type!=="guard").map(u=>u.cohesion))),routed:Math.max(...frames.map(f=>f.units.filter(u=>u.rout).length)),withdrawn:final.units.filter(u=>u.side===0&&u.type!=="guard"&&u.x<initial.units.find(v=>v.id===u.id).x-25).length,reserveArrived:initial.units.some(u=>u.pendingArrival)&&final.units.some(u=>initial.units.find(v=>v.id===u.id)?.pendingArrival&&!u.pendingArrival),loss:initial.units.reduce((n,u)=>n+u.n,0)-final.units.reduce((n,u)=>n+u.n,0),events:s.events};
 let score=f=>id==="missiles"?f.shots.length:id==="withdraw"?Math.min(3,f.units.filter(u=>u.side===0&&u.type!=="guard"&&u.order.kind==="retreat"&&u.v>.1).length):id==="reserve"?f.units.filter(u=>u.groupName==="Резерв"&&!u.pendingArrival).length*4+f.units.filter(u=>u.contact>0).length:id==="disorder"?f.units.filter(u=>u.contact>0).length+f.units.reduce((n,u)=>n+(100-u.cohesion)/30+(u.rout?3:0),0):f.units.filter(u=>u.contact>0).length;
 let best=0;for(let i=1;i<frames.length;i++)if(score(frames[i])>score(frames[best]))best=i;
 return {id,title:names[id],project,frames,history,measure,best}
}
