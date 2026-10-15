import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,advanceDays,audit,serialize,deserialize,CALIBRATION} from './model.js';
import {walkingSteps} from './navigation.js';
const live=(s,h)=>h.members.map(id=>s.people.find(p=>p.id===id)).filter(p=>p?.alive);
const check=(s)=>assert.ok(audit(s).ok,audit(s).issues.slice(0,4).join('; '));
test('garden produce is made only after a complete sequence of actual home labour',()=>{
 const s=createWorld(413);
 const h=s.households[0];
 const before=h.garden||0;assert.equal(before,0);
 advanceDays(s,310);
 assert.ok((s.stats.gardenProduced||0)>0,'crofts with adults produce vegetables');
 assert.ok(s.households.some(x=>x.gardenYear?.harvested),'at least one family completed planting and tending');
 check(s);
 const p=live(s,h);for(const person of p){person.alive=false;person.job='dead';}
 const old=(s.stats.gardenProduced||0),previousGardenProject=JSON.stringify(h.gardenYear);
 advanceDays(s,365);
 assert.equal(JSON.stringify(h.gardenYear),previousGardenProject,'empty homestead cannot cultivate a new croft season');
 assert.ok((s.stats.gardenProduced||0)>=old);
 check(s);
});
test('dairy production is conditional on cattle, fodder and a milking worker',()=>{
 const s=createWorld(413);for(const h of s.households){h.cattle=0;h.fodder=0;}
 s.economy.cattleInitial=0;s.economy.forageInitial=Number((s.pasture.reduce((n,x)=>n+x,0)+s.stats.forageConverted).toFixed(2));
 advanceDays(s,30);
 assert.equal(s.stats.dairyProduced||0,0,'zero animals cannot produce food');
 check(s);
});
test('a documented grain loan is a physical shipment with no minted money',()=>{
 const s=createWorld(43821),donor=s.households.find(h=>h.members.length===2);
 const debtor=s.households.find(h=>h.id!==donor.id&&walkingSteps(s,donor,h)>0&&walkingSteps(s,donor,h)<15&&h.fields.length>=15);
 assert.ok(debtor);
 for(const h of s.households){h.grain=300;h.coin=0;}
 donor.grain=720;debtor.grain=0;
 s.economy.grainInitial=Number(s.households.reduce((n,h)=>n+h.grain,0).toFixed(2));s.economy.coinsInitial=0;
 advanceDays(s,7);
 const loan=s.loans.find(l=>l.borrowerId===debtor.id);
 assert.ok(loan,'field rights and a real neighboring reserve make limited credit possible');
 assert.equal(loan.status,'in-transit');
 assert.equal(loan.principal,loan.owed);
 assert.ok(donor.grain<720,'grain was removed from lender immediately');
 assert.equal(debtor.grain,0,'borrower cannot eat grain before the carrier arrives');
 const ship=s.shipments.find(t=>t.loanId===loan.id);
 assert.ok(ship&&ship.kind==='loan'&&ship.cost===0);
 check(s);
 advanceDays(s,ship.day-s.day);
 assert.equal(loan.status,'active');
 assert.ok(debtor.grain>0,'physical delivery, not the contract, feeds the family');
 check(s);
});
test('long-term saves preserve loan obligations and calorie conservation without hidden food',()=>{
 const s=createWorld(9001);
 advanceDays(s,365*12);const frozen=serialize(s),copy=deserialize(frozen);
 assert.equal(serialize(copy),frozen);
 advanceDays(s,365*2);advanceDays(copy,365*2);
 assert.equal(serialize(s),serialize(copy),'in-progress loans and seasonal gardens replay deterministically');
 check(s);
 assert.ok((s.stats.gardenProduced||0)>0);
 assert.ok((s.stats.gardenConsumed||0)>0);
 assert.ok((s.stats.dairyProduced||0)>=0);
});
test('multiple food streams do not enforce survival when all edible calories are inaccessible',()=>{
 const s=createWorld(377);
 for(const h of s.households){h.grain=0;h.garden=0;h.dairy=0;h.cattle=0;h.fodder=0;h.fields=[];}
 s.usage.forEach((cell,i)=>{if(cell===2)s.usage[i]=0});
 s.economy.cattleInitial=0;s.economy.forageInitial=Number(s.pasture.reduce((n,x)=>n+x,0).toFixed(2));
 s.economy.grainInitial=0;s.economy.gardenInitial=0;s.economy.dairyInitial=0;
 s.stats.forageConverted=0;
 advanceDays(s,180);
 assert.ok((s.stats.starvationDeaths||0)>0,'no magic calories and no demographic floor');
 check(s);
});