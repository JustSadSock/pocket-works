import assert from 'node:assert/strict';
import {assessZamazkaAwards,ZAMAZKA_ACHIEVEMENTS} from '../pocketnet/zamazka-awards.mjs';
import {mascotSvg,safeMascot} from '../shared/capabilities/maskot.js';
const ids=['p0','p1','p2','p3'],matchId='eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee';
const participants=ids.map(id=>({id,name:id}));
const base={phase:'lobby',participants,round:0,rounds:5,scores:Object.fromEntries(ids.map(id=>[id,{mask:0,eye:0}]))};
let stats=null;
const update=(before,next,events=[],actor='p0')=>{
 const result=assessZamazkaAwards(before,next,events,actor,stats,matchId);
 stats=result.data;return result.awards.map(a=>a.playerId+':'+a.achievementId);
};
for(let i=0;i<10;i++)update(base,base,[{type:'board_delta',payload:{u:'p0'}}]);
update(base,base,[{type:'board_delta',payload:{u:'p1'}}],'p1');
assert.equal(stats.board.p0,10);
const first={...base,phase:'preview',round:1};
update(base,first);
assert.equal(stats.matchId,matchId);
const all=[];
for(let round=1;round<=5;round++){
 const votes={};
 const assignments={};
 for(let i=0;i<4;i++)assignments[ids[i]]={art:i,strokes:[1,2,3,4].map(n=>({c:'#000000',s:4,p:[[n,n]]}))};
 for(const target of ids){
  votes[target]={};
  for(const voter of ids){
   if(voter===target)continue;
   const ballot=[0,0,0,0,0];
   // Nobody can identify p0; p0 always recognizes p1 perfectly.
   ballot[voter==='p0'?1:target==='p0'?1:0]=3;
   votes[target][voter]=ballot;
  }
 }
 const previous={...base,phase:'reveal',round,rounds:5};
 const completed={...previous,phase:'round-review',selected:[0,1,2,3,4],assignments,votes,
  scores:Object.fromEntries(ids.map((id,i)=>[id,{mask:i===0?600:10,eye:i===0?600:5}]))};
 all.push(...update(previous,completed));
 assert.deepEqual(update(completed,completed),[],'repeated pulses cannot double score a round');
 if(round<5)update(completed,{...completed,phase:'preview',round:round+1});
 else all.push(...update(completed,{...completed,phase:'results'}));
}
const earned=new Set(all.map(x=>x.split(':').slice(1).join(':')));
assert(earned.size>=7,'all original achievements remain reachable by genuine server states');
for(const id of ['first-stroke','sharp-eye','shared-canvas','three-rounds','five-works','perfect-forgery','maestro'])assert.ok(earned.has('zamazka.'+id),id+' not awarded');
assert.equal(all.some(x=>x.startsWith('p0:zamazka.maestro')),true);
assert.equal(all.some(x=>x.startsWith('p0:zamazka.sharp-eye')),true);
const noGuests=assessZamazkaAwards(base,{...base,phase:'preview',round:1},[],null,null,matchId);
assert.deepEqual(noGuests.awards,[]);
for(const animal of ['cat','black-cat','fox','rabbit','frog']){
 const m={animal,hat:'brush',clothes:'restorer',face:'monocle'};
 assert.equal(safeMascot(m,[]).hat,'none');
 assert.deepEqual(safeMascot(m,['zamazka.shared-canvas','zamazka.maestro','zamazka.sharp-eye']),{...m,accessory:'none'});
 const svg=mascotSvg(m,{unlocks:['zamazka.shared-canvas','zamazka.maestro','zamazka.sharp-eye']});
 assert.match(svg,/<svg/);assert.match(svg,/painter's brush/);assert.match(svg,/master's coat/);
 assert.doesNotMatch(svg,/<script|foreignObject|onload=/i);
}

function awardPhase(participantCount,round,mode,original=null){
 const people=Array.from({length:participantCount},(_,i)=>({id:'member'+i,name:'Участник '+i}));
 const pids=people.map(p=>p.id),selected=[0,1,2,3,4];
 const assignments=Object.fromEntries(people.map((p,i)=>[p.id,{art:i%5,strokes:Array(4).fill({c:'#123456',s:4,p:[[4,5]]})}]));
 const votes=Object.fromEntries(people.map((target,i)=>[target.id,Object.fromEntries(
  people.filter(v=>v.id!==target.id).map(voter=>{
   const ballot=[0,0,0,0,0],correct=i%5;
   if(mode==='wrong')ballot[(correct+1)%5]=3;
   else if(mode==='split'&&voter.id===people[0].id&&i===1){
    for(const idx of [0,1,2])ballot[idx]=1;
   }else ballot[correct]=1;
   return [voter.id,ballot];
  })
 )]));
 const last={phase:'reveal',round,rounds:3,participants:people,scores:{},selected,assignments,votes};
 const next={...last,phase:'round-review'};
 const awarded=assessZamazkaAwards(last,next,[],pids[0],original||{matchId,board:{},rounds:{},done:false},matchId);
 return {awarded:awarded.awards,stats:awarded.data,participants:people};
}
const duo=awardPhase(2,1,'correct');
assert.equal(duo.awarded.filter(x=>x.achievementId==='zamazka.duo-detectives').length,2,'both duo players must detect each other');
for(const count of [2,3,4,8]){
 const blank=awardPhase(count,1,'wrong');
 assert.equal(blank.awarded.filter(x=>x.achievementId==='zamazka.ghost-brush').length,count,
  'fully fooled juries from '+count+' players are valid');
 const r1=awardPhase(count,1,'correct'),r2=awardPhase(count,2,'correct',r1.stats);
 assert.equal(r2.awarded.filter(x=>x.achievementId==='zamazka.eagle-eye').length,count,
  'two complete clean rounds qualify at '+count+' players');
 const split=awardPhase(count,1,'split');
 assert(split.awarded.some(x=>x.playerId==='member0'&&x.achievementId==='zamazka.three-theories'),
  'three different painted choices include one correct at '+count+' players');
}
const noVotes={phase:'reveal',round:1,participants:[{id:'a'},{id:'b'}],selected:[0,1,2,3,4],
 assignments:{a:{art:0,strokes:[{p:[1]},{p:[2]},{p:[3]},{p:[4]}]},b:{art:1,strokes:[]}},
 votes:{a:{},b:{}},scores:{}};
const emptyAward=assessZamazkaAwards(noVotes,{...noVotes,phase:'round-review'},[],null,
 {matchId,rounds:{},board:{},done:false},matchId);
assert(!emptyAward.awards.some(a=>a.achievementId==='zamazka.ghost-brush'),
 'no votes must never award phantom deception');
for(const x of ['duo-detectives','ghost-brush','eagle-eye','three-theories'])
 assert(ZAMAZKA_ACHIEVEMENTS.some(a=>a.id==='zamazka.'+x),'server catalogue has '+x);
console.log('Zamazka achievements: old 7 and 4 new authenticated achievements verified for 2, 3, 4 and 8 players.');

