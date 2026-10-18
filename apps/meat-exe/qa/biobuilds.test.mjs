import test from 'node:test';
import assert from 'node:assert/strict';
import {GRAFTS,sanitizeGrafts,drawGrafts,applyGraft,weaponBuild,dashCooldown,
 moveSpeed,incomingDamage,membraneDamage,immuneHeatGain,maxWeaponIndex} from '../biobuilds.js';
import {validateRun} from '../stability.js';
const make=()=>({grafts:[],hp:80,maxHp:100,level:0,damageBonus:0,biomass:0});
test('11 operations and seeded offers stay repeatable with a body and gun choice',()=>{
 assert.equal(GRAFTS.length,11);assert.equal(new Set(GRAFTS.map(g=>g.id)).size,11);
 for(let seed=0;seed<500;seed++){
  const seen=[];
  for(let wave=2;wave<=5;wave++){
   const opts=drawGrafts(seed,wave,seen,0);
   assert.deepEqual(opts,drawGrafts(seed,wave,seen,0));
   assert.equal(opts.length,3);
   assert.ok(opts.some(g=>g.group==='weapon'));assert.ok(opts.some(g=>g.group==='body'));
   assert.ok(opts.every(g=>!seen.includes(g.id)));
   seen.push(opts[(seed+wave)%3].id);
  }
  assert.equal(new Set(seen).size,4);
 }
});
test('heavy and rapid bolter have balanced opposite costs',()=>{
 const baseline=weaponBuild(make(),0),heavy=make(),fast=make();
 applyGraft(heavy,'bolt_press');applyGraft(fast,'bolt_rapid');
 assert.ok(weaponBuild(heavy,0).damage>baseline.damage);
 assert.ok(weaponBuild(heavy,0).cooldown>baseline.cooldown);
 assert.ok(weaponBuild(fast,0).damage<baseline.damage);
 assert.ok(weaponBuild(fast,0).cooldown<baseline.cooldown);
});
test('shotgun teeth and choke alter pellet count and dispersion',()=>{
 const teeth=make(),choke=make(),base=weaponBuild(make(),1);
 applyGraft(teeth,'shot_teeth');applyGraft(choke,'shot_choke');
 assert.equal(weaponBuild(teeth,1).pellets,9);
 assert.ok(weaponBuild(teeth,1).spread>base.spread);
 assert.ok(weaponBuild(choke,1).spread<base.spread/2);
});
test('needle launcher becomes a real third high-pressure weapon',()=>{
 const state=make();
 assert.equal(maxWeaponIndex(state),1);
 assert.equal(applyGraft(state,'stinger'),true);
 assert.equal(maxWeaponIndex(state),2);
 assert.ok(weaponBuild(state,2).damage>50);
 assert.ok(weaponBuild(state,2).cooldown>weaponBuild(state,0).cooldown);
 assert.equal(applyGraft(state,'stinger'),false);
});
test('body surgeries change health, movement, dash and biological danger',()=>{
 const plate=make(),pump=make(),nerve=make(),shock=make(),gland=make();
 applyGraft(plate,'marrow_plate');assert.equal(plate.maxHp,125);assert.equal(plate.hp,105);
 assert.ok(moveSpeed(plate)<1);
 applyGraft(pump,'blood_pump');assert.equal(pump.maxHp,84);
 applyGraft(nerve,'nerve_splice');assert.ok(dashCooldown(nerve)<dashCooldown(make()));
 assert.ok(incomingDamage(nerve,10)>10);
 applyGraft(shock,'shock_dash');assert.ok(dashCooldown(shock)>dashCooldown(make()));
 applyGraft(gland,'rupture_gland');assert.ok(membraneDamage(gland,26)>45);
 assert.ok(immuneHeatGain(gland,26)>26);
});
test('four surgeries are the hard limit and arrays are sanitized',()=>{
 const s=make();for(const id of ['stinger','marrow_plate','bolt_press','nerve_splice'])assert.ok(applyGraft(s,id));
 assert.equal(applyGraft(s,'shot_teeth'),false);
 assert.deepEqual(sanitizeGrafts(['fake','stinger','stinger',null,'marrow_plate']),['stinger','marrow_plate']);
});
test('all old saves migrate without phantom grafts or draft',()=>{
 for(const v of [1,2,3,4]){
  const a=validateRun({v,seed:413,x:3,z:3,hp:80,wave:3});
  assert.equal(a.v,5);assert.deepEqual(a.grafts,[]);
  assert.equal(a.pendingDraft,0);assert.equal(a.biomass,0);
 }
});
test('v5 surgical state is durable and impossible variants are rejected',()=>{
 const r={v:5,seed:413,x:3,z:3,hp:108,maxHp:125,wave:2,pendingDraft:3,
  biomass:12,draftRevision:2,grafts:['stinger','marrow_plate'],weapon:2};
 const v=validateRun(r);assert.equal(v.pendingDraft,3);
 assert.equal(v.maxHp,125);assert.equal(v.hp,108);assert.equal(v.weapon,2);
 assert.equal(v.biomass,12);assert.equal(v.draftRevision,2);
 assert.deepEqual(validateRun(v),v);
 const bad=validateRun({...r,pendingDraft:5,biomass:999,grafts:['bad'],weapon:2});
 assert.equal(bad.pendingDraft,0);assert.equal(bad.biomass,99);assert.equal(bad.weapon,0);
});
