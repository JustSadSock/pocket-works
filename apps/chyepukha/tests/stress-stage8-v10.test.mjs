import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {checkChyepukhaStateBudget,checkChyepukhaViewBudget} from '../../../pocketnet/chyepukha-transport.mjs';

const file=x=>readFileSync(new URL('../../../'+x,import.meta.url),'utf8');
const v10=file('apps/chyepukha/server/module.ts');
const module=new Function('crypto',v10.replace(/export const /g,'const ').replace(/export default module;/,'return module;'))({randomUUID});
const clone=x=>JSON.parse(JSON.stringify(x));
const suites=['characterArc','collapsingPlan','detectiveCase','nightSurvival','relationshipCrash','questAdventure','heistOperation','sciFiIncident','roadTrip','courtroomScandal'];
const authors=n=>Array.from({length:n},(_,i)=>({id:'player-'+n+'-'+i,name:'Автор '+i,verified:true,accountId:'acc-'+n+'-'+i,avatar:'paper'}));
function start(players,options={}){
 let s=module.createRoom({player:players[0],payload:{settings:{maxPlayers:players.length,questionSet:'collapsingPlan',genre:'absurdComedy',visibleTailWords:3,...options}}}).state;
 for(let i=1;i<players.length;i++)s=module.onJoin({state:s,player:players[i],players:players.slice(0,i+1)}).state;
 s=module.onMessage({state:s,player:players[0],payload:{type:'start'}}).state;
 assert.equal(s.phase,'writing');
 return s;
}
function submit(s,p,players,round,answer,carry=3){
 const v=module.viewForPlayer({state:s,player:p,players,onlineIds:players.map(x=>x.id)});
 assert.equal(v.round,round);
 assert.equal(v.waiting,false);
 assert.ok(v.sheet?.id);
 const words=answer.split(/\s+/);
 const number=round===s.total-1?0:Math.min(carry,words.length);
 const payload={type:'submit',requestId:'request_'+p.id+'_'+round+'_endurance_12345678',
  round,sheetId:v.sheet.id,answer,tailIndexes:Array.from({length:number},(_,i)=>i),gender:'unspecified'};
 const response=module.onMessage({state:s,player:p,payload});
 const receipt=response.events.find(e=>e.type==='receipt');
 assert.equal(receipt?.payload?.accepted,true,'accepted '+p.id+' R'+round);
 return {state:clone(response.state),payload,receipt};
}

test('v10 recovery cancels a previously issued replacement ticket via both rejoin paths',()=>{
 for(const mode of ['rejoin','presence']){
  const [host,away,entrant]=authors(3);
  // Create a 2-author room even though the replacement is a third durable identity.
  let s=start([host,away],{maxPlayers:2});
  s=module.onLeave({state:s,players:[host],player:away}).state;
  s=module.onMessage({state:s,player:host,connectedIds:[host.id],payload:{type:'open_seat',seatId:away.id},now:Date.now()}).state;
  assert.ok(s.claim?.code,mode+' issued code');
  const code=s.claim.code;
  s=clone(s);
  if(mode==='rejoin')s=module.onJoin({state:s,player:away,players:[host,away]}).state;
  else s=module.onPresence({state:s,player:away,players:[host,away],online:true,onlineIds:[host.id,away.id],now:11_000}).state;
  assert.equal(s.claim,null,mode+' must revoke the code');
  // The returned author loses the connection a second time; the old code stays invalid.
  s=module.onLeave({state:s,players:[host],player:away}).state;
  assert.throws(()=>module.onJoin({state:clone(s),player:entrant,players:[host,entrant],payload:{claimCode:code}}),/invalid_replacement_code/);
  assert.ok(s.players.some(p=>p.id===away.id));
  assert.equal(s.players.some(p=>p.id===entrant.id),false);
 }
});

test('offline author can still be replaced exactly once; submitted and prior chapters are preserved',()=>{
 const [host,away,entrant]=authors(3);
 let s=start([host,away],{maxPlayers:2});
 const earlier=submit(s,away,[host,away],0,'Автор знайшов дуже дивний годинник біля театру');
 s=earlier.state;
 s=module.onLeave({state:s,players:[host],player:away}).state;
 s=module.onMessage({state:s,player:host,connectedIds:[host.id],payload:{type:'open_seat',seatId:away.id},now:Date.now()}).state;
 assert.ok(s.claim);
 const code=s.claim.code;
 s=module.onJoin({state:s,player:entrant,players:[host,entrant],payload:{claimCode:code}}).state;
 assert.equal(s.claim,null);
 assert.equal(s.submitted[entrant.id],true);
 assert.equal(s.submitted[away.id],undefined);
 assert.equal(s.sheets.find(sh=>sh.id===earlier.payload.sheetId).fragments[0].answer,earlier.payload.answer);
 assert.ok(s.bannedIds.includes(away.id));
 assert.throws(()=>module.onJoin({state:clone(s),player:away,players:[host,away]}),/room_kicked/);
 assert.throws(()=>module.onJoin({state:clone(s),player:{id:'third',name:'Third'},players:[host,entrant,{id:'third'}],payload:{claimCode:code}}),/invalid_replacement_code/);
});

test('56 full 2–8 author matches survive reconnections, duplicate sends, pause and serialized rooms',()=>{
 let issued=0,repeated=0,rejoined=0;
 for(let count=2;count<=8;count++)for(let scenario=0;scenario<8;scenario++){
  const players=authors(count);
  const carry=scenario%4,settings={questionSet:suites[(count+scenario)%suites.length],visibleTailWords:carry};
  let state=start(players,settings);
  for(let round=0;round<state.total;round++){
   if(round>0&&round%3===0){
    const who=players[(round+scenario)%count];
    state=module.onLeave({state,player:who,players:players.filter(p=>p.id!==who.id)}).state;
    state=clone(state);
    state=module.onJoin({state,player:who,players}).state;
    rejoined++;
   }
   if(round===3){
    state=module.onMessage({state,player:players[0],payload:{type:'pause'}}).state;
    const revision=state.revision,v=module.viewForPlayer({state,player:players.at(-1),players});
    const blocked=module.onMessage({state,player:players.at(-1),payload:{type:'submit',round,sheetId:v.sheet.id,
       answer:'Тут чотири нові слова після паузи',tailIndexes:[0,1,2]}});
    assert.equal(blocked.state.revision,revision,'paused submission cannot mutate');
    state=module.onMessage({state,player:players[0],payload:{type:'unpause'}}).state;
   }
   const observed=new Set();
   for(const player of players){
    const v=module.viewForPlayer({state,player,players});
    assert.equal(v.round,round);
    const answer='Випуск '+scenario+' автор '+player.id+' раунд '+round+' має чудернацьку історію сьогодні';
    const {state:accepted,payload}=submit(state,player,players,round,answer,carry);
    state=accepted;issued++;
    if(round%3===0){
     const revision=state.revision,duplicate=module.onMessage({state,player,payload});
     assert.equal(duplicate.events.length,1);
     assert.equal(duplicate.events[0].type,'receipt');
     assert.equal(duplicate.state.revision,revision);
     repeated++;
    }
    observed.add(payload.sheetId);
    // A second packet, even with a new requestId, cannot alter a committed fragment.
    if(round%4===0){
     const forged=module.onMessage({state,player,payload:{...payload,requestId:payload.requestId+'_new',answer:'Цілком інша неправдива подія у тексті'}});
     assert.equal(forged.events[0].type,'submission_rejected');
    }
   }
   assert.equal(observed.size,count,'each author gets exactly one manuscript');
   assert.equal(state.round,round+1);
   assert.ok(checkChyepukhaStateBudget(state,256*1024).ok,'persistent room remains within budget');
  }
  assert.equal(state.phase,'finished');
  for(const sheet of state.sheets){
   assert.equal(sheet.fragments.length,10);
   for(const fragment of sheet.fragments)assert.ok(fragment.answer.includes('чудернацьку історію'));
  }
  const viewer=module.viewForPlayer({state,player:players[0],players});
  assert.equal(viewer.stories.length,count);
  assert.ok(checkChyepukhaViewBudget({id:'room',gameId:'chyepukha',version:'v10',players},viewer,256*1024).ok);
  const reply=module.onMessage({state,player:players[0],payload:{type:'again'}});
  assert.equal(reply.state.phase,'writing');
  assert.ok(reply.state.sheets.every(sh=>sh.fragments.length===0));
 }
 assert.equal(issued,2800);
 assert.equal(repeated,1120);
 assert.equal(rejoined,168);
});

test('large UTF-8 manuscripts with 8 authors fit both persistent room and reader packet budgets',()=>{
 const players=authors(8);
 let state=start(players,{visibleTailWords:3});
 const oversizedWord='界'.repeat(160),answer=Array(4).fill(oversizedWord).join(' ');
 for(let round=0;round<10;round++){
  for(const p of players)state=submit(state,p,players,round,answer).state;
  const fit=checkChyepukhaStateBudget(state,256*1024);
  assert.equal(fit.ok,true,'R'+round+' bytes='+fit.bytes);
 }
 const v=module.viewForPlayer({state,player:players[0],players});
 const size=checkChyepukhaViewBudget({id:'room',gameId:'chyepukha',version:'v10',players},v,256*1024);
 assert.equal(size.ok,true,'final reader bytes='+size.bytes);
 assert.equal(v.stories.length,8);
 assert.ok(v.stories.every(x=>x.fragments.length===10));
});
