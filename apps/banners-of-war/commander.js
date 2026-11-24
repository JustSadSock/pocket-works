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
  const v={id:u.id,type:u.type,profile:u.profile??null,x:u.x,y:u.y,a:u.a,motionX:u.motionX||0,motionY:u.motionY||0,rout:!!u.rout,cols:u.cols,form:u.form,...estimate,confidence:1,seen:s.time};intel[u.id]=v;enemy.push(v);
 }
 for(const [id,v] of Object.entries({...previous,...Object.fromEntries(Object.entries(s.known?.[side]||{}).map(([k,q])=>[k,previous[k]&&previous[k].seen>=q.time?previous[k]:{...q,n:previous[k]?.n??E.spec(q).n,cohesion:previous[k]?.cohesion??75,morale:previous[k]?.morale??70,fatigue:previous[k]?.fatigue??30,motionX:previous[k]?.motionX??0,motionY:previous[k]?.motionY??0,seen:q.time}]))})){
  if(intel[id]||!s.fog)continue;let age=s.time-v.seen;if(age>180)continue;let q={...v,confidence:Math.max(.15,1-age/210)};intel[id]=q;enemy.push(q)
 }
 return {own,enemy:enemy.sort((a,b)=>a.id-b.id),intel,terrain:s.terrain,side,front:side?-1:1,round:s.round,time:s.time,remaining:Math.max(0,(s.objective?.seconds||1800)-s.time),objective:s.objective?.kind||"power",goals:s.objective?.zones||[],memory:s.aiIntent?.[side]||null}
}
function center(a,fallback){return a.length?point(mean(a,u=>u.x),mean(a,u=>u.y)):fallback}
export function analyze(E,p){
 const foot=p.own.filter(u=>!E.spec(u).horse&&!E.spec(u).range),home=center(foot.length?foot:p.own,point(p.side?1100:300,450)),foes=p.enemy.filter(u=>!u.rout),enemy=center(foes,point(home.x+p.front*180,home.y)),cells=[];
 const field=(q,list,r=150)=>sum(list,u=>{let d=dist(q,u);return d<r?power(u)*(u.confidence??1)*(1-d/r):0});
 for(let y=50;y<E.H;y+=100)for(let x=50;x<E.W;x+=100){let q=point(x,y),land=E.sample(p.terrain,x,y),friendly=field(q,p.own),hostile=field(q,foes),width=0;for(let dy of [-40,0,40])if(E.sample(p.terrain,x,clamp(y+dy,0,E.H)).move>.55)width+=40;
 cells.push({...q,friendly,hostile,capacity:width,move:land.move,h:land.h,wood:land.wood,wet:land.wet||0,threat:hostile/Math.max(30,friendly+width)})}
 let lanes=[-1,0,1].map(wing=>{let q=point(clamp(enemy.x-p.front*45,30,E.W-30),clamp(enemy.y+wing*140,45,E.H-45)),near=cells.slice().sort((a,b)=>{let z=dist(a,q)-dist(b,q);return Math.abs(z)<1e-8?p.front*(a.y-b.y||a.x-b.x):z})[0],f=field(q,p.own,260)+sum(p.own,u=>power(u)*.35*Math.max(0,1-Math.abs(u.y-q.y)/300)),e=field(q,foes,190);return {wing,...q,capacity:near.capacity,move:near.move,height:near.h,ratio:Math.min(f,near.capacity*9)/Math.max(30,e),hostile:e,friendly:f}})
 let crises=p.own.filter(u=>u.type!=="guard").map(u=>({id:u.id,score:(100-u.cohesion)*.5+u.fatigue*.22+(100-u.morale)*.3+(u.link?.isolation||0)*45+Math.max(0,field(u,foes,105)-field(u,p.own,105))*.25,unit:u})).sort((a,b)=>b.score-a.score||a.id-b.id);
 const observed=foes.filter(u=>u.confidence===1),advance=mean(observed,u=>-p.front*u.motionX),lateral=mean(observed,u=>Math.abs(u.motionY)),hypotheses=[{kind:"attack",weight:clamp(.4+advance*.12,.12,.8)},{kind:"hold",weight:clamp(.55-Math.abs(advance)*.12,.1,.65)},{kind:"flank",weight:clamp(.15+lateral*.2,.1,.7)},{kind:"withdraw",weight:clamp(.2-advance*.12,.05,.7)}].sort((a,b)=>b.weight-a.weight);
 return {home,enemy,foot,foes,cells,lanes,crises,hypotheses,field,ratio:foes.length?sum(p.own,power)/Math.max(1,sum(foes,u=>power(u)*u.confidence)):1,uncertainty:mean(foes,u=>1-u.confidence),near:foes.some(u=>dist(u,home)<220)}
}

// Tactical value is measured relative to an observed approach, not assigned to map tiles.
// Sampling is side-relative to preserve 180-degree rotational symmetry.
export function positionValue(E,p,b,q){
 const f=p.front, land=E.sample(p.terrain,q.x,q.y), at=(dx,dy)=>E.sample(p.terrain,clamp(q.x+f*dx,0,E.W),clamp(q.y+f*dy,0,E.H));
 const approaches=[-100,-50,0,50,100].map(y=>Math.min(at(45,y).move,at(90,y).move));
 const width=sum(approaches,m=>clamp((m-.2)/.8,0,1))*50;
 const flank=(2-at(0,-90).move-at(0,90).move)/2;
 const retreat=mean([-40,0,40],y=>Math.min(at(-45,y).move,at(-90,y).move));
 const rise=clamp((land.h-mean([-50,0,50],y=>at(90,y).h))/25,-1,1);
 const ready=b.foot.filter(u=>dist(u,q)<160),frontage=sum(ready,u=>E.dims(u).w);
 const screen=clamp(frontage/Math.max(45,width),0,1);
 const reserve=mean(ready,u=>clamp(1-dist(u,q)/160,0,1)*(1-u.fatigue/100));
 const sight=E.lineOfSight(p.terrain,q,b.enemy,420)?1:0;
 const enemyDistance=dist(q,b.enemy), relevance=b.foes.length?clamp(1-enemyDistance/420,0,1):0;
 const constriction=clamp(1-width/250,0,1);
 const crossing=mean(approaches,m=>m<.4?1:0)*clamp(at(45,0).move,0,1);
 const goalValue=mean(p.goals||[],z=>clamp(1-dist(q,z)/z.r,0,1)*z.weight);const value=relevance*(1.1*constriction*screen+flank*.55+rise*.65+crossing*.45+reserve*.22+sight*.12)*clamp(retreat+.15,.15,1.15);
 return {value:value+goalValue*.65,width,flank,retreat,rise,screen,reserve,sight,crossing,goalValue};
}
// Deterministic coarse forward model. No orders or hidden enemy state are consulted.
export function forecast(E,p,b,q,h,depth){
 const f=p.front, lane=b.lanes.find(v=>v.wing===q.wing), goal=q.posture==="hold"||q.posture==="reinforce"||q.posture==="screen"?b.home:q.posture==="withdraw"?point(clamp(b.home.x-f*150,25,E.W-25),b.home.y):lane;
 const copyUnit=u=>({x:u.x,y:u.y,type:u.type,profile:u.profile??null,n:u.n,cohesion:u.cohesion,morale:u.morale,fatigue:u.fatigue,confidence:u.confidence??1});
 const own=p.own.filter(u=>u.type!=="guard").map(copyUnit),enemy=b.foes.filter(u=>u.type!=="guard").map(copyUnit);
 const baseOwn=sum(own,power),baseEnemy=sum(enemy,u=>power(u)*u.confidence);
 const move=(u,dest,seconds)=>{let distance=dist(u,dest);if(distance<1)return;let land=E.sample(p.terrain,u.x,u.y),speed=E.spec(u).speed*land.move*(.45+.55*u.cohesion/100)*(1-u.fatigue/160),length=Math.min(distance,speed*seconds),x=clamp(u.x+(dest.x-u.x)*length/distance,25,E.W-25),y=clamp(u.y+(dest.y-u.y)*length/distance,25,E.H-25);let to=E.sample(p.terrain,x,y),slope=Math.abs(to.h-land.h)/Math.max(1,length),pass=Math.min(1,to.move/Math.max(.15,land.move))/(1+slope*3);u.x+=(x-u.x)*pass;u.y+=(y-u.y)*pass;u.fatigue=clamp(u.fatigue+length*.025*(2-land.move),0,100)};
 const ownHome=b.home,enemyHome=b.enemy;let pressure=0,arrived=0;
 for(let i=0;i<depth;i++){
  for(const u of own){let t=E.spec(u),offset=clamp(u.y-ownHome.y,-120,120),dest=point(goal.x,clamp(goal.y+offset,25,E.H-25));let nearest=enemy.reduce((best,v)=>!best||dist(u,v)<dist(u,best)?v:best,null);if(t.range&&nearest&&dist(u,nearest)<t.range*.8||nearest&&dist(u,nearest)<24&&q.posture!=="withdraw")continue;if(q.posture==="hold"||q.posture==="screen"){u.fatigue=Math.max(0,u.fatigue-2);continue}move(u,dest,30);if(q.posture==="reinforce"&&dist(u,ownHome)<75)arrived++}
  for(const u of enemy){let dest=h.kind==="hold"?u:h.kind==="withdraw"?point(clamp(enemyHome.x+f*150,25,E.W-25),u.y):point(ownHome.x,clamp(ownHome.y+(u.y-enemyHome.y)+(h.kind==="flank"?f*100:0),25,E.H-25));if(!own.some(v=>dist(u,v)<24))move(u,dest,30)}
  const losses=(a,c)=>a.map(u=>{let t=E.spec(u),near=c.filter(v=>dist(u,v)<Math.max(36,E.spec(v).range*.8)&&E.lineOfSight(p.terrain,v,u,220));let land=E.sample(p.terrain,u.x,u.y),hostile=sum(near,v=>power(v)*v.confidence*(E.spec(v).range&&dist(u,v)>36?.28:1)),friendly=sum(a,v=>dist(u,v)<65?power(v):0),capacity=Math.max(30,100*land.move),ratio=Math.min(hostile,capacity*4)/Math.max(50,friendly),loss=clamp(ratio*.022,0,.075)*(1-t.armor*.6);return {loss,ratio}});
  let a=losses(own,enemy),c=losses(enemy,own);
  for(let [units,ls] of [[own,a],[enemy,c]])for(let j=0;j<units.length;j++){let u=units[j],l=ls[j];u.n*=1-l.loss;u.cohesion=clamp(u.cohesion-l.loss*90,0,100);u.morale=clamp(u.morale-l.loss*55,0,100);u.fatigue=clamp(u.fatigue+Math.min(3,l.ratio),0,100)}
  pressure+=mean(a,v=>Math.max(0,v.ratio-1));
 }
 const ownRetention=sum(own,power)/Math.max(1,baseOwn),enemyRetention=sum(enemy,u=>power(u)*u.confidence)/Math.max(1,baseEnemy),progress=clamp(f*(mean(own,u=>u.x)-ownHome.x)/150,-1,1);
 const zoneGain=sum(p.goals||[],z=>{let before=mean(p.own.filter(u=>u.type!=="guard"),u=>clamp(1-dist(u,z)/(z.r+350),0,1)),after=mean(own,u=>clamp(1-dist(u,z)/(z.r+350),0,1));return (after-before)*z.weight});
 return {value:zoneGain*1.2+clamp((ownRetention-enemyRetention)*2.5,-1.5,1.5)+progress*(p.objective==="territory"?.25:.08)-Math.min(.6,pressure/Math.max(1,depth)*.12),ownRetention,enemyRetention,progress,pressure,arrived,depth,zoneGain};
}

// Objective pressure uses only own forces and sanitized observations.
export function objectivePressure(p,b){
 const goals=p.goals||[];if(!goals.length)return {deficit:0,target:null};
 const info=goals.map(z=>{let own=b.field(z,p.own,z.r),hostile=b.field(z,b.foes,z.r),secure=own>10&&own>hostile*1.22;return {...z,own,hostile,secure}});
 let total=sum(info,z=>z.weight),deficit=sum(info,z=>z.secure?0:z.weight)/Math.max(.001,total);
 let target=info.filter(z=>!z.secure).sort((a,c)=>{let v=c.weight-a.weight;return Math.abs(v)<1e-8?dist(a,b.home)-dist(c,b.home):v})[0]||null;
 return {deficit,target}
}
export function alternatives(E,p,b,traits,level){
 const base=[{posture:"assault",wing:0},{posture:"hold",wing:0},{posture:"maneuver",wing:p.front},{posture:"maneuver",wing:-p.front},{posture:"reinforce",wing:0},{posture:"withdraw",wing:0},{posture:"assault",wing:p.front},{posture:"assault",wing:-p.front},{posture:"screen",wing:0}];
 const candidates=base.slice(0,level.variants);let crisis=b.crises[0]?.score||0;const position=positionValue(E,p,b,b.home),objective=objectivePressure(p,b),depth=level.depth??(level.variants>=9?3:level.variants>=7?2:1);
 const localOwn=b.field(b.home,p.own,220),localEnemy=b.field(b.home,b.foes,220),engageableEnemy=Math.min(localEnemy,Math.max(45,position.width)*9),localRatio=localOwn/Math.max(1,engageableEnemy),withdrawalPressure=b.near&&engageableEnemy>40?clamp((.85-localRatio)/.55,0,1):0;
 return candidates.map(q=>{let l=b.lanes.find(v=>v.wing===q.wing),travel=dist(b.home,l),time=travel/Math.max(1,mean(p.own,u=>E.spec(u).speed)),risk=Math.max(0,1-l.ratio)*(b.near?1:.32)+Math.max(0,1-l.capacity/100)+b.uncertainty*traits.uncertainty;
 let value=0;switch(q.posture){case "assault":value=.6+traits.aggression*2.1+traits.initiative*.8+Math.min(2,b.ratio)*.6-risk*(1+traits.caution-traits.risk*.35)-time/240;break;case "hold":value=1+traits.caution*1.3+traits.patience*.7+(b.ratio<.85?.9:0)+(l.height-E.sample(p.terrain,b.enemy.x,b.enemy.y).h)/50;break;case "maneuver":value=.6+traits.maneuver*2.7+Math.min(2,l.ratio)*.45-risk*.75-time/220;break;case "reinforce":value=.3+crisis/45+traits.preservation*.5;break;case "withdraw":value=withdrawalPressure*2.7+crisis/75+traits.preservation*.9-(p.remaining<100?1:0)-(b.near?0:.7);break;case "screen":value=.5+traits.patience+mean(p.own,u=>E.spec(u).range?1:0)*2}
 if(q.posture==="hold"&&b.foes.length&&p.remaining<150&&b.ratio>1.3)value-=.7;if(!b.near&&q.posture==="reinforce")value-=1.4;if(!b.foes.length){if(q.posture==="assault"||q.posture==="maneuver")value+=.35;if(q.posture==="withdraw")value-=2;}if(q.posture==="hold"&&p.objective==="territory"&&p.remaining<180)value-=.8;
 if(objective.deficit){let urgency=1+clamp(1-p.remaining/900,0,1)*.55;if(q.posture==="hold"||q.posture==="screen")value-=2.65*objective.deficit*urgency;else if(q.posture==="assault"||q.posture==="maneuver")value+=.8*objective.deficit;else if(q.posture==="withdraw")value-=.9*objective.deficit}
 if(q.posture==="hold"||q.posture==="reinforce")value+=position.value*1.4;else if(q.posture==="assault"||q.posture==="maneuver")value-=position.value*(1-traits.risk*.5);
 const outcomes=b.hypotheses.slice(0,level.hypotheses).map(h=>{const prediction=forecast(E,p,b,q,h,depth);return {against:h.kind,prediction,value:value+prediction.value*.65+(h.kind==="flank"?(q.posture==="hold"||q.posture==="reinforce"?.35:-risk*.35):h.kind==="withdraw"?(q.posture==="assault"?.35:-.2):h.kind==="attack"?(q.posture==="hold"?.3:0):q.posture==="maneuver"?.2:0),weight:h.weight}});
 let robust=sum(outcomes,o=>o.value*o.weight)/Math.max(.001,sum(outcomes,o=>o.weight))*.65+Math.min(...outcomes.map(o=>o.value))*.35,change=p.memory?.posture&&(p.memory.posture!==q.posture||p.memory.wing!==q.wing);
 if(change)robust-=.65*(1-traits.adaptability)+Math.max(0,3-(p.round-(p.memory.started||p.round)))*.22;
 return {...q,score:robust,risk,time,capacity:l.capacity,position,objective,localRatio,withdrawalPressure,outcomes}
 }).sort((a,b)=>Math.abs(b.score-a.score)<1e-8?a.wing*p.front-b.wing*p.front||a.posture.localeCompare(b.posture):b.score-a.score)
}
export function route(E,p,b,u,dest,budget){
 if(!budget||dist(u,dest)<55)return [dest];const size=50,nx=Math.ceil(E.W/size),ny=Math.ceil(E.H/size),index=(x,y)=>clamp(Math.floor((p.side?E.H-y:y)/size+1e-9),0,ny-1)*nx+clamp(Math.floor((p.side?E.W-x:x)/size+1e-9),0,nx-1),pos=i=>{let x=(i%nx+.5)*size,y=(Math.floor(i/nx)+.5)*size;return p.side?point(E.W-x,E.H-y):point(x,y)},start=index(u.x,u.y),end=index(dest.x,dest.y),cost=new Map([[start,0]]),parent=new Map(),open=[start],closed=new Set();let best=start;
 for(let i=0;i<budget&&open.length;i++){open.sort((a,b)=>{let q=cost.get(a)+dist(pos(a),dest)/size-(cost.get(b)+dist(pos(b),dest)/size);return Math.abs(q)<1e-8?a-b:q});let k=open.shift();if(closed.has(k))continue;closed.add(k);let q=pos(k);if(dist(q,dest)<dist(pos(best),dest))best=k;if(k===end){best=k;break}for(let [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){let x=k%nx+dx,y=Math.floor(k/nx)+dy;if(x<0||x>=nx||y<0||y>=ny)continue;let j=y*nx+x;if(closed.has(j))continue;let v=pos(j),mid=point((v.x+q.x)/2,(v.y+q.y)/2),land=E.sample(p.terrain,mid.x,mid.y),to=E.sample(p.terrain,v.x,v.y),slope=Math.abs(to.h-E.sample(p.terrain,q.x,q.y).h)/size,cong=p.own.filter(w=>w.id!==u.id&&dist(w,v)<35).length,threat=b.field(v,b.foes,90)/400;
 let c=cost.get(k)+1/Math.max(.12,Math.min(land.move,to.move))+slope*4+cong*.8+threat*.65+(E.spec(u).horse&&to.marsh?2:0);
 if(c<(cost.get(j)??Infinity)-1e-8){cost.set(j,c);parent.set(j,k);open.push(j)}}}
 if(best===start)return [dest];let path=[];for(let k=best;k!==start&&parent.has(k);k=parent.get(k))path.push(pos(k));path.reverse();let reduced=path.filter((v,i)=>i===path.length-1||i%2===1);if(best===end)reduced.push(dest);return reduced.slice(0,12)
}
export function plan(E,s,side,profile=null){
 const clock=profile?.clock||(()=>0),start=clock(),p=perceive(E,s,side),observedAt=clock(),b=analyze(E,p),analyzedAt=clock(),traits=personality(s.styleBySide?.[side]||s.style,s.seed+":"+side),baseLevel=difficulties[s.difficultyBySide?.[side]||s.difficulty]||difficulties.commander,level={...baseLevel,...(Number.isInteger(s.forecastDepthBySide?.[side])?{depth:clamp(s.forecastDepthBySide[side],1,3)}:{})},options=alternatives(E,p,b,traits,level),evaluatedAt=clock(),chosen=options[0],prev=p.memory,changed=prev?.posture!==chosen.posture||prev?.wing!==chosen.wing,orders={},roles={},reasons={};
 const line=b.foot.slice().sort((a,b)=>p.front*(a.y-b.y)||a.id-b.id),reserve=line.length>=3?line.filter(u=>!u.contact&&u.cohesion>65&&u.fatigue<55).sort((a,b)=>p.front*(a.x-b.x)||power(b)-power(a)||a.id-b.id)[0]:null;
 let crisis=b.crises.find(q=>q.unit!==reserve&&q.score>58),opportunity=reserve&&b.foes.filter(v=>v.confidence===1&&v.cohesion<45&&dist(v,reserve)<160).sort((a,b)=>a.cohesion-b.cohesion||dist(a,reserve)-dist(b,reserve))[0],relief=!!(reserve&&crisis&&b.near&&crisis.score>75-traits.reserve*25),exploit=!!(reserve&&!relief&&opportunity&&traits.reserve>.45&&chosen.posture!=="hold"&&chosen.posture!=="withdraw"&&b.ratio>.8),commit=relief||exploit,lane=b.lanes.find(q=>q.wing===chosen.wing);const scout=!b.foes.some(u=>u.confidence===1)?p.own.filter(u=>u.type!=="guard"&&u!==reserve&&u.cohesion>55&&!u.contact).sort((a,b)=>E.spec(b).speed-E.spec(a).speed||a.id-b.id)[0]:null;
 const safe=(x,y)=>point(clamp(x,25,E.W-25),clamp(y,25,E.H-25)),nearest=u=>b.foes.slice().sort((a,b)=>dist(a,u)/a.confidence-dist(b,u)/b.confidence||a.id-b.id)[0];
 for(const u of p.own){let t=E.spec(u),v=nearest(u),d=v?dist(u,v):Infinity,kind="hold",dest=null,target,a=v?E.angle(u,v):u.a,role="line",reason="maintain front";
 if(u.type==="guard"){role="command";dest=safe(b.home.x-p.front*65,b.home.y);kind=dist(u,dest)>30?"move":"hold";reason="maintain command support"}
 else if((u.cohesion<35||u.fatigue>83||u.morale<36||chosen.posture==="withdraw")&&d<160){role="withdraw";kind="retreat";dest=[0,p.front*45,-p.front*45].map(y=>safe(u.x-p.front*65,u.y+y)).sort((a,c)=>b.field(a,b.foes,120)-b.field(c,b.foes,120)+90*(E.sample(p.terrain,c.x,c.y).move-E.sample(p.terrain,a.x,a.y).move))[0];reason="local loss of combat readiness"}
 else if(u===scout){role="scout";kind="move";dest=safe(u.x+p.front*100,u.y);reason="reconnoiter uncertain front"}
 else if(u===reserve&&level.variants>=5){role="reserve";if(commit){kind="move";dest=relief?safe(crisis.unit.x-p.front*12,crisis.unit.y):safe(opportunity.x-p.front*15,opportunity.y);reason=relief?"reinforce crisis #"+crisis.id:"exploit weakened enemy #"+opportunity.id}else{kind=u.fatigue>30?"rally":"hold";reason="preserve uncommitted force"}}
 else if(t.range&&u.ammo>0){role="missiles";if(d<Math.min(65,t.range*.42)){kind="retreat";dest=safe(u.x-p.front*70,u.y);reason="avoid melee"}else if(d>t.range*.85||v&&v.confidence<1){kind="advance";dest=safe((v?.x??b.enemy.x)-p.front*t.range*.72,v?.y??u.y);reason="gain firing distance"}else{kind="shoot";target=v?.confidence===1?v.id:undefined;reason="fire on observed target"}}
 else if(s.aiTactics==='lane-v2'&&!u.contact&&u.fatigue>58&&d>50&&chosen.posture!=='withdraw'){kind='rally';reason='recover exhausted formation before contact'}
 else if(t.horse){role="wing";if(v?.confidence===1&&d<65&&E.sample(p.terrain,u.x,u.y).move>.65&&u.cohesion>55){kind="charge";target=v.id;reason="available charge corridor"}else if(chosen.posture==="hold"||chosen.posture==="reinforce"){kind="brace";reason="protect flank"}else{kind="move";let w=chosen.wing|| (u.y<b.home.y?-1:1);dest=s.aiTactics==="lane-v2"&&chosen.posture==="maneuver"?safe(lane.x-p.front*30,lane.y+w*Math.min(100,Math.abs(u.y-b.home.y)*.4)):safe(b.enemy.x-p.front*35,b.enemy.y+w*(100+Math.abs(u.y-b.home.y)*.3));reason="seek flank with room"}}
 else if(chosen.posture==="hold"){let local=b.cells.filter(q=>dist(q,u)<95&&q.move>.6&&q.threat<1.4).sort((a,b)=>{let q=(b.h*.06-b.threat)-(a.h*.06-a.threat);return Math.abs(q)<1e-8?p.front*(a.y-b.y||a.x-b.x):q});let q=local[0];if(q&&q.h>E.sample(p.terrain,u.x,u.y).h+5&&d>125&&positionValue(E,p,b,q).value>positionValue(E,p,b,u).value+.1){kind="move";dest=safe(q.x,q.y);reason="occupy nearby higher ground"}else{kind="brace";reason="hold ordered line; avoid abandoning frontage"}}
 else if(chosen.posture==="reinforce"&&crisis&&dist(u,crisis.unit)<100&&d>60){kind="advance";dest=safe(crisis.unit.x-p.front*15,u.y);reason="support threatened section"}
 else {let ordered=b.foes.slice().sort((a,b)=>p.front*(a.y-b.y)||a.id-b.id),assigned=ordered[Math.min(ordered.length-1,Math.floor(Math.max(0,line.indexOf(u))*ordered.length/Math.max(1,line.length)))]||v;
  if(s.aiTactics==="lane-v2"&&chosen.posture==="maneuver"&&d>70){kind="advance";dest=safe(lane.x-p.front*55,lane.y+clamp(u.y-b.home.y,-100,100));reason="approach chosen lane before engagement"}else if(assigned?.confidence===1&&dist(u,assigned)<85){kind="attack";target=assigned.id;reason="engage assigned frontage"}else{kind="advance";dest=safe((assigned?.x??chosen.objective?.target?.x??b.enemy.x)-p.front*20,(assigned?.y??chosen.objective?.target?.y??u.y)*.65+u.y*.35+(chosen.posture==="maneuver"?chosen.wing*35:0));reason="advance assigned lane"}}
 if(kind==="advance"&&dest&&chosen.posture==="assault"&&chosen.wing!==0)dest.y=clamp(dest.y+chosen.wing*35,25,E.H-25);if(!dest&&kind==="hold"&&u.fatigue>50)kind="rally";let path=dest?(kind==="retreat"?[dest]:route(E,p,b,u,dest,Math.floor(level.route/Math.max(1,p.own.length/8)))):[];
 orders[u.id]={kind,path,a,...(target!==undefined?{target}:{}),...(role==="reserve"&&commit?{nav:true}:{}),...(role==="line"&&kind==="advance"?{group:"mind-line-"+side+(s.aiTactics==="lane-v2"?"-"+Math.floor((u.y-b.home.y)/100):"")}:{})};roles[u.id]=role;reasons[u.id]=reason
 }
 const intent={round:s.round,started:changed?s.round:prev.started??s.round,posture:chosen.posture,wing:chosen.wing,ratio:b.ratio,intel:p.intel,roles,reasons,reserve:reserve?.id??null,committed:commit,reservePurpose:relief?"relief":exploit?"exploitation":"held",crisis:crisis?.id??null,alternatives:options,assumptions:b.hypotheses,changed,observed:p.enemy.filter(v=>v.confidence===1).length,stale:p.enemy.filter(v=>v.confidence<1).length};
 if(profile){profile.perception=(profile.perception||0)+observedAt-start;profile.analysis=(profile.analysis||0)+analyzedAt-observedAt;profile.alternatives=(profile.alternatives||0)+evaluatedAt-analyzedAt;profile.orderGeneration=(profile.orderGeneration||0)+clock()-evaluatedAt}Object.defineProperty(orders,"intent",{value:intent,enumerable:false});return orders
}
export function deploy(E,s,side){
 let traits=personality(s.styleBySide?.[side]||s.style,s.seed+":"+side),units=s.units.filter(u=>u.side===side),front=side?-1:1,home=(side?E.W-380:380)+front*Math.round((traits.aggression-traits.caution)*65),foot=units.filter(u=>!E.spec(u).horse&&!E.spec(u).range),ranged=units.filter(u=>E.spec(u).range&&!E.spec(u).horse),mounted=units.filter(u=>E.spec(u).horse&&u.type!=="guard"),guard=units.find(u=>u.type==="guard"),placed=[];
 const place=(u,x,y)=>{let candidates=[];for(let dx of [0,-front*45,-front*90])for(let dy of [0,40,-40,80,-80,120,-120]){let q={...u,x:clamp(x+dx,45,E.W-45),y:clamp(y+dy,35,E.H-35)};if((side?q.x<E.W*.6:q.x>E.W*.4)||placed.some(v=>E.overlap(v,q,3)))continue;let land=E.sample(s.terrain,q.x,q.y);candidates.push({q,score:land.move*20+land.h*.08-dist(q,point(x,y))*.25})}let q=candidates.sort((a,b)=>b.score-a.score)[0]?.q||u;u.x=q.x;u.y=q.y;placed.push(u)};
 foot.forEach((u,i)=>place(u,home-front*Math.floor(i/8)*70,450+(i%8-(Math.min(foot.length,8)-1)/2)*(traits.maneuver>.75?68:56)));ranged.forEach((u,i)=>place(u,home-front*(traits.caution>.75?85:65),450+(i-(ranged.length-1)/2)*62));mounted.forEach((u,i)=>place(u,home-front*35,450+(i%2?1:-1)*(170+Math.floor(i/2)*50)));if(guard)place(guard,home-front*115,450);
}
export function delegate(E,s,ids,task,anchor){
 let p=perceive(E,s,0),b=analyze(E,p),units=p.own.filter(u=>ids.includes(u.id)),orders={};if(!units.length)return orders;let base=anchor||b.home,front=p.front;
 for(let u of units){let offset=(u.y-mean(units,v=>v.y)),dest=point(clamp(base.x,25,E.W-25),clamp(base.y+offset,25,E.H-25));if(task==="reserve")dest=point(clamp(b.home.x-front*85,25,E.W-25),dest.y);if(task==="follow")dest=point(clamp(b.home.x-front*30,25,E.W-25),dest.y);if(task==="cover")dest=point(clamp(base.x-front*45,25,E.W-25),dest.y);let kind=dist(u,dest)<12?"brace":"move";orders[u.id]={kind,path:kind==="move"?route(E,p,b,u,dest,90):[],a:u.a,nav:true,group:"staff-"+ids.join("-"),stages:kind==="move"?[{kind:task==="reserve"?"rally":"brace",path:[],when:"complete",a:u.a}]:[]}}
 return orders
}
