// Historical Command: explicit group organisation and deterministic messenger travel.
// Only the issuing side's living units and observed opponents enter local decisions.
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),mean=(u,f)=>u.reduce((n,v)=>n+f(v),0)/Math.max(1,u.length);
export const organizations={macedonian:{name:"Македонская общевойсковая армия",level:"Таксисы и илы",signal:110},achaemenid:{name:"Ахеменидские контингенты",level:"Контингенты",signal:95},manipular:{name:"Манипулярная армия",level:"Линии и манипулы",signal:105},punic:{name:"Смешанная карфагенская армия",level:"Контингенты",signal:100},feudal:{name:"Феодальное войско",level:"Знамённые группы",signal:85},hellenistic:{name:"Эллинистическая армия",level:"Таксисы и илы",signal:105},hoplite:{name:"Гоплитская армия",level:"Лохи",signal:90}};
export function establishCommand(E,s,side=0){let org=s.historical?.organizations?.[side]||"feudal",units=s.units.filter(u=>u.side===side&&u.type!=="guard"),groups=[];let by=new Map();for(let u of units){let name=u.groupName|| (E.spec(u).horse?"Конное крыло":E.spec(u).range?"Стрелки":u.x*(side?-1:1)<mean(units,v=>v.x)*(side?-1:1)?"Резервная линия":"Пешая линия");if(!by.has(name))by.set(name,[]);by.get(name).push(u.id)}
 let index=0;for(let [name,ids] of by){let n=index++,id="g"+side+"-"+n,traits={initiative:.4+(n%3)*.15,discipline:.7+(n%2)*.12,caution:.45+(n%3)*.12,competence:.65+(n%3)*.12,risk:.45+(n%2)*.15,commitment:.72,adaptability:.6+(n%3)*.1};groups.push({id,name,ids,leader:ids[0],traits,autonomy:"bounded",intent:null,lastReport:null,reportDue:0})}
 s.commandHierarchy={schema:1,side,org,groups,queue:[],serial:0,messages:[]};s.fog=true;for(let g of groups){let us=groupUnits(E,s,g),p=centre(us);g.lastReport={time:0,...p,units:us.length,power:us.reduce((n,u)=>n+u.n*u.cohesion/100,0),morale:mean(us,u=>u.morale),contact:false,order:null}}return s.commandHierarchy
}
export function groupUnits(E,s,g){return s.units.filter(u=>g.ids.includes(u.id)&&u.side===s.commandHierarchy.side&&E.alive(u)&&!u.rout)}
export function centre(units){return {x:mean(units,u=>u.x),y:mean(units,u=>u.y)}}
export function groupPlan(E,s,g,packet){let units=groupUnits(E,s,g),out={};if(!units.length)return out;let home=centre(units),task=packet.task,front=s.commandHierarchy.side?-1:1,anchor=packet.anchor;
 let foes=s.units.filter(u=>u.side!==s.commandHierarchy.side&&E.alive(u)&&!u.rout&&units.some(v=>E.lineOfSight(s.terrain,v,u,E.spec(v).horse?460:350)));let crisis=units.filter(u=>u.cohesion<36||u.morale<32||u.fatigue>85).length;
 let adapting=packet.autonomy==="bounded"&&g.traits.caution>.45&&crisis>=Math.ceil(units.length/2);if(adapting&&task==="advance"){task="hold";anchor=home}
 for(let u of units){let x=clamp(anchor.x+(u.x-home.x),25,E.W-25),y=clamp(anchor.y+(u.y-home.y),25,E.H-25),dest={x,y},near=foes.slice().sort((a,b)=>E.dist(a,u)-E.dist(b,u)||a.id-b.id)[0],distance=near?E.dist(u,near):Infinity,t=E.spec(u),kind=E.dist(u,dest)<10?"brace":"move",stages=[];
 if(task==="withdraw"){kind="retreat";dest={x:clamp(anchor.x+u.x-home.x,25,E.W-25),y}}
 if(task==="advance"){kind="advance";if(packet.autonomy==="bounded"&&g.traits.initiative>=.5&&near&&distance<45&&u.cohesion>55){kind=t.range&&u.ammo>0?"shoot":t.horse?"charge":"attack";out[u.id]={kind,target:near.id,path:[],a:E.angle(u,near),commandPacket:packet.id};continue}}
 if(task==="reserve")stages=[{kind:"rally",when:"complete",path:[],a:u.a}];
 else if(task==="hold"||task==="advance")stages=[{kind:"brace",when:"complete",path:[],a:u.a}];
 if(task==="withdraw")stages=[{kind:"rally",when:"complete",path:[],a:u.a}];if(kind==="brace"&&task==="reserve")kind="rally";
 out[u.id]={kind,path:kind==="brace"||kind==="rally"?[]:[dest],a:u.a,nav:kind==="move",group:"historical-"+g.id,stages,commandPacket:packet.id};
 }return out
}
export function enqueueCommand(E,s,requests){let h=s.commandHierarchy;if(!h||!Array.isArray(requests))return;let guard=s.units.find(u=>u.side===h.side&&u.type==="guard"&&E.alive(u)&&!u.rout);
 for(let request of requests){let g=h.groups.find(v=>v.id===request.group);if(!g||!["advance","hold","reserve","withdraw"].includes(request.task)||!Number.isFinite(request.anchor?.x)||!Number.isFinite(request.anchor?.y))continue;let us=groupUnits(E,s,g);if(!us.length){h.queue.push({id:++h.serial,group:g.id,task:request.task,anchor:request.anchor,autonomy:request.autonomy,method:"messenger",sent:s.time,due:s.time,status:"failed",changed:s.time,reason:"group unavailable"});continue}let anchor={x:clamp(request.anchor.x,25,E.W-25),y:clamp(request.anchor.y,25,E.H-25)},target=centre(us),distance=guard?E.dist(guard,target):Infinity,signal=!!guard&&distance<=organizations[h.org].signal&&E.lineOfSight(s.terrain,guard,{...target,type:"spear"},organizations[h.org].signal),method=distance<25?"personal":signal?"signal":"messenger",delay=method==="personal"?1:method==="signal"?3:guard?Math.ceil(distance/4.2)+6:0;
 for(let q of h.queue)if(q.group===g.id&&["sent","received","executing"].includes(q.status)){q.status="superseded";q.changed=s.time}
 let packet={id:++h.serial,group:g.id,task:request.task,anchor,autonomy:request.autonomy==="strict"?"strict":"bounded",method,sent:s.time,due:s.time+delay,status:guard?"sent":"failed",changed:s.time,reason:guard?null:"command unavailable"};h.queue.push(packet);g.intent=packet.id
 }h.queue=h.queue.slice(-120)
}
export function tickCommand(E,s,apply){let h=s.commandHierarchy;if(!h)return;for(let g of h.groups){let units=groupUnits(E,s,g);
 // A report is a snapshot, delivered after travel, never a live remote feed.
 if(g.pendingReport&&s.time>=g.pendingReport.due){g.lastReport=g.pendingReport.data;g.pendingReport=null}
 if(units.length&&!g.pendingReport&&s.time>=g.reportDue){let guard=s.units.find(u=>u.side===h.side&&u.type==="guard"&&E.alive(u)&&!u.rout);if(guard){let p=centre(units),delay=Math.ceil(E.dist(guard,p)/4.2)+3;g.pendingReport={due:s.time+delay,data:{time:s.time,x:p.x,y:p.y,units:units.length,power:units.reduce((n,u)=>n+u.n*u.cohesion/100,0),morale:mean(units,u=>u.morale),contact:units.some(u=>u.contact),order:(()=>{let q=h.queue.find(q=>q.id===g.intent);return q?{id:q.id,status:q.status,changed:q.changed,reason:q.reason??null}:null})()}}}g.reportDue=s.time+30}
 }for(let q of h.queue){if(!["sent","received","executing"].includes(q.status))continue;let g=h.groups.find(v=>v.id===q.group),us=g?groupUnits(E,s,g):[];if(!us.length){q.status="failed";q.reason="group unavailable";q.changed=s.time;continue}
 if(q.status==="sent"&&s.time>=q.due){q.status="received";q.changed=s.time;continue}
 if(q.status==="received"&&s.time>=q.changed+Math.max(1,Math.round(4*(1-g.traits.competence)))){let orders=groupPlan(E,s,g,q);apply(orders);q.status="executing";q.changed=s.time;q.assigned=Object.keys(orders).map(Number);continue}
 if(q.status==="executing"&&q.assigned?.length){if(q.autonomy==="bounded"&&q.task==="advance"&&!q.adapted&&s.time-q.changed>=15&&g.traits.caution>=.45&&us.filter(u=>u.cohesion<36||u.morale<32||u.fatigue>85).length>=Math.ceil(us.length/2)){apply(groupPlan(E,s,g,{...q,task:"hold",anchor:centre(us)}));q.adapted=true;q.reason="local readiness crisis";q.changed=s.time}let assigned=us.filter(u=>q.assigned.includes(u.id));if(!assigned.length){q.status="failed";q.reason="assigned troops unavailable";q.changed=s.time}else if(assigned.every(u=>u.order.commandPacket!==q.id&&!u.program?.length||!u.order.path.length&&!u.contact&&!u.program?.length&&["brace","hold","rally"].includes(u.order.kind))){q.status="complete";q.changed=s.time}}
 }}

export function headquarters(E,s){return s.units.find(u=>u.side===(s.commandHierarchy?.side??0)&&u.type==="guard"&&E.alive(u)&&!u.rout)}
export function hqObserves(E,s,u){if(!s.commandHierarchy)return E.visible(s,0,u);let g=headquarters(E,s);if(u.side===s.commandHierarchy.side&&(s.time===0||u.id===g?.id||s.result))return true;return !!g&&E.lineOfSight(s.terrain,g,u,E.spec(g).horse?420:300)}
export function knownGroup(s,g){return g.lastReport||null}
export function knownPacket(s,g){let q=s.commandHierarchy.queue.filter(v=>v.group===g.id).at(-1);if(!q)return null;let r=g.lastReport?.order;if(r?.id===q.id)return {id:q.id,status:r.status,changed:r.changed,reason:r.reason,sent:q.sent};return {id:q.id,status:q.reason==="command unavailable"?"failed":"sent",sent:q.sent,due:q.due,estimated:true}}
