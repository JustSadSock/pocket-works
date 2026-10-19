import {createInitialState,resolveTurn} from '../shared/game-engine.js';
const clone=v=>structuredClone(v);
const role=(s,id)=>['p1','p2'].find(r=>s.slots[r]===id);
const output=state=>({state,events:[{type:'state',payload:{}}]});
export default {protocolVersion:1,
 createRoom({player}){return output({game:null,slots:{p1:player.id,p2:null},ready:{p1:false,p2:false},pending:{}});},
 onJoin({state,player}){state=clone(state);if(!role(state,player.id)){const r=['p1','p2'].find(r=>!state.slots[r]);if(!r)throw Error('Комната заполнена');state.slots[r]=player.id;}if(state.slots.p1&&state.slots.p2&&!state.game)state.game=createInitialState({mode:'online',seed:'room-'+Date.now()});return output(state);},
 onLeave({state,player}){state=clone(state);const r=role(state,player.id);if(r){state.slots[r]=null;delete state.pending[r];state.ready[r]=false;}return output(state);},
 onMessage({state,player,payload:p}){state=clone(state);const r=role(state,player.id);if(!r)throw Error('Игрок не в комнате');
  if(p?.type==='sync')return output(state);
  if(p?.type==='match:restart'){if(r!=='p1')throw Error('Перезапуск доступен создателю');state.game=createInitialState({mode:'online',seed:'room-'+Date.now()});state.ready={p1:false,p2:false};state.pending={};return output(state);}
  if(p?.type!=='match:choose'||!state.game||state.game.winner||state.ready[r]||!state.slots.p1||!state.slots.p2)throw Error('Сейчас нельзя выбрать закон');
  if(!state.game.players[r].hand.includes(p.cardId))throw Error('Карты нет в руке');
  state.pending[r]={cardId:p.cardId};state.ready[r]=true;
  if(state.ready.p1&&state.ready.p2){state.game=resolveTurn(state.game,state.pending).state;state.pending={};state.ready={p1:false,p2:false};}
  return output(state);
 },
 viewForPlayer({state,player}){const you=role(state,player.id);const game=clone(state.game);if(game){const enemy=you==='p1'?'p2':'p1';game.players[enemy].hand=game.players[enemy].hand.map(()=> 'hidden');for(const r of ['p1','p2'])game.players[r].deck=game.players[r].deck.map(()=> 'hidden');game.seed='private';game.pendingChoices=null;}return {phase:game?'playing':'lobby',you,ready:clone(state.ready),players:['p1','p2'].filter(r=>state.slots[r]),state:game};}
};
