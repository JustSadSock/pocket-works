import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {finaleRevealAuditMarkup,finaleResultsMarkup} from '../finale-ui.js';

let now=1_000_000;
class Clock extends Date{static now(){return now}}
const source=readFileSync(new URL('../server/module.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const api={};runInNewContext(js,{exports:api,Math,Array,Number,JSON,Object,Map,Set,Error,Date:Clock,console});
const game=api.default;
const people=[{id:'curator',name:'Curator'},{id:'bravo',name:'Bravo'},{id:'charlie',name:'Charlie'}];
const pick=(trueIndex,n=1)=>Array.from({length:5},(_,i)=>i===trueIndex?n:0);
const different=(trueIndex,n=1)=>pick((trueIndex+1)%5,n);
let checks=0;

function active(players=people){
 now+=200_000;
 const state=game.createRoom({player:players[0]}).state;
 for(const p of players.slice(1))game.onJoin({state,player:p,players});
 const send=(p,payload)=>game.onMessage({state,player:p,players,payload});
 send(players[0],{type:'start',rounds:1,drawingSeconds:60});
 now=state.deadline+1;send(players[0],{type:'pulse'});
 assert.equal(state.phase,'drawing');
 for(const p of players)send(p,{type:'submit',strokes:[]});
 assert.equal(state.phase,'voting','all accepted paintings start the jury immediately');
 const start=now;return {state,players,send,start};
}
function nextAfterReveal(match){
 const {state,send,players}=match;
 assert.equal(state.phase,'reveal');
 now=state.deadline+1;send(players[0],{type:'pulse'});
}
function finishRound(match){
 const {state,send,players}=match;
 while(state.phase!=='round-review'){
  if(state.phase==='voting'){
   now=state.deadline+1;send(players[0],{type:'pulse'});
  }else if(state.phase==='verdict'){now=state.deadline+1;send(players[0],{type:'pulse'});}
  else if(state.phase==='reveal')nextAfterReveal(match);
  else throw Error('Unexpected phase '+state.phase);
 }
}
{
 const m=active(),{state,send,players,start}=m;
 const author=players[0],truth=state.selected.indexOf(state.assignments[author.id].art);
 now=start+1000;send(players[1],{type:'vote_draft',chips:pick(truth,1)});
 const initial=state.voteTiming[author.id][players[1].id][truth][0];
 assert(initial>=30&&initial<=45,'initial placement timed from server');
 checks++;
 now=start+3200;send(players[1],{type:'vote_draft',chips:different(truth,1)});
 now=start+7200;send(players[1],{type:'vote_draft',chips:pick(truth,1)});
 const moved=state.voteTiming[author.id][players[1].id][truth][0];
 assert(moved>initial+200,'moving a chip must discard its earlier timestamp');
 checks++;
 now=start+8500;send(players[1],{type:'vote_draft',chips:pick(truth,2)});
 assert.equal(state.voteTiming[author.id][players[1].id][truth].length,2);
 checks++;
 // A paused/resumed PocketNet clock may change the deadline. Already placed
 // coins retain their relative progress and cannot be artificially backdated.
 const preserve=Array.from(state.voteTiming[author.id][players[1].id][truth]);
 state.deadline+=5000;
 now=start+12000;send(players[1],{type:'vote',chips:pick(truth,2)});
 assert.deepEqual(Array.from(state.voteTiming[author.id][players[1].id][truth]),preserve);
 checks++;
 now=state.deadline-1800;send(players[2],{type:'vote_draft',chips:different(truth,2)});
 const lateWrong=state.voteTiming[author.id][players[2].id][(truth+1)%5];
 assert(lateWrong.every(t=>t>=900));
 checks++;
 // A malicious or delayed retransmission can't rewrite either a finalized
 // ballot or the individual coin ages.
 send(players[1],{type:'vote_draft',chips:different(truth,3)});
 send(players[1],{type:'vote',chips:different(truth,3)});
 assert.deepEqual(Array.from(state.votes[author.id][players[1].id]),pick(truth,2));
 checks++;
 now=state.deadline+1;send(players[0],{type:'pulse'});
 assert.equal(state.phase,'verdict','unconfirmed two-coin draft counted at the deadline and tally shown');
 assert.deepEqual(Array.from(state.votes[author.id][players[2].id]),different(truth,2));
 checks++;
 const view=send(players[1],{type:'sync'}).events[0].payload;
 const audit=view.gallery[0].scoreAudit;
 assert(audit,'scoring disclosed after reveal, not during voting');
 assert.equal(audit.correct,2);assert.equal(audit.wrong,2);
 assert(audit.byVoter.bravo.speed>0,'quick correct vote gets an extra award');
 assert.equal(audit.byVoter.charlie.eye,0,'quick wrong choice never receives speed reward');
 assert(audit.delay>0&&audit.late>0,'author has both delayed decoy and resistance bonuses');
 assert.equal(audit.undetected,0,'a partly solved work is not undetected');
 checks+=6;
 const ui=finaleRevealAuditMarkup({breakdown:[{name:'Bravo',correct:2,wrong:0,points:audit.byVoter.bravo.eye,speed:audit.byVoter.bravo.speed}],wrong:audit.wrong,bonus:audit.mask,
 authorExtras:{endurance:audit.delay+audit.late,undetected:audit.undetected},escapeText:x=>x,chipDots:n=>String(n)});
 assert(ui.includes('за скорость')&&ui.includes('Выдержка'),'visible receipt explains speed/endurance awards');
 checks++;
 finishRound(m);
 assert(state.scores[author.id].mask>=audit.mask,'author scoreboard must contain the disclosed vote reward');
 assert(state.scores.bravo.eye>=audit.byVoter.bravo.eye,'real scoreboard includes the early correct vote');
 const previous=JSON.stringify(state.scores);
 send(players[0],{type:'pulse'});assert.equal(JSON.stringify(state.scores),previous,'replayed pulse cannot score twice');
 checks+=2;
}
{
 // Completely fooled gallery: author is paid for wrong coins AND the
 // mystery surviving the entire 25.5-second review.
 const m=active(people.slice(0,2)),{state,send,players,start}=m;
 const trueIndex=state.selected.indexOf(state.assignments.curator.art);
 now=start+20000;send(players[1],{type:'vote_draft',chips:different(trueIndex,3)});
 now=state.deadline+1;send(players[0],{type:'pulse'});
 const audit=send(players[0],{type:'sync'}).events[0].payload.gallery[0].scoreAudit;
 assert.equal(audit.correct,0);assert.equal(audit.wrong,3);
 assert.equal(audit.undetected,60);
 assert(audit.mask>150,'late deception earns more than old 3×50');
 checks+=3;
 finishRound(m);assert(state.scores.curator.mask>=audit.mask);
 checks++;
}
{
 // No participation must never count as an undefeated/restored masterpiece.
 const m=active(people.slice(0,2)),{state,send,players}=m;
 now=state.deadline+1;send(players[0],{type:'pulse'});
 const audit=send(players[0],{type:'sync'}).events[0].payload.gallery[0].scoreAudit;
 assert.equal(audit.mask,0);assert.equal(audit.undetected,0);
 checks+=2;
}
{
 // Correct identification in the first second outruns an otherwise identical
 // correct identification just before the deadline.
 const totals=[];
 for(const elapsed of [1000,24000]){
  const m=active(people.slice(0,2)),{state,send,players,start}=m;
  const truth=state.selected.indexOf(state.assignments.curator.art);
  now=start+elapsed;send(players[1],{type:'vote',chips:pick(truth,3)});
  const audit=send(players[0],{type:'sync'}).events[0].payload.gallery[0].scoreAudit;
  assert.equal(audit.correct,3);totals.push(audit.byVoter.bravo.eye);
 }
 assert(totals[0]>totals[1]+60,'fast detection should materially beat late detection');
 checks++;
}
{
 const view={participants:people,scores:{curator:{mask:170,eye:0},bravo:{mask:0,eye:375},charlie:{mask:80,eye:30}},host:'curator',timedScoring:true};
 const txt=finaleResultsMarkup({view,escapeText:x=>x,memberSeal:()=>'',pocketPlayerBadge:()=>'' ,hostId:'curator'});
 assert(txt.includes('Время голосования влияет на очки')&&txt.includes('Скорость: до +40')&&txt.includes('Выдержка: до +80')&&txt.includes('375'));
 checks++;
}
console.log('ZAMAZKA timed-scoring: '+checks+' server clock, anti-backdating, partial ballot, fairness, UI and full-round checks OK');
