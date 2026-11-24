import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {E as Local} from '../../apps/banners-of-war/engine.js';
import {chronicles} from '../banners-engine-v1/chronicles.js';
import {createMatch,joinMatch,mutateMatch,tickMatch,resolveLocked,resolveDuel,validateOrders,viewMatch,viewRound,scenarioProject,rematchSource,ENGINE} from '../banners-match.mjs';
const a={id:'a',name:'Alpha'},b={id:'b',name:'Beta'},c={id:'c',name:'Intruder'},start=1000;
const act=(m,u,type,p={},now=start)=>mutateMatch(m,u,{type,seq:m.seq[u===a?0:1]+1,...p},now);
async function match(options={}){let m=await createMatch(a,{seconds:90,planSeconds:0,landscape:'flat',fog:true,...options},start,'1234567890abcdef');joinMatch(m,b,start);for(let u of [a,b])act(m,u,'accept',{checksum:m.checksum});return m}
test('all twelve compact historical scenarios are supported',()=>{for(let d of chronicles)assert.equal(scenarioProject({scenario:d.id}).armies.length,2,d.id)});
test('local explicit orders equal pinned network simulation',async()=>{let m=await match(),s=m.battle,F=Local.forState(s),orders={0:{kind:'advance',path:[{x:700,y:400}]},100:{kind:'advance',path:[{x:700,y:500}]}};let l=F.snapshot(s);F.prepare(l,orders);for(let i=0;i<F.STEPS&&!l.result;i++)F.step(l);if(l.fog)F.refreshVisibility(l);l.round++;assert.deepEqual(resolveDuel(s,orders,{frames:false}).state,l);assert.deepEqual(resolveDuel(s,orders).state,l)});
test('private orders, forged requests, durable lock and complete match',async()=>{let m=await match(),draft={0:{kind:'advance',path:[{x:711.123,y:412.456}],group:'flank'}};assert.throws(()=>act(m,b,'draft',{round:1,orders:draft}),/invalid_unit/);assert.throws(()=>act(m,a,'draft',{round:1,orders:{0:{kind:'move',n:900,path:[]}}}),/invalid_order/);assert.throws(()=>viewMatch(m,c,start),/not_member/);act(m,a,'draft',{round:1,orders:draft});assert.deepEqual(viewMatch(m,a,start).draft,draft);let enemy=viewMatch(m,b,start);assert.deepEqual(enemy.draft,{});assert.ok(!JSON.stringify(enemy).includes('711.123'));assert.equal(mutateMatch(m,a,{type:'draft',seq:m.seq[0],round:1,orders:{}},start),false);act(m,a,'ready',{round:1,orders:draft});assert.throws(()=>act(m,a,'draft',{round:1,orders:{}}),/round_locked/);act(m,b,'ready',{round:1,orders:{}});assert.equal(m.phase,'locked');m=JSON.parse(JSON.stringify(m));let row=resolveLocked(m,start+100);assert.equal(m.phase,'replay');assert.deepEqual(Object.keys(viewRound(m,b,row)).sort(),['frames','number']);assert.throws(()=>resolveLocked(m,start+101),/round_not_locked/);for(let u of [a,b])act(m,u,'replay_done',{round:1});for(let r=2;r<=3;r++){for(let u of [a,b])act(m,u,'ready',{round:r,orders:{}});resolveLocked(m,start+100);if(m.phase==='replay')for(let u of [a,b])act(m,u,'replay_done',{round:r})}assert.equal(m.phase,'finished');assert.equal(viewRound(m,b,row).engine,ENGINE);assert.ok(viewRound(m,b,row).orders)});
test('server deadline and correspondence',async()=>{let m=await match({planSeconds:30,fallback:'hold'});assert.equal(m.deadline,start+30000);assert.equal(tickMatch(m,m.deadline-1),false);assert.equal(tickMatch(m,m.deadline),true);assert.equal(m.phase,'locked');resolveLocked(m,start+31000);assert.equal(m.phase,'replay');let d=m.deadline;assert.equal(tickMatch(m,d),true);assert.equal(m.deadline,d+30000);let n=await match({mode:'correspondence',planSeconds:86400});assert.equal(n.deadline,start+86400000)});
test('Historical Command accepts only own hierarchy and hides enemy internals',async()=>{let m=await match({historical:true,scenario:'cannae'}),s=m.battle,n=s.commandHierarchy.nodes.find(n=>n.level===1),q={commands:[{group:n.id,task:'advance',anchor:{x:800,y:450},autonomy:'bounded'}]};assert.throws(()=>validateOrders(s,0,{0:{kind:'move',path:[]}}),/invalid_unit/);act(m,a,'draft',{round:1,orders:q});act(m,a,'draft',{round:1,orders:viewMatch(m,a,start).draft});assert.deepEqual(viewMatch(m,b,start).draft,{});s.units.find(u=>u.side===1).order={kind:'advance',path:[{x:777.12345,y:333.12345}]};let out=JSON.stringify(viewMatch(m,a,start));assert.ok(!out.includes('777.12345'));assert.ok(!out.includes('enemyHierarchy'));assert.ok(!out.includes('aiIntent'))});
test('free deployment, scenario digest, surrender',async()=>{let m=await match({deployment:'free'});assert.match(m.checksum,/^[0-9a-f]{64}$/);assert.throws(()=>act(m,b,'deploy',{placements:[{id:0,x:100,y:100,a:0}]}),/invalid_deployment/);assert.throws(()=>act(m,a,'deploy',{placements:[{id:0,x:1000,y:400,a:0}]}),/deployment_boundary/);for(let u of [a,b])act(m,u,'deploy_ready');act(m,a,'surrender');assert.equal(m.phase,'finished');assert.throws(()=>scenarioProject({project:{kind:'banners-lab-project',schema:999}}))});

test('scenario plans remain private and seed own first round; rematch swaps armies',async()=>{let p=scenarioProject({landscape:'flat',seconds:60,fog:true}),g=p.armies[0].units[0].groupName||p.armies[0].units[0].group;p.plans=[{side:0,group:g,task:'advance',x:600,y:400,wait:0,when:'complete',threshold:30,autonomy:'bounded',phases:[]}];let m=await match({project:p});assert.ok(Object.keys(viewMatch(m,a,start).draft).length>0);assert.deepEqual(viewMatch(m,b,start).draft,{});assert.throws(()=>rematchSource(m,a),/match_not_finished/);act(m,b,'surrender');let r=rematchSource(m,a);assert.equal(r.project.armies[0].name,m.project.armies[1].name);assert.equal(r.project.plans[0].side,1);assert.throws(()=>rematchSource(m,c),/not_member/)})

test('immutable engine v1 files match the reviewed Git blob digests',()=>{
 const pins={
  'battle-events.js':'3413afc4faf5ee577b8a64674c7f25c116f0df17',
  'battle-plans.js':'6fa56aa05a8c0031c6c093a9758f8ca793436603',
  'chronicles.js':'af4d86e88202fd9a3d367b4d9fc64ae463a3e790',
  'commander.js':'6434e46ae6e140f5ae6caee9f59c8771ba10018a',
  'engine.js':'b7408697eb7ccc876bda662216f2adc20a0773c7',
  'historical-command.js':'7cffd02dc4502feb8b338dc07b4150972a58f8da',
  'historical-profiles.js':'0daa66f572358fe6eb1f188fdc1000c022ff4ae7',
  'laboratory.js':'323c91226da241bbb548b498bf23d4f9b42a1cd6'
 };
 const root=new URL('../banners-engine-v1/',import.meta.url);
 assert.deepEqual(readdirSync(root).sort(),Object.keys(pins).sort());
 for(const [name,expected] of Object.entries(pins)){
  const bytes=readFileSync(new URL(name,root));
  assert.equal(createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex'),expected,name);
 }
});
test('active match rejects hidden targets, forged state and oversized scenarios',async()=>{
 const m=await match(),original={seed:m.project.seed,physics:m.battle.physicsVersion,checksum:m.checksum};
 const v=viewMatch(m,a,start),visible=new Set(v.units.map(u=>u.id));
 const hidden=m.battle.units.find(u=>u.side===1&&!visible.has(u.id));
 assert.ok(hidden,'fixture must contain a hidden enemy');
 assert.throws(()=>validateOrders(m.battle,0,{0:{kind:'attack',target:hidden.id,path:[]}}),/invalid_target/);
 assert.throws(()=>validateOrders(m.battle,0,{0:{kind:'hold',path:[],physicsVersion:999}}),/invalid_order/);
 assert.throws(()=>act(m,a,'set_seed',{seed:'forged'}),/unknown_action/);
 act(m,a,'draft',{round:1,orders:{},seed:'forged',physicsVersion:999,result:'win'});
 assert.deepEqual({seed:m.project.seed,physics:m.battle.physicsVersion,checksum:m.checksum},original);
 assert.equal(m.battle.result,null);
 for(const key of ['project','battle','seed','enemyHierarchy','aiIntent'])assert.ok(!Object.hasOwn(viewMatch(m,a,start),key));
 const p=scenarioProject({landscape:'flat'});
 for(const army of p.armies)army.units=Array.from({length:30},()=>({...army.units[0]}));
 assert.throws(()=>scenarioProject({project:p}),/regiment_limit_60/);
});
test('Historical Command rejects overlapping assignments and unauthorized unit orders',async()=>{
 const m=await match({historical:true}),h=m.battle.commandHierarchy,n=h.nodes.find(n=>n.level===1);
 assert.ok(n);
 assert.throws(()=>validateOrders(m.battle,0,{0:{kind:'hold',path:[]}}),/invalid_unit/);
 const request=group=>({group,task:'advance',anchor:{x:700,y:450},autonomy:'bounded'});
 assert.throws(()=>validateOrders(m.battle,0,{commands:[request(h.nodes[0].id),request(n.id)]}),/overlapping_commands/);
});
