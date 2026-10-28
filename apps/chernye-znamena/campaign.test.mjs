import test from 'node:test';
import assert from 'node:assert/strict';
import {createCampaign,PROVINCES,FACTIONS,neighbors,armiesAt,validCampaign,march,recruit,fortify,endSeason,
  startCampaignBattle,concludeCampaignBattle,retreatCampaignBattle,defensePower,MAX_STRENGTH,income,upkeep,supplyNetwork,isStronghold,raid,startSiege,siegeAt,siegeByArmy,liftSiege,campaignUpgrade} from './campaign.mjs';
function invasion(){
 const s=createCampaign();
 const r=march(s,'army-1',5);
 assert.equal(r.error,null);
 assert.equal(r.state.pending?.to,5);
 assert.equal(r.state.actions,1);
 return r.state;
}
test('the twelve provinces form one consistent undirected playable graph',()=>{
 assert.equal(PROVINCES.length,12);assert.equal(FACTIONS.length,4);
 for(let i=0;i<PROVINCES.length;i++)for(const n of neighbors(i)){
  assert.ok(neighbors(n).includes(i),'Undirected border '+i+'->'+n);
  assert.ok(n>=0&&n<12);
 }
 assert.equal(new Set(PROVINCES.map(p=>p.name)).size,12);
});
test('starting campaign is internally valid with armies, capitals and economy',()=>{
 const s=createCampaign();
 assert.ok(validCampaign(s));
 assert.equal(s.provinces[0].owner,0);assert.equal(s.provinces[3].owner,2);assert.equal(s.provinces[11].owner,1);
 assert.ok(income(s)>0);assert.ok(upkeep(s)>0);
 assert.equal(s.actions,2);
 assert.equal(armiesAt(s,1,0)[0].strength,11);
});
test('army march is adjacent, costs an order, and a second move is rejected',()=>{
 const s=createCampaign();
 assert.ok(march(s,'army-1',11).error);
 assert.ok(march(s,'army-3',6).error);
 const r=march(s,'army-1',0);assert.equal(r.error,null);
 assert.equal(r.state.armies.find(a=>a.id==='army-1').province,0);
 assert.equal(r.state.actions,1);
 assert.ok(march(r.state,'army-1',4).error);
 assert.equal(s.armies.find(a=>a.id==='army-1').province,1,'original state immutable');
 assert.ok(validCampaign(r.state));
});
test('recruitment and fortification actually spend silver and orders',()=>{
 const s=createCampaign();
 const a=recruit(s,1,'army-1');assert.equal(a.error,null);
 assert.equal(a.state.coins,10);
 assert.equal(a.state.armies.find(x=>x.id==='army-1').strength,15);
 assert.ok(recruit(a.state,1,'army-1').error,'used army cannot be replenished twice');
 const b=fortify(a.state,4);assert.equal(b.error,null);
 assert.equal(b.state.coins,5);assert.equal(b.state.actions,0);
 assert.equal(b.state.provinces[4].garrison,6);
 assert.ok(fortify(b.state,4).error);
 assert.ok(validCampaign(b.state));
});
test('new armies are real, independently movable next season',()=>{
 const s=createCampaign(); const a=recruit(s,0);
 assert.equal(a.error,null);assert.equal(a.state.armies.length,s.armies.length+1);
 const id=a.state.armies.at(-1).id;
 assert.ok(march(a.state,id,1).error,'new levy cannot march same season');
 const next=endSeason(a.state).state;
 assert.equal(next.season,2);assert.ok(validCampaign(next));
 if(!next.pending){const b=march(next,id,1);assert.equal(b.error,null);}
});
test('attack launches the actual tactical engine, with strength mapped to living figures',()=>{
 const s=invasion(),b=startCampaignBattle(s);
 assert.ok(b.campaignContext);
 assert.equal(b.campaignContext.to,5);
 assert.ok(b.units.some(u=>u.side===0&&u.hp>0));
 assert.ok(b.units.some(u=>u.side===1&&u.hp>0));
 assert.ok(b.units.filter(u=>u.side===0).reduce((n,u)=>n+u.hp,0)<=19);
 assert.ok(validCampaign(s));
 assert.ok(march(s,'army-2',8).error,'no simultaneous campaign orders while battle pending');
});
test('winning a tactical fight conquers the province and persists player casualties',()=>{
 const s=invasion(),b=startCampaignBattle(s);
 const initial=s.armies.find(a=>a.id==='army-1').strength;
 for(const u of b.units.filter(u=>u.side===1))u.hp=0;
 const a=b.units.find(u=>u.side===0 && u.hp>1);a.hp--;
 b.winner=0;
 const r=concludeCampaignBattle(s,b);
 assert.equal(r.error,null);
 assert.equal(r.state.pending,null);
 assert.equal(r.state.provinces[5].owner,0);
 assert.equal(r.state.armies.find(u=>u.id==='army-1').province,5);
 assert.ok(r.state.armies.find(u=>u.id==='army-1').strength<initial);
 assert.equal(r.state.report.playerWon,true);
 assert.ok(validCampaign(r.state));
});
test('losing an assault does not transfer province and leaves damaged force at origin',()=>{
 const s=invasion(),b=startCampaignBattle(s);
 for(const u of b.units.filter(u=>u.side===0))u.hp=0;
 b.winner=1;
 const r=concludeCampaignBattle(s,b);
 assert.equal(r.error,null);assert.equal(r.state.pending,null);
 assert.equal(r.state.provinces[5].owner,3);
 assert.ok(!r.state.armies.some(u=>u.id==='army-1'));
 assert.ok(validCampaign(r.state));
});
test('retreat is explicit and sacrifices strength without stealing land',()=>{
 const s=invasion(),old=s.armies.find(a=>a.id==='army-1').strength;
 const r=retreatCampaignBattle(s);
 assert.equal(r.error,null);
 assert.equal(r.state.provinces[5].owner,3);
 assert.ok(r.state.armies.find(a=>a.id==='army-1').strength<old);
 assert.equal(r.state.report.retreat,true);
 assert.equal(r.state.pending,null);
 assert.ok(validCampaign(r.state));
});
test('AI responds at end of season; its assault becomes a player-defended tactical battle',()=>{
 let s=createCampaign();
 for(let i=0;i<10 && s.winner===null;i++){
  const result=endSeason(s);assert.equal(result.error,null);s=result.state;
  assert.ok(validCampaign(s));
  if(s.pending){
   assert.equal(s.pending.defenderSide,0);
   const b=startCampaignBattle(s);
   const aiWasInvader=s.pending.attackerSide!==0;
   assert.ok(aiWasInvader);
   for(const u of b.units.filter(u=>u.side===1))u.hp=0;
   b.winner=0;
   const resolved=concludeCampaignBattle(s,b);assert.equal(resolved.error,null);
   s=resolved.state;
   assert.ok(validCampaign(s));
  }
 }
 assert.ok(s.season>1);
});
test('defensive defeat transfers territory, enemy retreats do not leave hostile pieces inside',()=>{
 const s=createCampaign();
 // Army of the order assaults a northern province from a neighboring tile.
 // The real game reaches exactly this pending shape after an AI seasonal order.
 const a=s.armies.find(u=>u.id==='army-5');
 a.province=2;
 const pending={...s,pending:{kind:'counterattack',attackerId:'army-5',from:2,to:1,attackerSide:2,defenderSide:0,
   attackerStrength:9,defenderStrength:defensePower(s,1),defenderGarrison:s.provinces[1].garrison}};
 assert.ok(validCampaign(pending));
 const b=startCampaignBattle(pending);
 for(const u of b.units.filter(u=>u.side===0))u.hp=0;
 b.winner=1;
 const result=concludeCampaignBattle(pending,b);
 assert.equal(result.error,null);
 assert.equal(result.state.provinces[1].owner,2);
 assert.ok(result.state.armies.every(a=>result.state.provinces[a.province].owner===a.side));
 assert.ok(validCampaign(result.state));
});
test('corrupted or impossible saved campaigns are rejected',()=>{
 const s=createCampaign();
 assert.equal(validCampaign({...s,coins:-20}),false);
 assert.equal(validCampaign({...s,provinces:[...s.provinces.slice(1)]}),false);
 assert.equal(validCampaign({...s,armies:[...s.armies,s.armies[0]]}),false);
 assert.equal(validCampaign({...s,season:0}),false);
});

function preparedSiege(){
 const s=createCampaign();
 s.provinces[2].owner=0;
 s.provinces[2].garrison=3;
 s.armies=s.armies.filter(a=>a.side===0);
 s.armies.find(a=>a.id==='army-1').province=2;
 assert.ok(validCampaign(s));
 return s;
}
test('capital supply travels only through friendly provinces',()=>{
 const s=createCampaign();
 assert.deepEqual([...supplyNetwork(s,0)].sort((a,b)=>a-b),[0,1,4]);
 s.provinces[1].owner=2;
 assert.equal(supplyNetwork(s,0).has(1),false);
 assert.equal(supplyNetwork(s,0).has(4),true);
 s.provinces[5].owner=0;
 assert.equal(supplyNetwork(s,0).has(5),true,'supply can pass through province four');
 s.provinces[4].owner=3;
 assert.equal(supplyNetwork(s,0).has(5),false,'isolated province cannot draw supply through enemy lands');
});
test('siege cannot begin in open country or from a disconnected army',()=>{
 const s=createCampaign();
 assert.ok(startSiege(s,'army-1',5).error,'ordinary crossing is not a stronghold');
 const good=preparedSiege();
 assert.equal(isStronghold(good,3),true);
 assert.equal(startSiege(good,'army-1',3).error,null);
 assert.ok(validCampaign(startSiege(good,'army-1',3).state));
});
test('siege wears down the garrison and captures a capital after several seasons',()=>{
 let s=preparedSiege();
 const start=startSiege(s,'army-1',3);
 assert.equal(start.error,null);s=start.state;
 assert.equal(s.actions,1);
 assert.equal(siegeAt(s,3).progress,0);
 assert.equal(siegeByArmy(s,'army-1').to,3);
 assert.equal(s.provinces[3].owner,2);
 for(let i=0;i<4&&siegeAt(s,3);i++){
   const result=endSeason(s);assert.equal(result.error,null);
   s=result.state;
   assert.ok(validCampaign(s));
   assert.equal(s.pending,null,'no hostile field army should derail scenario');
 }
 assert.equal(s.provinces[3].owner,0,'capital capitulates after loss of supplies and garrison');
 assert.equal(siegeAt(s,3),null);
 assert.equal(s.armies.find(a=>a.id==='army-1').province,3);
 assert.equal(s.report?.siege,true);
});
test('a besieger can storm the fortress on a later turn and switches to a proper castle map',()=>{
 let s=startSiege(preparedSiege(),'army-1',3).state;
 s=endSeason(s).state;
 const attack=march(s,'army-1',3);
 assert.equal(attack.error,null);
 assert.equal(siegeAt(attack.state,3),null);
 assert.equal(attack.state.pending.to,3);
 const battle=startCampaignBattle(attack.state);
 assert.equal(battle.mapId,'bastion');
 assert.ok(battle.units.some(u=>u.side===1&&u.hp>0));
});
test('player can lift the blockade without spending the remaining strategic order',()=>{
 const s=startSiege(preparedSiege(),'army-1',3).state;
 const r=liftSiege(s,'army-1');
 assert.equal(r.error,null);
 assert.equal(r.state.actions,s.actions);
 assert.equal(r.state.sieges.length,0);
 assert.equal(s.sieges.length,1,'original must be unchanged');
});
test('raids are distinct from conquest and reduce target garrison at an explicit price',()=>{
 const s=createCampaign();
 const startCoin=s.coins,oldStrength=s.armies[0].strength;
 const r=raid(s,'army-1',5);
 assert.equal(r.error,null);
 assert.equal(r.state.coins,startCoin+4);
 assert.equal(r.state.armies[0].strength,oldStrength-1);
 assert.equal(r.state.provinces[5].owner,3);
 assert.equal(r.state.provinces[5].garrison,s.provinces[5].garrison-2);
 assert.ok(r.state.provinces[5].raidedUntil>r.state.season);
 assert.ok(raid(r.state,'army-1',5).error,'same unit may not raid again immediately');
 assert.ok(raid(r.state,'army-2',5).error,'scorched land cannot be plundered repeatedly');
 assert.ok(validCampaign(r.state));
});
test('cut-off troops lose manpower on seasonal attrition and cannot recruit',()=>{
 let s=createCampaign();
 s.provinces[5].owner=0;
 s.armies=s.armies.filter(a=>a.side===0);
 s.armies[0].province=5;
 // Both approaches to province five have fallen.
 s.provinces[1].owner=2;s.provinces[4].owner=2;
 s.armies[1].province=0;
 assert.equal(supplyNetwork(s,0).has(5),false);
 assert.ok(recruit(s,5,s.armies[0].id).error);
 const before=s.armies[0].strength,defBefore=s.provinces[5].garrison;
 s=endSeason(s).state;
 assert.equal(s.armies[0].strength,before-2);
 assert.equal(s.provinces[5].garrison,defBefore-1);
});
test('old v0.2 saves are migrated with sieges and raid status defaults',()=>{
 const s=createCampaign();
 for(const p of s.provinces)delete p.raidedUntil;
 delete s.sieges;
 const upgraded=campaignUpgrade(s);
 assert.ok(upgraded);
 assert.ok(validCampaign(upgraded));
 assert.deepEqual(upgraded.sieges,[]);
 assert.equal(upgraded.provinces[0].raidedUntil,0);
});
test('invalid duplicated or dangling siege armies are rejected',()=>{
 const s=preparedSiege();
 s.sieges=[{armyId:'army-1',side:0,from:2,to:3,progress:0}];
 assert.ok(validCampaign(s));
 assert.equal(validCampaign({...s,sieges:[s.sieges[0],s.sieges[0]]}),false);
 assert.equal(validCampaign({...s,sieges:[{...s.sieges[0],armyId:'army-999'}]}),false);
});

test('besieging camp is lost after a hostile counterattack captures its origin',()=>{
 let s=startSiege(preparedSiege(),'army-1',3).state;
 s.armies.push({id:'army-7',side:2,province:3,strength:9,used:false});
 s.pending={kind:'counterattack',attackerId:'army-7',from:3,to:2,attackerSide:2,defenderSide:0,
  attackerStrength:9,defenderStrength:defensePower(s,2),defenderGarrison:s.provinces[2].garrison};
 assert.ok(validCampaign(s));
 const b=startCampaignBattle(s);
 b.units.filter(u=>u.side===0).forEach(u=>u.hp=0);
 b.winner=1;
 const result=concludeCampaignBattle(s,b);
 assert.equal(result.error,null);
 assert.equal(result.state.provinces[2].owner,2);
 assert.equal(result.state.sieges.length,0,'no stranded besiegers inside enemy province');
 assert.ok(validCampaign(result.state));
});
