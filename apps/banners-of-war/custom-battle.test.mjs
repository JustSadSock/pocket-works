import test from 'node:test';
import assert from 'node:assert/strict';
import {E} from './engine.js';
import {createCustom,PRESETS,armyCost,validArmy,armyPopulation,campaignSummary,nextCampaign,regiment,regimentCost,campaignOptions,campaignLength,campaignOutcome} from './custom-battle.js';
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
for(let land of ['plain','valley','ridge','marsh','dry-plain','dry-ridge','forest'])test('custom terrain camera '+land,()=>{
 let s=createCustom({...base,landscape:land}),F=E.forState(s),e=extent(s),o={x:80,y:21},k=2.1;
 for(let x=0;x<=F.W;x+=19)for(let y=0;y<=F.H;y+=19){let q={x,y},p=project(s,q,o,k),r=unproject(s,p,o,k);assert(Math.hypot(q.x-r.x,q.y-r.y)<.01,JSON.stringify({q,r,land}));assert(p.y>=o.y+e.top*k&&p.y<=o.y+(e.top+e.h)*k)}
});

test('mixed regiment properties and budget use actual physical counts',()=>{
 let a=army('compact');a.overrides=[{size:1.25,quality:'levy',form:'spears'},{size:.75,quality:'veteran',form:'shield'},{form:'loose'},{form:'wedge'}];
 assert(validArmy(a));let s=createCustom({...base,armies:[a,base.armies[1]]});
 assert.equal(s.units[0].n,150);assert.equal(s.units[0].form,'spears');assert.equal(s.units[1].n,75);assert.equal(s.units[1].form,'shield');assert(E.spec(s.units[1]).skill>E.types.sword.skill);
 assert.equal(armyCost(a),a.roster.reduce((n,t,i)=>n+regimentCost(regiment(a,i)),0));assert.equal(armyPopulation(a),s.units.filter(u=>u.side===0).reduce((n,u)=>n+u.n,0));
 assert(!validArmy({...a,overrides:[{form:'wedge'}]}));
});
test('dry fields have no physical river, forest is real cover, legacy terrain unchanged',()=>{
 let counts={};for(let kind of ['dry-plain','dry-ridge','forest','valley']){let s=createCustom({...base,landscape:kind}),F=E.forState(s),wet=0,wood=0;
 for(let x=0;x<=F.W;x+=10)for(let y=0;y<=F.H;y+=10){let q=F.sample(s.terrain,x,y);wet+=+q.water;wood+=+q.wood}
 counts[kind]={wet,wood};if(kind!=='valley'){assert.equal(s.terrain.hasRiver,false);assert.equal(wet,0)}
 }assert(counts.forest.wood>counts['dry-plain'].wood);assert(counts.valley.wet>0)
});
test('campaign has finite resource, alternative route, bounded experience, no free replacements',()=>{
 let s=createCustom(base);s.result='loss';s.units[0].n-=55;s.units[0].causes={melee:5};let a=nextCampaign(s,'reinforce','bold');assert.equal(a.custom.campaign.resource,105);assert.equal(a.custom.campaign.route,'bold');assert.equal(a.terrain.kind,'forest');assert.equal(a.units.find(u=>u.campaignId==='R0').campaignExperience,1);assert(E.spec(a.units.find(u=>u.campaignId==='R0')).skill>E.types.spear.skill);
 a.result='loss';let b=nextCampaign(a,'recruit','secure');assert.equal(b.custom.campaign.resource,25);assert.equal(b.custom.campaign.records[1].spent,80);assert.equal(b.terrain.kind,'dry-ridge');assert.equal(b.custom.campaign.stage,3);
 let exhausted=E.snapshot(s);exhausted.custom.campaign.resource=40;assert(!campaignOptions(exhausted).recruit);assert.throws(()=>nextCampaign(exhausted,'recruit'));
 let destroyed=E.snapshot(s);for(let u of destroyed.units.filter(u=>u.side===0&&u.type!=='guard'))u.n=0;assert.throws(()=>nextCampaign(destroyed,'rest'));
});

test('field width keeps physical unit specs, deterministic geometry and non-overlap',()=>{
 let wide=createCustom({...base,front:'wide'}),field=createCustom({...base,front:'field'}),close=createCustom({...base,front:'close'});
 for(let [s,width] of [[wide,1400],[field,1200],[close,1000]]){let F=E.forState(s);assert.equal(F.W,width);assert.deepEqual(s.units.map(u=>[u.type,u.n,F.spec(u).speed,F.spec(u).range]),wide.units.map(u=>[u.type,u.n,E.spec(u).speed,E.spec(u).range]));assert(!s.units.some((u,i)=>s.units.slice(i+1).some(v=>F.overlap(u,v))));assert.equal(s.terrain.cols,width/20+1);assert(s.terrain.river>width*.4&&s.terrain.river<width*.6)}
});
test('five-operation routes depend on outcome and retain resources and width',()=>{
 let s=createCustom({...base,front:'field',campaignLength:5});assert.equal(campaignLength(s),5);s.result='loss';s.units[0].n-=20;
 assert(!campaignOptions(s).routes.assault);assert(campaignOptions(s).routes.withdraw);assert.throws(()=>nextCampaign(s,'rest','assault'));
 let a=nextCampaign(s,'reinforce','withdraw','R0');assert.equal(a.custom.campaign.resource,140);assert.equal(a.objective.mission,'withdrawal');assert.equal(E.forState(a).W,1200);a.result='win';
 let b=nextCampaign(a,'rest','assault');assert.equal(b.custom.campaign.resource,140);assert.equal(b.objective.mission,'assault');b.result='win';
 let c=nextCampaign(b,'rest','crossing');assert.equal(c.custom.campaign.resource,175);assert.equal(c.objective.mission,'crossing');assert.equal(c.objective.zones[0].x,E.forState(c).riverX(c.terrain,c.terrain.ford));c.result='draw';
 let d=nextCampaign(c,'rest','secure');assert.equal(d.custom.campaign.stage,5);d.result='win';assert(campaignOutcome(d).complete);assert.equal(campaignOutcome(d).points,6);assert.throws(()=>nextCampaign(d,'rest','secure'));
});
test('withdrawal requires actual rear-line survival and cannot end before 120s',()=>{
 let s=createCustom({...base,front:'close',landscape:'dry-plain',objective:'withdrawal',campaign:false}),F=E.forState(s);
 for(let u of s.units.filter(u=>u.side===0)){u.x=170;u.y=100+(u.id%100)*100}for(let u of s.units.filter(u=>u.side===1)){u.x=850;u.y=100+(u.id%100)*60}
 for(let i=0;i<479;i++)F.step(s);assert(!s.result);F.step(s);assert.equal(s.result,'win');assert.equal(s.resultReason,'operation-withdrawal');
});
