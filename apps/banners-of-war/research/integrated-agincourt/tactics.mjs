import {E} from '../../engine.js';
import {createHistorical,historicalScore} from '../../chronicles.js';
import {writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const out=resolve(process.env.BOW_AUDIT_OUTPUT);await mkdir(out,{recursive:true});const summary=[];
const clamp=E.clamp;
function plan(F,s,side,policy){
 let own=s.units.filter(u=>u.side===0&&F.alive(u)&&!u.rout),enemy=s.units.filter(u=>u.side===1&&F.alive(u)&&!u.rout),out={};
 let zone=s.objective.zones[0];if(!enemy.length)return out;
 const nearest=u=>enemy.slice().sort((a,b)=>F.dist(u,a)-F.dist(u,b)||a.id-b.id)[0];
 const rear=own.filter(u=>u.type==='sword').sort((a,b)=>a.x-b.x||a.id-b.id).slice(0,side?4:1).map(u=>u.id);
 const goodLane=u=>[zone.y-180,zone.y+180].map(y=>({y:clamp(y,40,F.H-40),cost:[.25,.5,.75,1].reduce((n,f)=>{let q=F.sample(s.terrain,u.x+(zone.x-u.x)*f,u.y+(y-u.y)*f);return n+(1-q.move)*100+(q.water||q.stakes?200:0)},0)+Math.abs(u.y-y)*.15})).sort((a,b)=>a.cost-b.cost||a.y-b.y)[0].y;
 for(let u of own){let spec=F.spec(u),v=nearest(u),dist=F.dist(u,v),guard=u.type==='guard',reserve=rear.includes(u.id),range=spec.range||0;
  const brace={kind:'brace',path:[]},attack={kind:spec.horse?'charge':'attack',target:v.id,path:[]};
  const move=(x,y,form=u.form)=>({kind:'move',nav:true,form,path:[{x:clamp(x,30,F.W-30),y:clamp(y,30,F.H-30)}]});
  if(guard){out[u.id]=brace;continue}
  if(u.fatigue>68&&u.contact===0&&dist>80){out[u.id]=brace;continue}
  if(range){
   const targets=enemy.filter(e=>F.dist(u,e)<=range).sort((a,b)=>(F.spec(b).range?1:0)-(F.spec(a).range?1:0)||F.dist(u,a)-F.dist(u,b));
   if(targets.length&&u.ammo>0){out[u.id]={kind:'shoot',target:targets[0].id,path:[]};continue}
   if(side&&u.ammo>0){let a=Math.atan2(v.y-u.y,v.x-u.x);out[u.id]=move(v.x-Math.cos(a)*range*.8,v.y-Math.sin(a)*range*.8,'loose');continue}
   out[u.id]=brace;continue
  }
  let release=policy==='reserve'?240:policy==='flanks'?150:120;
  if(reserve&&s.time<release&&u.contact===0){out[u.id]=brace;continue}
  if(!side){
   let vulnerable=own.filter(q=>(F.spec(q).range||0)>0).sort((a,b)=>F.dist(a,u)-F.dist(b,u))[0];
   if(u.contact>0||dist<45)out[u.id]=brace;
   else if(reserve&&s.time>=release&&vulnerable&&enemy.some(e=>F.dist(e,vulnerable)<70))out[u.id]=move(vulnerable.x+20,vulnerable.y,'line');
   else if(policy==='counter'&&s.time>180&&dist<100&&v.cohesion<50)out[u.id]=attack;
   else if(policy==='flanks'&&s.time>=release&&vulnerable&&F.dist(u,vulnerable)>60)out[u.id]=move(vulnerable.x-20,vulnerable.y,'line');
   else out[u.id]=brace;continue
  }
  if(u.contact>0||dist<40){out[u.id]=attack;continue}
  if(policy==='screen'&&s.time<90){out[u.id]=brace;continue}
  if(spec.horse&&s.time<release){out[u.id]=brace;continue}
  let y=policy==='flanks'||spec.horse?goodLane(u):clamp(zone.y+(u.y-zone.y)*.65,40,F.H-40);
  if(Math.abs(u.y-y)>35&&u.x<zone.x-65){out[u.id]=move(Math.min(zone.x-70,u.x+65),y,spec.horse?'wedge':'line');continue}
  if(u.x<zone.x-80){out[u.id]=move(zone.x-65,y,spec.horse?'wedge':'line');continue}
  out[u.id]=attack;
 }
 return out
}
for(const side of [0,1])for(const policy of side?['reserve','flanks','screen']:['reserve','flanks','counter'])for(const ground of [1,.85]){
 const options={side,difficulty:'commander',fog:false,alternative:ground!==1,ground},initial=createHistorical(E,'agincourt',options),F=E.forState(initial),terrain=JSON.stringify(initial.terrain),rounds=[],frames=[];let s=initial;
 for(let i=0;i<31&&!s.result;i++){let orders=plan(F,s,side,policy),r=F.resolve(s,orders,false);s=r.state;frames.push(...r.frames.map(f=>({...f,terrain:null})));rounds.push({orders,actual:r.orders,time:s.time,intent:s.aiIntent,score:historicalScore(F,s),units:s.units.map(u=>({id:u.id,n:u.n,cohesion:u.cohesion,morale:u.morale,fatigue:u.fatigue,x:u.x,y:u.y,contact:u.contact,rout:u.rout,causes:u.causes}))})}
 assert(s.result);assert.equal(JSON.stringify(s.terrain),terrain);
 let replay=createHistorical(E,'agincourt',options);for(let r of rounds)replay=F.resolve(replay,r.orders,false).state;assert.deepEqual(replay,s);
 let item={side,policy,ground,result:s.result,time:s.time,reason:s.resultReason,score:historicalScore(F,s),loss:[0,1].map(i=>s.units.filter(u=>u.side===i).reduce((n,u)=>n+u.initial-u.n,0))};summary.push(item);
 await writeFile(out+'/agincourt-'+side+'-'+policy+'-'+ground+'.json',JSON.stringify({item,options,initial,rounds,frames,final:s}));await writeFile(out+'/summary.json',JSON.stringify(summary,null,2));console.log(JSON.stringify(item));
}
