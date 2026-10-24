import test from 'node:test';
import assert from 'node:assert/strict';
import {incomingOffers,unreadOfferCount,bestInboxOffer} from './inbox.js';
const person=(id,name)=>({id,name});
const draft=()=>({phase:'play',you:{id:'mine'},players:[person('mine','Я'),person('bob','Борис')],deals:[],blackLots:[],blackMarket:false});
test('the receiver sees an actionable private deal, never a sender-owned one',()=>{
 const s=draft();s.deals=[{id:'d1',from:'bob',to:'mine'},{id:'d2',from:'mine',to:'bob'}];
 assert.deepEqual(incomingOffers(s),[{key:'deal:d1',kind:'deal',section:'deals',title:'Предложение от Борис',detail:'Ответить на обмен',targetId:''}]);
});
test('anonymous counteroffer discloses neither the seller nor another player\'s bid',()=>{
 const s=draft();s.blackMarket=true;
 s.blackLots=[{id:'black-1',mine:false,myBid:{gold:80},myCounter:{id:'c1',bidId:'b1',offer:{gold:100}},seller:'secret-account'},
  {id:'black-2',mine:true,bids:[{id:'b2',buyer:'stranger',counter:{id:'c2'}}]},
  {id:'black-3',mine:false,myBid:null,myCounter:{id:'c3'}}];
 const offers=incomingOffers(s);
 assert.equal(offers.length,1);
 assert.equal(offers[0].targetId,'bazaar-counter-black-1');
 assert.equal(JSON.stringify(offers).includes('secret-account'),false);
 assert.equal(JSON.stringify(offers).includes('stranger'),false);
 assert.equal(unreadOfferCount(offers,new Set(),'room','black'),1);
});
test('read state prioritizes a fresh offer and remains scoped to the room',()=>{
 const s=draft();s.deals=[{id:'d1',from:'bob',to:'mine'},{id:'d2',from:'bob',to:'mine'}];
 const offers=incomingOffers(s),seen=new Set(['room:deal:d1']);
 assert.equal(bestInboxOffer(offers,seen,'room').key,'deal:d2');
 assert.equal(unreadOfferCount(offers,seen,'room','deal'),1);
 assert.equal(unreadOfferCount(offers,seen,'new-room','deal'),2);
 seen.add('room:deal:d2');
 assert.equal(unreadOfferCount(offers,seen,'room','deal'),0);
 assert.equal(bestInboxOffer(offers,seen,'room').key,'deal:d1');
});
test('not in play or no private seat yields no incoming offers',()=>{
 const s=draft();s.deals=[{id:'d',from:'bob',to:'mine'}];
 s.phase='lobby';assert.deepEqual(incomingOffers(s),[]);
 s.phase='play';delete s.you;assert.deepEqual(incomingOffers(s),[]);
});
