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
assert.equal(earned.size,7,'all seven achievements are reachable by genuine server states');
for(const a of ZAMAZKA_ACHIEVEMENTS)assert.ok(earned.has(a.id),a.id+' not awarded');
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
console.log('Zamazka achievements: all seven server-authoritative conditions and cosmetics passed.');
