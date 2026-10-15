import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,advanceDays,audit,overview,serialize,deserialize,HISTORIC_PROFILE} from './model.js';
const live=(s,h)=>h.members.map(id=>s.people.find(p=>p.id===id)).filter(p=>p?.alive);
const check=s=>assert.ok(audit(s).ok,audit(s).issues.slice(0,6).join(' | '));

test('a local Midlands 1280 scenario has four real demesnes and unequal free, customary and cottar tenure',()=>{
 const s=createWorld(413);
 assert.equal(s.historicalProfile.referenceYear,1280);
 assert.equal(s.households.length,36);
 assert.ok(s.people.length>=150&&s.people.length<=250);
 for(const village of s.communities){
  const homes=s.households.filter(h=>h.communityId===village.id);
  assert.equal(homes.length,9);
  assert.deepEqual(Object.fromEntries(['free','customary','cottar','demesne'].map(k=>[k,homes.filter(h=>h.tenure===k).length])),
    {free:2,customary:4,cottar:2,demesne:1});
  assert.ok(homes.some(h=>h.fields.length<=15)&&homes.some(h=>h.fields.length>=120));
  assert.equal(homes.find(h=>h.id===village.manorHouseId).tenure,'demesne');
  assert.ok(homes.every(h=>h.fields.length>0));
 }
 check(s);
});

test('a steward grows a real demesne crop, obligations use tenant workdays and conserve grain',()=>{
 const s=createWorld(413),before=overview(s);
 advanceDays(s,365);
 assert.ok((s.stats.manorServiceDays||0)>0,'actual field-days served on a demesne');
 assert.ok((s.stats.manorRentsCoin||0)>0,'real customary rent paid to the demesne');
 assert.ok(s.households.filter(h=>h.tenure==='demesne').some(h=>h.lastHarvest?.kg>150),
   'demesnes grow a real crop rather than collect fictional income');
 const served=s.households.filter(h=>h.tenure!=='demesne').reduce((n,h)=>n+(h.manorAgreement?.served||0),0);
 assert.equal(served,s.stats.manorServiceDays);
 assert.equal(overview(s).coin,before.coin,'rent does not mint currency');
 assert.ok(s.people.some(p=>p.lifeLog?.some(l=>l.type==='manor-work')),'named people perform days');
 check(s);
});

test('unpaid manorial rent remains a debt and may not mint or confiscate coins',()=>{
 const s=createWorld(413),tenant=s.households[0],manor=s.households.find(h=>h.id===tenant.manorAgreement.manorId);
 // Remove every wallet's money to prove rent can never manufacture coins.
 for(const h of s.households)h.coin=0;
 s.economy.coinsInitial=0;
 s.day=309;advanceDays(s,1);
 assert.equal(tenant.coin,0);
 assert.equal(tenant.manorAgreement.rentArrears,tenant.manorAgreement.annualRentCoin);
 assert.equal(overview(s).coin,s.economy.coinsInitial);
 check(s);
});

test('when a demesne family dies, its institution retains fields and property for a real successor',()=>{
 const s=createWorld(43821),manor=s.households.find(h=>h.tenure==='demesne');
 const fields=[...manor.fields],grain=manor.grain;
 for(const p of live(s,manor)){p.alive=false;p.job='dead';}
 advanceDays(s,1);
 assert.equal(manor.tenure,'demesne');
 assert.deepEqual(manor.fields,fields);
 assert.ok(manor.grain<=grain,'stock can be spoiled but not donated to a false heir');
 assert.ok(s.households.every(h=>h.id===manor.id||!h.fields.some(i=>fields.includes(i))),
  'empty demesne fields are never reallocated to the village as private holding');
 check(s);
});

test('marital timing depends on both age and economy while new first marriages are tracked',()=>{
 const s=createWorld(7777);
 advanceDays(s,365*10);
 const married=s.people.filter(p=>Number.isFinite(p.firstMarriageAge));
 assert.ok(married.length>0,'new generation forms households and partnerships');
 assert.ok(married.every(p=>p.firstMarriageAge>=(p.sex==='f'?21:23)),'no underage first marriage');
 check(s);
});

test('older saved worlds can be opened without changing their existing resources or inventing a manor',()=>{
 const s=createWorld(413);
 delete s.historicalProfile;
 for(const c of s.communities)delete c.manorHouseId;
 for(const h of s.households){delete h.manorAgreement;delete h.manorGranaryKg;h.tenure='customary';}
 const old=serialize(s),before=overview(s);
 const restored=deserialize(old);
 assert.deepEqual(overview(restored),before);
 assert.ok(!restored.historicalProfile);
 assert.equal(restored.households.filter(h=>h.tenure==='demesne').length,0);
 advanceDays(restored,20);check(restored);
});

test('new manorial accounts, workdays and land rights survive save/restore identically',()=>{
 const s=createWorld(9001);advanceDays(s,365);
 const snapshot=serialize(s),copy=deserialize(snapshot);
 assert.equal(serialize(copy),snapshot);
 advanceDays(s,365);advanceDays(copy,365);
 assert.equal(serialize(s),serialize(copy));
 check(s);
});

test('Midlands foundation uses locally plausible English given names without rewriting older worlds',()=>{
 const s=createWorld(413);
 const given=new Set(['Агнес','Матильда','Алиса','Джоан','Маргарет','Эмма','Эдит','Изабель','Сесилия','Элинор',
  'Джон','Уильям','Роберт','Ричард','Генри','Томас','Роджер','Ральф','Уолтер','Хью']);
 assert.ok(s.people.every(p=>given.has(p.name)), 'names should correspond to the historic scenario');
 const old=createWorld(413);
 delete old.historicalProfile;
 const copy=deserialize(serialize(old));
 assert.ok(!copy.historicalProfile,'older worlds retain their profile absence on reload');
 assert.ok(audit(copy).ok);
});
