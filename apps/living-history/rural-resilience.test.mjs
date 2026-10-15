import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,advanceDays,rand,serialize,deserialize,audit,overview,foodAccess,CALIBRATION} from './model.js';
import {walkingSteps} from './navigation.js';
const living=(s,h)=>h.members.map(id=>s.people.find(p=>p.id===id)).filter(p=>p?.alive);
const check=s=>assert.ok(audit(s).ok,audit(s).issues.slice(0,4).join(' | '));
const reset=(s)=>{s.economy.grainInitial=+(s.households.reduce((n,h)=>n+h.grain,0).toFixed(2));s.economy.coinsInitial=s.households.reduce((n,h)=>n+h.coin,0)};
test('work paid in actual grain reaches the laborer family while the field owner loses the same grain',()=>{
 const s=createWorld(43821);
 const employer=s.households.find(h=>living(s,h).length>=2&&h.fields.length>=9);
 const donor=s.households.find(h=>h.id!==employer.id&&walkingSteps(s,h,employer)>0&&walkingSteps(s,h,employer)<13&&living(s,h).filter(p=>p.age>=15).length>=2);
 assert.ok(donor,'the tested medieval settlement has nearby working adults');
 employer.coin=0;employer.grain=1200;donor.grain=55;
 for(const p of living(s,employer).slice(1))p.age=12;
 s.day=89;reset(s);
 const w=CALIBRATION.grainDailyWageKg;
 advanceDays(s,1);
 assert.ok((s.stats.grainWagesKg||0)>=w,'a true grain wage was paid');
 const worker=living(s,donor).find(p=>p.hiredDay===s.day);
 assert.ok(worker,'hired worker must physically belong to a donor household');
 assert.ok((employer.accounting?.grainWagesPaidKg||0)>=w);
 assert.ok((donor.accounting?.grainWagesEarnedKg||0)>=w);
 assert.equal(overview(s).coin,s.economy.coinsInitial,'in-kind compensation never mints cash');
 check(s);
});
test('seed-backed loan is physically delivered, and the creditor keeps survival and sowing reserves',()=>{
 const s=createWorld(43821),lender=s.households.find(h=>living(s,h).length>=2);
 const borrower=s.households.find(h=>h.id!==lender.id&&walkingSteps(s,h,lender)>0&&walkingSteps(s,h,lender)<17&&h.fields.length>=15);
 assert.ok(borrower);
 for(const h of s.households){h.grain=230;h.coin=0;}
 lender.grain=1250;borrower.grain=100;s.day=69;reset(s);
 advanceDays(s,1);
 const loan=s.loans.find(x=>x.borrowerId===borrower.id&&x.purpose==='seed-and-food');
 assert.ok(loan,'seasonal seed need can enable a collateralized in-kind agreement');
 assert.equal(loan.status,'in-transit');
 assert.ok(lender.grain>200,'lender did not give away the seed and family reserve');
 assert.ok(s.shipments.some(t=>t.loanId===loan.id&&t.amount===loan.principal));
 check(s);
});
test('weather remains identical when market and global random usage diverge',()=>{
 const a=createWorld(413),b=createWorld(413,{tuning:{yield:1.04,storage:.97,planting:1.02,transport:.96,weather:1}});
 for(let d=0;d<500;d++){
  if(d%7===0)for(let i=0;i<17;i++)rand(b);
  advanceDays(a,1);advanceDays(b,1);
  assert.equal(a.weather,b.weather,'weather keyed to seed and day should be independent of economic random draws');
 }
 check(a);check(b);
});
test('random stream state is serialized and a restored 15-year world continues byte-for-byte',()=>{
 const s=createWorld(413);advanceDays(s,365*15);
 const raw=serialize(s),copy=deserialize(raw);
 assert.equal(serialize(copy),raw);
 advanceDays(s,365);advanceDays(copy,365);
 assert.equal(serialize(s),serialize(copy));
 assert.ok(!Object.hasOwn(s,'_randomScope'),'ephemeral random context cannot leak into saved worlds');
 check(s);
});
test('legacy 0.4.2 saves acquire scoped streams without modifying any material inventory',()=>{
 const s=createWorld(7777);advanceDays(s,20);
 delete s.randomStreams;
 const before=overview(s);
 const recovered=deserialize(serialize(s));
 assert.deepEqual(overview(recovered),before);
 advanceDays(recovered,40);
 assert.ok(recovered.randomStreams&&typeof recovered.randomStreams==='object','migrated saves have an independent random-stream ledger');
 check(recovered);
});
test('economic diagnostics for credit and work are observational',()=>{
 const s=createWorld(43821),h=s.households[0];
 const before=serialize(s);
 const a=foodAccess(s,h);
 assert.ok('potentialCreditKg' in a&&'potentialGrainWorkplaces' in a);
 assert.equal(serialize(s),before,'finding real neighbors cannot change any contracts or draws');
});
