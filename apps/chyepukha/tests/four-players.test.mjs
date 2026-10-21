import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Exercise every protocol that an existing four-author room may be pinned to.
const modules=[
 ['v1','../../../pocketnet/module-versions/chyepukha/v1.ts'],
 ['v2','../../../pocketnet/module-versions/chyepukha/v2.ts'],
 ['v3 (current)','../../../pocketnet/module-versions/chyepukha/v3.ts'],
 ['working source','../server/module.ts']
];
const players=Array.from({length:4},(_,i)=>({id:'author-'+i,name:'Автор '+i}));
function load(path){
 const source=readFileSync(new URL(path,import.meta.url),'utf8');
 return new Function(source.replace(/export const /g,'const ').replace(/export default module;/,'return module;'))();
}
const see=(game,state,player)=>game.viewForPlayer({state,player,players});
const send=(game,state,player,payload)=>game.onMessage({state,player,payload});

function playFour(game,{custom=false}={}){
 const questionCount=custom?16:10;
 const settings={maxPlayers:4,questionSet:custom?'custom':'collapsingPlan',visibleTailWords:3,
  ...(custom?{customQuestions:Array.from({length:16},(_,i)=>'Сцена '+(i+1))}:{})};
 let state=game.createRoom({player:players[0],payload:{settings}}).state;
 assert.equal(state.settings.maxPlayers,4);
 for(let count=2;count<=4;count++){
  state=game.onJoin({state,players:players.slice(0,count)}).state;
  assert.equal(state.players.length,count);
 }
 assert.throws(()=>game.onJoin({state:structuredClone(state),players:[...players,{id:'fifth',name:'П’ятий'}]}),/room_full/);
 assert.equal(send(game,state,players[1],{type:'start'}).events[0].type,'notice');
 state=send(game,state,players[0],{type:'start'}).state;
 assert.equal(state.phase,'writing');
 assert.equal(state.total,questionCount);
 assert.equal(state.sheets.length,4);
 assert.throws(()=>game.onJoin({state:structuredClone(state),players:[...players,{id:'fifth',name:'П’ятий'}]}),/match_in_progress/);
 const expected=new Map();
 for(let round=0;round<questionCount;round++){
  assert.equal(state.round,round);
  for(let i=0;i<4;i++){
   const v=see(game,state,players[i]);
   const sheet='sheet-'+((i-round%4+4)%4);
   assert.equal(v.sheet.id,sheet,'wrong sheet for player '+i+' in round '+round);
   assert.equal(v.waiting,false);
   assert.equal('stories' in v,false,'unfinished stories must stay private');
   const old=expected.get(sheet+'/'+(round-1));
   assert.equal(v.sheet.tail,old?.tail||'','the selected words did not follow the sheet');
  }
  // Vary answer order: the last player to submit must be the sole round-advance trigger.
  const order=[(round+2)%4,round%4,(round+3)%4,(round+1)%4];
  for(let position=0;position<4;position++){
   const i=order[position],player=players[i],v=see(game,state,player);
   const answer='автор'+i+' раунд'+round+' сигнал'+i+round+' тінь'+i+round+
    ' орбіта'+i+round+' PRIVATE_'+i+'_'+round;
   const tail='автор'+i+' сигнал'+i+round+' орбіта'+i+round;
   const packet={type:'submit',round,sheetId:v.sheet.id,answer,tailIndexes:[0,2,4],gender:'unspecified'};
   const response=send(game,state,player,packet);
   assert.equal(response.events[0].type,'state');
   state=response.state;
   expected.set(v.sheet.id+'/'+round,{answer,tail,player:player.name});
   if(position<3){
    assert.equal(state.round,round,'round advanced before four submissions');
    assert.equal(see(game,state,player).waiting,true);
    const duplicate=send(game,structuredClone(state),player,packet);
    assert.equal(duplicate.events[0].type,'notice','duplicate should be refused');
    assert.deepEqual(duplicate.state,state,'duplicate altered game state');
    for(const other of players){
     const publicView=see(game,state,other);
     assert.equal('stories' in publicView,false);
     assert.equal(JSON.stringify(publicView).includes('PRIVATE_'+i+'_'+round),false,
      'secret answer was leaked before the reveal');
    }
   }
  }
  assert.equal(state.round,round+1);
  if(round===4){
   const snapshot=JSON.parse(JSON.stringify(state));
   state=structuredClone(state);
   assert.deepEqual(state,snapshot,'PocketNet persistence damaged a four-player match');
   const resumed=send(game,state,players[2],{type:'sync'});
   assert.equal(resumed.state.round,5,'reconnect sync lost the round');
   assert.equal(resumed.events[0].type,'state');
  }
 }
 assert.equal(state.phase,'finished');
 for(const player of players){
  const v=see(game,state,player);
  assert.equal(v.stories.length,4);
  for(let sheet=0;sheet<4;sheet++){
   assert.equal(v.stories[sheet].fragments.length,questionCount);
   for(let round=0;round<questionCount;round++){
    const fragment=v.stories[sheet].fragments[round];
    const expectedFragment=expected.get('sheet-'+sheet+'/'+round);
    assert.equal(fragment.author,expectedFragment.player);
    assert.equal(fragment.answer,expectedFragment.answer);
    assert.equal(fragment.author,players[(sheet+round)%4].name,'credit rotated to wrong author');
   }
  }
 }
 assert.ok(Buffer.byteLength(JSON.stringify(state),'utf8')<256*1024);
 const replay=send(game,state,players[0],{type:'again'});
 assert.equal(replay.state.phase,'writing');
 assert.equal(replay.state.round,0);
 assert.equal(replay.state.sheets.length,4);
 assert.ok(replay.state.sheets.every(sheet=>sheet.fragments.length===0));
}

for(const [version,path] of modules){
 test('four-author full match, privacy, reconnect and replay on '+version,()=>{
  playFour(load(path));
 });
}
test('four authors can finish all sixteen custom questions on current PocketNet',()=>{
 playFour(load('../../../pocketnet/module-versions/chyepukha/v3.ts'),{custom:true});
});
