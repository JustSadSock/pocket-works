import test from 'node:test';
import assert from 'node:assert/strict';
import {createCampaign,campaignUpgrade,validCampaign,politicalOrder,march,raid,startSiege,supplyNetwork,endSeason,income} from './campaign.mjs';
import {agreement,relation,league,freePassage,diplomacyChoice,tributeIncome,nextPoliticalSeason,warDiplomacy} from './diplomacy.mjs';
const act=(s,side,action)=>{
 const r=politicalOrder(s,side,action);assert.equal(r.error,null,action+' should be accepted: '+r.error);return r.state;
};
function weakened(s,side){
 // Remove all but original capital and its closest province; preserve army invariants.
 const keep=side===2?[2,3]:[10,11];
 const capital=side===2?3:11;
 for(const p of s.provinces)if(p.owner===side&&!keep.includes(p.id))p.owner=3;
 for(const a of s.armies.filter(a=>a.side===side)){a.province=capital;a.strength=3;}
 s.renown=3;
 assert.ok(validCampaign(s));
 return s;
}
test('campaign starts with actual relations, contract slots and clean old-save upgrade',()=>{
 const s=createCampaign();assert.ok(validCampaign(s));
 assert.equal(relation(s,1),-32);assert.equal(relation(s,2),-12);
 const legacy=createCampaign();delete legacy.diplomacy;
 assert.ok(validCampaign(legacy));
 const upgraded=campaignUpgrade(legacy);
 assert.deepEqual(upgraded.diplomacy,s.diplomacy);
 assert.ok(validCampaign(upgraded));
});
test('embassy takes a strategic order and has a deterministic trust result',()=>{
 let s=createCampaign();const start=s.coins;
 s=act(s,2,'envoy');
 assert.equal(relation(s,2),14);assert.equal(s.actions,1);assert.equal(s.coins,start-4);
 assert.equal(relation(createCampaign(),2),-12);
 s=act(s,2,'envoy');assert.equal(relation(s,2),40);
 assert.ok(diplomacyChoice(s,2,'envoy').ok===false);
});
test('truce stops offensive marches and revokes pre-existing blockades',()=>{
 let s=createCampaign();
 assert.ok(march(s,'army-1',2).error===null);
 s=act(s,2,'truce');
 assert.equal(agreement(s,2).kind,'truce');
 assert.ok(march(s,'army-1',2).error,'cannot invade the party to a truce');
 assert.equal(warDiplomacy(s,2,0),false);
 assert.equal(s.coins,10);
});
test('alliance needs earned glory and diplomacy, then grants a traversable wagon corridor',()=>{
 let s=createCampaign();s.diplomacy.relations[2]=32;
 assert.equal(diplomacyChoice(s,2,'alliance').ok,false);
 s.renown=1;
 s.provinces[6].owner=0;
 s.armies.find(a=>a.id==='army-6').province=3;
 assert.ok(validCampaign(s));
 assert.equal(supplyNetwork(s,0).has(6),false);
 s=act(s,2,'alliance');
 assert.equal(agreement(s,2).kind,'alliance');
 assert.equal(supplyNetwork(s,0).has(6),true,'wagons pass through allied territory');
 assert.equal(tributeIncome(s),1);
 assert.ok(march(s,'army-1',2).error,'military armies cannot invade allied territory');
});
test('treaties expire after agreed seasons and do not lock out warfare forever',()=>{
 let s=createCampaign();s=act(s,2,'truce');
 s.armies=s.armies.filter(a=>a.side===0);
 for(let i=0;i<3;i++){s=endSeason(s).state;assert.ok(agreement(s,2));}
 s=endSeason(s).state;
 assert.equal(agreement(s,2),null);
 assert.equal(warDiplomacy(s,2,0),true);
});
test('vassalage requires real military weakness and two glory; tribute is ongoing',()=>{
 let s=createCampaign();
 assert.ok(diplomacyChoice(s,2,'submission').ok===false);
 s=weakened(s,2);assert.equal(s.renown,3);
 s=act(s,2,'submission');
 assert.equal(agreement(s,2).kind,'vassal');
 assert.equal(agreement(s,2).loyalty,66);
 assert.equal(tributeIncome(s),4);
 assert.equal(s.winner,null,'the other kingdom is still independent');
 assert.ok(validCampaign(s));
});
test('vassal tariffs and concessions change actual coin and loyalty values',()=>{
 let s=weakened(createCampaign(),2);
 s=act(s,2,'submission');
 const pre=s.coins;s=act(s,2,'tribute');
 assert.equal(s.coins,pre+6);assert.equal(agreement(s,2).loyalty,42);
 s.actions=2;
 const coin=s.coins;s=act(s,2,'charter');
 assert.equal(s.coins,coin-5);assert.equal(agreement(s,2).loyalty,68);
 assert.ok(validCampaign(s));
});
test('neglected vassals rebel and receive a real army, not a decorative status',()=>{
 let s=weakened(createCampaign(),2);
 s=act(s,2,'submission');
 s.armies=s.armies.filter(a=>a.side===0);
 for(let i=0;i<11;i++){s.season++;nextPoliticalSeason(s);if(!agreement(s,2))break;}
 assert.equal(agreement(s,2),null);
 assert.ok(s.armies.some(a=>a.side===2&&a.strength===6));
 assert.equal(relation(s,2),-65);
 assert.ok(validCampaign(s));
});
test('two sworn crowns satisfy victory without repainting their lands',()=>{
 let s=createCampaign();s=weakened(s,2);s=weakened(s,1);
 s=act(s,2,'submission');
 s.actions=2;
 s=act(s,1,'submission');
 assert.equal(s.winner,0);
 assert.equal(s.provinces[3].owner,2);
 assert.equal(s.provinces[11].owner,1);
});
test('rival kingdoms form a defensive league only against a dominant North',()=>{
 const s=createCampaign();
 for(const id of [5,8,9])s.provinces[id].owner=0;
 assert.equal(s.provinces.filter(p=>p.owner===0).length,6);
 s.season=2;nextPoliticalSeason(s);
 assert.equal(league(s),true);
 assert.equal(freePassage(s,1,2),true);
 assert.ok(validCampaign(s));
});
test('friendship blocks raiding and besieging as well as overt battles',()=>{
 let s=createCampaign();
 s.provinces[2].owner=0;s.armies.find(a=>a.id==='army-5').province=3;
 s=act(s,2,'truce');
 assert.ok(startSiege(s,'army-1',2).error);
 assert.ok(raid(s,'army-1',2).error);
 assert.equal(warDiplomacy(s,2,0),false);
});
test('breaking a pact costs reputation and restores war',()=>{
 let s=createCampaign();s.renown=2;
 s=act(s,2,'truce');
 const score=relation(s,2);
 s=act(s,2,'break');
 assert.equal(agreement(s,2),null);
 assert.equal(relation(s,2),score-45);
 assert.equal(s.renown,1);
 assert.equal(warDiplomacy(s,2,0),true);
});
test('no diplomatic action bypasses the two orders or an outstanding battle',()=>{
 const s=createCampaign();s.actions=0;
 assert.ok(politicalOrder(s,2,'envoy').error);
 s.actions=2;
 const invade=march(s,'army-1',2).state;
 assert.ok(politicalOrder(invade,2,'truce').error);
});
test('impossible diplomat saves are rejected and retrofits are safe',()=>{
 const s=createCampaign();
 assert.ok(!validCampaign({...s,diplomacy:{relations:{1:101,2:-12},treaties:[],coalitionUntil:0}}));
 assert.ok(!validCampaign({...s,diplomacy:{relations:{1:0,2:0},treaties:[{side:2,kind:'vassal',until:2,loyalty:55}],coalitionUntil:0}}));
 assert.ok(!validCampaign({...s,diplomacy:{relations:{1:0,2:0},treaties:[{side:1,kind:'alliance',until:4},{side:1,kind:'truce',until:4}],coalitionUntil:0}}));
});
