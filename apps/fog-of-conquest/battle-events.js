/* The replay is a collection of private observations, never a game-state rewind.
   The server filters every coordinate according to the recipient's fog. */
(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 const viewport=$('battleViewport'),canvas=$('canvas'),controls=$('controls');
 if(!viewport||!canvas||!controls)return;
 const historyButton=document.createElement('button');
 historyButton.type='button';historyButton.id='fogBattleHistoryButton';
 historyButton.className='game-btn';historyButton.title='События боя';
 historyButton.setAttribute('aria-label','История сражения');
 historyButton.textContent='Журнал';
 historyButton.hidden=true;controls.insertBefore(historyButton,$('endTurnBtn'));
 const victory=$('victoryOverlay'),victoryPanel=victory?.querySelector('.panel')||victory;
 const victoryButton=document.createElement('button');
 victoryButton.id='fogBattleVictoryHistory';victoryButton.type='button';
 victoryButton.className='game-btn';victoryButton.textContent='Посмотреть бой';
 victoryButton.hidden=true;victoryPanel?.append(victoryButton);
 const overlay=document.createElement('section');overlay.id='fogBattleHistory';
 overlay.hidden=true;overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');
 overlay.setAttribute('aria-labelledby','fogBattleTitle');
 overlay.innerHTML=`<div class="fog-battle-sheet">
  <header><h2 id="fogBattleTitle">Ход сражения</h2><button id="fogBattleClose" type="button" aria-label="Закрыть">×</button></header>
  <div id="fogBattleEntries" class="fog-battle-entries"></div>
  <footer><button id="fogBattleReplay" type="button">Повторить последние действия</button></footer>
 </div>`;
 document.body.append(overlay);
 const fx=document.createElement('div');fx.id='fogBattleFx';fx.setAttribute('aria-live','off');
 document.body.append(fx);
 const cancel=document.createElement('button');cancel.id='fogBattleStop';
 cancel.textContent='Остановить повтор';cancel.type='button';cancel.hidden=true;
 document.body.append(cancel);
 const labels={move:'Перемещение',attack:'Атака',heal:'Лечение',spawn:'Новый отряд',end:'Конец хода'};
 let entries=[],side=0,roomId='',seenLive=new Set(),sequence=[],playing=false,playingTimer=null;
 const label=e=>{
  const place=e.at?' · '+(e.at.r+1)+':'+(e.at.c+1):
   e.from?' · '+(e.from.r+1)+':'+(e.from.c+1):'';
  return (labels[e.kind]||'Действие')+' · '+(e.actor===side?'ваши войска':'соперник')+place;
 };
 function render(){
   const parent=$('fogBattleEntries');parent.replaceChildren();
   if(!entries.length){
     const p=document.createElement('p');p.className='fog-battle-empty';
     p.textContent='События появятся после первого приказа.';parent.append(p);
   }
   for(const e of [...entries].reverse()){
     const p=document.createElement('p');p.className='fog-battle-entry';
     const number=document.createElement('span');number.textContent='#'+e.seq;
     const description=document.createElement('span');description.textContent=label(e);
     p.append(number,description);parent.append(p);
   }
   $('fogBattleReplay').disabled=entries.length===0||playing;
 }
 function stop(){
   if(playingTimer!==null)clearTimeout(playingTimer);
   playingTimer=null;sequence=[];playing=false;cancel.hidden=true;
   $('fogBattleReplay').disabled=entries.length===0;
 }
 function animate(e){
   if(!e||e.actor!==side&&!e.at&&!e.from)return;
   const point=e.at||e.from;
   if(!point)return;
   const rect=canvas.getBoundingClientRect(),width=window.COLS,height=window.ROWS;
   if(!width||!height)return;
   const x=rect.left+(point.c+.5)*rect.width/width;
   const y=rect.top+(point.r+.5)*rect.height/height;
   const bounds=viewport.getBoundingClientRect();
   if(x<bounds.left||x>bounds.right||y<bounds.top||y>bounds.bottom)return;
   const node=document.createElement('div');node.className='fog-battle-pulse fog-battle-'+e.kind;
   node.style.left=x+'px';node.style.top=y+'px';node.title=label(e);
   fx.append(node);
   node.addEventListener('animationend',()=>node.remove(),{once:true});
   setTimeout(()=>node.remove(),1000);
 }
 function play(){
   if(playing)return;
   sequence=entries.slice(-12);if(!sequence.length)return;
   overlay.hidden=true;playing=true;cancel.hidden=false;
   const step=()=>{
     if(!playing)return;
     const item=sequence.shift();
     if(!item){stop();return;}
     animate(item);
     cancel.textContent=label(item)+' · остановить';
     playingTimer=setTimeout(step,630);
   };
   step();
 }
 function show(){
   if(!roomId||!side)return;
   stop();render();overlay.hidden=false;$('fogBattleClose').focus();
 }
 function close(){overlay.hidden=true;historyButton.focus();}
 function reset(room){
   stop();roomId=room||'';entries=[];side=0;seenLive.clear();
   overlay.hidden=true;historyButton.hidden=true;victoryButton.hidden=true;
   fx.replaceChildren();
 }
 window.FogBattleClear=()=>reset('');
 window.FogBattleSync=(view,room)=>{
   if(!view?.side||!view.game)return;
   if(roomId!==room||side&&side!==view.side)reset(room);
   side=view.side;roomId=room;
   // Server-projected history contains ONLY this side, including after finish.
   const own=view.game.battleHistory?.[side];
   entries=Array.isArray(own)?own.slice(-96):[];
   historyButton.hidden=false;
   victoryButton.hidden=view.game.phase!=='finished'&&view.phase!=='finished';
   if(!overlay.hidden)render();
 };
 window.FogBattleEvent=(event)=>{
   if(!event||!roomId||!side||!Number.isInteger(event.seq)||seenLive.has(event.seq))return;
   if(!['move','attack','heal','spawn','end'].includes(event.kind))return;
   seenLive.add(event.seq);
   // Observations are safe by construction; never infer hidden opponents from
   // the full local units collection or current terrain.
   if(!entries.some(e=>e.seq===event.seq)){
     entries.push(event);if(entries.length>96)entries.shift();
   }
   if(!playing)animate(event);
   if(!overlay.hidden)render();
 };
 historyButton.addEventListener('click',show);
 victoryButton.addEventListener('click',show);
 $('fogBattleClose').addEventListener('click',close);
 overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
 overlay.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close();}});
 $('fogBattleReplay').addEventListener('click',play);
 cancel.addEventListener('click',stop);
})();
