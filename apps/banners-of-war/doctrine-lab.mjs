import {E} from './engine.js';
// No doctrine flags exist in the engine. Each experiment constructs ordinary units and orders.
// Three seed/style combinations, then a 180-degree side swap with reflected terrain and plans.
export const doctrines=[
 {id:"double-envelopment",history:"Cannae",own:["spear","knight","knight"],enemy:["spear","spear","spear","spear"]},
 {id:"oblique",history:"Gaugamela",own:["sword","spear","spear","pike"],enemy:["spear","sword","spear","pike"]},
 {id:"weighted-wing",history:"Gaugamela",own:["spear","knight","sword","spear"],enemy:["spear","spear","spear","sword"]},
 {id:"yielding-center",history:"Cannae",own:["spear","sword","sword"],enemy:["spear","sword","spear","spear"]},
 {id:"feigned-retreat",history:"Hastings",own:["lightHorse","spear","sword"],enemy:["spear","knight","sword"]},
 {id:"reserve-breakthrough",history:"Gaugamela",own:["spear","sword","knight","pike"],enemy:["spear","spear","sword","pike"]},
 {id:"defense-in-depth",history:"Hastings",own:["spear","pike","sword","archer"],enemy:["spear","sword","knight","spear"]},
 {id:"mobile-archery",history:"",own:["horseArcher","horseArcher","spear"],enemy:["spear","sword","knight"]},
 {id:"pin-and-charge",history:"Gaugamela",own:["spear","pike","knight"],enemy:["sword","spear","spear"]},
 {id:"chokepoint",history:"Agincourt",own:["pike","spear","archer"],enemy:["spear","sword","sword","knight","spear"]}
];
export const cases=[{seed:"open",style:"aggressive",map:"open"},{seed:"valley",style:"adaptive",map:"wooded"},{seed:"ford",style:"defensive",map:"ford"}];
const P=(x,y)=>({x,y}),move=(x,y,extra={})=>({kind:"move",path:[P(x,y)],...extra}),hold=(kind="brace",extra={})=>({kind,path:[],...extra}),attack=(target,kind="attack",extra={})=>({kind,target,path:[],...extra}),after=(order,when="complete",seconds)=>({...order,when,seconds}),chain=(o,...stages)=>({...o,stages});
function setup(d,k){let s=E.create(k.seed,d.own,d.enemy,k.style);let a=s.units.filter(u=>u.side===0),b=s.units.filter(u=>u.side===1);const offset=k.seed==="valley"?35:k.seed==="ford"?-35:0,cy=450+offset;
 s.terrain=k.map==="open"?{hills:[],woods:[],river:1300,phase:0,ford:cy}:k.map==="wooded"?{...E.terrain(k.seed),river:1250,woods:[{x:600,y:cy-75,r:48},{x:655,y:cy+75,r:55}],hills:[{x:660,y:cy,r:100,h:23}]}:{hills:[{x:640,y:cy,r:105,h:18}],woods:[{x:585,y:cy-94,r:50},{x:585,y:cy+94,r:50}],river:620,phase:-cy/145,ford:cy};
 a.slice(0,-1).forEach((u,i)=>Object.assign(u,{x:565-(i===3?40:0),y:cy+(i-(d.own.length-1)/2)*40,a:0}));b.slice(0,-1).forEach((u,i)=>Object.assign(u,{x:655,y:cy+(i-(d.enemy.length-1)/2)*38,a:Math.PI}));Object.assign(a.at(-1),{x:460,y:cy});Object.assign(b.at(-1),{x:760,y:cy});
 // Starting positions are identical for both policies.
 if(d.id==="double-envelopment"||d.id==="pin-and-charge"||d.id==="yielding-center"){Object.assign(a[0],{x:590,y:cy});Object.assign(a[1],{x:560,y:cy-70});Object.assign(a[2],{x:560,y:cy+70})}
 if(d.id==="feigned-retreat"){Object.assign(a[0],{x:610,y:cy});Object.assign(a[1],{x:550,y:cy-45});Object.assign(a[2],{x:550,y:cy+45})}
 if(d.id==="mobile-archery"){Object.assign(a[0],{x:590,y:cy-48});Object.assign(a[1],{x:590,y:cy+48});Object.assign(a[2],{x:535,y:cy})}
 if(d.id==="reserve-breakthrough"){Object.assign(a[2],{x:515,y:cy});Object.assign(a[3],{x:560,y:cy+62})}
 if(d.id==="defense-in-depth"||d.id==="chokepoint"){Object.assign(a[0],{x:585,y:cy-20});Object.assign(a[1],{x:585,y:cy+20});Object.assign(a[2],{x:540,y:cy});if(a[3]&&a[3].type!=="guard")Object.assign(a[3],{x:515,y:cy+60})}
 if(d.id==="chokepoint")s.terrain={...s.terrain,woods:[{x:600,y:cy-100,r:65},{x:600,y:cy+100,r:65}],river:k.map==="ford"?620:1300,phase:-cy/145,ford:cy};
 return {s,cy}}
function plan(d,s,cy,tactical){const ids=s.units.filter(u=>u.side===1&&u.type!=="guard").map(u=>u.id),mid=ids[Math.floor(ids.length/2)],top=ids[0],bot=ids.at(-1),op={};const a=s.units.filter(u=>u.side===0&&u.type!=="guard");for(const u of a){let t=E.types[u.type];op[u.id]=t.range?hold("shoot",{a:0}):attack(mid,t.horse?"charge":"attack")};op[a.length]=hold("hold");
 if(!tactical)return op;
 switch(d.id){
 case "double-envelopment":op[0]=attack(mid);op[1]=chain(move(690,cy-85),after(attack(top,"charge")));op[2]=chain(move(690,cy+85),after(attack(bot,"charge")));break;
 case "oblique":op[0]=attack(top);op[1]=chain(move(605,cy-40),after(attack(top)));op[2]=chain(hold("brace"),after(attack(mid),"time",22));op[3]=chain(hold("brace"),after(attack(bot),"time",45));break;
 case "weighted-wing":op[0]=hold();op[1]=chain(move(650,cy-95),after(attack(top,"charge")));op[2]=chain(move(610,cy-78),after(attack(top)));op[3]=attack(mid);break;
 case "yielding-center":op[0]=chain({kind:"retreat",path:[P(545,cy)]},after(hold("brace"),"time",30));op[1]=chain(hold(),after(attack(top),"time",18));op[2]=chain(hold(),after(attack(bot),"time",18));break;
 case "feigned-retreat":op[0]=chain({kind:"retreat",path:[P(505,cy)]},after(hold("rally"),"time",24),after(attack(mid,"charge"),"time",8));op[1]=chain(hold(),after(attack(mid),"enemyNear",65));op[2]=chain(hold(),after(attack(mid),"enemyNear",65));break;
 case "reserve-breakthrough":op[0]=attack(top);op[1]=attack(mid);op[2]=chain(hold("rally"),after(move(630,cy+5),"time",35),after(attack(bot,"charge")));op[3]=hold();break;
 case "defense-in-depth":op[0]=hold("brace",{form:"shield"});op[1]=hold("brace",{form:"spears"});op[2]=chain(hold("rally"),after(move(580,cy),"enemyNear",70),after(hold()));op[3]=hold("shoot",{a:0});break;
 case "mobile-archery":for(let i=0;i<2;i++){let dy=i?60:-60;op[i]=chain(hold("shoot",{a:0}),after(move(505,cy+dy),"time",12),after(hold("shoot",{a:0})),after(move(470,cy+dy),"enemyNear",70),after(hold("shoot",{a:0})))}op[2]=hold();break;
 case "pin-and-charge":op[0]=attack(mid);op[1]=attack(top);op[2]=chain(hold(),after(move(650,cy+80),"time",25),after(attack(bot,"charge")));break;
 case "chokepoint":op[0]=hold("brace",{form:"spears",cols:13});op[1]=hold("brace",{form:"shield",cols:14});op[2]=hold("shoot",{a:0});break;
 }return op}
function reflect(s,orders){const t=E.copy(s),swap=id=>id>=100?id-100:id+100,point=p=>({x:E.W-p.x,y:E.H-p.y}),order=o=>({...o,path:o.path.map(point),target:o.target===undefined?undefined:swap(o.target),a:o.a===undefined?undefined:o.a+Math.PI,stages:o.stages?.map(order)});t.units=t.units.map(u=>({...u,...point(u),side:1-u.side,id:swap(u.id),a:u.a+Math.PI})).sort((a,b)=>a.id-b.id);t.terrain={...t.terrain,hills:t.terrain.hills.map(q=>({...q,...point(q)})),woods:t.terrain.woods.map(q=>({...q,...point(q)})),river:E.W-t.terrain.river,phase:-E.H/145-t.terrain.phase,ford:E.H-t.terrain.ford};return {s:t,orders:Object.fromEntries(Object.entries(orders).map(([id,o])=>[swap(+id),order(o)]))}}
function stats(s,side){let a=s.units.filter(u=>u.side===side),n=a.reduce((v,u)=>v+u.n,0),avg=k=>a.reduce((v,u)=>v+u[k],0)/a.length;return {power:E.power(s,side),initial:E.total(s,side),loss:E.total(s,side)-n,morale:avg("morale"),cohesion:avg("cohesion"),fatigue:avg("fatigue"),routed:a.filter(u=>u.rout||u.escaped).length,routEvents:a.reduce((n,u)=>n+(u.routCount||0),0),reserve:a.filter(u=>u.type!=="guard"&&u.combatSeconds>0&&u.stageIndex>0).length,reserveSeconds:a.filter(u=>u.type!=="guard"&&u.stageIndex>0).reduce((n,u)=>n+(u.combatSeconds||0),0),frontYield:a.reduce((n,u)=>n+(u.causes?.yield||0),0),crowding:a.reduce((n,u)=>n+(u.causes?.crowding||0),0)}}
export function trial(d,k,tactical,mirror=false){let {s,cy}=setup(d,k),orders=plan(d,s,cy,tactical),side=mirror?1:0;if(mirror)({s,orders}=reflect(s,orders));const initial=E.copy(s);let reserveIds=s.units.filter(u=>u.side===side&&u.type!=="guard"&&orders[u.id]?.stages?.length&&["hold","brace","rally"].includes(orders[u.id].kind)).map(u=>u.id);for(let round=0;round<4&&!s.result;round++){let enemy=E.ai(s,1-side);s.aiIntent??={};s.aiIntent[1-side]=enemy.intent;E.prepare(s,{...enemy,...(round===0?orders:{})});for(let j=0;j<E.STEPS&&!s.result;j++)E.step(s);s.round++}let own=stats(s,side),enemy=stats(s,1-side);own.reserve=reserveIds.filter(id=>s.units.find(u=>u.id===id)?.combatSeconds>0).length;own.reserveSeconds=reserveIds.reduce((n,id)=>n+(s.units.find(u=>u.id===id)?.combatSeconds||0),0);return {own,enemy,time:s.time,result:s.result,score:own.power/own.initial-enemy.power/enemy.initial,initial:initial.units.map(u=>[u.id,u.type,u.x,u.y,u.n])}}
export function compare(d,k,mirror=false){const control=trial(d,k,false,mirror),tactical=trial(d,k,true,mirror);return {id:d.id,seed:k.seed,style:k.style,map:k.map,mirror,control,tactical,delta:tactical.score-control.score}}
export function suite(){return doctrines.flatMap(d=>cases.flatMap(k=>[false,true].map(m=>compare(d,k,m))))}
export function summarize(rows){return doctrines.map(d=>{const a=rows.filter(r=>r.id===d.id),mean=k=>a.reduce((n,r)=>n+r[k],0)/a.length,positive=a.filter(r=>r.delta>.015).length,negative=a.filter(r=>r.delta<-.015).length;return {id:d.id,runs:a.length,positive,negative,neutral:a.length-positive-negative,meanDelta:mean("delta"),worst:a.slice().sort((x,y)=>x.delta-y.delta)[0]?.seed,best:a.slice().sort((x,y)=>y.delta-x.delta)[0]?.seed}})}
