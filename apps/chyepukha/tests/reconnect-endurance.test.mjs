import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';

const src=readFileSync(new URL('../server/module.ts',import.meta.url),'utf8');
const game=new Function('crypto',src.replace(/export const /g,'const ').replace(/export default module;/,'return module;'))({randomUUID});
const authors=Array.from({length:4},(_,i)=>({id:'author-'+i,name:'Автор '+i,verified:true,accountId:'account-'+i,avatar:'paper'}));
const clone=state=>JSON.parse(JSON.stringify(state));
function create(count=4){
 const players=authors.slice(0,count);
 let state=game.createRoom({player:players[0],payload:{settings:{maxPlayers:count,questionSet:'collapsingPlan',visibleTailWords:3}}}).state;
 for(let i=1;i<count;i++)state=game.onJoin({state,player:players[i],players:players.slice(0,i+1)}).state;
 state=game.onMessage({state,player:players[0],payload:{type:'start'}}).state;
 return {state,players};
}
function view(state,player,players,online=players.map(p=>p.id)){
 return game.viewForPlayer({state,player,players,onlineIds:online});
}
function send(state,player,players,round,answer){
 const v=view(state,player,players);
 assert.equal(v.round,round);
 const requestId=player.id+'_'+round+'_abcde123456789';
 const payload={type:'submit',round,sheetId:v.sheet.id,answer,gender:'unspecified',
  tailIndexes:round===9?[]:[0,2,4],requestId};
 const accepted=game.onMessage({state,player,payload});
 assert.ok(accepted.events.some(e=>e.type==='receipt'&&e.payload?.accepted),round+' receipt');
 return {state:accepted.state,payload};
}
test('four manuscripts survive nine complete rounds, a full room departure and re-entry, then reach final',()=>{
 let {state,players}=create();
 const historic=[];
 for(let round=0;round<9;round++){
  for(const player of players){
   const text='У раунді '+round+' автор '+player.id+' вигадав чудернацьку подію';
   const result=send(state,player,players,round,text);
   state=result.state;
   historic.push({sheet:result.payload.sheetId,round,text});
  }
 }
 assert.equal(state.round,9);
 const before=state.sheets.map(x=>x.fragments.map(f=>f.answer));
 for(const p of players)state=game.onLeave({state,players:[],player:p}).state;
 state=clone(state);
 assert.equal(state.phase,'writing');
 assert.equal(state.sheets.length,4);
 assert.deepEqual(state.sheets.map(x=>x.fragments.map(f=>f.answer)),before);
 for(let i=0;i<4;i++)state=game.onJoin({state,player:players[i],players:players.slice(0,i+1)}).state;
 assert.equal(state.round,9);
 for(const player of players)state=send(state,player,players,9,'Після довгих пригод усі герої зустрілися на святі').state;
 assert.equal(state.phase,'finished');
 const revealed=view(state,players[0],players);
 assert.equal(revealed.stories.length,4);
 assert.ok(revealed.stories.every(story=>story.fragments.length===10));
 for(const entry of historic)assert.equal(state.sheets.find(x=>x.id===entry.sheet).fragments[entry.round].answer,entry.text);
 const repeated=game.onMessage({state,player:players[0],payload:{type:'again'}});
 assert.equal(repeated.state.phase,'writing');
 assert.ok(repeated.state.sheets.every(x=>x.fragments.length===0));
});

test('a missing author can be skipped without erasing submitted chapters or leaking private answers',()=>{
 let {state,players}=create(2);
 const accepted=send(state,players[0],players,0,'Перший автор знайшов великий секретний скарб учора');
 state=accepted.state;
 const privateAnswer=state.sheets[0].fragments[0].answer;
 const before=state.revision;
 const denied=game.onMessage({state:clone(state),player:players[1],payload:{type:'skip_slot',seatId:players[1].id},connectedIds:[players[0].id]});
 assert.equal(denied.events[0].type,'notice');
 assert.equal(denied.state.revision,before);
 state=game.onMessage({state,player:players[0],payload:{type:'skip_slot',seatId:players[1].id},connectedIds:[players[0].id]}).state;
 assert.equal(state.round,1);
 assert.equal(state.sheets[0].fragments[0].answer,privateAnswer);
 const skipped=state.sheets.find(sh=>sh.fragments[0]?.skipped);
 assert.ok(skipped);
 assert.equal(skipped.fragments[0].tail,'');
 const publicView=view(state,players[0],players,[players[0].id]);
 assert.ok(!JSON.stringify(publicView).includes(privateAnswer));
 const rejoined=game.onJoin({state,player:players[1],players}).state;
 assert.equal(rejoined.round,1);
});

test('receipt replay after reconnect is exactly idempotent; stale and forged submissions cannot overwrite prior text',()=>{
 let {state,players}=create(2);
 const first=send(state,players[0],players,0,'Радісний автор побачив незвичайну величезну афішу біля театру');
 state=clone(first.state);
 const revision=state.revision,fragments=state.sheets[0].fragments.length;
 const replay=game.onMessage({state,player:players[0],payload:first.payload});
 assert.deepEqual(replay.events.map(x=>x.type),['receipt']);
 assert.equal(replay.state.revision,revision);
 assert.equal(replay.state.sheets[0].fragments.length,fragments);
 const attack={...first.payload,requestId:'other_packet_1234567',answer:'Інший текст мав би зруйнувати старий рукопис'};
 const declined=game.onMessage({state,player:players[0],payload:attack});
 assert.equal(declined.events[0].type,'submission_rejected');
 assert.equal(declined.state.sheets[0].fragments[0].answer,first.payload.answer);
});
