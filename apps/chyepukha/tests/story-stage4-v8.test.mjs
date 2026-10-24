import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderWriting} from '../writing-view.js';
import {handoffCount} from '../writer-flow.js';

const file=p=>readFileSync(new URL('../../../'+p,import.meta.url),'utf8');
const v7=file('pocketnet/module-versions/chyepukha/v7.ts');
const v8=file('pocketnet/module-versions/chyepukha/v8.ts');
const bank=s=>JSON.parse(s.match(/^const BANK = (\{.*\});$/m)[1]);
const previous=bank(v7),current=bank(v8);
const game=new Function(v8.replace(/export const /g,'const ').replace(/export default module;/,'return module;'))();
const ids=Object.keys(current);
const genreIds=['groundedDrama','absurdComedy','horror','detectiveNoir','romanticMelodrama','fantasyEpic','sciFiParanoia','cyberpunk','cozyWhimsy','postApocalypse','mythicLegend','satire'];
const changed={characterArc:[1,4,6,8],collapsingPlan:[4,6,8],detectiveCase:[5,6,8],nightSurvival:[4,6,8],
 relationshipCrash:[2,4,8],questAdventure:[6,8],heistOperation:[6,8],sciFiIncident:[6,8],roadTrip:[6,8],courtroomScandal:[5,7,8]};
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function room(id,genre,count,showNextQuestion=true){
 const players=Array.from({length:count},(_,i)=>({id:'p'+i,name:'Автор '+i}));
 let state=game.createRoom({player:players[0],payload:{settings:{questionSet:id,genre,showNextQuestion,maxPlayers:count,visibleTailWords:3}}}).state;
 for(let i=1;i<count;i++)state=game.onJoin({state,players:players.slice(0,i+1)}).state;
 state=game.onMessage({state,player:players[0],payload:{type:'start'}}).state;
 return {state,players};
}

test('v8 appends a pinned narrative snapshot and preserves all earlier published rooms',()=>{
 const lock=JSON.parse(file('pocketnet/modules.lock.json'));
 assert.ok(lock.chyepukha.versions.includes('v8'));
 assert.deepEqual(lock.chyepukha.versions.slice(0,8),Array.from({length:8},(_,i)=>'v'+(i+1)));
 assert.notEqual(file('apps/chyepukha/server/module.ts'),v8);
 assert.notEqual(v7,v8);
 assert.equal(ids.length,10);
 assert.equal(new Set(ids).size,10);
});

test('all 100 rounds keep the same roles, ten-stage arc and immutable finish',()=>{
 for(const id of ids){
  const before=previous[id],after=current[id];
  assert.equal(after.label,before.label);
  assert.equal(after.questions.length,10);
  assert.equal(new Set(after.questions.map(x=>x.prompt)).size,10);
  assert.deepEqual(after.questions.map(x=>x.stage),before.questions.map(x=>x.stage));
  assert.deepEqual(after.questions[0],before.questions[0]);
  assert.deepEqual(after.questions[9],before.questions[9]);
  for(let round=0;round<10;round++){
   const q=after.questions[round];
   for(const field of ['prompt','guidance','creativeFreedom','stage'])
    assert.ok(typeof q[field]==='string'&&q[field].length>(field==='stage'?2:4),id+'/'+round+'/'+field);
  }
 }
});

test('27 ambiguous transitions were rewritten without silent changes to other steps',()=>{
 let total=0;
 for(const id of ids){
  const expected=changed[id];
  const actual=current[id].questions.map((q,i)=>JSON.stringify(q)!==JSON.stringify(previous[id].questions[i])?i:-1).filter(i=>i>=0);
  assert.deepEqual(actual,expected,id+' narrative edits');
  for(const index of expected){
   const q=current[id].questions[index];
   assert.ok(q.prompt.length>22,id+'/'+index+' prompt');
   assert.ok(q.guidance.length>52,id+'/'+index+' guidance');
   assert.ok(q.creativeFreedom.length>34,id+'/'+index+' boundary');
  }
  total+=actual.length;
 }
 assert.equal(total,27);
 assert.doesNotMatch(current.detectiveCase.questions[6].guidance,/першій версії|попередньої версії/);
 assert.doesNotMatch(current.relationshipCrash.questions[8].prompt,/спробу примирення/);
 assert.match(current.roadTrip.questions[8].guidance,/без знання/);
});

test('each genre offers different on-theme advice without overriding narrative or hiding text',()=>{
 const oldTone=v7.match(/const GENRE_TONE = (\{[\s\S]*?\n\};)/)[1];
 const newTone=v8.match(/const GENRE_TONE = (\{[\s\S]*?\n\};)/)[1];
 const oldWords=Object.fromEntries([...oldTone.matchAll(/^ (\w+):'([^']+)'/gm)].map(x=>[x[1],x[2]]));
 const words=Object.fromEntries([...newTone.matchAll(/^ (\w+):'([^']+)'/gm)].map(x=>[x[1],x[2]]));
 assert.deepEqual(Object.keys(words).sort(),genreIds.slice().sort());
 assert.equal(new Set(Object.values(words)).size,12);
 for(const genre of genreIds){
  assert.notEqual(words[genre],oldWords[genre],genre+' new useful cue');
  assert.ok(words[genre].length>=45);
 }
 assert.equal(ids.length*genreIds.length,120);
});

test('120 combinations present stable prompts and a unique genre-specific end',()=>{
 for(const id of ids){
  const intros=[],endings=[];
  for(const genre of genreIds){
   const {state,players}=room(id,genre,2);
   const intro=game.viewForPlayer({state,player:players[0],players}).sheet;
   assert.equal(intro.question.prompt,current[id].questions[0].prompt);
   intros.push(intro.question.guidance);
   state.round=9;
   const final=game.viewForPlayer({state,player:players[0],players}).sheet;
   assert.equal(final.question.prompt,current[id].questions[9].prompt);
   endings.push(final.question.guidance);
  }
  assert.equal(new Set(intros).size,12,id+' genre openings');
  assert.equal(new Set(endings).size,12,id+' genre endings');
 }
});

test('blind writers see their own task and shared words, never the previous full answer',()=>{
 for(const id of ids)for(const count of [2,4,8]){
  const {state:initial,players}=room(id,'absurdComedy',count);
  let state=initial;
  for(let round=0;round<10;round++){
   for(const player of players){
    const seen=game.viewForPlayer({state,player,players});
    assert.equal(seen.round,round);
    assert.equal(seen.sheet.question.prompt,current[id].questions[round].prompt);
    if(round>0){
     const sheet=state.sheets.find(x=>x.id===seen.sheet.id);
     const prior=sheet.fragments.at(-1);
     assert.ok(prior);
     assert.equal(seen.sheet.tail,prior.tail);
     assert.ok(!JSON.stringify(seen.sheet).includes(prior.answer),id+'/'+round+' leaked manuscript');
    }
    const answer='Незвичайний автор навмисно вигадав окрему дивну подію '+round+' для історії '+id;
    const result=game.onMessage({state,player,payload:{type:'submit',round,sheetId:seen.sheet.id,answer,tailIndexes:round===9?[]:[0,2,4],gender:'unspecified'}});
    assert.equal(result.events[0].type,'state',id+'/'+round+' submission rejected');
    state=result.state;
   }
  }
  assert.equal(state.phase,'finished',id+'/'+count);
  assert.equal(state.sheets.length,count);
  for(const sheet of state.sheets)assert.equal(sheet.fragments.length,10);
 }
});

test('v8 editor shows server genre advice only once and retains last-round no-handoff',()=>{
 const {state,players}=room('collapsingPlan','absurdComedy',2);
 const view=game.viewForPlayer({state,player:players[0],players});
 const props={view,roomVersion:'v8',draft:'Автор вигадав надзвичайно дивний випадок у старому місті',
  meta:{step:'draft',anchor:'',gender:'unspecified'},chosen:[],escape,rosterCompact:()=>'',turnProgress:()=>'',genres:{'Абсурдна комедія':'ТОН ЖАНРУ'},genders:[['unspecified','Неважливо']]};
 const rendered=renderWriting(props);
 assert.match(rendered,/Підказки до етапу/);
 assert.doesNotMatch(rendered,/ТОН ЖАНРУ/);
 assert.match(rendered,/id="heroAnchor"/);
 assert.equal(handoffCount({roomVersion:'v8',round:9,total:10,answer:props.draft}),0);
 const final=renderWriting({...props,view:{...view,round:9}});
 assert.doesNotMatch(final,/id="wordTray"/);
 assert.match(final,/Запечатати аркуш/);
});

test('all ten narratives remain playable without any shared words or hero passport',()=>{
 for(const id of ids){
  const players=[{id:'a',name:'Автор A'},{id:'b',name:'Автор Б'}];
  let state=game.createRoom({player:players[0],payload:{settings:{questionSet:id,genre:'absurdComedy',visibleTailWords:0,maxPlayers:2}}}).state;
  state=game.onJoin({state,players}).state;
  state=game.onMessage({state,player:players[0],payload:{type:'start'}}).state;
  for(let round=0;round<10;round++){
   for(const player of players){
    const v=game.viewForPlayer({state,player,players});
    assert.equal(v.sheet.question.prompt,current[id].questions[round].prompt);
    assert.equal(v.sheet.tail,'',id+' R'+round+' unexpectedly knows previous answers');
    assert.equal(v.sheet.heroAnchor||'','');
    const response=game.onMessage({state,player,payload:{type:'submit',round,sheetId:v.sheet.id,
     answer:'Самостійна дивна пригода сталася просто посеред площі',tailIndexes:[],gender:'unspecified'}});
    assert.equal(response.events[0].type,'state',id+' R'+round+' rejected');
    state=response.state;
   }
  }
  assert.equal(state.phase,'finished');
  assert.equal(state.sheets.length,2);
  assert.ok(state.sheets.every(sh=>sh.fragments.length===10));
 }
});
