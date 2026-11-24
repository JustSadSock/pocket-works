// Enemy Minds. Pure round-boundary planner; all enemy input is sanitized by perceive().
export const personalities={
 methodical:[.35,.85,.45,.45,.7,.75,.3,.4,.45,.7],
 aggressive:[.85,.25,.9,.9,.2,.25,.65,.85,.4,.25],
 defensive:[.25,.8,.3,.2,.9,.8,.35,.35,.3,.8],
 maneuver:[.6,.55,.8,.6,.5,.5,.6,.65,.95,.5],
 cautious:[.15,.9,.25,.25,.95,.95,.25,.2,.55,.95],
 adaptive:[.5,.5,.7,.55,.6,.6,.9,.6,.7,.6]};
export const difficulties={recruit:{variants:3,hypotheses:1,route:0},captain:{variants:5,hypotheses:2,route:90},commander:{variants:7,hypotheses:3,route:240},grandmaster:{variants:9,hypotheses:4,route:480}};
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),sum=(a,f)=>a.reduce((n,v)=>n+f(v),0),mean=(a,f)=>sum(a,f)/Math.max(1,a.length),point=(x,y)=>({x,y});
function seeded(s){let h=2166136261;for(let c of String(s))h=Math.imul(h^c.charCodeAt(0),16777619);return ()=>((h=Math.imul(h,1664525)+1013904223|0)>>>0)/4294967296}
export function personality(style,seed){let a=personalities[style];if(!a){let r=seeded(seed);a=Array.from({length:10},()=>.15+r()*.7)}return Object.fromEntries(["risk","patience","initiative","aggression","caution","preservation","adaptability","reserve","maneuver","uncertainty"].map((k,i)=>[k,a[i]]))}
const power=u=>u.n*(.3+.7*u.cohesion/100)*(.3+.7*u.morale/100)*(1-u.fatigue/160);
export function perceive(E,s,side){
 const own=s.units.filter(u=>u.side===side&&E.alive(u)&&!u.rout).map(u=>({...u})).sort((a,b)=>a.id-b.id);
 const previous=s.aiIntent?.[side]?.intel||{},intel={},enemy=[];
 for(const u of s.units.filter(u=>u.side!==side&&E.alive(u)&&E.visible(s,side,u)).sort((a,b)=>a.id-b.id)){
  // A sighting includes observable geometry and movement; never orders, programs or exact hidden stats.
  const estimate=s.fog?{n:Math.max(1,Math.round(u.n/10)*10),cohesion:Math.round(u.cohesion/25)*25,morale:u.rout?15:65,fatigue:u.v>2?40:25}: {n:u.n,cohesion:u.cohesion,morale:u.morale,fatigue:u.fatigue};
  const v={id:u.id,type:u.type,x:u.x,y:u.y,a:u.a,motionX:u.motionX||0,motionY:u.motionY||0,rout:!!u.rout,cols:u.cols,form:u.form,...estimate,confidence:1,seen:s.time};intel[u.id]=v;enemy.push(v);
 }
 for(const [id,v] of Object.entries({...previous,...Object.fromEntries(Object.entries(s.known?.[side]||{}).map(([k,q])=>[k,previous[k]||{...q,n:E.types[q.type].n,cohesion:75,morale:70,fatigue:30,motionX:0,motionY:0,seen:q.time}]))})){
  if(intel[id]||!s.fog)continue;let age=s.time-v.seen;if(age>180)continue;let q={...v,confidence:Math.max(.15,1-age/210)};intel[id]=q;enemy.push(q)
 }
 return {own,enemy:enemy.sort((a,b)=>a.id-b.id),intel,terrain:s.terrain,side,front:side?-1:1,round:s.round,time:s.time,remaining:Math.max(0,(s.objective?.seconds||1800)-s.time),objective:s.objective?.kind||"power",memory:s.aiIntent?.[side]||null}
}
function center(a,fallback){return a.length?point(mean(a,u=>u.x),mean(a,u=>u.y)):fallback}
export function analyze(E,p){
 const foot=p.own.filter(u=>!E.types[u.type].horse&&!E.types[u.type].range),home=center(foot.length?foot:p.own,point(p.side?1100:300,450)),foes=p.enemy.filter(u=>!u.rout),enemy=center(foes,point(home.x+p.front*180,home.y)),cells=[];
 const field=(q,list,r=150)=>sum(list,u=>{let d=dist(q,u);return d<r?power(u)*(u.confidence??1)*(1-d/r):0});
 for(let y=50;y<E.H;y+=100)for(let x=50;x<E.W;x+=100){let q=point(x,y),land=E.sample(p.terrain,x,y),friendly=field(q,p.own),hostile=field(q,foes),width=0;for(let dy of [-40,0,40])if(E.sample(p.terrain,x,clamp(y+dy,0,E.H)).move>.55)width+=40;
 cells.push({...q,friendly,hostile,capacity:width,move:land.move,h:land.h,wood:land.wood,wet:land.wet||0,threat:hostile/Math.max(30,friendly+width)})}
 let lanes=[-1,0,1].map(wing=>{let q=point(clamp(enemy.x-p.front*45,30,E.W-30),clamp(enemy.y+wing*140,45,E.H-45)),near=cells.slice().sort((a,b)=>dist(a,q)-dist(b,q))[0],f=field(q,p.own,260),e=field(q,foes,190);return {wing,...q,capacity:near.capacity,move:near.move,height:near.h,ratio:Math.min(f,near.capacity*9)/Math.max(30,e),hostile:e,friendly:f}})
 let crises=p.own.filter(u=>u.type!=="guard").map(u=>({id:u.id,score:(100-u.cohesion)*.5+u.fatigue*.22+(100-u.morale)*.3+(u.link?.isolation||0)*45+Math.max(0,field(u,foes,105)-field(u,p.own,105))*.25,unit:u})).sort((a,b)=>b.score-a.score||a.id-b.id);
 const observed=foes.filter(u=>u.confidence===1),advance=mean(observed,u=>-p.front*u.motionX),lateral=mean(observed,u=>Math.abs(u.motionY)),hypotheses=[{kind:"attack",weight:clamp(.4+advance*.12,.12,.8)},{kind:"hold",weight:clamp(.55-Math.abs(advance)*.12,.1,.65)},{kind:"flank",weight:clamp(.15+lateral*.2,.1,.7)},{kind:"withdraw",weight:clamp(.2-advance*.12,.05,.7)}].sort((a,b)=>b.weight-a.weight);
 return {home,enemy,foot,foes,cells,lanes,crises,hypotheses,field,ratio:foes.length?sum(p.own,power)/Math.max(1,sum(foes,u=>power(u)*u.confidence)):1,uncertainty:mean(foes,u=>1-u.confidence),near:foes.some(u=>dist(u,home)<220)}
}
export function alternatives(E,p,b,traits,level){
 const base=[{posture:"assault",wing:0},{posture:"hold",wing:0},{posture:"maneuver",wing:p.front},{posture:"maneuver",wing:-p.front},{posture:"reinforce",wing:0},{posture:"withdraw",wing:0},{posture:"assault",wing:p.front},{posture:"assault",wing:-p.front},{posture:"screen",wing:0}];
 const candidates=base.slice(0,level.variants);let crisis=b.crises[0]?.score||0;
 return candidates.map(q=>{let l=b.lanes.find(v=>v.wing===q.wing),travel=dist(b.home,l),time=travel/Math.max(1,mean(p.own,u=>E.types[u.type].speed)),risk=Math.max(0,1-l.ratio)+Math.max(0,1-l.capacity/100)+b.uncertainty*traits.uncertainty;
 let value=0;switch(q.posture){case "assault":value=.6+traits.aggression*1.6+traits.initiative*.6+Math.min(2,b.ratio)*.6-risk*(1+traits.caution)-time/240;break;case "hold":value=1+traits.caution*1.3+traits.patience*.7+(b.ratio<.85?.9:0)+(l.height-E.sample(p.terrain,b.enemy.x,b.enemy.y).h)/50;break;case "maneuver":value=.6+traits.maneuver*2+Math.min(2,l.ratio)*.45-risk*.75-time/220;break;case "reinforce":value=.3+crisis/45+traits.preservation*.5;break;case "withdraw":value=(b.ratio<.75?2.7:0)+crisis/100+traits.preservation*.9-(p.remaining<100?1:0);break;case "screen":value=.5+traits.patience+mean(p.own,u=>E.types[u.type].range?1:0)*2}
 if(q.posture==="hold"&&b.foes.length&&p.remaining<150&&b.ratio>1.3)value-=.7;if(!b.near&&q.posture==="reinforce")value-=1.4;if(!b.foes.length){if(q.posture==="assault"||q.posture==="maneuver")value+=.35;if(q.posture==="withdraw")value-=2;}if(q.posture==="hold"&&p.objective==="territory"&&p.remaining<180)value-=.8;
 const outcomes=b.hypotheses.slice(0,level.hypotheses).map(h=>({against:h.kind,value:value+(h.kind==="flank"?(q.posture==="hold"||q.posture==="reinforce"?.35:-risk*.35):h.kind==="withdraw"?(q.posture==="assault"?.35:-.2):h.kind==="attack"?(q.posture==="hold"?.3:0):q.posture==="maneuver"?.2:0),weight:h.weight}));
 let robust=sum(outcomes,o=>o.value*o.weight)/Math.max(.001,sum(outcomes,o=>o.weight))*.65+Math.min(...outcomes.map(o=>o.value))*.35,change=p.memory?.posture&&(p.memory.posture!==q.posture||p.memory.wing!==q.wing);
 if(change)robust-=.65*(1-traits.adaptability)+Math.max(0,3-(p.round-(p.memory.started||p.round)))*.22;
 return {...q,score:robust,risk,time,capacity:l.capacity,outcomes}
 }).sort((a,b)=>b.score-a.score||a.wing*p.front-b.wing*p.front||a.posture.localeCompare(b.posture))
}
export function route(E,p,b,u,dest,budget){
 if(!budget||dist(u,dest)<55)return [dest];const size=50,nx=28,ny=18,index=(x,y)=>clamp(Math.floor(y/size),0,ny-1)*nx+clamp(Math.floor(x/size),0,nx-1),pos=i=>point((i%nx+.5)*size,(Math.floor(i/nx)+.5)*size),start=index(u.x,u.y),end=index(dest.x,dest.y),cost=new Map([[start,0]]),parent=new Map(),open=[start],closed=new Set();let best=start;
 for(let i=0;i<budget&&open.length;i++){open.sort((a,b)=>cost.get(a)+dist(pos(a),dest)/size-(cost.get(b)+dist(pos(b),dest)/size)||a-b);let k=open.shift();if(closed.has(k))continue;closed.add(k);let q=pos(k);if(dist(q,dest)<dist(pos(best),dest))best=k;if(k===end){best=k;break}for(let [dx,dy] of [[p.front,0],[-p.front,0],[0,p.front],[0,-p.front]]){let x=k%nx+dx,y=Math.floor(k/nx)+dy;if(x<0||x>=nx||y<0||y>=ny)continue;let j=y*nx+x;if(closed.has(j))continue;let v=pos(j),mid=point((v.x+q.x)/2,(v.y+q.y)/2),land=E.sample(p.terrain,mid.x,mid.y),to=E.sample(p.terrain,v.x,v.y),slope=Math.abs(to.h-E.sample(p.terrain,q.x,q.y).h)/size,cong=p.own.filter(w=>w.id!==u.id&&dist(w,v)<35).length,threat=b.field(v,b.foes,90)/400;
 let c=cost.get(k)+1/Math.max(.12,Math.min(land.move,to.move))+slope*4+cong*.8+threat*.65+(E.types[u.type].horse&&to.marsh?2:0);
 if(c<(cost.get(j)??Infinity)-1e-8){cost.set(j,c);parent.set(j,k);open.push(j)}}}
 if(best===start)return [dest];let path=[];for(let k=best;k!==start&&parent.has(k);k=parent.get(k))path.push(pos(k));path.reverse();let reduced=path.filter((v,i)=>i===path.length-1||i%2===1);if(best===end)reduced.push(dest);return reduced.slice(0,12)
}
export function plan(E,s,side){
 const p=perceive(E,s,side),b=analyze(E,p),traits=personality(s.styleBySide?.[side]||s.style,s.seed+":"+side),level=difficulties[s.difficultyBySide?.[side]||s.difficulty]||difficulties.commander,options=alternatives(E,p,b,traits,level),chosen=options[0],prev=p.memory,changed=prev?.posture!==chosen.posture||prev?.wing!==chosen.wing,orders={},roles={},reasons={};
 const line=b.foot.slice().sort((a,b)=>p.front*(a.y-b.y)||a.id-b.id),reserve=line.length>=3?line.filter(u=>!u.contact&&u.cohesion>65&&u.fatigue<55).sort((a,b)=>p.front*(a.x-b.x)||power(b)-power(a)||a.id-b.id)[0]:null;
 let crisis=b.crises.find(q=>q.unit!==reserve&&q.score>58),commit=!!(reserve&&crisis&&b.near&&(crisis.score>75-traits.reserve*25)),lane=b.lanes.find(q=>q.wing===chosen.wing);
 const safe=(x,y)=>point(clamp(x,25,E.W-25),clamp(y,25,E.H-25)),nearest=u=>b.foes.slice().sort((a,b)=>dist(a,u)/a.confidence-dist(b,u)/b.confidence||a.id-b.id)[0];
 for(const u of p.own){let t=E.types[u.type],v=nearest(u),d=v?dist(u,v):Infinity,kind="hold",dest=null,target,a=v?E.angle(u,v):u.a,role="line",reason="maintain front";
 if(u.type==="guard"){role="command";dest=safe(b.home.x-p.front*65,b.home.y);kind=dist(u,dest)>30?"move":"hold";reason="maintain command support"}
 else if((u.cohesion<35||u.fatigue>83||u.morale<36||chosen.posture==="withdraw")&&d<160){role="withdraw";kind="retreat";dest=safe(u.x-p.front*65,u.y);reason="local loss of combat readiness"}
 else if(u===reserve&&level.variants>=5){role="reserve";if(commit){kind="move";dest=safe(crisis.unit.x-p.front*12,crisis.unit.y);reason="reinforce crisis #"+crisis.id}else{kind=u.fatigue>30?"rally":"hold";reason="preserve uncommitted force"}}
 else if(t.range&&u.ammo>0){role="missiles";if(d<Math.min(65,t.range*.42)){kind="retreat";dest=safe(u.x-p.front*70,u.y);reason="avoid melee"}else if(d>t.range*.85||v&&v.confidence<1){kind="advance";dest=safe((v?.x??b.enemy.x)-p.front*t.range*.72,v?.y??u.y);reason="gain firing distance"}else{kind="shoot";target=v?.confidence===1?v.id:undefined;reason="fire on observed target"}}
 else if(t.horse){role="wing";if(v?.confidence===1&&d<65&&E.sample(p.terrain,u.x,u.y).move>.65&&u.cohesion>55){kind="charge";target=v.id;reason="available charge corridor"}else if(chosen.posture==="hold"||chosen.posture==="reinforce"){kind="brace";reason="protect flank"}else{kind="move";let w=chosen.wing|| (u.y<b.home.y?-1:1);dest=safe(b.enemy.x-p.front*35,b.enemy.y+w*(100+Math.abs(u.y-b.home.y)*.3));reason="seek flank with room"}}
 else if(chosen.posture==="hold"&&d>55){let local=b.cells.filter(q=>dist(q,u)<95&&q.move>.6&&q.threat<1.4).sort((a,b)=>(b.h*.06-b.threat)-(a.h*.06-a.threat));let q=local[0];if(q&&q.h>E.sample(p.terrain,u.x,u.y).h+5&&d>125){kind="move";dest=safe(q.x,q.y);reason="occupy nearby higher ground"}else{kind="brace";reason="hold ordered line"}}
 else if(chosen.posture==="reinforce"&&crisis&&dist(u,crisis.unit)<100&&d>60){kind="advance";dest=safe(crisis.unit.x-p.front*15,u.y);reason="support threatened section"}
 else {let ordered=b.foes.slice().sort((a,b)=>p.front*(a.y-b.y)||a.id-b.id),assigned=ordered[Math.min(ordered.length-1,Math.floor(Math.max(0,line.indexOf(u))*ordered.length/Math.max(1,line.length)))]||v;
  if(assigned?.confidence===1&&dist(u,assigned)<85){kind="attack";target=assigned.id;reason="engage assigned frontage"}else{kind="advance";dest=safe((assigned?.x??b.enemy.x)-p.front*20,(assigned?.y??u.y)*.65+u.y*.35+(chosen.posture==="maneuver"?chosen.wing*35:0));reason="advance assigned lane"}}
 if(kind==="advance"&&dest&&chosen.posture==="assault"&&chosen.wing!==0)dest.y=clamp(dest.y+chosen.wing*35,25,E.H-25);if(!dest&&kind==="hold"&&u.fatigue>50)kind="rally";let path=dest?(kind==="retreat"?[dest]:route(E,p,b,u,dest,Math.floor(level.route/Math.max(1,p.own.length/8)))):[];
 orders[u.id]={kind,path,a,...(target!==undefined?{target}:{}),...(role==="reserve"&&commit?{nav:true}:{}),...(role==="line"&&kind==="advance"?{group:"mind-line-"+side}:{})};roles[u.id]=role;reasons[u.id]=reason
 }
 const intent={round:s.round,started:changed?s.round:prev.started,posture:chosen.posture,wing:chosen.wing,ratio:b.ratio,intel:p.intel,roles,reasons,reserve:reserve?.id??null,committed:commit,crisis:crisis?.id??null,alternatives:options,assumptions:b.hypotheses,changed,observed:p.enemy.filter(v=>v.confidence===1).length,stale:p.enemy.filter(v=>v.confidence<1).length};
 Object.defineProperty(orders,"intent",{value:intent,enumerable:false});return orders
}
export function deploy(E,s,side){
 let units=s.units.filter(u=>u.side===side),front=side?-1:1,home=side?E.W-380:380,foot=units.filter(u=>!E.types[u.type].horse&&!E.types[u.type].range),ranged=units.filter(u=>E.types[u.type].range&&!E.types[u.type].horse),mounted=units.filter(u=>E.types[u.type].horse&&u.type!=="guard"),guard=units.find(u=>u.type==="guard"),placed=[];
 const place=(u,x,y)=>{let candidates=[];for(let dx of [0,-front*45,-front*90])for(let dy of [0,40,-40,80,-80,120,-120]){let q={...u,x:clamp(x+dx,45,E.W-45),y:clamp(y+dy,35,E.H-35)};if((side?q.x<E.W*.6:q.x>E.W*.4)||placed.some(v=>E.overlap(v,q,3)))continue;let land=E.sample(s.terrain,q.x,q.y);candidates.push({q,score:land.move*20+land.h*.08-dist(q,point(x,y))*.25})}let q=candidates.sort((a,b)=>b.score-a.score)[0]?.q||u;u.x=q.x;u.y=q.y;placed.push(u)};
 foot.forEach((u,i)=>place(u,home-front*Math.floor(i/8)*70,450+(i%8-(Math.min(foot.length,8)-1)/2)*56));ranged.forEach((u,i)=>place(u,home-front*65,450+(i-(ranged.length-1)/2)*62));mounted.forEach((u,i)=>place(u,home-front*35,450+(i%2?1:-1)*(170+Math.floor(i/2)*50)));if(guard)place(guard,home-front*115,450);
}
export function delegate(E,s,ids,task,anchor){
 let p=perceive(E,s,0),b=analyze(E,p),units=p.own.filter(u=>ids.includes(u.id)),orders={};if(!units.length)return orders;let base=anchor||b.home,front=p.front;
 for(let u of units){let offset=(u.y-mean(units,v=>v.y)),dest=point(clamp(base.x,25,E.W-25),clamp(base.y+offset,25,E.H-25));if(task==="reserve")dest=point(clamp(b.home.x-front*85,25,E.W-25),dest.y);if(task==="follow")dest=point(clamp(b.home.x-front*30,25,E.W-25),dest.y);if(task==="cover")dest=point(clamp(base.x-front*45,25,E.W-25),dest.y);let kind=dist(u,dest)<12?"brace":"move";orders[u.id]={kind,path:kind==="move"?route(E,p,b,u,dest,90):[],a:u.a,nav:true,group:"staff-"+ids.join("-"),stages:kind==="move"?[{kind:task==="reserve"?"rally":"brace",path:[],when:"complete",a:u.a}]:[]}}
 return orders
}
