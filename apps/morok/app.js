import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import {
  SIGILS, RELICS, cardById, sigilInfo, nodeLabel, createProfile, createRun, hydrateRun,
  resolveNode, chooseCardReward, chooseRelic, hearthUpgrade, altarSelect, afterBattleVictory,
  skipReward, playCard, sacrificeUnit, endTurn
} from './game-core.mjs';

installMobileRuntime();

const RUN_KEY='pocket-works:morok:run:v1';
const PROFILE_KEY='pocket-works:morok:profile:v1';
const PREF_KEY='pocket-works:morok:prefs:v1';
const $=(s,root=document)=>root.querySelector(s);
const $$=(s,root=document)=>[...root.querySelectorAll(s)];
const el={
  scene:$('#scene'), location:$('#locationLabel'), back:$('#backBtn'), menu:$('#menuBtn'),
  start:$('#startScreen'),trail:$('#trailScreen'),battle:$('#battleScreen'),event:$('#eventScreen'),result:$('#resultScreen'),
  continue:$('#continueBtn'),continueMeta:$('#continueMeta'),newRun:$('#newRunBtn'),rules:$('#rulesBtn'),
  runHp:$('#runHp'),deckCount:$('#deckCount'),relicCount:$('#relicCount'),trailChapter:$('#trailChapter'),trailTitle:$('#trailTitle'),trailHint:$('#trailHint'),trailPath:$('#trailPath'),deckBtn:$('#deckBtn'),deckBadge:$('#deckBadge'),
  enemyHpFill:$('#enemyHpFill'),enemyHpText:$('#enemyHpText'),playerHpFill:$('#playerHpFill'),playerHpText:$('#playerHpText'),round:$('#roundText'),
  intentRow:$('#intentRow'),enemyRow:$('#enemyRow'),playerRow:$('#playerRow'),battleMessage:$('#battleMessage'),ember:$('#emberText'),remains:$('#remainsText'),heritage:$('#heritageSlot'),endTurn:$('#endTurnBtn'),hand:$('#hand'),selectionStrip:$('#selectionStrip'),selectionTitle:$('#selectionTitle'),selectionText:$('#selectionText'),sacrifice:$('#sacrificeBtn'),
  eventKicker:$('#eventKicker'),eventTitle:$('#eventTitle'),eventHint:$('#eventHint'),eventChoices:$('#eventChoices'),eventSkip:$('#eventSkip'),
  resultRune:$('#resultRune'),resultKicker:$('#resultKicker'),resultTitle:$('#resultTitle'),resultText:$('#resultText'),resultDepth:$('#resultDepth'),resultKills:$('#resultKills'),resultSacrifices:$('#resultSacrifices'),again:$('#againBtn'),resultHome:$('#resultHomeBtn'),
  deckSheet:$('#deckSheet'),deckList:$('#deckList'),relicList:$('#relicList'),menuSheet:$('#menuSheet'),rulesSheet:$('#rulesSheet'),sound:$('#soundToggle'),haptic:$('#hapticToggle'),menuRules:$('#menuRulesBtn'),abandon:$('#abandonBtn'),
  confirm:$('#confirmBox'),confirmText:$('#confirmText'),confirmCancel:$('#confirmCancel'),confirmOk:$('#confirmOk'),toast:$('#toast')
};
const screens=[el.start,el.trail,el.battle,el.event,el.result];
let current='start';
let run=null;
let profile=loadJSON(PROFILE_KEY,createProfile());
let prefs={sound:true,haptic:true,...loadJSON(PREF_KEY,{})};
let selectedCard=null;
let selectedUnit=null;
let selectedHeritageSigil=null;
let confirmAction=null;
let toastTimer=0;
let renderedResultFor=null;

function loadJSON(key,fallback){try{return JSON.parse(localStorage.getItem(key)||'null')??fallback}catch{return fallback}}
function persist(){
  try{if(run)localStorage.setItem(RUN_KEY,JSON.stringify(run));else localStorage.removeItem(RUN_KEY);localStorage.setItem(PROFILE_KEY,JSON.stringify(profile));localStorage.setItem(PREF_KEY,JSON.stringify(prefs));}catch(err){console.warn('[MOROK] persist failed',err)}
}
function readSavedRun(){try{const raw=localStorage.getItem(RUN_KEY);return raw?hydrateRun(raw):null}catch(err){console.warn(err);return null}}

class AudioEngine{
  constructor(){this.ctx=null;this.noise=null}
  async ensure(){if(!prefs.sound)return null;if(!this.ctx){const A=window.AudioContext||window.webkitAudioContext;if(!A)return null;this.ctx=new A();}if(this.ctx.state==='suspended')await this.ctx.resume();return this.ctx}
  tone(kind='tap'){
    if(!prefs.sound)return;void this.ensure().then(ctx=>{if(!ctx)return;const now=ctx.currentTime;const o=ctx.createOscillator(),g=ctx.createGain(),f=ctx.createBiquadFilter();
      const map={tap:[160,.035,.025],card:[230,.065,.05],play:[95,.12,.075],hit:[58,.08,.12],death:[42,.18,.12],reward:[330,.18,.06],bad:[75,.09,.06],turn:[115,.12,.045],win:[210,.4,.07]};const [hz,dur,vol]=map[kind]||map.tap;
      o.type=kind==='reward'||kind==='win'?'triangle':'square';o.frequency.setValueAtTime(hz,now);o.frequency.exponentialRampToValueAtTime(Math.max(30,hz*(kind==='bad'?.55:1.35)),now+dur);
      f.type='lowpass';f.frequency.value=kind==='hit'?420:950;g.gain.setValueAtTime(vol,now);g.gain.exponentialRampToValueAtTime(.0001,now+dur);o.connect(f).connect(g).connect(ctx.destination);o.start(now);o.stop(now+dur+.01);
    }).catch(()=>{});
  }
}
const audio=new AudioEngine();
function haptic(pattern=8){if(prefs.haptic&&navigator.vibrate)navigator.vibrate(pattern)}
function feedback(kind='tap'){audio.tone(kind);if(kind==='hit'||kind==='death')haptic(kind==='death'?[12,25,18]:11);else if(kind==='bad')haptic([8,28,8]);else haptic(5)}

function showToast(text){clearTimeout(toastTimer);el.toast.textContent=text;el.toast.classList.add('show');toastTimer=setTimeout(()=>el.toast.classList.remove('show'),1500)}
function showScreen(name){
  current=name;screens.forEach(s=>s.classList.remove('active'));el[name]?.classList.add('active');
  el.location.textContent=({start:'ЗАЛ',trail:`ГЛУБИНА ${(run?.depth??0)+1}`,battle:'СХВАТКА',event:'СЛЕД',result:'КОНЕЦ'})[name]||'ЗАЛ';
  el.back.style.visibility=name==='start'?'hidden':'visible';selectedCard=null;selectedUnit=null;selectedHeritageSigil=null;
  render();
}
function closeSheets(){$$('.sheet').forEach(s=>s.hidden=true)}
function openSheet(sheet){closeSheets();sheet.hidden=false;feedback('tap')}
function roman(n){const m=['I','II','III','IV','V','VI','VII','VIII','IX','X'];return m[n-1]||String(n)}
function iconFor(type){return({battle:'╳',boss:'♜',cache:'⌗',altar:'†',hearth:'⌂',omen:'◉'})[type]||'·'}

function startNewRun(){profile.totalRuns=(profile.totalRuns||0)+1;run=createRun(Date.now(),profile);persist();feedback('reward');showScreen('trail')}
function continueRun(){run=readSavedRun();if(!run){showToast('Сохранение сгнило. Начинаем заново.');startNewRun();return;}showScreen(run.result?'result':run.battle?'battle':run.pending?'event':'trail')}
function finishProfileIfNeeded(){
  if(!run?.result||run.resultProfiled)return;
  profile.bestDepth=Math.max(profile.bestDepth||0,run.depth+1);
  if(run.result==='won')profile.wins=(profile.wins||0)+1;
  run.resultProfiled=true;persist();
}
function abandonRun(){run=null;persist();closeSheets();showScreen('start')}

function render(){
  renderStart();
  if(!run)return;
  if(current==='trail')renderTrail();
  if(current==='battle')renderBattle();
  if(current==='event')renderEvent();
  if(current==='result')renderResult();
}
function renderStart(){
  const saved=readSavedRun();el.continue.hidden=!saved;
  if(saved){el.continueMeta.textContent=saved.result?(saved.result==='won'?'ПОБЕДА СОХРАНЕНА':'ПОСЛЕДНИЙ СЛЕД'):`ГЛУБИНА ${saved.depth+1} · ${saved.hp}/${saved.maxHp}`;}
  el.sound.querySelector('b').textContent=prefs.sound?'ВКЛ':'ВЫКЛ';el.haptic.querySelector('b').textContent=prefs.haptic?'ВКЛ':'ВЫКЛ';
}
function renderTrail(){
  if(run.result){showScreen('result');return;}
  el.runHp.textContent=run.hp;el.deckCount.textContent=run.deck.length;el.deckBadge.textContent=run.deck.length;el.relicCount.textContent=run.relics.length;
  el.trailChapter.textContent=`ГЛУБИНА ${roman(run.depth+1)} / ${run.maxDepth}`;
  const stage=run.trail[run.depth]||[];el.trailTitle.textContent=stage.length===1&&stage[0].type==='boss'?'Кто-то стоит между деревьями':'Тропа раздваивается';
  el.trailHint.textContent=stage.length===1?'Назад дороги уже нет.':'Выбор закрывает остальные следы.';
  el.trailPath.replaceChildren();
  const future=[];for(let d=Math.min(run.maxDepth-1,run.depth+2);d>=run.depth;d--)future.push(d);
  for(const depth of future){
    const row=document.createElement('div');row.className=`stage-row ${depth===run.depth?'current':'future'}`;
    for(const node of run.trail[depth]){
      const b=document.createElement('button');b.type='button';b.className='stage-node';b.dataset.nativePress='';b.disabled=depth!==run.depth;
      b.innerHTML=`<b>${iconFor(node.type)}</b><span>${nodeLabel(node.type)}</span><small>${node.elite&&node.type==='battle'?'СИЛЬНЫЙ СЛЕД':depth===run.depth?'ВЫБРАТЬ':'СКОРО'}</small>`;
      if(depth===run.depth)b.addEventListener('click',()=>chooseNode(node));row.append(b);
    }
    el.trailPath.append(row);
  }
}
function chooseNode(node){
  feedback(node.type==='boss'?'death':'tap');const r=resolveNode(run,node);if(!r.ok){showToast(r.reason||'Не сейчас.');return;}persist();
  if(r.type==='battle')showScreen('battle');else showScreen('event');
}

function renderBattle(){
  const b=run?.battle;if(!b){if(run?.pending?.type==='card-choice')showScreen('event');else showScreen(run?.result?'result':'trail');return;}
  el.enemyHpFill.style.transform=`scaleX(${Math.max(0,b.enemyHp/b.enemyMaxHp)})`;el.enemyHpText.textContent=`${Math.max(0,b.enemyHp)}/${b.enemyMaxHp}`;
  el.playerHpFill.style.transform=`scaleX(${Math.max(0,b.playerHp/b.playerMaxHp)})`;el.playerHpText.textContent=`${Math.max(0,b.playerHp)}/${b.playerMaxHp}`;el.round.textContent=b.round;
  el.ember.textContent=b.ember;el.remains.textContent=b.remains;
  el.heritage.innerHTML=b.heritage?`<span>${sigilInfo(b.heritage).mark}</span><small>${sigilInfo(b.heritage).name}</small>`:'<span>∅</span><small>НАСЛЕДИЕ</small>';
  el.battleMessage.textContent=b.log?.[0]||'Камень ждёт твоего хода.';
  renderLaneRow(el.intentRow,[0,1,2,3].map(l=>b.intent.find(i=>i.lane===l)?.unit||null),'intent');
  renderLaneRow(el.enemyRow,b.enemy,'enemy');renderLaneRow(el.playerRow,b.player,'player');renderHand(b);
  renderSelection();highlightTargets();
}
function renderLaneRow(root,units,side){
  root.replaceChildren();units.forEach((unit,lane)=>{
    const btn=document.createElement('button');btn.type='button';btn.className='lane';btn.dataset.lane=lane;btn.dataset.side=side;btn.setAttribute('aria-label',unit?unit.name:`Пустая линия ${lane+1}`);
    if(side==='intent'){
      if(unit){const wrap=document.createElement('div');wrap.className='intent-unit';const art=document.createElement('canvas');wrap.append(art);const stat=document.createElement('b');stat.textContent=`${unit.atk}/${unit.hp}`;wrap.append(stat);btn.append(wrap);drawArt(art,unit,true);}btn.disabled=true;
    } else if(unit){
      const u=document.createElement('div');u.className='unit';const art=document.createElement('canvas');u.append(art);const stats=document.createElement('div');stats.className='unit-stats';stats.innerHTML=`<i>⚔${unit.atk}</i><span class="hp">♥${unit.hp}</span><span class="sig">${unit.sigils.map(s=>sigilInfo(s).mark).join('')}</span>`;u.append(stats);btn.append(u);drawArt(art,unit,false);
    }
    if(side==='player'&&lane===selectedUnit)btn.classList.add('selected');
    if(side!=='intent')btn.addEventListener('click',()=>onLaneTap(side,lane,btn));root.append(btn);
  });
}
function renderHand(b){
  el.hand.replaceChildren();for(const card of b.hand){const cardEl=createCardElement(card,true);cardEl.tabIndex=0;cardEl.setAttribute('role','button');cardEl.setAttribute('aria-label',`${card.name}. ${card.text||''}`);if(card.instanceId===selectedCard)cardEl.classList.add('selected');const affordable=isPotentiallyAffordable(card,b);if(!affordable)cardEl.classList.add('disabled');const choose=()=>{selectedCard=selectedCard===card.instanceId?null:card.instanceId;selectedUnit=null;selectedHeritageSigil=null;feedback('card');renderBattle();};cardEl.addEventListener('click',choose);cardEl.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();choose();}});el.hand.append(cardEl);}
}
function isPotentiallyAffordable(card,b){return card.costType==='ember'?b.ember>=Math.max(0,card.cost-1):card.costType==='remains'?b.remains>=card.cost:true}
function selectedCardObject(){return run?.battle?.hand.find(c=>c.instanceId===selectedCard)||null}
function onLaneTap(side,lane,node){
  const b=run.battle;const card=selectedCardObject();
  if(card){
    let targetLane=null,playLane=null;
    if(card.type==='creature'&&side==='player')playLane=lane;
    else if(card.type==='rite'){
      if(['bark','needle','molt'].includes(card.rite)&&side==='player')targetLane=lane;
      else if(card.rite==='salt'&&side==='enemy')targetLane=lane;
      else if(['milk','whisper'].includes(card.rite))targetLane=0;
      else {invalid(node,'Эта карта смотрит не туда.');return;}
    } else {invalid(node,'Зверей ставят на нижнюю линию.');return;}
    const r=playCard(run,b,card.instanceId,playLane,targetLane);if(!r.ok){invalid(node,r.reason);return;}
    selectedCard=null;feedback(card.type==='rite'?'hit':'play');persist();renderBattle();checkBattleState();return;
  }
  if(side==='player'&&b.player[lane]){selectedUnit=selectedUnit===lane?null:lane;const unit=b.player[lane];selectedHeritageSigil=unit?.sigils?.[0]||null;feedback('tap');renderBattle();}
}
function invalid(node,msg){node?.classList.add('invalid');setTimeout(()=>node?.classList.remove('invalid'),350);feedback('bad');showToast(msg||'Не получится.')}
function highlightTargets(){
  $$('.lane').forEach(n=>n.classList.remove('valid-target'));const card=selectedCardObject();if(!card)return;
  if(card.type==='creature'){$$('#playerRow .lane').forEach((n,i)=>{if(!run.battle.player[i])n.classList.add('valid-target')});return;}
  if(['bark','needle','molt'].includes(card.rite)){$$('#playerRow .lane').forEach((n,i)=>{if(run.battle.player[i])n.classList.add('valid-target')});}
  if(card.rite==='salt'){$$('#enemyRow .lane').forEach((n,i)=>{if(run.battle.enemy[i])n.classList.add('valid-target')});}
}
function renderSelection(){
  const b=run.battle;const unit=selectedUnit!=null?b.player[selectedUnit]:null;el.selectionStrip.hidden=!unit;
  if(!unit)return;el.selectionTitle.textContent=unit.name;
  if(unit.sigils.length){if(!selectedHeritageSigil||!unit.sigils.includes(selectedHeritageSigil))selectedHeritageSigil=unit.sigils[0];const s=sigilInfo(selectedHeritageSigil);el.selectionText.textContent=`Наследие: ${s.mark} ${s.name}${unit.sigils.length>1?' · нажми сменить':''}`;el.selectionText.style.cursor=unit.sigils.length>1?'pointer':'default';}
  else{selectedHeritageSigil=null;el.selectionText.textContent='Без метки: останутся только Останки.'}
  el.sacrifice.disabled=b.sacrificedThisTurn;
  el.sacrifice.textContent=b.sacrificedThisTurn?'РИТУАЛ УЖЕ БЫЛ':'ПРИНЕСТИ В ЖЕРТВУ';
}
function cycleHeritage(){const b=run?.battle,unit=selectedUnit!=null?b?.player[selectedUnit]:null;if(!unit||unit.sigils.length<2)return;const i=Math.max(0,unit.sigils.indexOf(selectedHeritageSigil));selectedHeritageSigil=unit.sigils[(i+1)%unit.sigils.length];feedback('tap');renderSelection();}
function doSacrifice(){const b=run.battle;if(selectedUnit==null)return;const r=sacrificeUnit(run,b,selectedUnit,selectedHeritageSigil);if(!r.ok){showToast(r.reason);feedback('bad');return;}selectedUnit=null;selectedHeritageSigil=null;feedback('death');persist();renderBattle();checkBattleState()}
function doEndTurn(){const b=run?.battle;if(!b)return;selectedCard=null;selectedUnit=null;const prevEnemy=b.enemyHp,prevPlayer=b.playerHp;const r=endTurn(run,b);feedback(r.ended?(r.winner==='player'?'win':'death'):'turn');if(b.enemyHp<prevEnemy||b.playerHp<prevPlayer)haptic(12);persist();renderBattle();checkBattleState();}
function checkBattleState(){const b=run?.battle;if(!b?.ended)return;if(b.winner==='player'){setTimeout(()=>{afterBattleVictory(run);persist();if(run.result==='won')showScreen('result');else showScreen('event');},280);}else{setTimeout(()=>showScreen('result'),280);}}

function renderEvent(){
  const p=run?.pending;if(!p){showScreen(run?.result?'result':'trail');return;}
  if(p.type==='battle'){showScreen('battle');return;}if(p.type==='run-win'){showScreen('result');return;}
  el.eventChoices.replaceChildren();el.eventSkip.hidden=true;el.eventKicker.textContent=({ 'card-choice':'ДОБЫЧА','relic-choice':'ЗНАК','hearth':'КОСТЁР','altar':'АЛТАРЬ'})[p.type]||'СЛЕД';el.eventTitle.textContent=p.title||'Камень что-то оставил';
  if(p.type==='card-choice'){el.eventHint.textContent='Возьми одну карту. Или не бери — толстая колода тоже умеет убивать.';for(const card of p.choices){const wrap=document.createElement('div');wrap.className='choice-wrap';wrap.append(createCardElement(card,false));const b=document.createElement('button');b.className='choice-action';b.textContent='ВЗЯТЬ В КОЛОДУ';b.addEventListener('click',()=>{chooseCardReward(run,card.instanceId);feedback('reward');persist();showScreen('trail')});wrap.append(b);el.eventChoices.append(wrap);}el.eventSkip.hidden=false;}
  if(p.type==='relic-choice'){el.eventHint.textContent='Один Знак останется до конца забега.';for(const relic of p.choices){const wrap=document.createElement('div');wrap.className='choice-wrap';const b=document.createElement('button');b.className='relic-choice';b.innerHTML=`<small>ЗНАК МОРОКА</small><b>${relic.name}</b><span>${relic.text}</span>`;b.addEventListener('click',()=>{chooseRelic(run,relic.id);feedback('reward');persist();showScreen('trail')});wrap.append(b);el.eventChoices.append(wrap);}}
  if(p.type==='hearth')renderHearth(p);
  if(p.type==='altar')renderAltar(p);
}
function renderHearth(p){
  el.eventHint.textContent='Выбери зверя. Костёр залатает тебя на 4 сердца и оставит на карте постоянный шрам.';
  for(const card of run.deck.filter(c=>c.type==='creature')){const wrap=document.createElement('div');wrap.className='choice-wrap';const choice=document.createElement('button');choice.className='deck-choice';choice.innerHTML=`<small>${card.upgrades?'ШРАМОВ: '+card.upgrades:'БЕЗ ШРАМОВ'}</small><b>${card.name}</b><span>⚔ ${card.atk} · ♥ ${card.hp} · ${card.sigils.map(s=>sigilInfo(s).name).join(' / ')||'без меток'}</span>`;choice.addEventListener('click',()=>showUpgradeChoice(card));wrap.append(choice);el.eventChoices.append(wrap);}
}
function showUpgradeChoice(card){el.eventTitle.textContent=card.name;el.eventHint.textContent='Какой шрам оставить?';el.eventChoices.replaceChildren();for(const option of [{mode:'fang',name:'Клык',text:'+1 атака навсегда.'},{mode:'hide',name:'Шкура',text:'+2 здоровья навсегда.'}]){const wrap=document.createElement('div');wrap.className='choice-wrap';const b=document.createElement('button');b.className='relic-choice';b.innerHTML=`<small>КОСТЁР</small><b>${option.name}</b><span>${option.text}</span>`;b.addEventListener('click',()=>{hearthUpgrade(run,card.instanceId,option.mode);feedback('reward');persist();showScreen('trail')});wrap.append(b);el.eventChoices.append(wrap);}}
function renderAltar(p){
  const donor=p.donor?run.deck.find(c=>c.instanceId===p.donor):null;
  el.eventHint.textContent=donor?`Теперь выбери, кто заберёт метку «${sigilInfo(donor.sigils[0]).name}». ${donor.name} исчезнет из колоды.`:'Выбери жертву. Её первая метка перейдёт другому зверю навсегда, сама карта исчезнет.';
  const cards=run.deck.filter(c=>c.type==='creature'&&(!donor||c.instanceId!==donor.instanceId));
  for(const card of cards){const wrap=document.createElement('div');wrap.className='choice-wrap';const b=document.createElement('button');b.className='deck-choice';b.innerHTML=`<small>${donor?'ПРИНЯТЬ НАСЛЕДИЕ':'ЖЕРТВА'}</small><b>${card.name}</b><span>${card.sigils.map(s=>`${sigilInfo(s).mark} ${sigilInfo(s).name}`).join(' · ')||'Нет меток'}</span>`;b.addEventListener('click',()=>{const r=altarSelect(run,card.instanceId);if(!r.ok){showToast(r.reason||'Алтарь молчит.');feedback('bad');return;}feedback(donor?'reward':'death');persist();if(r.stage==='receiver')renderEvent();else showScreen('trail')});wrap.append(b);el.eventChoices.append(wrap);}
}

function renderResult(){
  if(!run)return;finishProfileIfNeeded();
  const won=run.result==='won';el.resultRune.textContent=won?'◉':'†';el.resultKicker.textContent=won?'ПЕЧАТЬ СЛОМАНА':'МОРОК СОМКНУЛСЯ';el.resultTitle.textContent=won?'Ты открыл последнюю дверь':'Забег окончен';el.resultText.textContent=won?'Хозяин исчез, но карты всё ещё шевелятся в руке. В следующем забеге залы соберутся иначе.':'Колода закончилась раньше, чем коридоры. Следующий маршрут уже будет другим.';el.resultDepth.textContent=Math.min(run.depth+1,run.maxDepth);el.resultKills.textContent=run.stats.kills;el.resultSacrifices.textContent=run.stats.sacrifices;
  if(renderedResultFor!==run.seed){renderedResultFor=run.seed;feedback(won?'win':'death');}
}

function createCardElement(card,compact=false){
  const root=document.createElement('article');root.className=`card ${card.type==='rite'?'rite':''} ${card.rarity==='rare'?'rare':''} ${compact?'compact':''}`;root.dataset.card=card.instanceId||card.id;
  const resource=card.costType==='remains'?'●':'✦';root.innerHTML=`<div class="card-head"><span class="cost">${resource}${card.cost}</span><span class="card-name"></span></div><canvas class="art"></canvas><div class="card-text"></div><div class="card-foot"><span>${card.type==='creature'?`⚔${card.atk} · ♥${card.hp}`:'РИТУАЛ'}</span><span class="sigils">${card.sigils?.map(s=>sigilInfo(s).mark).join('')||'·'}</span></div>`;
  $('.card-name',root).textContent=card.name;$('.card-text',root).textContent=card.text||card.sigils?.map(s=>sigilInfo(s).text).join(' ');drawArt($('.art',root),card,false);return root;
}
function renderDeckSheet(){
  if(!run)return;el.deckList.replaceChildren();el.relicList.replaceChildren();
  if(!run.relics.length){const e=document.createElement('div');e.className='relic-chip';e.innerHTML='<b>Знаков пока нет</b><p>Они меняют правила всего забега.</p>';el.relicList.append(e);}else for(const id of run.relics){const r=RELICS.find(x=>x.id===id);if(!r)continue;const d=document.createElement('div');d.className='relic-chip';d.innerHTML=`<b>${r.name}</b><p>${r.text}</p>`;el.relicList.append(d);}
  for(const card of run.deck)el.deckList.append(createCardElement(card,true));
}

function confirm(text,action){el.confirmText.textContent=text;confirmAction=action;el.confirm.hidden=false;feedback('bad')}
function updatePrefs(){el.sound.querySelector('b').textContent=prefs.sound?'ВКЛ':'ВЫКЛ';el.haptic.querySelector('b').textContent=prefs.haptic?'ВКЛ':'ВЫКЛ';persist()}

// Pixel art renderer ---------------------------------------------------------
const palette={beast:['#20271f','#72533a','#c1a56f'],carrion:['#171918','#4a4038','#a79276'],fungal:['#171b16','#4b5b42','#c1a15f'],spirit:['#17201d','#6e8278','#d1cbb4'],enemy:['#171312','#61352d','#b47655'],rite:['#1c1411','#6f3528','#c88b56']};
function drawArt(canvas,card,ghost=false){
  const w=64,h=40;canvas.width=w;canvas.height=h;const c=canvas.getContext('2d');c.imageSmoothingEnabled=false;const p=palette[card.faction]||palette.enemy;
  c.fillStyle=p[0];c.fillRect(0,0,w,h);c.fillStyle='#242b24';for(let x=1;x<w;x+=7){const ht=8+((x*13)%15);c.fillRect(x,h-ht,2,ht);c.fillRect(x-2,h-ht+4,6,2)}
  c.fillStyle=ghost?'#5d6158':'#7a6a50';c.fillRect(0,31,w,9);c.fillStyle='rgba(210,190,150,.12)';for(let y=2;y<30;y+=5)for(let x=(y%3);x<w;x+=9)c.fillRect(x,y,1,1);
  if(card.type==='rite'){drawRite(c,card.id,p);return;}
  const id=String(card.id).replace('enemy-','');c.fillStyle=p[1];c.strokeStyle=p[2];
  if(['crow','owl','nightjar'].includes(id))drawBird(c,id,p);else if(['moth'].includes(id))drawMoth(c,p);else if(['mushroom','toad','weaver'].includes(id))drawFungal(c,id,p);else drawBeast(c,id,p);
  if(ghost){c.globalCompositeOperation='source-atop';c.fillStyle='rgba(210,205,185,.25)';c.fillRect(0,0,w,h);c.globalCompositeOperation='source-over'}
}
function px(c,x,y,w,h,color){if(color)c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h))}
function drawBeast(c,id,p){
  let bx=20,by=20,bw=25,bh=10; if(id==='hare'){bx=23;bw=18;bh=8;by=22} if(id==='moose'||id==='stag'){bw=27;bh=11;by=19}
  px(c,bx,by,bw,bh,p[1]);px(c,bx+bw-2,by-5,9,8,p[1]);px(c,bx+3,by+bh,4,8,p[1]);px(c,bx+bw-7,by+bh,4,8,p[1]);px(c,bx-7,by+2,8,3,p[1]);
  if(['wolf','fox','hound'].includes(id)){px(c,bx+bw+1,by-9,3,5,p[2]);px(c,bx+bw+5,by-8,3,4,p[2]);px(c,bx-9,by-2,10,2,p[2]);}
  if(id==='hare'){px(c,bx+bw+1,by-12,3,9,p[2]);px(c,bx+bw+5,by-11,2,8,p[2]);}
  if(['stag','moose'].includes(id)){for(const s of [-1,1]){const ox=bx+bw+2+s*3;px(c,ox,by-14,2,10,p[2]);px(c,ox+(s<0?-4:2),by-13,5,2,p[2]);px(c,ox+(s<0?-5:2),by-17,2,5,p[2]);}}
  if(id==='ram'){px(c,bx+bw+1,by-9,8,2,p[2]);px(c,bx+bw+6,by-7,2,7,p[2]);px(c,bx+bw+2,by-2,6,2,p[2]);}
  if(id==='boar'){px(c,bx+bw+5,by,5,2,p[2]);px(c,bx+bw+7,by-2,2,2,p[2]);}
  if(id==='adder'){c.clearRect(18,18,35,17);for(let i=0;i<7;i++)px(c,16+i*6,22+(i%2)*4,8,4,p[1]);px(c,52,20,7,6,p[2]);}
  if(id==='doe'){px(c,bx+bw+2,by-10,2,6,p[2]);px(c,bx+bw+6,by-9,2,5,p[2]);}
  px(c,bx+bw+4,by-3,1,1,'#d86c45');
}
function drawBird(c,id,p){px(c,27,17,15,13,p[1]);px(c,19,19,12,7,p[2]);px(c,40,16,9,7,p[1]);px(c,48,18,6,2,p[2]);px(c,31,29,2,5,p[2]);px(c,38,29,2,5,p[2]);if(id==='owl'){px(c,42,17,2,2,'#d0a65a');px(c,46,17,2,2,'#d0a65a')}else px(c,46,17,1,1,'#b95138')}
function drawMoth(c,p){px(c,30,14,4,17,p[2]);px(c,13,13,17,12,p[1]);px(c,34,13,17,12,p[1]);px(c,18,17,8,5,p[2]);px(c,38,17,8,5,p[2]);px(c,30,9,1,6,p[2]);px(c,34,9,1,6,p[2]);}
function drawFungal(c,id,p){if(id==='toad'){drawBeast(c,'hare',p);px(c,28,14,14,5,p[2]);return;}for(let i=0;i<(id==='weaver'?4:3);i++){const x=17+i*10,y=18+(i%2)*4;px(c,x,y,4,13,p[2]);px(c,x-5,y-4,14,5,p[1]);px(c,x-2,y-6,8,3,p[2]);}if(id==='weaver'){px(c,9,27,46,2,p[2]);px(c,14,24,2,8,p[2]);px(c,48,23,2,9,p[2]);}}
function drawRite(c,id,p){c.fillStyle=p[2];if(id==='salt'){for(let i=0;i<14;i++)px(c,14+(i*11)%38,13+(i*7)%16,2,2,p[2]);}else if(id==='bark'){px(c,25,8,14,25,p[1]);for(let y=11;y<31;y+=5)px(c,28,y,8,1,p[2]);}else if(id==='needle'){px(c,31,7,2,26,p[2]);px(c,27,12,10,1,p[1]);}else if(id==='milk'){px(c,24,12,18,18,p[2]);px(c,28,8,10,6,p[1]);px(c,28,19,10,8,p[0]);}else if(id==='molt'){px(c,19,25,28,3,p[2]);px(c,27,10,10,16,p[1]);px(c,23,13,18,2,p[2]);}else{for(let i=0;i<3;i++){c.strokeStyle=p[2];c.strokeRect(18+i*6,10+i*4,28-i*12,20-i*8);}}}

// Background scene ---------------------------------------------------------------
const ctx=el.scene.getContext('2d',{alpha:false});let lastFrame=0,sceneTime=0;
function sizeScene(){const r=el.scene.getBoundingClientRect();const ratio=Math.max(1.55,Math.min(2.25,r.height/Math.max(1,r.width)));el.scene.width=240;el.scene.height=Math.round(240*ratio);ctx.imageSmoothingEnabled=false}
function sceneLoop(t){if(!document.hidden&&t-lastFrame>33){sceneTime=t/1000;drawScene();lastFrame=t}requestAnimationFrame(sceneLoop)}
function drawScene(){const w=el.scene.width,h=el.scene.height;ctx.fillStyle='#090a09';ctx.fillRect(0,0,w,h);drawVault(w,h);drawBanners(w,h);drawCandles(w,h);if(current==='battle')drawStoneTable(w,h);else drawFlagstones(w,h);drawDust(w,h)}
function drawVault(w,h){
  ctx.fillStyle='#111310';ctx.fillRect(0,0,w,h*.7);
  for(let y=16;y<h*.7;y+=15){const off=((y/15)|0)%2?13:0;for(let x=-off;x<w;x+=27){ctx.fillStyle=((x+y)%5)?'#191b18':'#20211d';ctx.fillRect(x,y,25,13);ctx.fillStyle='#0c0e0c';ctx.fillRect(x,y+13,25,2);ctx.fillRect(x+25,y,2,15)}}
  ctx.fillStyle='#070807';ctx.fillRect(79,45,82,102);ctx.beginPath();ctx.arc(120,66,41,Math.PI,0);ctx.fill();
  ctx.fillStyle='#2b2a24';ctx.fillRect(74,43,5,109);ctx.fillRect(161,43,5,109);ctx.fillRect(70,147,100,5);
  ctx.fillStyle='#3b382e';for(let i=0;i<7;i++)ctx.fillRect(73+i*15,39+(i%2),11,3);
}
function drawBanners(w,h){for(const x of [27,w-52]){ctx.fillStyle='#3a1816';ctx.fillRect(x,43,25,75);ctx.fillStyle='#6d3028';ctx.fillRect(x+4,46,17,66);ctx.fillStyle='#b29361';ctx.fillRect(x+11,59,3,27);ctx.fillRect(x+7,70,11,3)}}
function drawCandles(w,h){const flick=Math.round((Math.sin(sceneTime*12)+1)*2);for(const x of [16,w-18,62,w-64]){const y=Math.round(h*.61+(x%3)*4);ctx.fillStyle='#c1aa7b';ctx.fillRect(x,y,3,12);ctx.fillStyle='#8f3d29';ctx.fillRect(x+1,y-5-flick,1,5+flick);ctx.fillStyle='#e39b55';ctx.fillRect(x,y-3-flick,3,2+flick)}}
function drawFlagstones(w,h){ctx.fillStyle='#171713';ctx.fillRect(0,h*.69,w,h*.31);ctx.fillStyle='#28271f';for(let y=Math.floor(h*.7);y<h;y+=17)ctx.fillRect(0,y,w,1);for(let x=12;x<w;x+=28)ctx.fillRect(x,h*.69,1,h*.31);ctx.fillStyle='#3f3021';ctx.fillRect(116,h*.75,8,h*.17);ctx.fillRect(105,h*.78,30,3)}
function drawStoneTable(w,h){ctx.fillStyle='#1e1b17';ctx.beginPath();ctx.moveTo(18,h*.56);ctx.lineTo(w-18,h*.56);ctx.lineTo(w+18,h);ctx.lineTo(-18,h);ctx.fill();ctx.fillStyle='#42382d';for(let x=19;x<w;x+=27)ctx.fillRect(x,h*.59,1,h*.34);for(let y=h*.64;y<h;y+=24)ctx.fillRect(0,y,w,1);ctx.fillStyle='#5e3328';ctx.fillRect(8,h*.555,w-16,2)}
function drawDust(w,h){ctx.fillStyle='rgba(164,158,142,.045)';for(let i=0;i<5;i++){const x=((sceneTime*4+i*57)%(w+70))-35;const y=Math.round(h*.24+i*17+Math.sin(sceneTime*.25+i)*3);ctx.fillRect(x,y,70,3)}}

// Events -------------------------------------------------------------------
el.continue.addEventListener('click',()=>{void audio.ensure();continueRun()});el.newRun.addEventListener('click',()=>{void audio.ensure();const saved=readSavedRun();if(saved&&!saved.result)confirm('Начать новый забег? Текущий путь и колода исчезнут.',startNewRun);else startNewRun()});el.again.addEventListener('click',startNewRun);el.resultHome.addEventListener('click',()=>{run=null;persist();showScreen('start')});
el.rules.addEventListener('click',()=>openSheet(el.rulesSheet));el.menuRules.addEventListener('click',()=>openSheet(el.rulesSheet));el.menu.addEventListener('click',()=>openSheet(el.menuSheet));el.deckBtn.addEventListener('click',()=>{renderDeckSheet();openSheet(el.deckSheet)});
$$('[data-close-sheet]').forEach(b=>b.addEventListener('click',()=>{$(`#${b.dataset.closeSheet}`).hidden=true;feedback('tap')}));
el.sound.addEventListener('click',()=>{prefs.sound=!prefs.sound;updatePrefs();if(prefs.sound)audio.tone('reward')});el.haptic.addEventListener('click',()=>{prefs.haptic=!prefs.haptic;updatePrefs();if(prefs.haptic)haptic(10)});
el.abandon.addEventListener('click',()=>confirm('Бросить текущий забег? Колода и тропа исчезнут.',abandonRun));el.confirmCancel.addEventListener('click',()=>{el.confirm.hidden=true;confirmAction=null});el.confirmOk.addEventListener('click',()=>{const a=confirmAction;el.confirm.hidden=true;confirmAction=null;a?.()});
el.eventSkip.addEventListener('click',()=>{if(skipReward(run).ok){feedback('tap');persist();showScreen('trail')}});el.endTurn.addEventListener('click',doEndTurn);el.sacrifice.addEventListener('click',doSacrifice);el.selectionText.addEventListener('click',cycleHeritage);
el.back.addEventListener('click',()=>{if(current==='trail'){persist();showScreen('start')}else if(current==='battle'||current==='event')openSheet(el.menuSheet);else if(current==='result')showScreen('start')});
window.addEventListener('resize',sizeScene);document.addEventListener('visibilitychange',()=>{if(document.hidden)persist()});window.addEventListener('pagehide',persist);

function boot(){sizeScene();updatePrefs();const saved=readSavedRun();if(saved&&saved.result){run=saved;}showScreen('start');requestAnimationFrame(sceneLoop)}
boot();
