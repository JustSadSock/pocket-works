import {E} from '../../engine.js';
import {createCustom,nextCampaign,campaignSummary} from '../../custom-battle.js';
import {configurations} from './configurations.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const out=resolve(process.env.BOW_AUDIT_OUTPUT);await mkdir(out,{recursive:true});
function measure(F,s){return {time:s.time,result:s.result,reason:s.resultReason,control:F.control(s),ai:s.aiIntent,units:s.units.map(u=>({id:u.id,side:u.side,type:u.type,x:u.x,y:u.y,n:u.n,morale:u.morale,cohesion:u.cohesion,fatigue:u.fatigue,contact:u.contact,rout:u.rout,ammo:u.ammo,causes:u.causes,order:u.order.kind}))}}
function orders(F,s,approach){
 if(approach==='staff')return F.command(s,0);
 let own=s.units.filter(u=>u.side===0&&F.alive(u)&&!u.rout),enemy=s.units.filter(u=>u.side===1&&F.alive(u)&&!u.rout&&F.visible(s,0,u)),out={};
 for(let u of own){let q=F.spec(u),v=enemy.slice().sort((a,b)=>F.dist(u,a)-F.dist(u,b)||a.id-b.id)[0],move=(x,y,kind='advance')=>({kind,path:[{x:F.clamp(x,40,F.W-40),y:F.clamp(y,30,F.H-30)}]});
 if(u.type==='guard'){out[u.id]={kind:'brace',path:[]};continue}
 if(!v){out[u.id]=approach==='hold'?{kind:'brace',path:[]}:move(u.x+80,u.y);continue}
 if(approach==='hold'){out[u.id]=q.range?{kind:'shoot',target:v.id,path:[],a:F.angle(u,v)}:{kind:'brace',path:[]};continue}
 if(approach==='direct'){out[u.id]={kind:q.range?'shoot':q.horse?'charge':'attack',target:v.id,path:[]};continue}
 // Combined arms: use the range gap, reserve one wing, do not repeatedly
 // charge a formed frontal enemy through impassable ground.
 if(q.range){let d=F.dist(u,v),a=F.angle(u,v);out[u.id]=d<q.range*.93?{kind:'shoot',target:v.id,path:[],a}:move(v.x-Math.cos(a)*q.range*.8,v.y-Math.sin(a)*q.range*.8);continue}
 if(u.fatigue>68&&u.contact===0){out[u.id]={kind:'rally',path:[]};continue}
 if(q.horse&&s.time<90){out[u.id]=move(u.x+35,u.y+(u.y<F.H/2?-35:35));continue}
 if(q.horse&&F.sample(s.terrain,u.x,u.y).move<.55){out[u.id]=move(u.x,u.y+Math.sign(s.terrain.ford-u.y)*50,'move');continue}
 out[u.id]={kind:q.horse?'charge':'attack',target:v.id,path:[]};
 }return out;
}
async function battle(initial,approach,tag){let s=initial,F=E.forState(s),rounds=[],frames=[];for(let i=0;i<Math.ceil(s.objective.seconds/30)+1&&!s.result;i++){let o=orders(F,s,approach),r=F.resolve(s,o,false);s=r.state;rounds.push({orders:o,actual:r.orders,metrics:measure(F,s)});frames.push(...r.frames.map(f=>({...f,terrain:null})))}assert(s.result);let replay=initial;for(let r of rounds)replay=F.resolveHeadless(replay,r.orders,false).state;assert.deepEqual(replay,s);assert.deepEqual(initial.terrain,s.terrain);await writeFile(out+'/'+tag+'.json',JSON.stringify({initial,final:s,rounds,frames}));return s}
let summary=[];
for(let c of configurations.map(c=>process.env.BOW_DEEP_AUDIT==='1'?{...c,seconds:900}:c))for(let policy of ['hold','direct','combined','staff']){let s=await battle(createCustom(c),policy,c.id+'-'+policy),F=E.forState(s),r={case:c.id,policy,result:s.result,time:s.time,reason:s.resultReason,loss:[0,1].map(i=>s.units.filter(u=>u.side===i).reduce((n,u)=>n+u.initial-u.n,0)),power:[F.power(s,0),F.power(s,1)],control:F.control(s)};summary.push(r);console.log(JSON.stringify(r));await writeFile(out+'/summary.json',JSON.stringify(summary,null,2))}
let s=createCustom({...configurations[0],campaign:true}),campaign=[];
for(let i=1;i<=3;i++){s=await battle(s,'combined','campaign-'+i);let r=campaignSummary(s);campaign.push(r);if(i<3){let next=nextCampaign(s,i===1?'reinforce':'recruit');assert.equal(next.custom.campaign.stage,i+1);s=next}}
await writeFile(out+'/campaign.json',JSON.stringify(campaign,null,2));console.log(JSON.stringify({campaign}));
