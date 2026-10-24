import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../server/module.ts',import.meta.url),'utf8');
const game=new Function(source.replace(/export const /g,'const ').replace(/export default module;/,'return module;'))();
const players=[{id:'author-a',name:'Автор А'},{id:'author-b',name:'Автор Б'}];
const bank=JSON.parse(source.match(/const BANK = (\{.*?\});\n/)[1]);
function start(questionSet,genre='absurdComedy',showNextQuestion=true){
 let state=game.createRoom({player:players[0],payload:{settings:{questionSet,genre,showNextQuestion}}}).state;
 state=game.onJoin({state,players}).state;
 return game.onMessage({state,player:players[0],payload:{type:'start'}}).state;
}
function view(state,round){state.round=round;return game.viewForPlayer({state,player:players[0],players}).sheet;}

test('all ten scenarios have ten well-formed, non-duplicated and accurately named stages',()=>{
 const sets=game.viewForPlayer({state:game.createRoom({player:players[0],payload:{}}).state,player:players[0],players:[players[0]]}).questionSets;
 assert.equal(sets.length,10);
 assert.equal(new Set(sets.map(x=>x.id)).size,10);
 for(const set of sets){
  const state=start(set.id);
  assert.equal(state.total,10,set.id);
  const prompts=[],stages=[];
  for(let r=0;r<10;r++){
   const sheet=view(state,r),q=sheet.question;
   for(const field of ['prompt','stage','guidance','creativeFreedom'])
    assert.ok(q[field]&&q[field].trim().length>3,set.id+' R'+r+' '+field);
   assert.equal(sheet.nextQuestion,r===9?'':bank[set.id].questions[r+1].prompt);
   // The next question is already presented as a separate UI element.
   assert.ok(!q.creativeFreedom.includes(sheet.nextQuestion||'<empty>'),set.id+' R'+r+' redundant hint');
   prompts.push(q.prompt);stages.push(q.stage);
  }
  assert.equal(new Set(prompts).size,10,set.id+' duplicate question');
  assert.ok(new Set(stages).size>=8,set.id+' generic/misleading stage labels');
  assert.equal(stages.at(-1)==='Фінал'||stages.at(-1)==='Вирок',true,set.id+' ending stage');
 }
});

test('120 scenario-genre combinations keep their structure and genre-specific ending',()=>{
 const lobby=game.viewForPlayer({state:game.createRoom({player:players[0],payload:{}}).state,player:players[0],players:[players[0]]});
 assert.equal(lobby.genres.length,12);
 for(const set of lobby.questionSets){
  const beginnings=[],endings=[];
  for(const genre of lobby.genres){
   const state=start(set.id,genre.id);
   const intro=view(state,0).question,final=view(state,9).question;
   assert.ok(intro.guidance.includes(bank[set.id].questions[0].guidance));
   assert.ok(final.guidance.includes(bank[set.id].questions[9].guidance));
   assert.equal(final.prompt,bank[set.id].questions[9].prompt);
   beginnings.push(intro.guidance);
   endings.push(final.guidance);
  }
  assert.equal(new Set(beginnings).size,12,set.id+' intro genres');
  assert.equal(new Set(endings).size,12,set.id+' ending genres');
  assert.ok(!endings[3].includes('розгадку залиш на потім'),set.id+' noir must end');
  assert.ok(!endings[6].includes('не пояснює її'),set.id+' sci-fi must end');
 }
});

test('critical hidden-information boundaries are explicit',()=>{
 assert.match(bank.collapsingPlan.questions[1].creativeFreedom,/локацію/);
 assert.match(bank.collapsingPlan.questions[2].prompt,/Де саме/);
 assert.match(bank.nightSurvival.questions[1].prompt,/до ночі/);
 assert.match(bank.nightSurvival.questions[4].prompt,/новий знак/);
 assert.match(bank.nightSurvival.questions[4].guidance,/сигнал/);
 assert.match(bank.detectiveCase.questions[1].creativeFreedom,/Місце/);
 assert.match(bank.roadTrip.questions[1].creativeFreedom,/куди/);
 assert.match(bank.courtroomScandal.questions[1].creativeFreedom,/вирок/);
});

test('hiding next question reveals neither prompt nor duplicate in helper text',()=>{
 const state=start('collapsingPlan','absurdComedy',false);
 for(let round=0;round<9;round++){
  const sheet=view(state,round);
  assert.equal(sheet.nextQuestion,'');
  const next=bank.collapsingPlan.questions[round+1].prompt;
  assert.ok(!sheet.question.creativeFreedom.includes(next));
  assert.ok(!sheet.question.guidance.includes(next));
 }
});
