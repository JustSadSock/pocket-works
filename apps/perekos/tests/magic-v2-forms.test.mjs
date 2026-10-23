import test from 'node:test';
import assert from 'node:assert/strict';
import {makeMagicV2Practice,tick,STEP,validState} from '../core.mjs';
import {applyMagicEdit,grantEarnedMagicRune,validateMagicState,effectiveMagicForm} from '../magic-v2-rules.mjs';
import module from '../server/module.ts';

const C={x:0,y:0,attack:true,shield:false,dash:false,aim:{x:180,y:484}};
function fit(s,school,shape,origin){
 let b=s.magicLoadouts[0];
 for(const [id,action] of [['u_reform_base',undefined],[shape,0],...(origin?[[origin,0]]:[])]){
  const granted=grantEarnedMagicRune(b,id);assert.equal(granted.ok,true,granted.error);
  b=granted.state;
  const own=b.reserve.at(-1);
  const cmd={type:'equip',slot:1,instanceId:own.instanceId,revision:b.revision,
   ...(action===undefined?{}:{action})};
  const edit=applyMagicEdit(b,cmd);assert.equal(edit.ok,true,edit.error);b=edit.state;
 }
 assert.equal(validateMagicState(b).ok,true);
 s.magicLoadouts[0]=b;
 assert.equal(effectiveMagicForm(b).shape,shape);
 assert.equal(effectiveMagicForm(b).origin,origin||null);
 s.phase='fight';
 return s;
}
test('stone front is a bounded physical ground wave rather than a recolored projectile',()=>{
 const s=fit(makeMagicV2Practice('stone',303),'stone','st_form_wave');
 tick(s,C);
 assert.equal(s.shots.length,0);
 assert.equal(s.waves.length,1);
 assert.equal(s.waves[0].v2Element,'stone');
 assert.ok(s.waves[0].halfAngle<Math.PI);
 assert.equal(validState(s),true);
});
test('stone epicenter spreads a complete shockwave; below-ground origin visibly winds up',()=>{
 const self=fit(makeMagicV2Practice('stone',304),'stone','st_form_wave','st_origin_self');
 tick(self,C);assert.equal(self.waves.length,1);
 assert.equal(self.waves[0].halfAngle,Math.PI);
 const below=fit(makeMagicV2Practice('stone',305),'stone','st_form_wave','st_origin_below');
 tick(below,C);const wave=below.waves[0];
 assert.ok(wave.warmup>0);assert.ok(wave.x>below.actors[0].x+30);
 const hp=below.actors[1].hp;
 for(let i=0;i<45;i++)tick(below,{...C,attack:false});
 assert.ok(below.actors[1].hp<=hp);
 assert.equal(validState(below),true);
});
test('fire plume hits through a cone, sky origin is a telegraphed circular zone',()=>{
 const cone=fit(makeMagicV2Practice('fire',321),'fire','fi_form_stream');
 cone.actors[1].x=145;cone.actors[1].y=484;
 tick(cone,C);
 assert.equal(cone.shots.length,0);assert.equal(cone.waves.length,1);
 assert.equal(cone.waves[0].v2Element,'fire');
 for(let i=0;i<15;i++)tick(cone,{...C,attack:false});
 assert.ok(cone.actors[1].hp<100,'real cone should hit unobstructed opponent');
 const sky=fit(makeMagicV2Practice('fire',322),'fire','fi_form_stream','fi_origin_sky');
 tick(sky,C);
 assert.equal(sky.waves[0].halfAngle,Math.PI);
 assert.ok(sky.waves[0].warmup>0);
 assert.ok(sky.waves[0].x>sky.actors[0].x+40);
});
test('electric ray uses line geometry; relay origin moves the discharge point',()=>{
 const direct=fit(makeMagicV2Practice('storm',400),'storm','li_form_ray');
 direct.actors[1].x=175;direct.actors[1].y=484;
 tick(direct,C);
 assert.ok(direct.shots.every(q=>q.depth>0),'only on-hit secondary projectiles, never a default bolt');
 assert.equal(direct.beams.at(-1).style,'evo-beam');
 assert.ok(direct.actors[1].hp<100,'ray really damages unobstructed enemy');
 const relay=fit(makeMagicV2Practice('storm',401),'storm','li_form_ray','li_origin_pylon');
 relay.actors[1].x=175;relay.actors[1].y=484;
 tick(relay,C);
 assert.ok(relay.beams[0].x>relay.actors[0].x+35);
 assert.ok(relay.beams[0].length>0);
 assert.equal(validState(relay),true);
});
test('unformed magic continues to fire its normal projectile and foreign schools stay blocked',()=>{
 const s=makeMagicV2Practice('storm',402);s.phase='fight';tick(s,C);
 assert.ok(s.shots.length>0);assert.equal(s.beams.length,0);
 assert.equal(grantEarnedMagicRune(s.magicLoadouts[0],'st_form_wave').ok,false);
});
const p={id:'a'},q={id:'b'},players=[p,q];
const send=(s,who,type,rest={})=>module.onMessage({state:s,player:who,players,payload:{type,...rest}});
test('PocketNet v11 owns the transformed form and applies it to a real two-seat fight',()=>{
 const clock=Date.now;let now=1_000_000;Date.now=()=>now;
 try{
  let s=module.createRoom({player:p}).state;
  s=module.onJoin({state:s,player:q,players}).state;
  send(s,p,'mode',{gameMode:'magic-v2'});
  send(s,p,'magic-school',{school:'stone'});
  send(s,p,'start',{gameMode:'magic-v2'});
  assert.equal(s.phase,'magic-build');
  const seat=s.match.magicLoadouts[0];
  for(const [id,act] of [['u_reform_base',undefined],['st_form_wave',0],['st_origin_self',0]]){
   const book=s.match.magicLoadouts[0],inst=book.reserve.find(r=>r.defId===id);
   assert.ok(inst,id+' is issued by server');
   const command={type:'equip',slot:1,revision:book.revision,
    instanceId:inst.instanceId,nonce:'form-'+id,...(act===undefined?{}:{action:act})};
   send(s,p,'magic-edit',{command});
   assert.ok(s.match.magicLoadouts[0].revision>book.revision);
  }
  assert.equal(effectiveMagicForm(s.match.magicLoadouts[0]).origin,'st_origin_self');
  send(s,p,'magic-ready');send(s,q,'magic-ready');
  assert.equal(s.phase,'fight');
  for(let i=0;i<3;i++){
   now+=80;
   send(s,p,'input',{seq:i,round:s.match.round,control:{...C}});
   send(s,q,'input',{seq:i,round:s.match.round,control:{...C,attack:false}});
  }
  assert.ok(s.match.waves.some(w=>w.v2Element==='stone'),'server generated live ground wave');
  assert.equal(s.match.shots.filter(q=>q.owner===0).length,0);
 }finally{Date.now=clock}
});
