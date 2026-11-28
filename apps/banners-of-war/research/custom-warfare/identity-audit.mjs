import {E} from '../../engine.js';
import {createCustom,PRESETS,armyCost} from '../../custom-battle.js';
import {configurations} from './configurations.mjs';
import {readFile,writeFile,readdir,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const out=resolve(process.env.BOW_AUDIT_OUTPUT),source=process.env.BOW_ORIGINAL_TRACES;await mkdir(out,{recursive:true});
async function all(dir){let files=[];for(let x of await readdir(dir,{withFileTypes:true})){let p=resolve(dir,x.name);if(x.isDirectory())files.push(...await all(p));else files.push(p)}return files}
function trace(initial,frames,final,rounds){
 let F=E.forState(initial),units=new Map(),first={seen:null,shot:null,contact:null,loss:null,rout:null},distance=Infinity,timeline=[],postures={},lastTime=null;
 for(let f of frames){
 let dt=lastTime===null?0:Math.max(0,f.time-lastTime);lastTime=f.time;
 let own=f.units.filter(u=>u.side===0&&F.alive(u)&&!u.rout),enemy=f.units.filter(u=>u.side===1&&F.alive(u)&&!u.rout);
 let gap=Math.min(Infinity,...own.flatMap(u=>enemy.map(v=>F.dist(u,v))));distance=Math.min(distance,gap);
 if(first.seen===null&&own.some(u=>enemy.some(v=>F.lineOfSight(initial.terrain,u,v,350))))first.seen=f.time;
 if(first.shot===null&&f.shots?.length)first.shot=f.time;if(first.contact===null&&f.units.some(u=>u.contact>0))first.contact=f.time;
 if(first.loss===null&&f.units.some(u=>u.initial-u.n>.01))first.loss=f.time;if(first.rout===null&&f.units.some(u=>u.rout))first.rout=f.time;
 if(f.aiIntent?.[1]?.posture)postures[f.aiIntent[1].posture]=(postures[f.aiIntent[1].posture]||0)+dt;
 for(let u of f.units){let r=units.get(u.id)||{id:u.id,side:u.side,type:u.type,orders:{},roles:{},firstContact:null,firstFire:null,firstRout:null,distance:0,peakFatigue:0,minimumCohesion:100,waterSeconds:0,last:{x:u.x,y:u.y},lastN:u.n,ammo:u.ammo};r.distance+=F.dist(r.last,u);r.last={x:u.x,y:u.y};r.orders[u.order?.kind||'none']=(r.orders[u.order?.kind||'none']||0)+dt;let role=f.aiIntent?.[u.side]?.roles?.[u.id];if(role)r.roles[role]=(r.roles[role]||0)+dt;if(u.contact>0&&r.firstContact===null)r.firstContact=f.time;if(u.ammo<r.ammo&&r.firstFire===null)r.firstFire=f.time;if(u.rout&&r.firstRout===null)r.firstRout=f.time;r.peakFatigue=Math.max(r.peakFatigue,u.fatigue);r.minimumCohesion=Math.min(r.minimumCohesion,u.cohesion);if(F.sample(initial.terrain,u.x,u.y).water)r.waterSeconds+=dt;r.final={n:u.n,morale:u.morale,cohesion:u.cohesion,fatigue:u.fatigue,ammo:u.ammo,causes:u.causes};units.set(u.id,r)}
 if(!timeline.length||f.time-timeline.at(-1).t>=30||f.result)timeline.push({t:f.time,gap:Number.isFinite(gap)?gap:null,control:F.control(f),power:[F.power(f,0),F.power(f,1)],posture:f.aiIntent?.[1]?.posture,reasons:f.aiIntent?.[1]?.reasons,loss:f.units.reduce((n,u)=>n+u.initial-u.n,0)});
 }
 return {result:final.result,reason:final.resultReason,time:final.time,first,minimumGap:Number.isFinite(distance)?distance:null,loss:[0,1].map(i=>final.units.filter(u=>u.side===i).reduce((n,u)=>n+u.initial-u.n,0)),postures,units:[...units.values()],timeline,rounds:rounds.length};
}
let old=[];for(let path of await all(source)){let name=path.split('/').at(-1);if(!/^(equal|quality|mixed|defence)-(hold|direct|combined|staff)\.json$/.test(name))continue;let a=JSON.parse(await readFile(path,'utf8'));let row={name,...trace(a.initial,a.frames,a.final,a.rounds)};old.push(row);console.log(JSON.stringify({original:name,first:row.first,loss:row.loss,gap:row.minimumGap,postures:row.postures}))}
assert.equal(old.length,16);await writeFile(out+'/original-causality.json',JSON.stringify(old,null,2));
function policy(F,s,kind){if(kind==='staff')return F.command(s,0);let o={},enemy=s.units.filter(u=>u.side===1&&F.alive(u)&&!u.rout&&F.visible(s,0,u));for(let u of s.units.filter(u=>u.side===0&&F.alive(u)&&!u.rout)){let v=enemy.slice().sort((a,b)=>F.dist(u,a)-F.dist(u,b)||a.id-b.id)[0];o[u.id]=kind==='hold'||!v?F.spec(u).range&&v?{kind:'shoot',target:v.id,path:[],a:F.angle(u,v)}:{kind:'brace',path:[]}:F.spec(u).range?{kind:'shoot',target:v.id,path:[]}:{kind:F.spec(u).horse?'charge':'attack',target:v.id,path:[]}}return o}
async function run(config,kind,rules,name){let initial=createCustom({...config,seconds:900,rules}),s=initial,F=E.forState(s),frames=[],rounds=[];for(let i=0;i<31&&!s.result;i++){let o=policy(F,s,kind),r=F.resolve(s,o,false);rounds.push(o);frames.push(...r.frames.map(f=>({...f,terrain:null})));s=r.state}assert(s.result);let replay=initial;for(let o of rounds)replay=F.resolveHeadless(replay,o,false).state;assert.deepEqual(replay,s);let summary=trace(initial,frames,s,rounds);await writeFile(out+'/'+name+'.json',JSON.stringify({initial,frames,final:s,rounds,summary}));console.log(JSON.stringify({name,first:summary.first,loss:summary.loss,gap:summary.minimumGap,result:s.result}));return summary}
let comparisons=[];for(let config of configurations.slice(0,2))for(let rules of ['legacy','coordinated']){let name=config.id+'-hold-'+rules;comparisons.push({name,...await run(config,'hold',rules,name)})}
const a=(roster,overrides=[])=>({roster,size:1,quality:'regular',overrides});
let heavy=a(['knight','knight','sword','sword','spear','archer','crossbow','lightHorse'],[{quality:'veteran',size:.75},{quality:'veteran',size:.75},{quality:'veteran'},{quality:'veteran'}]),levy=a(['militia','militia','militia','militia','spear','spear','pike','archer','archer','crossbow','lightHorse'],[{size:1.25},{size:1.25},{size:1.25},{size:1.25}]),base=configurations[0];
for(let [i,landscape] of ['dry-plain','dry-ridge','forest'].entries()){let config={...base,seed:'Identity '+i,landscape,armies:i===1?[levy,heavy]:[heavy,levy],objective:i===2?'territory':'time'};let name='identity-'+landscape;comparisons.push({name,budgets:config.armies.map(armyCost),...await run(config,'staff','coordinated',name)})}
await writeFile(out+'/comparison.json',JSON.stringify(comparisons,null,2));
