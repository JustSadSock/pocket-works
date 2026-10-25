import test from 'node:test';
import assert from 'node:assert/strict';
import {runNegotiationAudit,PROFILES} from './negotiation-audit.mjs';

test('negotiation audit exercises server decisions without guaranteed sales',()=>{
 const original=Math.random;
 const report=runNegotiationAudit({seed:0xBA2A2026,trials:20});
 assert.equal(Math.random,original,'production Math.random must be restored after the audit');
 assert.equal(report.games,300);
 assert.deepEqual(Object.keys(report.profiles),Object.keys(PROFILES));
 for(const scenarios of Object.values(report.profiles)){
  for(let size=2;size<=6;size++){
   const stats=scenarios[size];
   assert.equal(stats.players,20*size);
   assert.equal(stats.publicSales+stats.unfilledListings,stats.listings);
   assert.ok(stats.publicSales<=stats.publicOffers);
   assert.ok(stats.privateSales<=stats.privateOffers);
   assert.ok(stats.counterSales<=stats.counterOffers);
   assert.ok(stats.blackSales<=stats.blackOffers);
   assert.ok(stats.completionPercent>=0&&stats.completionPercent<=100);
  }
 }
 assert.ok(report.profiles.mixed[4].sellerRejects+report.profiles.mixed[4].declined>0);
 console.log('BAZAAR_NEGOTIATION_SMOKE '+JSON.stringify({
  games:report.games,
  fourPlayer:Object.fromEntries(Object.entries(report.profiles).map(([key,scenario])=>[key,{
   sales:scenario[4].publicSales,
   bids:scenario[4].publicOffers,
   noSale:scenario[4].unfilledListings,
   quotaCompletionPercent:scenario[4].completionPercent
  }]))
 }));
});

test('negotiation audit is reproducible and does not leave a seeded RNG behind',()=>{
 const old=Math.random;
 const a=runNegotiationAudit({seed:0xDEAD2026,trials:4});
 const b=runNegotiationAudit({seed:0xDEAD2026,trials:4});
 const c=runNegotiationAudit({seed:0xBEEF2026,trials:4});
 assert.deepEqual(a,b);
 assert.notDeepEqual(a,c);
 assert.equal(Math.random,old);
});
