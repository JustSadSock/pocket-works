import assert from 'node:assert/strict';
import {assessBlockiesAwards} from '../pocketnet/blockies-awards.mjs';
import {blockiesAchievements} from '../shared/capabilities/blockies-achievements.js';
const players=[{id:'alpha',left:false},{id:'beta',left:false}];
const sample=(lines=0,score=0,comboChain=0,round=1,group=players,cleared=1)=>({
 started:true,round,players:group,engine:{sharedStats:{lines,score,comboChain,lastClearDetail:lines?{linesCleared:cleared}:null}}
});
let old=sample(),stats=null;let next=sample(1,100,1);
let value=assessBlockiesAwards(old,next,stats,()=> 'round-one');
assert.equal(value.awards.length,2);
assert.equal(value.awards[0].achievementId,'blockies.first-line');
stats=value.stats;
value=assessBlockiesAwards(next,next,stats,()=>{throw Error('must not mint new match')});
assert.equal(value.awards.length,0,'duplicate pulse does not grant twice');
old=next;next=sample(3,360,2,1,players,2);
value=assessBlockiesAwards(old,next,stats);stats=value.stats;
assert.deepEqual(value.awards.map(a=>a.achievementId),['blockies.double','blockies.double']);
old=next;next=sample(7,980,3,1,players,4);
value=assessBlockiesAwards(old,next,stats);stats=value.stats;
assert.deepEqual([...new Set(value.awards.map(a=>a.achievementId))],['blockies.combo-three','blockies.four-lines']);
old=next;next=sample(100,5100,2);
value=assessBlockiesAwards(old,next,stats);stats=value.stats;
assert.deepEqual([...new Set(value.awards.map(a=>a.achievementId))],[
 'blockies.ten-lines','blockies.coop-twenty','blockies.forty-lines',
 'blockies.five-thousand','blockies.hundred-lines'
]);
assert.equal(stats.seen.length,blockiesAchievements.length);
value=assessBlockiesAwards(next,sample(110,7000,4),stats);
assert.equal(value.awards.length,0,'earned milestones cannot repeat within a match');
value=assessBlockiesAwards(sample(0,0,0,2),sample(10,2000,1,2,[{id:'alpha',left:false}]),stats,()=> 'round-two');
assert.ok(value.awards.every(a=>a.playerId==='alpha'));
assert.ok(value.awards.every(a=>a.achievementId!=='blockies.coop-twenty'));
assert.ok(value.stats.matchId==='round-two');
assert.equal(assessBlockiesAwards(null,null,null).awards.length,0);
for(const a of blockiesAchievements)assert.ok(a.slot&&a.item&&a.reward);
console.log('Blockies server-achievements tests passed');

// Two lines gained across different placements do not prove a double clear.
const fakeBurst=assessBlockiesAwards(sample(1),sample(3,300,1,3,players,1),null,()=> 'third-round');
assert.ok(!fakeBurst.awards.some(a=>a.achievementId==='blockies.double'));

// Offline sockets cannot earn fresh rewards or count as a cooperative duo.
const present=assessBlockiesAwards(sample(19,2000,0,4),sample(20,2200,1,4),null,()=> 'presence',['alpha']);
assert.ok(present.awards.every(a=>a.playerId==='alpha'));
assert.ok(!present.awards.some(a=>a.achievementId==='blockies.coop-twenty'));
