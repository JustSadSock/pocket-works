import test from 'node:test';
import assert from 'node:assert/strict';
import {makeMatch,chooseEvolution,grantEvolution,availableFusions,EVOLUTIONS,tick,beginRound,validState,STEP} from '../core.mjs';
import module,{RULESET_VERSION} from '../server/module.ts';
const idle={x:0,y:0,aim:{x:200,y:310},attack:false,shield:false,dash:false};
const zero=(s)=>tick(s,idle,STEP,idle);
function fight(form,seed=65){
 const s=makeMatch(seed,'wire','kindle','rupture');
 s.phase='draft';assert.ok(chooseEvolution(s,'mutate',form));assert.ok(beginRound(s));return s;
}
test('mutation selection is exclusive, capped at three levels, and persists across revival',()=>{
 const s=fight('beam');assert.deepEqual(s.actors[0].evolution,{form:'beam',level:1});
 for(let i=2;i<=3;i++){s.phase='draft';assert.ok(chooseEvolution(s,'mutate','beam'));assert.equal(s.actors[0].evolution.level,i);assert.ok(beginRound(s))}
 s.phase='draft';assert.equal(chooseEvolution(s,'mutate','beam'),false);assert.equal(s.phase,'draft');
 assert.equal(grantEvolution(s.actors[0],'mutate','unknown'),false);
 assert.equal(grantEvolution(s.actors[0],'mutate','field'),true);assert.equal(s.actors[0].evolution.level,1);
 s.phase='fight';s.actors[0].hp=0;zero(s);for(let i=0;i<165;i++)zero(s);
 assert.deepEqual(s.actors[0].evolution,{form:'field',level:1});assert.ok(validState(s));
});
test('three mutation forms make mechanically different deterministic attack entities',()=>{
 for(const form of EVOLUTIONS.map(x=>x.id)){
  const s=fight(form);s.actors[0].cast=0;s.actors[0].face=0;
  const attack={...idle,attack:true,aim:{x:336,y:134}};
  tick(s,attack,STEP,idle);
  assert.equal(s.phase,'fight');
  if(form==='beam')assert.ok(s.beams.some(b=>b.style==='evo-beam'&&b.length>150));
  if(form==='swarm')assert.ok(s.shots.filter(q=>q.evo).length>=4);
  if(form==='field')assert.ok(s.fields.length>=1);
  assert.ok(validState(s));
 }
});
test('lasting field damages a real rival inside its radius and expires',()=>{
 const s=fight('field');s.actors[0].x=100;s.actors[0].y=310;s.actors[1].x=160;s.actors[1].y=310;
 tick(s,{...idle,attack:true,aim:{x:160,y:310}},STEP,idle);
 assert.ok(s.fields.length>0);const hp=s.actors[1].hp;
 for(let i=0;i<70;i++)zero(s);
 assert.ok(s.actors[1].hp<hp);for(let i=0;i<200;i++)zero(s);
 assert.equal(s.fields.length,0);
});
test('fusing requires an actual compiled action with a matching elemental modifier',()=>{
 const s=makeMatch(130,'wire','kindle','rupture'),a=s.actors[0];
 assert.equal(availableFusions(a).length,0);
 a.runes=['on_cast','ball','as_storm'];assert.deepEqual(availableFusions(a).map(f=>f.id),['storm_lattice']);
 assert.ok(grantEvolution(a,'fuse','storm_lattice'));assert.equal(availableFusions(a).length,0);
 assert.equal(grantEvolution(a,'fuse','storm_lattice'),false);
 a.runes=['on_cast','ball','as_fire','on_hit','mine','as_stone'];
 assert.deepEqual(availableFusions(a).map(f=>f.id),['ember_nova','stone_crush']);
 assert.ok(grantEvolution(a,'fuse','ember_nova'));assert.ok(grantEvolution(a,'fuse','stone_crush'));
 assert.equal(a.fusions.length,3);assert.ok(validState(s));
});
test('elemental fusion changes projectile impact rather than only adding an icon',()=>{
 const s=makeMatch(79,'wire','kindle','rupture'),a=s.actors[0],b=s.actors[1];
 a.runes=['on_cast','ball','as_storm'];assert.ok(grantEvolution(a,'fuse','storm_lattice'));
 a.x=180;a.y=300;b.x=245;b.y=300;b.invuln=0;a.cast=0;
 tick(s,{...idle,attack:true,aim:{x:b.x,y:b.y}},STEP,idle);
 for(let i=0;i<80;i++)zero(s);
 assert.ok(s.fx.some(f=>f.k==='thunder')||b.hp<100);
});
test('server rejects forged mutation and accepts legitimate one-time authenticated choices',()=>{
 assert.equal(RULESET_VERSION,8);
 const host={id:'host'},guest={id:'guest'},s=module.createRoom({player:host}).state;
 module.onJoin({state:s,player:guest,players:[host,guest]});
 const send=(player,payload)=>module.onMessage({state:s,player,payload});
 send(host,{type:'start'});assert.equal(s.match.gameMode,'rupture');
 s.phase='draft';s.match.phase='draft';s.picked=[false,false];s.ready=[false,false];
 const first=send(host,{type:'evolve',kind:'mutate',form:'beam'});
 assert.equal(s.picked[0],true);assert.equal(s.match.actors[0].evolution.form,'beam');
 send(host,{type:'evolve',kind:'mutate',form:'field'});assert.equal(s.match.actors[0].evolution.form,'beam');
 const bad=send(guest,{type:'evolve',kind:'fuse',form:'storm_lattice'});
 assert.equal(s.picked[1],false);assert.ok(bad.events.some(e=>e.type==='notice'));
 const other=send(guest,{type:'evolve',kind:'mutate',form:'swarm'});
 assert.equal(s.match.actors[1].evolution.form,'swarm');
 send(host,{type:'ready',runes:[...s.match.actors[0].runes]});
 send(guest,{type:'ready',runes:[...s.match.actors[1].runes]});
 assert.equal(s.phase,'fight');assert.equal(s.match.actors[0].evolution.form,'beam');
});
test('old v0.23 save resumes safely with a migrated field collection and fusion list',()=>{
 const s=makeMatch(981,'kindle','wire','rupture');delete s.fields;for(const a of s.actors){delete a.fusions;delete a.evolution}
 assert.ok(validState(s));zero(s);
 assert.deepEqual(s.fields,[]);assert.deepEqual(s.actors.map(x=>x.fusions),[[],[]]);
});
