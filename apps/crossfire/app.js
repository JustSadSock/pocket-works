import {createWorkshopMode} from '../../shared/workshop-mode.js';
import {installMobileRuntime} from '../../shared/mobile-runtime.js';
import {initial,actions,play,bot,count} from './rules.js';
import {PocketNet} from '../../shared/capabilities/net.js';
installMobileRuntime();
const $=id=>document.getElementById(id);
let net=null,match=null,state=null,me=null,solo=false,busy=false,connected=false,pending=false,room='',timeout=0;
const scope='pocket-works:crossfire:';
const storage={getItem:k=>sessionStorage.getItem(scope+k),setItem:(k,v)=>sessionStorage.setItem(scope+k,v),removeItem:k=>sessionStorage.removeItem(scope+k)};
const error=e=>$('error').textContent=String(e?.message||e||'');
const clearPending=()=>{pending=false;clearTimeout(timeout);};
function show(){ $('intro').hidden=true;$('menu').hidden=true;$('arena').hidden=false; }
function render(){
 show();
 const ready=solo||connected&&!pending;
 const required=state?count(state.mode):2;
 $('room').textContent=solo?'Тренировка':room?'Комната: '+room.slice(0,8).toUpperCase():'Подключение…';
 $('copy').hidden=solo||!room;
 $('board').replaceChildren();
 $('start').hidden=solo||!state||state.host!==me||state.phase==='playing';
 $('start').disabled=!ready||!state||state.players.length!==required;
 $('start').textContent=state?.phase==='finished'?'Реванш':'Начать бой';
 $('replay').hidden=!solo||!match||match.winner===null;
 $('wait').hidden=!match||match.winner!==null;
 if(!match){$('status').textContent='Лобби · '+(state?.players?.length||0)+' / '+required+' игроков';return;}
 const u=match.units[match.turn],mine=ready&&u.id===me&&match.winner===null,legal=mine?actions(match):[];
 $('status').textContent='Синие '+match.score[0]+' : '+match.score[1]+' Красные · '+(match.winner!==null?(match.winner===2?'Ничья':match.winner===0?'Синие победили':'Красные победили'):!ready?'Ожидание связи':mine?'Ваш ход':'Ход другого игрока')+' · '+match.log;
 $('wait').disabled=!mine;
 for(let y=0;y<7;y++)for(let x=0;x<7;x++){
  const v=match.units.find(v=>v.hp&&v.x===x&&v.y===y),a=legal.find(a=>a.x===x&&a.y===y),b=document.createElement('button');
  b.type='button';b.className=[x===3&&y===3?'center':'',v?v.team?'red':'blue':'',v&&v===u?'active':'',a?a.type==='hit'?'hit':'legal':''].join(' ');
  b.textContent=v?'◆'+v.hp:x===3&&y===3?'◎':'';
  b.setAttribute('aria-label',(x+1)+','+(y+1)+(v?' здоровье '+v.hp:'')+(a?a.type==='hit'?' выстрел':' перемещение':''));
  b.disabled=!a;if(a)b.onclick=()=>act(a);$('board').append(b);
 }
}
function remote(payload){
 if(!connected||pending||!state)return;
 try{pending=true;net.sendGame({...payload,revision:state.revision});render();timeout=setTimeout(()=>{clearPending();error('Ответ сервера задерживается');try{net?.sendGame({type:'sync'})}catch{}if(match||state)render()},5000)}catch(e){clearPending();error(e);render();}
}
function act(a){
 if(solo){if(play(match,me,a)){if(match.winner===null)bot(match);render();}}
 else remote({type:'act',action:a});
}
function receive(next){
 if(!next||!Array.isArray(next.players)||!Number.isInteger(next.revision))return;
 if(state&&next.revision<state.revision)return;
 state=next;match=next.match;clearPending();error('');render();
}
function disconnect(){
 const client=net;net=null;connected=false;clearPending();
 if(client){try{if(client.roomId)client.leaveRoom()}catch{}client.roomId=null;client.persist();client.close();}
}
function reset(){disconnect();busy=false;solo=false;match=null;state=null;room='';me=null;$('arena').hidden=true;$('intro').hidden=false;$('menu').hidden=false;error('');}
async function online(mode,code){
 if(busy)return;disconnect();busy=true;solo=false;state=null;match=null;room='';error('');show();$('status').textContent='Подключение к PocketNet…';$('board').replaceChildren();$('wait').hidden=true;$('start').hidden=true;$('replay').hidden=true;$('copy').hidden=true;
 const client=new PocketNet({serverUrl:location.origin+'/pocketnet',name:'Commander',storage,identityKey:'crossfire'});
 // Explicit create/join is not a request to resume another room.
 client.roomId=null;client.persist();net=client;
 client.on('connected',m=>{if(net!==client)return;me=m.player.id;connected=true;});
 client.on('room_joined',m=>{
  if(net!==client)return;
  if(m.gameId!=='crossfire'){reset();error('Это код другой игры');return;}
  busy=false;clearTimeout(timeout);room=m.roomId;receive(m.state);
 });
 client.on('game_event',m=>{if(net===client&&m.event?.type==='state')receive(m.event.payload)});
 client.on('error',m=>{if(net!==client)return;clearPending();const message=m.message||m.code||m;if(!room){reset();error(message);}else{busy=false;error(message);render();}});
 client.on('room_closed',()=>{if(net===client){reset();error('Комната закрыта');}});
 client.on('room_kicked',()=>{if(net===client){reset();error('Вы покинули комнату');}});
 client.on('disconnected',()=>{if(net===client){connected=false;clearPending();error('Переподключение…');if(state)render();}});
 try{await client.connect();if(net!==client)return;if(code)client.joinRoom(code);else client.createRoom('crossfire',{mode});
  timeout=setTimeout(()=>{if(net===client&&!room){reset();error('Комната не ответила. Попробуйте снова.');}},12000);
 }catch(e){if(net===client){reset();error(e);}}
}
function startSolo(){disconnect();solo=true;me='local';match=initial('solo',[me]);state=null;room='';error('');render();}
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>b.dataset.mode==='solo'?startSolo():online(b.dataset.mode));
$('join').onclick=()=>{const c=$('code').value.trim();if(c)online(null,c);else error('Введите код комнаты')};
$('wait').onclick=()=>act({type:'wait'});$('start').onclick=()=>remote({type:'start'});$('replay').onclick=startSolo;$('back').onclick=reset;
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText(room.slice(0,8).toUpperCase());$('copy').textContent='Код скопирован';setTimeout(()=>{$('copy').textContent='Копировать код'},1500)}catch{error('Код комнаты: '+room.slice(0,8).toUpperCase())}};
createWorkshopMode({appName:'Crossfire',version:'0.1.0',cachePrefix: 'crossfire-',storageNamespace: 'pocket-works:crossfire',onReset:reset});
