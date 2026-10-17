import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../server/module.ts',import.meta.url),'utf8');
const game=new Function(source.replace(/export const /g,'const ').replace(/export default module;/,'return module;'))();
const ps=(...names)=>names.map((name,i)=>({id:'player-'+i,name}));
const msg=(state,player,payload)=>game.onMessage({state,player,payload});
const see=(state,player,players)=>game.viewForPlayer({state,player,players});
function fixture(names=['Anna','Bohdan'],settings={}){
 const players=ps(...names),host=players[0];
 let state=game.createRoom({player:host,payload:{settings:{questionSet:'custom',customQuestions:['Хто це був?','Чим все скінчилося?'],visibleTailWords:2,...settings}}}).state;
 for(let i=1;i<players.length;i++)state=game.onJoin({state,players:players.slice(0,i+1)}).state;
 state=msg(state,host,{type:'start'}).state;
 assert.equal(state.phase,'writing');
 return {players,state};
}
function answer(state,player,players,txt,indices=[0,2]){
 const v=see(state,player,players);
 return msg(state,player,{type:'submit',round:v.round,sheetId:v.sheet.id,answer:txt,tailIndexes:indices,gender:'unspecified'});
}
test('full two-person run: parallel authors, deterministic sheet rotation, private tails and final reveal',()=>{
 const {players}=fixture(),[a,b]=players;let {state}=fixture();
 const firstA=see(state,a,players),firstB=see(state,b,players);
 assert.equal(firstA.sheet.id,'sheet-0');assert.equal(firstB.sheet.id,'sheet-1');
 state=answer(state,a,players,'Капітан вкрав величезний кавун учора').state;
 assert.equal(see(state,a,players).waiting,true);
 const before=see(state,b,players);
 assert.equal(before.sheet.tail,'');assert.equal('stories' in before,false);
 assert.equal(JSON.stringify(before).includes('кавун'),false);
 const count=state.sheets[0].fragments.length;
 const repeat=answer(state,a,players,'Стара відповідь нікуди не піде');
 assert.equal(repeat.events[0].type,'notice');assert.equal(repeat.state.sheets[0].fragments.length,count);
 state=answer(state,b,players,'Монах забрав сусідський свисток сьогодні').state;
 assert.equal(state.round,1);
 const secondA=see(state,a,players),secondB=see(state,b,players);
 assert.equal(secondA.sheet.id,'sheet-1');
 assert.equal(secondA.sheet.tail,'Монах сусідський');
 assert.equal(secondB.sheet.id,'sheet-0');assert.equal(secondB.sheet.tail,'Капітан величезний');
 assert.equal(JSON.stringify(secondA).includes('свисток'),false);
 assert.equal(JSON.stringify(secondB).includes('кавун'),false);
 const recovery=see(structuredClone(state),a,players);
 assert.deepEqual(recovery,secondA);
 state=answer(state,a,players,'Зрештою свисток потрапив до парламенту').state;
 state=answer(state,b,players,'Урешті кавун обрали новим президентом').state;
 assert.equal(state.phase,'finished');assert.equal(state.round,2);
 const final=see(state,b,players);
 assert.equal(final.stories.length,2);
 assert.equal(final.stories[0].fragments.length,2);
 assert.match(final.stories[0].text,/кавун/);
 assert.match(final.stories[0].text,/президентом/);
 assert.equal(final.stories[0].fragments[0].author,'Anna');
 assert.equal(final.stories[0].fragments[1].author,'Bohdan');
});
test('three players: sheet rotation, no user receives complete draft mid-game',()=>{
 const {players}=fixture(['A','B','C']);let {state}=fixture(['A','B','C']);
 for(let round=0;round<2;round++){
  for(let j=0;j<3;j++){
   const p=players[j];const view=see(state,p,players);assert.equal('stories' in view,false);
   state=answer(state,p,players,'Фрагмент '+round+' магічний трактор на даху').state;
  }
 }
 assert.equal(state.phase,'finished');
 assert.equal(see(state,players[2],players).stories.length,3);
});
test('validation rejects stale round, foreign sheet, too-short text, false word count and duplicates',()=>{
 const {players,state}=fixture(),[a,b]=players;const sh=see(state,a,players).sheet.id;
 for(const p of [
  {type:'submit',round:1,sheetId:sh,answer:'Один два три чотири',tailIndexes:[0,2],gender:'male'},
  {type:'submit',round:0,sheetId:'sheet-1',answer:'Один два три чотири',tailIndexes:[0,2],gender:'male'},
  {type:'submit',round:0,sheetId:sh,answer:'Один два',tailIndexes:[0,1],gender:'male'},
  {type:'submit',round:0,sheetId:sh,answer:'Один два три чотири',tailIndexes:[0],gender:'male'},
  {type:'submit',round:0,sheetId:sh,answer:'Один два три чотири',tailIndexes:[0,0],gender:'male'}
 ])assert.equal(msg(structuredClone(state),a,p).events[0].type,'notice');
 assert.equal(msg(structuredClone(state),b,{type:'settings',settings:{visibleTailWords:9}}).events[0].type,'notice');
});
test('owner settings, custom questions, round restart, leave, and room limits',()=>{
 const names=['A','B'],players=ps(...names);let s=game.createRoom({player:players[0],payload:{}}).state;
 let z=msg(s,players[0],{type:'settings',settings:{questionSet:'custom',customQuestions:['Начало','Конец'],visibleTailWords:0}});
 assert.equal(z.state.settings.visibleTailWords,0);
 s=game.onJoin({state:z.state,players}).state;
 s=msg(s,players[0],{type:'start'}).state;
 assert.equal(s.total,2);assert.equal(s.phase,'writing');
 let v=see(s,players[0],players);
 s=msg(s,players[0],{type:'submit',round:0,sheetId:v.sheet.id,answer:'Панда танцювала на сцені',tailIndexes:[],gender:'female'}).state;
 assert.equal(see(s,players[0],players).waiting,true);
 s=game.onLeave({state:s,players:[players[0]]}).state;
 assert.equal(s.phase,'lobby');assert.equal(s.sheets.length,0);
 const next=msg(s,players[0],{type:'start'});assert.equal(next.events[0].type,'notice');
});
test('full original ten question sets, custom and per-sheet random included',()=>{
 const p=ps('Author')[0],state=game.createRoom({player:p,payload:{}}).state;
 const view=see(state,p,[p]);
 assert.equal(view.questionSets.length,10);
 assert.equal(view.genres.length,12);
 for(const set of view.questionSets){
  assert.ok(set.label);
  let s=game.createRoom({player:p,payload:{settings:{questionSet:set.id}}}).state;
  const q=ps('Author','Friend');s=game.onJoin({state:s,players:q}).state;
  s=msg(s,p,{type:'start'}).state;
  assert.equal(s.total,10);
 }
});
