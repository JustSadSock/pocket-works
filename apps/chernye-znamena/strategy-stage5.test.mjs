import test from 'node:test';
import assert from 'node:assert/strict';
import {createCampaign,campaignUpgrade,validCampaign,buildImprovement,provinceRevenue,income,defensePower,supplyNetwork,endSeason,
 enemyOrder,MAX_STRENGTH,PROVINCES,IMPROVEMENTS,retreatCampaignBattle} from './campaign.mjs';
import {evaluateWarOrder} from './strategy-ai.mjs';
import {warDiplomacy,vassal} from './diplomacy.mjs';

test('a province chooses exactly one transparent specialization at a strategic cost',()=>{
 const base=createCampaign();
 const r=buildImprovement(base,4,'market');
 assert.equal(r.error,null);
 assert.equal(r.state.coins,8);assert.equal(r.state.actions,1);
 assert.equal(base.provinces[4].development,null,'original immutable');
 assert.equal(r.state.provinces[4].development,'market');
 assert.equal(provinceRevenue(r.state,4),PROVINCES[4].income+2);
 assert.equal(income(r.state),income(base)+2);
 assert.ok(buildImprovement(r.state,4,'barracks').error);
 assert.ok(validCampaign(r.state));
});
test('watchtower raises real defensive power, not a decorative attribute',()=>{
 const base=createCampaign();
 const r=buildImprovement(base,1,'watchtower');
 assert.equal(r.error,null);
 assert.equal(r.state.coins,9);
 assert.equal(defensePower(r.state,1),defensePower(base,1)+2);
 assert.equal(IMPROVEMENTS.watchtower.cost,7);
});
test('supplied barracks recruit people per season, but never exceed capacity',()=>{
 let s=createCampaign();
 s=buildImprovement(s,1,'barracks').state;
 s.armies=s.armies.filter(a=>a.side===0);
 s.armies[0].strength=11;
 s=endSeason(s).state;
 assert.equal(s.armies[0].strength,13);
 assert.ok(validCampaign(s));
});
test('barracks hold a garrison when no army is stationed nearby',()=>{
 let s=buildImprovement(createCampaign(),0,'barracks').state;
 const start=s.provinces[0].garrison;
 s.armies=s.armies.filter(a=>a.side===0);
 s=endSeason(s).state;
 assert.equal(s.provinces[0].garrison,start+1);
});
test('scorched, hostile, isolated and full provinces cannot build',()=>{
 const s=createCampaign();
 assert.ok(buildImprovement(s,5,'market').error);
 s.provinces[4].raidedUntil=3;
 assert.ok(buildImprovement(s,4,'market').error);
 s.provinces[4].raidedUntil=0;
 s.provinces[1].owner=2;
 s.provinces[4].owner=2;
 s.provinces[5].owner=0;
 assert.equal(supplyNetwork(s,0).has(5),false);
 assert.ok(buildImprovement(s,5,'barracks').error);
 assert.ok(buildImprovement(s,0,'fake').error);
});
test('AI treasuries have real revenue and upkeep, survive serialization and never become negative',()=>{
 let s=createCampaign();
 const previous={...s.treasury};
 s.armies=s.armies.filter(a=>a.side===0);
 const r=endSeason(s);
 assert.equal(r.error,null);s=r.state;
 assert.ok(s.treasury[1]>=previous[1] && s.treasury[2]>=previous[2]);
 assert.ok(validCampaign(s));
 assert.equal(validCampaign(JSON.parse(JSON.stringify(s))),true);
});
test('enemy economy can raise actual new armies after battlefield losses',()=>{
 let s=createCampaign();
 s.armies=s.armies.filter(a=>a.side!==2);
 const total=s.armies.length;
 const order=enemyOrder(s,2);
 assert.equal(order.kind,'raise');
 assert.equal(s.armies.length,total+1);
 assert.equal(s.treasury[2],3);
 assert.equal(s.armies.at(-1).side,2);
 assert.ok(validCampaign(s));
});
test('weakened hostile armies reinforce instead of endlessly throwing themselves away',()=>{
 let s=createCampaign();
 s.armies=s.armies.filter(a=>a.side!==1);
 const a=s.armies.find(a=>a.side===2);
 a.strength=4;
 const first=a.strength;
 const decision=evaluateWarOrder(s,2,{
  neighbors:id=>{const x=id%4,y=Math.floor(id/4);return [[x-1,y],[x+1,y],[x,y-1],[x,y+1]].filter(([x,y])=>x>=0&&x<4&&y>=0&&y<3).map(([x,y])=>y*4+x);},
  defensePower,supplyNetwork,isStronghold:()=>false,warDiplomacy,armiesAt:(state,id,side=null)=>state.armies.filter(u=>u.province===id&&(side===null||u.side===side)),
  MAX_STRENGTH
 });
 assert.ok(decision);
 assert.ok(['recruit','attack','raise','move','garrison','siege','raid','develop'].includes(decision.kind));
 const result=enemyOrder(s,2);
 assert.ok(result);
 assert.ok(a.strength>=first || result.kind!=='recruit');
 assert.ok(validCampaign(s));
});
test('old saves without economy and buildings migrate without changing ownership',()=>{
 const s=createCampaign(),firstOwner=s.provinces[2].owner,firstCoins=s.coins;
 delete s.treasury;for(const p of s.provinces)delete p.development;
 assert.ok(validCampaign(s));
 const out=campaignUpgrade(s);
 assert.ok(out);assert.deepEqual(out.treasury,{1:12,2:12});
 assert.ok(out.provinces.every(p=>p.development===null));
 assert.equal(out.provinces[2].owner,firstOwner);
 assert.equal(out.coins,firstCoins);
 assert.ok(validCampaign(out));
});
test('corrupted building and enemy funds are rejected',()=>{
 const s=createCampaign();
 s.provinces[2].development='oracle';
 assert.equal(validCampaign(s),false);
 s.provinces[2].development=null;
 s.treasury[2]=-1;
 assert.equal(validCampaign(s),false);
});
test('30 seasonal decisions remain legal and keep the economy finite',()=>{
 let s=createCampaign(),fights=0,firstKingdomTax=s.treasury[1];
 for(let i=0;i<30&&s.winner===null;i++){
  const r=endSeason(s);assert.equal(r.error,null);
  s=r.state;assert.ok(validCampaign(s),'valid on season '+s.season);
  if(s.pending){
    fights++;
    const ret=retreatCampaignBattle(s);assert.equal(ret.error,null);
    s=ret.state;
  }
  assert.ok(s.armies.length<=100);
  assert.ok(s.treasury[1]>=0&&s.treasury[1]<=9999);
  assert.ok(s.treasury[2]>=0&&s.treasury[2]<=9999);
  assert.ok(s.provinces.every(p=>p.development===null||p.development in IMPROVEMENTS));
 }
 assert.ok(s.season>=10);
 assert.ok(fights>=0);
 assert.ok(s.treasury[1]!==firstKingdomTax||s.winner!==null,'AI treasury changes over time');
});
