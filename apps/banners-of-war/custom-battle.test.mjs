import test from 'node:test';
import assert from 'node:assert/strict';
import {E} from './engine.js';
import {createCustom,PRESETS,armyCost,validArmy,armyPopulation,campaignSummary,nextCampaign} from './custom-battle.js';
import {extent,project,unproject} from './research/integrated-agincourt/tactical-camera.js';
const army=(preset,size=1,quality='regular')=>({roster:[...PRESETS[preset]],size,quality});
const base={seed:'Custom causal test',armies:[army('compact'),army('levy',.75,'levy')],landscape:'valley',objective:'defend',seconds:360,difficulty:'commander',style:'adaptive',fog:false,campaign:true};
test('custom army pricing, physical counts, terrain seed and constraints',()=>{
 assert(validArmy(base.armies[0])&&validArmy(base.armies[1]));assert(!validArmy(army('mounted',1.25,'veteran')));
 let a=createCustom(base),b=createCustom(base);assert.deepEqual(a,b);
 assert.equal(a.units.filter(u=>u.side===0).reduce((n,u)=>n+u.n,0),armyPopulation(base.armies[0]));
 assert.equal(a.units.filter(u=>u.side===1).reduce((n,u)=>n+u.n,0),armyPopulation(base.armies[1]));
 assert.notDeepEqual(createCustom({...base,seed:'Different'}).terrain,a.terrain);
 assert.throws(()=>createCustom({...base,armies:[army('mounted',1.25,'veteran'),base.armies[1]]}));
 assert.equal(a.objective.kind,'zones');assert.equal(a.objective.zones.length,1);
});
test('campaign carries identities and casualties; two bounded alternatives, final stage',()=>{
 let s=createCustom(base),F=E.forState(s);s.units[0].n-=45;s.units[1].n-=25;s.units[2].n=0;s.result='win';
 let old=JSON.stringify(s),rec=campaignSummary(s),a=nextCampaign(s,'reinforce'),b=nextCampaign(s,'recruit');
 assert.equal(JSON.stringify(s),old);assert.equal(rec.loss,150);
 let pop=t=>t.units.filter(u=>u.side===0).reduce((n,u)=>n+u.n,0),before=rec.men.reduce((n,u)=>n+u.n,0);
 assert.equal(pop(a)-before,70);assert.equal(pop(b)-before,80);
 assert(!a.units.some(u=>u.campaignId==='R2'));assert(b.units.some(u=>u.campaignId==='R1000'));
 assert.equal(a.custom.campaign.records[0].loss,150);assert.equal(a.custom.campaign.stage,2);
 a.result='loss';let c=nextCampaign(a,'recruit');assert.equal(c.custom.campaign.stage,3);assert.equal(c.custom.campaign.records.length,2);
 c.result='draw';assert.throws(()=>nextCampaign(c,'reinforce'));
});
for(let land of ['plain','valley','ridge','marsh'])test('custom terrain camera '+land,()=>{
 let s=createCustom({...base,landscape:land}),F=E.forState(s),e=extent(s),o={x:80,y:21},k=2.1;
 for(let x=0;x<=F.W;x+=19)for(let y=0;y<=F.H;y+=19){let q={x,y},p=project(s,q,o,k),r=unproject(s,p,o,k);assert(Math.hypot(q.x-r.x,q.y-r.y)<.01,JSON.stringify({q,r,land}));assert(p.y>=o.y+e.top*k&&p.y<=o.y+(e.top+e.h)*k)}
});
