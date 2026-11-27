import test from 'node:test';import assert from 'node:assert/strict';import {initial,actions,play,bot} from '../rules.js';test('solo match ends with legal actions',()=>{const s=initial('solo',['human']);for(let i=0;i<160&&s.winner===null;i++)bot(s);assert.notEqual(s.winner,null)});test('reject wrong turn and distant attack',()=>{const s=initial('duel',['a','b']);assert.equal(play(s,'b',{type:'wait'}),false);assert.equal(play(s,'a',{type:'hit',x:6,y:3}),false);assert.equal(play(s,'a',actions(s)[1]),true);assert.equal(s.turn,1)});test('team and coop have four alternating seats',()=>{const s=initial('coop',['a','bot1','b','bot3']);assert.deepEqual(s.units.map(u=>u.team),[0,1,0,1]);assert.equal(s.units[2].id,'b')});
import game from '../rules.js';
for(const mode of ['coop','duel','team'])test(mode+' room completes a legal match and rejects stale commands',()=>{
 const players=Array.from({length:mode==='team'?4:2},(_,i)=>({id:'human'+i}));
 let {state}=game.createRoom({player:players[0],payload:{mode}});
 for(let i=1;i<players.length;i++)state=game.onJoin({state,player:players[i],players:players.slice(0,i+1)}).state;
 const command=(player,payload)=>game.onMessage({state,player,players,payload:{revision:state.revision,...payload}}).state;
 state=command(players[0],{type:'start'});assert.equal(state.phase,'playing');
 const before=JSON.stringify(state);command(players[0],{type:'act',revision:state.revision-1,action:{type:'wait'}});assert.equal(JSON.stringify(state),before);
 for(let i=0;i<160&&state.phase==='playing';i++){
  const unit=state.match.units[state.match.turn],player=players.find(p=>p.id===unit.id);
  assert.ok(player,'bot must not leave a stalled turn');const rev=state.revision;
  state=command(player,{type:'act',action:actions(state.match)[0]});
  assert.ok(state.revision>rev);
 }
 assert.equal(state.phase,'finished');assert.notEqual(state.match.winner,null);
 state=command(players[0],{type:'start'});assert.equal(state.phase,'playing');
});
