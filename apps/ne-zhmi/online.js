// Multiplayer orchestration. The only simulation authority is PocketNet.
// UI events are never treated as confirmation until a server snapshot arrives.
import { PocketNet } from '../../shared/capabilities/net.js';
import { stepGame, FIXED_DT } from './engine.js';
const serverUrl=location.origin+'/pocketnet';
const storagePrefix='ne-zhmi:net:';
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const ROOM=/^[0-9a-f]{8}$/i;
export function validRoom(value){return ROOM.test(value)||UUID.test(value);}
export function roleOf(snapshot,id){return snapshot?.roles?.indexOf(id)??-1;}
export function acceptOnlineSnapshot(previous,next) {
  if(!next||!['lobby','play','won'].includes(next.phase)||!Array.isArray(next.players))return false;
  if(!previous)return true;
  if(next.round<previous.round)return false;
  if(next.round===previous.round&&next.revision<previous.revision)return false;
  if(next.round===previous.round&&next.revision===previous.revision&&
    Number(next.robot?.t||0)<Number(previous.robot?.t||0)-.001)return false;
  return true;
}
const $=id=>document.getElementById(id);
const str=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const netStorage={
  getItem(key){try{return sessionStorage.getItem(storagePrefix+key)}catch{return null}},
  setItem(key,value){try{sessionStorage.setItem(storagePrefix+key,value)}catch{}},
  removeItem(key){try{sessionStorage.removeItem(storagePrefix+key)}catch{}}
};
export function createOnlineController({onUpdate,onExit,onNotice}) {
  let client=null,me=null,roomId='',snapshot=null,connected=false,busy=false,connecting=false,active=false;
  let pulseTimer=0,pulseSentAt=0,commandSeq=0,display=null,displayDebt=0,offlineSince=0,transportRevision=0;
  let pausedForPrompt=false,mode='create',attemptId=0;
  const status=$('online-status'),banner=$('online-banner');
  const notify=(text)=>{status.textContent=text;onNotice?.(text)};
  const send=payload=>{
    if(!client||!connected)return false;
    try{client.sendGame(payload);return true}catch{connected=false;refresh();return false}
  };
  function refresh() {
    const joined=!!roomId,host=snapshot?.host===me?.id;
    const total=snapshot?.players?.length||0,role=roleOf(snapshot,me?.id);
    $('online-lobby').classList.toggle('hidden',!active||snapshot?.phase==='play'||snapshot?.phase==='won');
    $('online-result').classList.toggle('hidden',!active||snapshot?.phase!=='won');
    $('online-entry').classList.toggle('hidden',mode!=='join'||joined);
    $('online-room').classList.toggle('hidden',!joined);
    $('online-start').classList.toggle('hidden',!joined||!host);
    $('online-swap').classList.toggle('hidden',!joined||!host);
    $('online-start').disabled=!connected||busy||total!==2;
    $('online-swap').disabled=!connected||busy||total!==2;
    $('online-again').classList.toggle('hidden',!host);
    $('online-again').disabled=!connected||busy||total!==2;
    $('online-wait-host').classList.toggle('hidden',host);
    $('online-code').textContent=roomId?roomId.slice(0,8).toUpperCase():'--------';
    const roles=snapshot?.roles||[];
    const people=snapshot?.players||[];
    $('online-roster').replaceChildren();
    for(let i=0;i<2;i++){
      const id=roles[i],person=people.find(p=>p.id===id);
      const item=document.createElement('div');item.className='operator-seat'+(id===me?.id?' mine':'');
      const name=document.createElement('strong'),label=document.createElement('small');
      name.textContent=person?.name||'Ожидание оператора';
      label.textContent=i===0?'ПОСТ 01 · ПРЫЖОК':'ПОСТ 02 · РАЗВОРОТ';
      item.append(name,label);$('online-roster').append(item);
    }
    const label=role===0?'Вы управляете прыжком':role===1?'Вы управляете разворотом':'Ожидание роли';
    $('online-role').textContent=label;
    $('online-lobby-title').textContent=joined?'Комната готова':mode==='join'?'Войти по коду':'Подключение';
    const playing=snapshot?.phase==='play';
    const troubled=active&&(connecting||!connected||snapshot?.hold||pausedForPrompt);
    banner.classList.toggle('hidden',!playing||!troubled);
    banner.textContent=!connected?'Связь потеряна — переподключение…':snapshot?.hold?'Один из операторов отключился — игра приостановлена':pausedForPrompt?'Выход из комнаты?':'';
    $('online-out').classList.toggle('hidden',!active||!playing);
    $('online-result-stats').textContent=snapshot?.robot
      ? 'Время '+format(snapshot.robot.wonAt||snapshot.robot.t)+' · падений '+snapshot.robot.respawns+
        ' · прыжков '+snapshot.robot.jumps+' · разворотов '+snapshot.robot.reverses:'';
    if(playing)$('online-role-chip').textContent=role===0?'ПОСТ 01 · ПРЫЖОК':role===1?'ПОСТ 02 · РАЗВОРОТ':'СИНХРОНИЗАЦИЯ';
    $('online-role-chip').classList.toggle('hidden',!playing);
    $('online-role-chip').classList.toggle('chip-unavailable',troubled);
    $('jump').disabled=!playing||troubled||role!==0;
    $('reverse').disabled=!playing||troubled||role!==1;
    onUpdate({active,snapshot,role,connected,connecting,troubled});
  }
  function format(t){const n=Math.max(0,Math.floor(t));return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');}
  function consume(next) {
    if(!acceptOnlineSnapshot(snapshot,next))return;
    const old=snapshot;
    if(next.round!==old?.round){display=null;displayDebt=0;commandSeq=0;}
    snapshot=next;
    // Soft visual reconciliation uses an independent copy. The network state
    // remains immutable from the perspective of renderer and local input.
    if(next.robot) {
      if(!display||!old||next.round!==old.round||Math.abs(display.x-next.robot.x)>.7||Math.abs(display.y-next.robot.y)>.65) {
        display={...next.robot};displayDebt=0;
      }else{
        const correction=.46;
        display.x+=(next.robot.x-display.x)*correction;
        display.y+=(next.robot.y-display.y)*correction;
        display.vx=next.robot.vx;display.vy=next.robot.vy;
        display.dir=next.robot.dir;display.ground=next.robot.ground;
        display.coyote=next.robot.coyote;display.buffer=next.robot.buffer;
        display.cooldown=next.robot.cooldown;display.rotation=next.robot.rotation;
        display.t=next.robot.t;display.finished=next.robot.finished;
        display.checkpoint=next.robot.checkpoint;
        display.respawns=next.robot.respawns;display.jumps=next.robot.jumps;display.reverses=next.robot.reverses;
      }
    }
    if(next.phase==='won')stopPulses();
    else if(next.phase==='play')startPulses();
    refresh();
  }
  function stopPulses(){if(pulseTimer){clearInterval(pulseTimer);pulseTimer=0;}}
  function startPulses(){
    if(pulseTimer||!connected)return;
    pulseTimer=setInterval(()=>{
      if(!active||!connected||snapshot?.phase!=='play')return;
      send({type:'pulse'});
      pulseSentAt=performance.now();
    },120);
    send({type:'pulse'});
  }
  function wire(net,id) {
    net.on('connected',e=>{
      if(client!==net||attemptId!==id)return;
      me=e.player;connected=true;connecting=false;
      notify('PocketNet · соединение установлено');
      if(snapshot?.phase==='play')startPulses();
      if(roomId)send({type:'sync'});
      refresh();
    });
    net.on('room_joined',e=>{
      if(client!==net||attemptId!==id)return;
      if(e.gameId!=='ne-zhmi'){notify('Неверная игра в приглашении');return;}
      roomId=e.roomId;busy=false;connecting=false;
      consume(e.state);send({type:'sync'});
      try{netStorage.setItem('active','yes')}catch{}
      refresh();
    });
    net.on('game_event',e=>{
      if(client!==net||attemptId!==id)return;
      if(e.event?.type==='state')consume(e.event.payload);
      else if(e.event?.type==='notice')notify(String(e.event.payload||'Сообщение от сервера'));
    });
    net.on('presence',()=>{if(client===net&&connected)send({type:'sync'})});
    net.on('disconnected',()=>{
      if(client!==net||attemptId!==id)return;
      connected=false;connecting=true;offlineSince=performance.now();stopPulses();
      notify('Ожидание связи с PocketNet…');refresh();
    });
    net.on('room_closed',()=>{
      if(client!==net||attemptId!==id)return;
      disconnect();onExit?.();onNotice?.('Комната закрыта');
    });
    net.on('error',e=>{
      if(client!==net||attemptId!==id)return;
      busy=false;
      const errors={room_full:'Комната уже занята',room_not_found:'Комната не существует или устарела',
        match_in_progress:'Партия уже запущена',already_in_room:'Вы уже находитесь в комнате',
        account_already_in_room:'Этот аккаунт уже в комнате',game_unavailable:'Сервер игры пока не опубликован'};
      notify(errors[e.code]||('Ошибка PocketNet: '+(e.code||'неизвестная')));
      if(e.code==='room_not_found'){roomId='';snapshot=null;mode='join';}
      refresh();
    });
  }
  function disconnect(){
    const old=client;client=null;attemptId++;stopPulses();
    if(old){try{if(connected&&old.roomId)old.leaveRoom()}catch{}old.close();}
    roomId='';me=null;snapshot=null;display=null;connected=false;connecting=false;active=false;busy=false;pausedForPrompt=false;
    netStorage.removeItem('active');refresh();
  }
  async function enter(action,code='') {
    if(active)disconnect();
    const id=++attemptId;
    mode=action==='create'?'create':'join';
    active=true;busy=true;connecting=true;snapshot=null;roomId='';connected=false;
    $('online-code-input').value=String(code||'').trim().toUpperCase();
    refresh();notify('Подключаемся к PocketNet…');
    const requestedName=String($('player-name').value||'Игрок').trim().slice(0,22)||'Игрок';
    try{localStorage.setItem('pocket-works:ne-zhmi:player',requestedName)}catch{}
    const net=new PocketNet({serverUrl,name:requestedName,storage:netStorage,identityKey:'guest'});
    client=net;wire(net,id);
    try{
      await Promise.race([
        net.connect(),
        new Promise((_,reject)=>setTimeout(()=>reject(Error('Сервер не ответил')),12000))
      ]);
      if(client!==net||id!==attemptId)return;
      if(action==='create'){net.roomId=null;net.persist();net.createRoom('ne-zhmi');}
      else if(action==='resume'){
        if(!net.roomId) {busy=false;notify('Комната недоступна, введите новый код');refresh();}
        else {roomId=net.roomId;send({type:'sync'});}
      } else if(code){join(code);}
      else{busy=false;refresh();notify('Введите код комнаты');}
    }catch(error){
      if(client!==net||id!==attemptId)return;
      disconnect();onExit?.();onNotice?.(error.message||'Не удалось подключиться к серверу');
    }
  }
  function join(value){
    if(!connected||!client)return notify('Нет подключения к PocketNet');
    const code=String(value||$('online-code-input').value||'').trim().toUpperCase();
    if(!validRoom(code)){notify('Введите восьмизначный код приглашения');return;}
    if(roomId){notify('Вы уже в комнате');return;}
    busy=true;refresh();
    try{client.joinRoom(code);}catch{busy=false;refresh();notify('Не удалось отправить приглашение');}
  }
  function sendAction(action){
    if(!active||!connected||snapshot?.phase!=='play'||snapshot.hold||pausedForPrompt)return false;
    const role=roleOf(snapshot,me?.id);
    if((role===0&&action!=='jump')||(role===1&&action!=='reverse')||role<0)return false;
    return send({type:'input',action,round:snapshot.round,seq:++commandSeq});
  }
  function request(action){
    if(!connected||!snapshot||snapshot.host!==me?.id)return notify('Действие доступно ведущему');
    if(action==='start'||action==='restart'||action==='swap')send({type:action});
  }
  async function copyInvite(){
    if(!roomId)return;
    const link=new URL(location.href);link.searchParams.set('room',roomId.slice(0,8).toUpperCase());
    try{await navigator.clipboard.writeText(link.href);notify('Ссылка приглашения скопирована');}
    catch{
      const el=document.createElement('textarea');el.value=link.href;document.body.append(el);el.select();
      const worked=document.execCommand?.('copy');el.remove();
      notify(worked?'Ссылка приглашения скопирована':'Не удалось скопировать ссылку');
    }
  }
  function advance(dt){
    if(!active||!connected||snapshot?.phase!=='play'||snapshot.hold||!display)return null;
    displayDebt+=Math.max(0,Math.min(.06,dt));
    const cap=.17;
    let steps=0;
    while(displayDebt>=FIXED_DT && steps<8 && (display.t-snapshot.robot.t)<cap){
      stepGame(display,FIXED_DT);displayDebt-=FIXED_DT;steps++;
    }
    if(steps===8||display.t-snapshot.robot.t>=cap)displayDebt=0;
    return display;
  }
  function resultState(){return display||snapshot?.robot||null;}
  function isActive(){return active;}
  function isPlaying(){return active&&snapshot?.phase==='play';}
  function canInput(action){const role=roleOf(snapshot,me?.id);return isPlaying()&&connected&&!snapshot?.hold&&!pausedForPrompt&& (role===0&&action==='jump'||role===1&&action==='reverse');}
  function exitPrompt(){if(!active)return;pausedForPrompt=true;$('online-confirm').classList.remove('hidden');refresh();}
  function cancelExit(){pausedForPrompt=false;$('online-confirm').classList.add('hidden');refresh();}
  function leave(){disconnect();$('online-confirm').classList.add('hidden');onExit?.();}
  $('online-start').addEventListener('click',()=>request('start'));
  $('online-again').addEventListener('click',()=>request('start'));
  $('online-swap').addEventListener('click',()=>request('swap'));
  $('online-join').addEventListener('click',()=>join());
  $('online-code-input').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();join();}});
  $('online-copy').addEventListener('click',copyInvite);
  for(const id of ['online-leave','online-out','online-leave-result'])$(id).addEventListener('click',exitPrompt);
  $('online-leave-no').addEventListener('click',cancelExit);
  $('online-leave-yes').addEventListener('click',leave);
  return {enter,join,leave,isActive,isPlaying,canInput,sendAction,request,advance,resultState,refresh,getSnapshot:()=>snapshot};
}
