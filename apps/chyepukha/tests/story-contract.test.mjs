import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../server/module.ts',import.meta.url),'utf8');
const game=new Function(source.replace(/export const /g,'const ').replace(/export default module;/,'return module;'))();
const players=[{id:'a',name:'Марта'},{id:'b',name:'Назар'}];
const send=(state,player,payload)=>game.onMessage({state,player,payload}).state;
const see=(state,player)=>game.viewForPlayer({state,player,players});
function start(questionSet,options={}){
 let state=game.createRoom({player:players[0],payload:{settings:{questionSet,...options}}}).state;
 state=game.onJoin({state,players}).state;
 return send(state,players[0],{type:'start'});
}
test('all 100 built-in questions have one precise role and visible guidance',()=>{
 const lobby=game.viewForPlayer({state:game.createRoom({player:players[0],payload:{}}).state,player:players[0],players:[players[0]]});
 assert.equal(lobby.questionSets.length,10);
 for(const set of lobby.questionSets){
  let state=start(set.id);
  assert.equal(state.total,10);
  for(let round=0;round<10;round++){
   for(const player of players){
    const view=see(state,player);
    assert.equal(view.round,round);
    assert.ok(view.sheet.question.prompt.length>20,set.id+' Q'+round);
    assert.ok(view.sheet.question.guidance.length>20,set.id+' guidance'+round);
    assert.ok(view.sheet.question.creativeFreedom.length>20,set.id+' constraint'+round);
    assert.ok(view.sheet.question.stage);
    assert.equal(Boolean(view.sheet.nextQuestion),round<9);
    const answer='Автор записав химерний випадок та пригоди';
    const result=game.onMessage({state,player,payload:{type:'submit',round,sheetId:view.sheet.id,answer,tailIndexes:round===9?[]:[0,2,4],gender:'unspecified',heroAnchor:'Василь — чарівник'}});
    assert.equal(result.events[0].type,'state',set.id+' R'+round);
    state=result.state;
   }
  }
  assert.equal(state.phase,'finished');
  assert.equal(state.sheets.length,2);
  assert.equal(state.sheets[0].fragments.length,10);
 }
});
test('hero passport survives sheet rotation without revealing older answers',()=>{
 let state=start('characterArc');
 const first=see(state,players[0]);
 state=send(state,players[0],{type:'submit',round:0,sheetId:first.sheet.id,answer:'Василь знайшов таємний ключ під килимом',tailIndexes:[0,2,4],gender:'male',heroAnchor:'Василь — архіваріус'});
 const second=see(state,players[1]);
 assert.equal(JSON.stringify(second).includes('таємний'),false);
 state=send(state,players[1],{type:'submit',round:0,sheetId:second.sheet.id,answer:'Олеся відкрила стару книгу вранці',tailIndexes:[0,2,4],gender:'female',heroAnchor:'Олеся — дослідниця'});
 const next=see(state,players[1]);
 assert.equal(next.sheet.heroAnchor,'Василь — архіваріус');
 assert.equal(next.sheet.tail,'Василь таємний під');
 assert.equal(JSON.stringify(next).includes('килимом'),false);
});
test('next-question previews can be switched off by room host',()=>{
 const state=start('roadTrip',{showNextQuestion:false});
 assert.equal(see(state,players[0]).sheet.nextQuestion,'');
});
test('last chapter requires zero carried words and rejects unnecessary handoff',()=>{
 let state=start('custom',{customQuestions:['Хто був героєм?','Чим усе закінчилося?'],visibleTailWords:3});
 for(const p of players){const v=see(state,p);state=send(state,p,{type:'submit',round:0,sheetId:v.sheet.id,answer:'Жираф зібрав могутню армію качок',tailIndexes:[0,2,4],gender:'unspecified'});}
 const v=see(state,players[0]);
 assert.equal(v.sheet.nextQuestion,'');
 const failed=game.onMessage({state:structuredClone(state),player:players[0],payload:{type:'submit',round:1,sheetId:v.sheet.id,answer:'Усі жили довго та щасливо',tailIndexes:[0,2,4],gender:'unspecified'}});
 assert.equal(failed.events[0].type,'notice');
 state=send(state,players[0],{type:'submit',round:1,sheetId:v.sheet.id,answer:'Усі жили довго та щасливо',tailIndexes:[],gender:'unspecified'});
 assert.equal(state.round,1);
});
