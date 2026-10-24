import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chapterReader,reactionBar,clampPage,nextPage,previousPage,REACTION_OPTIONS,supportsLiveReactions} from '../reader-reveal.js';
const file=path=>readFileSync(new URL('../../../'+path,import.meta.url),'utf8');
const source=file('pocketnet/module-versions/chyepukha/v9.ts');
const game=new Function(source.replace(/export const /g,'const ').replace(/export default module;/,'return module;'))();
const players=Array.from({length:4},(_,i)=>({id:'player-'+i,name:'Автор '+i}));
const make=count=>{
 const members=players.slice(0,count);
 let state=game.createRoom({player:members[0],payload:{settings:{maxPlayers:count}}}).state;
 for(let i=1;i<count;i++)state=game.onJoin({state,players:members.slice(0,i+1)}).state;
 state=game.onMessage({state,player:members[0],payload:{type:'start'}}).state;
 for(let round=0;round<10;round++)for(const player of members){
  const v=game.viewForPlayer({state,player,players:members});
  const r=game.onMessage({state,player,payload:{type:'submit',round,sheetId:v.sheet.id,
   answer:'Жвавий архіваріус знайшов таємничий годинник на площі міста',tailIndexes:round===9?[]:[0,1,2],gender:'unspecified'}});
  assert.equal(r.events[0].type,'state');
  state=r.state;
 }
 assert.equal(state.phase,'finished');
 return {members,state};
};
const see=(state,members,p)=>game.viewForPlayer({state,player:p,players:members});
const vote=(state,p,storyId,reaction)=>game.onMessage({state,player:p,payload:{type:'react_story',storyId,reaction}});
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

test('v9 adds a snapshot only and maintains older room rules',()=>{
 const lock=JSON.parse(file('pocketnet/modules.lock.json'));
 assert.ok(lock.chyepukha.versions.includes('v9'));
 assert.deepEqual(lock.chyepukha.versions.slice(0,9),Array.from({length:9},(_,i)=>'v'+(i+1)));
 assert.equal(file('pocketnet/module-versions/chyepukha/v9.ts'),source);
 assert.notEqual(file('pocketnet/module-versions/chyepukha/v8.ts'),source);
 assert.match(file('pocketnet/hub.mjs'),/\['v6','v7','v8','v9','v10'\]/);
});

test('all reader modes preserve full text and the pager cannot overrun an issue',()=>{
 const story={id:'sheet-0',fragments:[
  {author:'Марта',question:'Хто почав?',answer:'Архіваріус знайшов секретний <лист>'},
  {author:'Назар',question:'Що сталося?',answer:'Папір оголосив себе мером'},
  {author:'Софія',question:'Чим скінчилося?',answer:'Місто обрало новий календар'}
 ]};
 assert.equal(clampPage(-999,3),0);
 assert.equal(clampPage(999,3),2);
 assert.equal(clampPage(Infinity,3),0);
 assert.equal(nextPage(2,3),2);
 assert.equal(previousPage(0,3),0);
 const start=chapterReader(story,0,escape);
 assert.match(start,/АРКУШ 01/);
 assert.match(start,/Марта/);
 assert.match(start,/Архіваріус знайшов/);
 assert.doesNotMatch(start,/Папір оголосив/);
 assert.doesNotMatch(start,/Місто обрало/);
 assert.match(start,/&lt;лист&gt;/);
 assert.match(start,/data-act="prev-part" disabled/);
 const final=chapterReader(story,99,escape);
 assert.match(final,/КІНЕЦЬ РУКОПИСУ/);
 assert.match(final,/data-act="next-story"/);
 assert.doesNotMatch(final,/data-act="next-part"/);
 assert.match(chapterReader({fragments:[]},0,escape),/немає завершених/);
});

test('each member can choose one reaction; a repeated choice unvotes and changes reach others',()=>{
 for(const count of [2,4]){
  const {state,members}=make(count),id=state.sheets[0].id;
  const first=see(state,members,members[0]);
  assert.deepEqual(first.reactionTotals[id],{laugh:0,surprised:0,heart:0});
  vote(state,members[0],id,'laugh');
  assert.equal(see(state,members,members[1]).reactionTotals[id].laugh,1);
  assert.equal(see(state,members,members[0]).myReactions[id],'laugh');
  assert.equal(see(state,members,members[1]).myReactions[id],undefined);
  vote(state,members[1],id,'laugh');
  assert.equal(see(state,members,members[0]).reactionTotals[id].laugh,2);
  vote(state,members[0],id,'heart');
  assert.deepEqual(see(state,members,members[1]).reactionTotals[id],{laugh:1,surprised:0,heart:1});
  vote(state,members[0],id,'heart');
  assert.equal(see(state,members,members[0]).myReactions[id],undefined);
  assert.equal(see(state,members,members[1]).reactionTotals[id].heart,0);
  // Votes for different manuscripts do not contaminate each other.
  vote(state,members[0],state.sheets[1].id,'surprised');
  assert.equal(see(state,members,members[1]).reactionTotals[id].surprised,0);
  assert.equal(see(state,members,members[0]).reactionTotals[state.sheets[1].id].surprised,1);
 }
});

test('invalid reactions, fake story IDs and unknown players cannot alter stored votes',()=>{
 const {state,members}=make(2),id=state.sheets[0].id;
 const valid=vote(state,members[0],id,'laugh');
 assert.equal(valid.events[0].type,'state');
 const before=structuredClone(state.reactions),rev=state.revision;
 for(const [player,storyId,reaction] of [
  [members[0],'sheet-999','laugh'],[members[0],id,'invalid'],
  [{id:'stranger',name:'Anonymous'},id,'laugh'],
  [members[0],id,{}]
 ]){
  const r=vote(state,player,storyId,reaction);
  assert.equal(r.events[0].type,'notice');
  assert.equal(state.revision,rev);
  assert.deepEqual(state.reactions,before);
 }
});

test('reactions cannot be cast early and reset on a new edition',()=>{
 const {state,members}=make(2),id=state.sheets[0].id;
 vote(state,members[0],id,'laugh');
 const again=game.onMessage({state,player:members[0],payload:{type:'again'}});
 assert.equal(again.state.phase,'writing');
 assert.deepEqual(again.state.reactions,{});
 assert.equal(vote(state,members[0],id,'laugh').events[0].type,'notice');
});

test('live reaction controls are v9-only, accessible and visually track personal choice',()=>{
 assert.deepEqual(REACTION_OPTIONS.map(x=>x.id),['laugh','surprised','heart']);
 assert.equal(supportsLiveReactions('v8'),false);
 assert.equal(supportsLiveReactions('v9'),true);
 assert.equal(supportsLiveReactions('v10'),true);
 const view={reactionTotals:{'sheet-0':{laugh:3,surprised:1,heart:0}},myReactions:{'sheet-0':'laugh'}};
 assert.equal(reactionBar({storyId:'sheet-0',view,version:'v8',escape}),'');
 const html=reactionBar({storyId:'sheet-0',view,version:'v9',escape});
 assert.match(html,/aria-pressed="true" aria-label="Смішно: 3"/);
 assert.equal((html.match(/data-act="react-story"/g)||[]).length,3);
 assert.match(reactionBar({storyId:'sheet-0',view,version:'v9',escape,connected:false}),/ disabled/);
});
