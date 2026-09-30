import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import {
  VERSION,SEAL_LIMIT,SIGILS,RELICS,ITEMS,BOSSES,sigilInfo,itemInfo,bossInfo,nodeLabel,
  createProfile,createRun,hydrateRun,resolveNode,chooseCardReward,chooseRelic,chooseItem,
  hearthUpgrade,altarSelect,afterBattleVictory,skipReward,playCard,canPlay,sacrificeUnit,endTurn,useItem,canMove,moveUnit,forecastTurn
} from './game-core.js';

installMobileRuntime();

const RUN_KEY='pocket-works:morok:run:v2';
const OLD_RUN_KEY='pocket-works:morok:run:v1';
const PROFILE_KEY='pocket-works:morok:profile:v2';
const PREF_KEY='pocket-works:morok:prefs:v2';
const VIEW_KEY='pocket-works:morok:session-view';
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];

const el={
  app:$('#app'),opponent:$('#opponent'),mask:$('#opponentMask'),maskMark:$('.mask-mark'),speech:$('#opponentSpeech'),wallSeal:$('#wallSeal'),
  table:$('#table'),sealPlate:$('#sealPlate'),enemySeals:$('#enemySeals'),playerSeals:$('#playerSeals'),sealStatus:$('#sealStatus'),
  combatCaption:$('#combatCaption'),combatCaptionMain:$('#combatCaptionMain'),combatCaptionSub:$('#combatCaptionSub'),turnCue:$('#turnCue'),turnCueText:$('#turnCueText'),
  ember:$('#emberText'),remains:$('#remainsText'),intent:$('#intentRack'),enemy:$('#enemyRow'),player:$('#playerRow'),round:$('#roundText'),forecast:$('#turnForecast'),
  heritage:$('#heritageToken'),sacrifice:$('#sacrificeBtn'),items:$('#itemRack'),endTurn:$('#endTurnBtn'),deckBtn:$('#deckBtn'),deckCount:$('#deckCount'),hand:$('#hand'),
  menu:$('#menuTray'),continue:$('#continueBtn'),continueMeta:$('#continueMeta'),newRun:$('#newRunBtn'),rules:$('#rulesBtn'),
  route:$('#routeTablet'),routeDepth:$('#routeDepth'),routeTitle:$('#routeTitle'),routeChoices:$('#routeChoices'),routeRelics:$('#routeRelics'),routeItems:$('#routeItems'),
  event:$('#eventTray'),eventKicker:$('#eventKicker'),eventTitle:$('#eventTitle'),eventHint:$('#eventHint'),eventChoices:$('#eventChoices'),eventSkip:$('#eventSkip'),
  result:$('#resultPlaque'),resultKicker:$('#resultKicker'),resultTitle:$('#resultTitle'),resultText:$('#resultText'),resultDepth:$('#resultDepth'),resultKills:$('#resultKills'),resultSacrifices:$('#resultSacrifices'),again:$('#againBtn'),resultHome:$('#resultHomeBtn'),
  focus:$('#cardFocus'),focusClose:$('#focusClose'),focusCard:$('#focusCard'),focusName:$('#focusName'),focusText:$('#focusText'),focusSigils:$('#focusSigils'),
  ledger:$('#deckLedger'),ledgerClose:$('#ledgerClose'),ledgerStats:$('#ledgerStats'),relicStrip:$('#relicStrip'),deckList:$('#deckList'),
  settingsBtn:$('#settingsBtn'),settings:$('#settingsPanel'),settingsClose:$('#settingsClose'),sound:$('#soundToggle'),haptic:$('#hapticToggle'),rulesFromSettings:$('#rulesFromSettings'),abandon:$('#abandonBtn'),
  rulesPanel:$('#rulesPanel'),rulesClose:$('#rulesClose'),
  confirm:$('#confirmBox'),confirmText:$('#confirmText'),confirmCancel:$('#confirmCancel'),confirmOk:$('#confirmOk'),toast:$('#toast'),actionHint:$('#actionHint'),cancelCard:$('#cancelCard'),cast:$('#castBtn'),itemHint:$('#itemHint')
};

let mode='menu';
let run=null;
let profile=load(PROFILE_KEY,createProfile());
let prefs={sound:true,haptic:true,...load(PREF_KEY,{})};
let selectedCard=null;
let selectedUnit=null;
let selectedItem=null;
let heritageChoice=null;
let eventStage=null;
let confirmAction=null;
let toastTimer=0;
let resultCommitted=false;
let motionTimer=0;
let beatTimer=0;
let trackedBattleSeed=null;
let seenPlayerUnits=new Set();
let seenEnemyUnits=new Set();
let resolvingTurn=false;
let sceneToken=0,finishTimer=0,activeDelay=null,cancelDrag=null;
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const wait=ms=>new Promise(resolve=>{if(document.hidden||reduced.matches){resolve();return}const timer=setTimeout(()=>{activeDelay=null;resolve()},ms);activeDelay=()=>{clearTimeout(timer);activeDelay=null;resolve()}});
function blocked(){return resolvingTurn||mode!=='battle'||!run?.battle||run.battle.ended||!el.settings.hidden||!el.focus.hidden||!el.ledger.hidden||!el.rulesPanel.hidden||!el.confirm.hidden}
function publishState(){window.__AI_TEST_STATE__={app:'morok',mode,busy:resolvingTurn,depth:run?.depth,round:run?.battle?.round,seals:run?.battle?.seals,hand:run?.battle?.hand.map(c=>({id:c.instanceId,name:c.name,cost:c.cost,costType:c.costType,type:c.type})),player:run?.battle?.player.map(u=>u?{name:u.name,atk:u.atk,hp:u.hp}:null),enemy:run?.battle?.enemy.map(u=>u?{name:u.name,atk:u.atk,hp:u.hp}:null),pending:run?.pending?.type,result:run?.result}}

function load(key,fallback){try{return JSON.parse(localStorage.getItem(key)||'null')??fallback}catch{return fallback}}
function readRun(){
  for(const key of [RUN_KEY,OLD_RUN_KEY]){
    try{const raw=localStorage.getItem(key);if(raw){const parsed=hydrateRun(raw);if(key===OLD_RUN_KEY){localStorage.removeItem(OLD_RUN_KEY);localStorage.setItem(RUN_KEY,JSON.stringify(parsed))}return parsed}}catch(e){console.warn('[MOROK] bad save',e)}
  }
  return null;
}
function save(clearRun=false){
  try{
    if(run){run.log=run.log.slice(0,24);if(run.battle){run.battle.log=run.battle.log.slice(0,24);run.battle.events=[]}localStorage.setItem(RUN_KEY,JSON.stringify(run))}else if(clearRun)localStorage.removeItem(RUN_KEY);
    localStorage.setItem(PROFILE_KEY,JSON.stringify(profile));localStorage.setItem(PREF_KEY,JSON.stringify(prefs));
  }catch(e){console.warn('[MOROK] save failed',e)}
}
function setHidden(node,hidden){if(node)node.hidden=hidden}
function hidePanels(){el.settings.hidden=true;el.rulesPanel.hidden=true;el.ledger.hidden=true;el.focus.hidden=true}
function setMode(next){
  cancelDrag?.();activeDelay?.();hidePanels();el.confirm.hidden=true;confirmAction=null;clearTimeout(finishTimer);sceneToken++;resolvingTurn=false;delete el.app.dataset.resolving;if(next==='route'&&run?.battle)next='battle';else if(next==='route'&&run?.pending)next='event';mode=next;el.app.dataset.mode=next;try{sessionStorage.setItem(VIEW_KEY,next)}catch{}
  setHidden(el.menu,next!=='menu');setHidden(el.route,next!=='route');setHidden(el.event,next!=='event');setHidden(el.result,next!=='result');
  selectedCard=null;selectedUnit=null;selectedItem=null;heritageChoice=null;eventStage=null;
  render();publishState();
}
function toast(text){clearTimeout(toastTimer);el.toast.textContent=text;el.toast.classList.add('show');toastTimer=setTimeout(()=>el.toast.classList.remove('show'),1500)}
function confirm(text,fn){el.confirmText.textContent=text;confirmAction=fn;el.confirm.hidden=false;feedback('warning')}
function opponentAction(action='react'){
  clearTimeout(motionTimer);el.opponent.dataset.action=action;
  motionTimer=setTimeout(()=>{delete el.opponent.dataset.action},520);
}
function sceneBeat(kind='impact'){
  clearTimeout(beatTimer);el.app.dataset.beat=kind;
  beatTimer=setTimeout(()=>{delete el.app.dataset.beat},460);
}
function updateWallSeal(){
  const available=!!run && run.depth>=3 && !run.secrets?.wallSeal && mode!=='menu' && mode!=='result';
  el.wallSeal.classList.toggle('available',available);
  el.wallSeal.classList.toggle('used',!!run?.secrets?.wallSeal);
}
function claimWallSeal(){
  if(resolvingTurn||!run||run.depth<3||run.secrets?.wallSeal)return;
  run.secrets={...(run.secrets||{}),wallSeal:true};
  const gainId=['small-bell','red-thread','black-candle'].find(id=>!run.relics.includes(id));
  if(gainId){
    run.relics.push(gainId);
    const relic=RELICS.find(x=>x.id===gainId);
    toast(`Скрытый знак найден: ${relic.name}. ${relic.text}`);
  }else{
    if(run.items.length>=3)run.items.shift();
    run.items.push('bell');
    toast('Скрытый знак найден: добавлен Железный колокол.');
  }
  el.wallSeal.classList.add('revealed');feedback('reward');sceneBeat('reward');save();render();
  setTimeout(()=>el.wallSeal.classList.remove('revealed'),900);
}

class MaterialAudio{
  constructor(){this.ctx=null;this.noiseBuffer=null;this.ambience=null;this.ambGain=null}
  async ensure(){
    if(!prefs.sound)return null;
    const A=window.AudioContext||window.webkitAudioContext;if(!A)return null;
    if(!this.ctx){this.ctx=new A();this.makeNoise();this.startAmbience()}
    if(this.ctx.state==='suspended')await this.ctx.resume();
    return this.ctx;
  }
  makeNoise(){
    if(!this.ctx)return;const len=this.ctx.sampleRate*2.5,b=this.ctx.createBuffer(1,len,this.ctx.sampleRate),d=b.getChannelData(0);
    let last=0;for(let i=0;i<len;i++){const white=Math.random()*2-1;last=last*.985+white*.015;d[i]=white*.22+last*.78}this.noiseBuffer=b;
  }
  startAmbience(){
    if(!this.ctx||!this.noiseBuffer||this.ambience)return;
    const s=this.ctx.createBufferSource(),f=this.ctx.createBiquadFilter(),g=this.ctx.createGain();
    s.buffer=this.noiseBuffer;s.loop=true;f.type='lowpass';f.frequency.value=480;g.gain.value=.012;s.connect(f).connect(g).connect(this.ctx.destination);s.start();this.ambience=s;this.ambGain=g;
  }
  burst({dur=.08,gain=.08,freq=700,type='bandpass',rate=1}={}){
    if(!this.ctx||!this.noiseBuffer)return;const n=this.ctx.currentTime,s=this.ctx.createBufferSource(),f=this.ctx.createBiquadFilter(),g=this.ctx.createGain();
    s.buffer=this.noiseBuffer;s.playbackRate.value=rate;f.type=type;f.frequency.value=freq*(.94+Math.random()*.12);f.Q.value=.7;g.gain.setValueAtTime(gain,n);g.gain.exponentialRampToValueAtTime(.0001,n+dur);s.connect(f).connect(g).connect(this.ctx.destination);s.start(n,Math.random());s.stop(n+dur);
  }
  tone(freq=120,dur=.12,gain=.04,type='sine'){freq*=.96+Math.random()*.08;
    if(!this.ctx)return;const n=this.ctx.currentTime,o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type=type;o.frequency.setValueAtTime(freq,n);o.frequency.exponentialRampToValueAtTime(Math.max(32,freq*.68),n+dur);g.gain.setValueAtTime(gain,n);g.gain.exponentialRampToValueAtTime(.0001,n+dur);o.connect(g).connect(this.ctx.destination);o.start(n);o.stop(n+dur+.01);
  }
  play(kind='wood'){
    if(!prefs.sound||document.hidden)return;void this.ensure().then(()=> {if(!prefs.sound||document.hidden)return;
      const variance=.92+Math.random()*.16;
      if(kind==='pickup'){this.burst({dur:.09,gain:.05,freq:1100*variance,rate:variance});this.tone(170*variance,.08,.018,'triangle')}
      else if(kind==='swing'){this.burst({dur:.1,gain:.065,freq:850*variance,rate:.8*variance})}
      else if(kind==='hit'){this.burst({dur:.07,gain:.11,freq:500*variance,rate:variance});this.tone(110*variance,.09,.03,'triangle')}
      else if(kind==='death'){this.burst({dur:.27,gain:.08,freq:1500*variance,type:'highpass',rate:.65*variance});this.tone(65*variance,.2,.025)}
      else if(kind==='card'){this.burst({dur:.055,gain:.08,freq:1700,type:'highpass',rate:1.35});setTimeout(()=>this.tone(92,.055,.025,'triangle'),18)}
      else if(kind==='wood'){this.burst({dur:.07,gain:.11,freq:430,type:'bandpass',rate:.65});this.tone(72,.08,.035,'sine')}
      else if(kind==='bone'){this.burst({dur:.025,gain:.09,freq:2600,type:'bandpass',rate:1.9});setTimeout(()=>this.burst({dur:.02,gain:.055,freq:3200,type:'bandpass',rate:2.1}),35)}
      else if(kind==='knife'){this.burst({dur:.12,gain:.085,freq:2800,type:'highpass',rate:1.6});setTimeout(()=>this.burst({dur:.08,gain:.1,freq:380,type:'lowpass',rate:.6}),55)}
      else if(kind==='bell'){this.tone(410,.65,.035,'sine');this.tone(615,.55,.016,'sine');this.tone(820,.4,.009,'sine')}
      else if(kind==='impact'){this.burst({dur:.15,gain:.13,freq:250,type:'lowpass',rate:.48});this.tone(48,.18,.05,'triangle')}
      else if(kind==='paper'){this.burst({dur:.16,gain:.035,freq:2100,type:'highpass',rate:1.1})}
      else if(kind==='warning'){this.tone(66,.18,.04,'triangle')}
      else if(kind==='reward'){this.tone(220,.22,.025,'sine');setTimeout(()=>this.tone(330,.26,.018,'sine'),70)}
      else if(kind==='loss'){this.tone(72,.45,.05,'triangle');setTimeout(()=>this.burst({dur:.3,gain:.06,freq:180,type:'lowpass',rate:.4}),40)}
    }).catch(()=>{});
  }
  setEnabled(on){if(this.ambGain)this.ambGain.gain.setTargetAtTime(on?.012:0,this.ctx.currentTime,.08);if(this.ctx){if(!on)void this.ctx.suspend();else void this.ctx.resume()}}
}
const audio=new MaterialAudio();
function haptic(pattern=7){if(prefs.haptic&&navigator.vibrate)navigator.vibrate(pattern)}
function feedback(kind='wood'){
  audio.play(kind);
  if(kind==='knife'||kind==='impact')haptic([11,22,13]);else if(kind==='warning')haptic([7,28,7]);else if(kind==='bell')haptic(12);else haptic(5);
}

const opponentLines={
  menu:['Садись.','Я тебя помню.','Дверь за собой закрой.'],
  route:['За той дверью тоже кто-то ждёт.','Не все комнаты пусты.','Слышишь колокол?' ],
  play:['Пусть лежит.','Эту я знаю.','Посмотрим.'],
  sacrifice:['Нож оставь на столе.','Кости не выбрасывай.'],
  damage:['Ещё одна треснула.','Я считал.'],
  hurt:['Теперь моя очередь.','Не отворачивайся.'],
  mutation:['Назад уже не срастётся.','Теперь узнаю.']
};
function pick(arr,seed=Date.now()){if(!arr?.length)return'';return arr[Math.abs((seed|0))%arr.length]}
function talk(text){el.speech.textContent=text}
function contextualTalk(kind){talk(pick(opponentLines[kind]||opponentLines.play,(run?.seed||0)+(run?.stats?.cardsPlayed||0)+(run?.battle?.round||0)))}
function setOpponent(){
  const boss=run?.battle?.bossId?bossInfo(run.battle.bossId):null;
  el.opponent.dataset.boss=boss?.id||'dealer';
  el.maskMark.textContent=boss?.id==='warden'?'⊠':boss?.id==='bellkeeper'?'◉':boss?.id==='prior'?'◇':'†';
  if(mode==='menu')talk(pick(opponentLines.menu,profile.totalRuns||0));
  else if(mode==='route')contextualTalk('route');
  else if(mode==='battle'&&boss)talk(boss.text);
  else if(mode==='battle')talk('Не спеши. Я подожду.');
  else if(mode==='event')talk('Всё не унесёшь.');
  else if(mode==='result')talk(run?.result==='won'?'Можешь идти.':'Оставь карты.');
}

function newRun(){
  cancelDrag?.();profile.totalRuns=(profile.totalRuns||0)+1;run=createRun(Date.now(),profile);resultCommitted=false;save();void audio.ensure();feedback('card');setMode('route');
}
function continueRun(auto=false){
  run=readRun();if(!run){newRun();return}
  if(run.battle?.ended&&run.battle.winner==='player')afterBattleVictory(run);
  resultCommitted=!!run.resultProfiled;if(auto!==true)void audio.ensure();setMode(run.result?'result':run.battle?'battle':run.pending?'event':'route');
}
function finishProfile(){
  if(!run?.result||resultCommitted)return;
  profile.bestDepth=Math.max(profile.bestDepth||0,Math.min(run.depth+1,run.maxDepth));if(run.result==='won')profile.wins=(profile.wins||0)+1;
  run.resultProfiled=true;resultCommitted=true;save();
}
function abandon(){cancelDrag?.();run=null;save(true);hidePanels();setMode('menu')}

function render(){
  renderMenu();setOpponent();updateWallSeal();renderSeals(run?.battle?.seals||{player:0,enemy:0});
  if(!run)return;
  el.deckCount.textContent=run.deck.length;
  if(mode==='route')renderRoute();
  if(mode==='battle')renderBattle();
  if(mode==='event')renderEvent();
  if(mode==='result')renderResult();
}
function renderMenu(){
  const saved=readRun();el.continue.hidden=!saved;
  if(saved)el.continueMeta.textContent=saved.result?(saved.result==='won'?'последняя сдача завершена':'записано поражение'):`глубина ${saved.depth+1} · ${saved.deck.length} карт`;
  el.sound.querySelector('b').textContent=prefs.sound?'ВКЛ':'ВЫКЛ';el.haptic.querySelector('b').textContent=prefs.haptic?'ВКЛ':'ВЫКЛ';
}
const roman=n=>['I','II','III','IV','V','VI','VII','VIII','IX'][n-1]||String(n);
const nodeIcon=t=>({battle:'╳',boss:'♜',cache:'▣',altar:'†',hearth:'⌂',omen:'◇',item:'⌗'})[t]||'·';
function renderRoute(){
  if(run.result){setMode('result');return}
  const stage=run.trail[run.depth]||[];
  el.routeDepth.textContent=`ГЛУБИНА ${roman(run.depth+1)} / ${roman(run.maxDepth)}`;
  el.routeTitle.textContent=stage.length===1?(stage[0].type==='boss'?`${bossInfo(stage[0].bossId)?.name||'Босс'} · бой с боссом`:'Доступен один следующий узел.'):'Выбери следующий узел.';
  el.routeRelics.textContent=`${run.relics.length} знаков`;el.routeItems.textContent=`${run.items.length}/3 предметов`;el.routeChoices.replaceChildren();
  stage.forEach(node=>{
    const b=document.createElement('button');b.type='button';b.className='route-node';
    const boss=node.type==='boss'?bossInfo(node.bossId):null;
    b.innerHTML=`<b>${nodeIcon(node.type)}</b><span>${boss?.name||nodeLabel(node.type)}</span><small>${node.elite&&node.type==='battle'?'УСИЛЕННАЯ СДАЧА':node.type==='boss'?'ПРАВИЛА ИЗМЕНЯТСЯ':'ОТКРЫТЬ'}</small>`;
    b.addEventListener('click',()=>{feedback(node.type==='boss'?'bell':'wood');const r=resolveNode(run,node);if(!r.ok){toast(r.reason);return}save();setMode(r.type==='battle'?'battle':'event')});el.routeChoices.append(b);
  });
}

function renderSeals(scores=run?.battle?.seals||{player:0,enemy:0},breaking=null){
  const make=(root,broken,side)=>{root.replaceChildren();for(let i=0;i<SEAL_LIMIT;i++){const mark=document.createElement('i');mark.className='seal-mark'+(i<broken?' broken':'');if(breaking?.side===side&&breaking.index===i)mark.classList.add('breaking');root.append(mark)}};
  make(el.enemySeals,scores.player,'player');make(el.playerSeals,scores.enemy,'enemy');el.sealStatus.textContent=`${scores.player} : ${scores.enemy}`
}
function renderBattle(){
  const b=run.battle;if(!b){setMode(run.pending?'event':'route');return}
  renderSeals();el.ember.textContent=b.ember;el.remains.textContent=b.remains;el.round.textContent=`ХОД ${b.round}${b.bossId?` · ${b.phase}/${b.phasesTotal}`:''}`;
  renderIntent(b);renderRows(b);renderHand(b);renderItems(b);renderSelection(b);highlightTargets();publishState();
  renderForecast(b);
}
function renderForecast(b){
  const forecast=forecastTurn(run,b);if(!forecast)return;
  const text=forecast.winner==='player'?'Его печати не выдержат.':forecast.winner==='enemy'?'Твои печати не выдержат.':forecast.phase?'Приор сменит правила.':`Его печати −${forecast.damage.player} · твои −${forecast.damage.enemy}`;
  el.forecast.textContent=text;el.forecast.dataset.danger=String(forecast.winner==='enemy');el.forecast.dataset.win=String(forecast.winner==='player');
  el.endTurn.setAttribute('aria-label',`Закончить ход. ${text}`);
  for(const node of $$('.unit-card')){
    const result=forecast.units[node.dataset.unitId];if(!result)continue;
    node.classList.toggle('will-die',result.dead);
    if(result.dead||result.hp<Number(node.querySelector('.unit-stats span')?.textContent.replace(/[^0-9]/g,''))){
      const mark=document.createElement('small');mark.className='wound-mark';mark.textContent=result.dead?'×':`→${result.hp}`;mark.setAttribute('aria-label',result.dead?'Погибнет после удара':`После удара: ${result.hp} здоровья`);node.append(mark);
    }
  }
}
function renderIntent(b){
  el.intent.replaceChildren();
  for(let lane=0;lane<4;lane++){
    const p=b.intent.find(x=>x.lane===lane),n=document.createElement(p?'button':'div');n.className='intent-card'+(p?'':' empty');
    if(p){n.type='button';n.innerHTML=artSvg(p.unit,true)+`<b>${p.unit.atk}/${p.unit.hp}</b>`;n.setAttribute('aria-label',`${p.unit.name}, появится на месте ${lane+1} после удара`);n.addEventListener('click',()=>{if(blocked())return;openFocus(p.unit);el.focusText.textContent='Выйдет после этого удара. Атаковать начнёт со следующего.'})}el.intent.append(n);
  }
}
function renderRows(b){
  if(trackedBattleSeed!==b.seed){trackedBattleSeed=b.seed;seenPlayerUnits=new Set();seenEnemyUnits=new Set()}
  const nextEnemy=new Set(b.enemy.filter(Boolean).map(u=>u.instanceId));
  const nextPlayer=new Set(b.player.filter(Boolean).map(u=>u.instanceId));
  renderRow(el.enemy,b.enemy,'enemy',b,seenEnemyUnits);renderRow(el.player,b.player,'player',b,seenPlayerUnits);
  seenEnemyUnits=nextEnemy;seenPlayerUnits=nextPlayer;
}
function renderRow(root,units,side,b,seen){
  root.replaceChildren();for(let lane=0;lane<4;lane++){
    const btn=document.createElement('button');btn.type='button';btn.className='lane';btn.dataset.side=side;btn.dataset.lane=lane;btn.setAttribute('aria-label',`${side==='player'?'Твоя':'Вражеская'} линия ${lane+1}${units[lane]?': '+units[lane].name:' — пусто'}`);
    if(lane===b.lockedLane)btn.classList.add('locked');const u=units[lane];
    if(u){const cardNode=makeUnitNode(u,side,`${side==='player'&&selectedUnit===lane?' selected':''}${seen.has(u.instanceId)?'':' just-placed'}`);btn.append(cardNode)}
    if(u)attachCardInput(btn,u,()=>laneTap(side,lane,btn));else btn.addEventListener('click',()=>laneTap(side,lane,btn));root.append(btn);
  }
}
function makeUnitNode(u,side,extra=''){
  const board=run?.battle?.[side]||[],lane=board.findIndex(x=>x?.instanceId===u.instanceId),attack=u.atk+(u.sigils?.includes('pack')?Number(!!board[lane-1])+Number(!!board[lane+1]):0);
  const node=document.createElement('div');node.className=`unit-card ${side}${extra}`;node.dataset.unitId=u.instanceId||'';node.dataset.unitName=u.name||'';
  node.innerHTML=`${artSvg(u,side==='enemy')}<div class="unit-name">${u.name}</div><div class="unit-stats"><b>⚔${attack}</b><span>♥${u.hp}</span><i>${(u.sigils||[]).map(s=>sigilInfo(s).mark).join('')}</i></div>`;
  return node
}
function unitNodeById(id){if(!id)return null;return $$('.unit-card').find(n=>n.dataset.unitId===id)||null}
function laneNode(side,lane){return (side==='player'?el.player:el.enemy)?.children?.[lane]||null}
function showCombatCaption(main='',sub='',kind=''){
  el.combatCaptionMain.textContent=main;el.combatCaptionSub.textContent=sub;el.combatCaption.className='combat-caption'+(kind?' '+kind:'');el.combatCaption.hidden=false
}
function hideCombatCaption(){el.combatCaption.hidden=true}
function splinters(target,count=7,death=false){
  if(!target||reduced.matches||document.hidden)return;const r=target.getBoundingClientRect(),root=el.app.getBoundingClientRect();
  for(let i=0;i<count;i++){const n=document.createElement('i');n.className='splinter'+(death?' ash':'');n.style.left=(r.left+r.width/2-root.left)+'px';n.style.top=(r.top+r.height/2-root.top)+'px';el.app.append(n);
    const angle=Math.random()*Math.PI*2,distance=12+Math.random()*(death?68:35);const animation=n.animate([{transform:'translate(0,0) rotate(0)',opacity:1},{transform:`translate(${Math.cos(angle)*distance}px,${Math.sin(angle)*distance+25}px) rotate(${Math.random()*290}deg)`,opacity:0}],{duration:death?450:300,easing:'ease-out'});animation.finished.finally(()=>n.remove());
  }
}
function floatDamage(side,lane,text,kind=''){
  const laneEl=laneNode(side,lane);if(!laneEl)return;
  const n=document.createElement('span');n.className='damage-float'+(kind?' '+kind:'');n.textContent=text;laneEl.append(n);setTimeout(()=>n.remove(),520)
}
async function animateCombat(events,beforeSeals,token=sceneToken){
  let visual={player:beforeSeals.player||0,enemy:beforeSeals.enemy||0};
  for(const event of events||[]){
    if(token!==sceneToken||document.hidden)break;
    if(event.type==='sequence'){
      showCombatCaption(event.label==='player'?'ТВОЙ УДАР':'ЕГО УДАР','','');
      if(event.label==='enemy')opponentAction('deal');await wait(120);hideCombatCaption();continue
    }
    if(event.type==='attack'){
      const attacker=unitNodeById(event.attackerId),target=unitNodeById(event.targetId),heavy=event.amount>=3;
      const destination=target|| (event.side==='player'?el.enemySeals:el.playerSeals);
      if(attacker&&!reduced.matches){
        const a=attacker.getBoundingClientRect(),t=destination.getBoundingClientRect(),direction=event.side==='player'?-1:1;
        const dy=(t.top+t.height/2-a.top-a.height/2)*.68;
        attacker.style.zIndex='50';const lane=attacker.closest('.lane');if(lane)lane.style.zIndex='50';
        const animation=attacker.animate([{transform:'translateY(0) scale(1)'},{transform:`translateY(${-direction*7}px) scale(.97,1.03)`,offset:.3},{transform:`translateY(${dy}px) scale(${heavy?1.1:1.05},.95)`,offset:.57},{transform:'translateY(0) scale(1)'}],{duration:heavy?360:300,easing:'cubic-bezier(.2,.7,.3,1)'});
        animation.finished.finally(()=>{attacker.style.zIndex='';if(lane)lane.style.zIndex=''});
      }
      feedback('swing');await wait(heavy?170:140);hideCombatCaption();continue;
    }
    if(event.type==='move'){
      const unit=unitNodeById(event.unitId),destination=laneNode(event.side,event.lane);
      if(unit&&destination){const from=unit.getBoundingClientRect(),to=destination.getBoundingClientRect();const animation=!reduced.matches?unit.animate([{transform:'translate(0,0) rotate(0)'},{transform:`translate(${(to.left-from.left)*.5}px,-7px) rotate(3deg)`,offset:.5},{transform:`translate(${to.left-from.left}px,0) rotate(0)`}],{duration:180,fill:'forwards',easing:'ease-out'}):null;feedback('pickup');await wait(180);destination.replaceChildren(unit);animation?.cancel();feedback('wood')}continue;
    }
    if(event.type==='ward'){
      const target=unitNodeById(event.unitId);target?.classList.add('combat-ward');floatDamage(event.side,event.lane,'0','ward');feedback('bone');
      await wait(150);target?.classList.remove('combat-ward');hideCombatCaption();continue
    }
    if(event.type==='damage'){
      const target=unitNodeById(event.unitId);target?.classList.add('combat-hit');floatDamage(event.side,event.lane,`−${event.amount}`,event.source==='attack'?'':'minor');
      const sourceLabel={thorn:'Шип',bleed:'Разрез',chain:'Цепь'}[event.source]||'Урон';
      splinters(target,event.amount>=3?12:6);feedback(event.amount>=3?'impact':'hit');sceneBeat(event.amount>=3?'impact':'tap');
      const hp=target?.querySelector('.unit-stats span');if(hp)hp.textContent=`♥${event.hpAfter}`;await wait(event.source==='attack'?125:85);
      target?.classList.remove('combat-hit');hideCombatCaption();continue
    }
    if(event.type==='death'){
      const target=unitNodeById(event.unitId);splinters(target,15,true);target?.classList.add('combat-dying');feedback('death');await wait(210);if(target)target.style.visibility='hidden';hideCombatCaption();continue
    }
    if(event.type==='spawn'){
      const laneEl=laneNode(event.side,event.lane);if(laneEl){laneEl.replaceChildren();const node=makeUnitNode(event.unit,event.side,' resolution-spawn');laneEl.append(node);(event.side==='player'?seenPlayerUnits:seenEnemyUnits).add(event.unit.instanceId);if(event.side==='enemy')opponentAction('deal');feedback('card');await wait(155);hideCombatCaption()}continue
    }
    if(event.type==='seal'){
      const from=event.before,to=event.after;visual[event.side]=from;feedback(event.amount>=3?'impact':'bone');opponentAction(event.side==='player'?'react':'deal');
      for(let i=from;i<to;i++){visual[event.side]=i+1;renderSeals(visual,{side:event.side,index:i});sceneBeat(event.amount>=3?'impact':'tap');await wait(45)}
      await wait(55);hideCombatCaption();continue
    }
    if(event.type==='buff'){floatDamage(event.side,event.lane,'+1 ⚔','ward');const n=unitNodeById(event.unitId);const a=n?.querySelector('.unit-stats b');if(a)a.textContent=`⚔${Number(a.textContent.replace(/[^0-9]/g,''))+1}`;await wait(80);hideCombatCaption();continue}
    if(event.type==='lock'){showCombatCaption(`ЛИНИЯ ${event.lane+1} ЗАБЛОКИРОВАНА`,'Смотритель','');feedback('warning');opponentAction('boss');await wait(260);hideCombatCaption();continue}
    if(event.type==='phase'){showCombatCaption('ФАЗА II','Приор: печати восстановлены, максимум Угля — 2.','death');renderSeals({player:0,enemy:0});feedback('warning');opponentAction('boss');sceneBeat('boss');await wait(350);hideCombatCaption();continue}
    if(event.type==='round'){el.turnCueText.textContent=`ХОД ${event.round}`;el.turnCue.hidden=false;feedback('bell');await wait(240);el.turnCue.hidden=true;continue}
    if(event.type==='battle-end'){showCombatCaption(event.winner==='player'?'ПОБЕДА':'ПОРАЖЕНИЕ',event.winner==='player'?'Все печати противника разрушены.':'Все твои печати разрушены.',event.winner==='player'?'':'death');await wait(240);hideCombatCaption()}
  }
  if(token===sceneToken)renderSeals(run?.battle?.seals||visual)
}
function cardAffordable(card,b){
  if(card.costType==='remains')return b.remains>=card.cost;
  if(card.costType==='ember')return b.ember>=Math.max(0,card.cost-(run.relics.includes('moth-lantern')&&!b.firstDiscountUsed?1:0));
  return true;
}
function renderHand(b){
  el.hand.replaceChildren();
  b.hand.forEach(card=>{
    const n=createCard(card,true);if(card.instanceId===selectedCard)n.classList.add('selected');if(!cardAffordable(card,b))n.classList.add('disabled');
    n.dataset.faction=card.faction;n.style.setProperty('--index',b.hand.indexOf(card));n.style.setProperty('--count',b.hand.length);attachCardInput(n,card,()=>selectHandCard(card),true);el.hand.append(n);
  });
}
function attachCardInput(node,card,onTap,draggable=false){
  let gesture=null,suppressClick=false;
  const cleanup=()=>{if(!gesture)return;clearTimeout(gesture.timer);node.classList.remove('holding');gesture=null};
  node.addEventListener('pointerdown',e=>{
    if(e.button!==0||gesture||(draggable&&blocked()))return;
    suppressClick=false;gesture={id:e.pointerId,x:e.clientX,y:e.clientY,dragging:false,ghost:null,long:false};
    node.classList.add('holding');
    gesture.timer=setTimeout(()=>{if(!gesture||gesture.dragging)return;gesture.long=true;suppressClick=true;openFocus(card);feedback('paper');node.classList.remove('holding')},450);
    if(draggable)node.setPointerCapture(e.pointerId);
  });
  node.addEventListener('pointermove',e=>{
    const g=gesture;if(!g||g.id!==e.pointerId)return;
    const dx=e.clientX-g.x,dy=e.clientY-g.y;
    if(Math.hypot(dx,dy)>8){clearTimeout(g.timer);node.classList.remove('holding');if(!draggable){suppressClick=true;return}if(g.long)return;
      if(!g.dragging){g.dragging=true;suppressClick=true;selectedCard=card.instanceId;selectedUnit=null;selectedItem=null;
        g.ghost=createCard(card,false);g.ghost.classList.add('drag-card');el.app.append(g.ghost);node.classList.add('drag-origin');feedback('pickup');renderSelection(run.battle);highlightTargets();cancelDrag=()=>finish(true)}
      e.preventDefault();const r=el.app.getBoundingClientRect();g.ghost.style.left=(e.clientX-r.left)+'px';g.ghost.style.top=(e.clientY-r.top)+'px';g.ghost.style.setProperty('--tilt',Math.max(-8,Math.min(8,dx*.04))+'deg');
      const target=document.elementFromPoint(e.clientX,e.clientY)?.closest('.lane');$$('.lane').forEach(n=>n.classList.toggle('drop-target',n===target));
    }
  });
  function finish(cancelled=false,e=null){
    const g=gesture;if(!g)return;
    if(g.dragging){const target=!cancelled&&e?document.elementFromPoint(e.clientX,e.clientY)?.closest('.lane'):null;
      if(target){laneTap(target.dataset.side,Number(target.dataset.lane),target)}else{selectedCard=null;renderSelection(run.battle);highlightTargets()}
      const dest=target?.classList.contains('valid')?target:node,rect=dest.getBoundingClientRect(),root=el.app.getBoundingClientRect();
      g.ghost.style.transition='left .16s ease,top .16s ease,opacity .16s';g.ghost.style.left=(rect.left+rect.width/2-root.left)+'px';g.ghost.style.top=(rect.top+rect.height/2-root.top)+'px';g.ghost.style.opacity='0';setTimeout(()=>g.ghost.remove(),180);
      node.classList.remove('drag-origin');$$('.lane').forEach(n=>n.classList.remove('drop-target'));cancelDrag=null;
    }
    cleanup();if(node.hasPointerCapture?.(g.id))node.releasePointerCapture(g.id);
  }
  node.addEventListener('pointerup',e=>finish(false,e));node.addEventListener('pointercancel',()=>{suppressClick=true;finish(true)});
  node.addEventListener('lostpointercapture',()=>finish(true));
  node.addEventListener('pointerleave',()=>{if(!draggable){clearTimeout(gesture?.timer);node.classList.remove('holding')}});
  node.addEventListener('click',e=>{if(suppressClick){e.preventDefault();suppressClick=false;return}onTap?.()});
  node.addEventListener('contextmenu',e=>{e.preventDefault();if(!draggable||!blocked())openFocus(card)});
}
function selectHandCard(card){
  if(blocked())return;selectedCard=selectedCard===card.instanceId?null:card.instanceId;selectedUnit=null;selectedItem=null;heritageChoice=null;feedback('pickup');renderBattle();
}
async function resolveAction(action){
  if(blocked())return;const battle=run.battle,owner=run,token=sceneToken,beforeSeals={...battle.seals};
  const r=action();if(!r.ok)return r;el.ember.textContent=battle.ember;el.remains.textContent=battle.remains;feedback('wood');
  resolvingTurn=true;el.app.dataset.resolving='true';selectedCard=null;selectedItem=null;selectedUnit=null;heritageChoice=null;
  const events=r.events||[];save();publishState();
  try{await animateCombat(events,beforeSeals,token)}
  finally{if(run===owner&&sceneToken===token){resolvingTurn=false;delete el.app.dataset.resolving;renderBattle();hideCombatCaption();el.turnCue.hidden=true}}
  if(run!==owner||sceneToken!==token)return r;
  if(r.ended)resolveBattleEnd(r);else if(r.phase){talk('Свечу не трогай. Теперь света меньше.');opponentAction('boss')}else if(events.some(e=>e.type==='seal'))contextualTalk(events.some(e=>e.type==='seal'&&e.side==='enemy')?'hurt':'damage');else if(events.some(e=>e.type==='death'&&e.cause==='sacrifice'))contextualTalk('sacrifice');
  return r;
}
function selectedCardObj(){return run?.battle?.hand.find(c=>c.instanceId===selectedCard)||null}
function highlightTargets(){
  $$('.lane').forEach(n=>n.classList.remove('valid','unavailable'));const b=run?.battle,c=selectedCardObj();if(!b)return;
  if(selectedItem==='knife'){$$('#playerRow .lane').forEach((n,i)=>{if(b.player[i])n.classList.add('valid')});return}
  if(!c&&selectedUnit!==null){$$('#playerRow .lane').forEach((n,i)=>{n.classList.toggle('valid',canMove(b,selectedUnit,i).ok);n.classList.toggle('unavailable',i!==selectedUnit&&!canMove(b,selectedUnit,i).ok)});return}
  if(!c)return;
  $$('.lane').forEach(n=>{const side=n.dataset.side,lane=Number(n.dataset.lane);const correct=c.type==='creature'?side==='player':c.rite==='salt'?side==='enemy':['bark','needle','molt','nails'].includes(c.rite)&&side==='player';const ok=correct&&canPlay(run,b,c,c.type==='creature'?lane:null,lane).ok;n.classList.toggle('valid',ok);n.classList.toggle('unavailable',!ok)});

}
function laneTap(side,lane,node){
  if(blocked())return;const b=run.battle;
  if(selectedItem==='knife'){
    if(side!=='player'||!b.player[lane]){bad(node,'Нож требует твою карту.');return}
    void resolveAction(()=>useItem(run,b,'knife',lane));return;
  }
  const card=selectedCardObj();
  if(card){
    let playLane=null,target=null;
    if(card.type==='creature'&&side==='player')playLane=lane;
    else if(['bark','needle','molt','nails'].includes(card.rite)&&side==='player')target=lane;
    else if(card.rite==='salt'&&side==='enemy')target=lane;
    else{bad(node,'Эта карта требует другую цель.');return}
    const check=canPlay(run,b,card,playLane,target);if(!check.ok){bad(node,check.reason);return}
    void resolveAction(()=>playCard(run,b,card.instanceId,playLane,target));return;
  }
  if(side==='enemy'&&b.enemy[lane]){openFocus(b.enemy[lane]);return}
  if(side==='player'&&b.player[lane]){
    selectedUnit=selectedUnit===lane?null:lane;heritageChoice=selectedUnit!==null?b.player[lane].sigils[0]||null:null;feedback('bone');renderBattle();
  }else if(side==='player'&&selectedUnit!==null){
    const from=selectedUnit,check=canMove(b,from,lane);if(!check.ok){bad(node,check.reason);return}void resolveAction(()=>moveUnit(run,b,from,lane));
  }
}
function bad(node,msg){node?.classList.add('invalid');setTimeout(()=>node?.classList.remove('invalid'),260);toast(msg||'Нельзя.');feedback('warning')}
function renderSelection(b){
  const c=selectedCardObj();el.actionHint.textContent=c?`${c.name} · ${cardAffordable(c,b)?c.type==='creature'?'выбери пустое место':c.rite==='salt'?'выбери врага':['bark','needle','molt','nails'].includes(c.rite)?'выбери своего зверя':'подтверди ритуал':'не хватает '+(c.costType==='ember'?'угля':'костей')}`:selectedUnit!==null?b.movedThisTurn?'Сдвиг уже сделан':b.ember<1?'Сдвиг требует 1 уголь · или принеси жертву':'Сдвиг: соседнее место · 1 уголь':b.heritage?`Наследие: ${sigilInfo(b.heritage).name}`:'Перетащи карту · нажми на зверя для сдвига';el.cancelCard.hidden=!c&&!selectedItem&&selectedUnit===null;el.cast.hidden=!c||!['milk','whisper','lash'].includes(c.rite);
  const u=selectedUnit!==null?b.player[selectedUnit]:null;el.sacrifice.hidden=!u||b.sacrificedThisTurn;el.heritage.hidden=!u||!u.sigils.length;
  if(u?.sigils.length){if(!heritageChoice||!u.sigils.includes(heritageChoice))heritageChoice=u.sigils[0];const s=sigilInfo(heritageChoice);el.heritage.querySelector('span').textContent=s.mark;el.heritage.querySelector('small').textContent=s.name.toUpperCase();el.heritage.setAttribute('role','button');el.heritage.tabIndex=0}
}
function cycleHeritage(){
  const u=selectedUnit!==null?run?.battle?.player[selectedUnit]:null;if(!u||u.sigils.length<2)return;const i=Math.max(0,u.sigils.indexOf(heritageChoice));heritageChoice=u.sigils[(i+1)%u.sigils.length];feedback('bone');renderSelection(run.battle);
}
function doSacrifice(){
  if(blocked()||selectedUnit===null)return;const lane=selectedUnit,heritage=heritageChoice;
  void resolveAction(()=>sacrificeUnit(run,run.battle,lane,heritage));opponentAction('react');
}
function renderItems(b){
  el.items.replaceChildren();run.items.slice(0,3).forEach(id=>{
    const item=itemInfo(id);if(!item)return;const btn=document.createElement('button');btn.type='button';btn.className='item'+(selectedItem===id?' selected':'');btn.innerHTML=`<b>${item.mark}</b><small>${item.name}</small>`;
    btn.title=item.text;btn.setAttribute('aria-label',item.name+': '+item.text);btn.addEventListener('click',()=>{
      if(blocked())return;el.itemHint.textContent=item.text;
      if(item.target==='player'){selectedItem=selectedItem===id?null:id;selectedCard=null;selectedUnit=null;feedback('bone');renderBattle();highlightTargets();return}
      void resolveAction(()=>{const r=useItem(run,b,id,null);if(!r.ok){toast(r.reason);feedback('warning')}else feedback(id==='bell'?'bell':'bone');return r});
    });el.items.append(btn);
  });
}
async function doEndTurn(){return resolveAction(()=>endTurn(run,run.battle))}
function resolveBattleEnd(r){
  const owner=run;resolvingTurn=true;el.app.dataset.resolving='true';publishState();
  talk(r.winner==='player'?'Эти карты забери.':'На сегодня хватит.');
  clearTimeout(finishTimer);finishTimer=setTimeout(()=>{if(run!==owner)return;resolvingTurn=false;delete el.app.dataset.resolving;if(r.winner==='player')afterBattleVictory(run);save();setMode(run.result?'result':'event')},document.hidden?0:260);
}

function renderEvent(){
  const p=run.pending;if(!p){setMode(run.result?'result':'route');return}
  if(p.type==='battle'){setMode('battle');return}
  if(p.type==='run-win'){run.result='won';save();setMode('result');return}
  el.eventChoices.replaceChildren();el.eventSkip.hidden=true;
  const meta={
    'card-choice':['КАРТЫ','Одну забери.','Добавится в колоду. Остальные останутся здесь.'],
    'relic-choice':['ЗНАК','Выбери один постоянный знак.','Его эффект действует до конца забега.'],
    'item-choice':['ПРЕДМЕТ','Выбери один расходуемый предмет.','Одновременно можно нести до трёх предметов.'],
    hearth:['УЛУЧШЕНИЕ','Усиль одну карту.','Второе улучшение добавит случайную постоянную метку.'],
    altar:['ПЕРЕНОС МЕТКИ','Перенеси метку между картами.','Карта-донор будет удалена из колоды.']
  }[p.type]||['СОБЫТИЕ',p.title||'Выбери действие.',''];
  el.eventKicker.textContent=meta[0];el.eventTitle.textContent=(p.opening?p.title:meta[1]);el.eventHint.textContent=meta[2]||meta[1];
  if(p.type==='card-choice')renderCardReward(p);
  if(p.type==='relic-choice')renderRelicReward(p);
  if(p.type==='item-choice')renderItemReward(p);
  if(p.type==='hearth')renderHearth(p);
  if(p.type==='altar')renderAltar(p);
}
function choiceWrap(){const w=document.createElement('div');w.className='event-choice';return w}
function renderCardReward(p){
  p.choices.forEach(card=>{const w=choiceWrap(),c=createCard(card,false),b=document.createElement('button');b.type='button';b.className='choice-button';b.textContent='ВЗЯТЬ';attachCardInput(c,card,()=>{chooseCardReward(run,card.instanceId);feedback('reward');save();setMode('route')});b.addEventListener('click',()=>{chooseCardReward(run,card.instanceId);feedback('reward');save();setMode('route')});w.append(c,b);el.eventChoices.append(w)});el.eventSkip.hidden=false;
}
function renderRelicReward(p){
  p.choices.forEach(raw=>{const r=typeof raw==='string'?RELICS.find(x=>x.id===raw):raw;if(!r)return;const w=choiceWrap(),o=document.createElement('div'),b=document.createElement('button');o.className='choice-object';o.innerHTML=`<span class="big-mark">◇</span><b>${r.name}</b><p>${r.text}</p>`;b.className='choice-button';b.textContent='ВЗЯТЬ ЗНАК';b.addEventListener('click',()=>{chooseRelic(run,r.id);feedback('reward');save();setMode(run.result?'result':'route')});w.append(o,b);el.eventChoices.append(w)})
}
function renderItemReward(p){
  p.choices.forEach(raw=>{const item=typeof raw==='string'?itemInfo(raw):raw;if(!item)return;const w=choiceWrap(),o=document.createElement('div'),b=document.createElement('button');o.className='choice-object';o.innerHTML=`<span class="big-mark">${item.mark}</span><b>${item.name}</b><p>${item.text}</p>`;b.className='choice-button';b.textContent=run.items.length>=3?'ЗАМЕНИТЬ СТАРЫЙ':'ВЗЯТЬ';b.addEventListener('click',()=>{chooseItem(run,item.id);feedback('bone');save();setMode('route')});w.append(o,b);el.eventChoices.append(w)})
}
function renderHearth(){
  if(eventStage?.type==='upgrade'){renderUpgradeModes(eventStage.card);return}
  run.deck.filter(c=>c.type==='creature').forEach(card=>{const w=choiceWrap(),c=createCard(card,false),b=document.createElement('button');b.type='button';b.className='choice-button';b.textContent=card.upgrades?'ЕЩЁ ОДИН ШРАМ':'ОСТАВИТЬ ШРАМ';b.addEventListener('click',()=>{eventStage={type:'upgrade',card};renderEvent()});attachCardInput(c,card,()=>{eventStage={type:'upgrade',card};renderEvent()});w.append(c,b);el.eventChoices.append(w)})
}
function renderUpgradeModes(card){
  el.eventTitle.textContent=card.name;el.eventHint.textContent=card.upgrades>=1?'Второе улучшение добавит случайную постоянную метку. Выбери параметр.':'Клык: +1 атака. Кожа: +2 здоровья.';
  [['fang','КЛЫК','+1 атака'],['hide','КОЖА','+2 здоровья']].forEach(([mode,name,text])=>{const w=choiceWrap(),o=document.createElement('div'),b=document.createElement('button');o.className='choice-object';o.innerHTML=`<span class="big-mark">${mode==='fang'?'⌁':'□'}</span><b>${name}</b><p>${text}${card.upgrades>=1?' · + случайная метка':''}</p>`;b.className='choice-button';b.textContent='ПРИЖЕЧЬ';b.addEventListener('click',()=>{hearthUpgrade(run,card.instanceId,mode);feedback('knife');if(card.mutationLevel)contextualTalk('mutation');save();setMode('route')});w.append(o,b);el.eventChoices.append(w)})
}
function renderAltar(p){
  const donor=p.donor?run.deck.find(c=>c.instanceId===p.donor):null;
  el.eventHint.textContent=donor?`${donor.name}: перенос «${sigilInfo(donor.sigils[0]).name}». Выбери карту-получателя.`:'Выбери карту-донора. Её первая метка перейдёт другой карте, а донор будет удалён.';
  run.deck.filter(c=>c.type==='creature'&&(!donor||c.instanceId!==donor.instanceId)).forEach(card=>{const w=choiceWrap(),c=createCard(card,false),b=document.createElement('button');b.type='button';b.className='choice-button';b.textContent=donor?'ПРИНЯТЬ МЕТКУ':'ОТДАТЬ КАРТУ';const act=()=>{const r=altarSelect(run,card.instanceId);if(!r.ok){toast(r.reason);feedback('warning');return}feedback(donor?'reward':'knife');save();if(r.stage==='receiver')renderEvent();else setMode('route')};b.addEventListener('click',act);attachCardInput(c,card,act);w.append(c,b);el.eventChoices.append(w)})
}

function renderResult(){
  finishProfile();const won=run.result==='won';el.resultKicker.textContent=won?'ЗАБЕГ ПРОЙДЕН':'ПОРАЖЕНИЕ';el.resultTitle.textContent=won?'Дверь открыта.':'Оставь карты.';
  el.resultText.textContent=won?'Девять столов. Ни одной целой печати.':'В следующий раз колода ляжет иначе.';
  el.resultDepth.textContent=Math.min(run.depth+1,run.maxDepth);el.resultKills.textContent=run.stats.kills;el.resultSacrifices.textContent=run.stats.sacrifices;
}

function createCard(card,interactive=false){
  const n=document.createElement(interactive?'button':'article');if(interactive)n.type='button';
  n.className=`game-card ${card.type==='rite'?'rite ':''}${card.rarity==='rare'?'rare ':''}${card.mutationLevel?'mutated ':''}`;n.dataset.card=card.instanceId||card.id;n.dataset.faction=card.faction;n.dataset.rarity=card.rarity;n.setAttribute('aria-label',`${card.name}, ${card.cost} ${card.costType==='ember'?'угля':'костей'}, атака ${card.atk}, здоровье ${card.hp}`);
  const resource=card.costType==='remains'?'●':'✦';
  n.innerHTML=`<div class="card-head"><span class="card-cost">${resource}${card.cost}</span><span class="card-name"></span></div><div class="card-art">${artSvg(card,false)}</div><div class="card-desc"></div><div class="card-foot"><b>${card.type==='creature'?`⚔ ${card.atk}　♥ ${card.hp}`:'РИТУАЛ'}</b><i>${card.sigils?.map(s=>sigilInfo(s).mark).join('')||'·'}</i></div>${card.mutationLevel?'<span class="card-mark">✕</span>':''}`;
  $('.card-name',n).textContent=card.name;$('.card-desc',n).textContent=card.type==='rite'?({bark:'+3 ♥ · Оберег',needle:'+1/+1 · Добор',salt:'2 урона врагу',milk:'2 печати',molt:'Жертва · Добор 2',whisper:'Добор 3',nails:'+2 ♥ · Шип',lash:'1 урон всем'}[card.rite]||card.text):(card.sigils||[]).map(s=>sigilInfo(s).name).join(' · ');return n;
}
function openFocus(card){if(resolvingTurn)return;
  el.focusCard.replaceChildren(createCard(card,false));el.focusName.textContent=card.name;el.focusText.textContent=card.text||'';
  el.focusSigils.replaceChildren();(card.sigils||[]).forEach(id=>{const s=sigilInfo(id),x=document.createElement('span');x.className='sigil-pill';x.textContent=`${s.mark} ${s.name} — ${s.text}`;el.focusSigils.append(x)});el.focus.hidden=false;
}
function artSvg(card,enemy=false){
  const id=String(card.portrait||card.id).replace('enemy-',''),f=card.faction||'enemy';
  const pal={beast:['#1a1712','#76543a','#c59a63'],carrion:['#171512','#5f5042','#b49b78'],fungal:['#151812','#58604a','#b99b60'],spirit:['#151918','#6c7c75','#c4bda8'],enemy:['#171210','#704032','#bb7655'],rite:['#1a100d','#703526','#c78951']}[f]||['#171210','#704032','#bb7655'];
  let archetype='beast';
  if(/crow|owl|nightjar|bird/.test(id))archetype='bird';else if(/moth/.test(id))archetype='moth';else if(/adder|leech/.test(id))archetype='serpent';else if(/mushroom|weaver|choir/.test(id))archetype='fungus';else if(/stag|doe|moose|ram|ox/.test(id))archetype='horned';else if(/hare|rat/.test(id))archetype='small';else if(/widow|king/.test(id))archetype='figure';
  const h=hashString(id),dots=Array.from({length:12},(_,i)=>`<rect x="${4+((h+i*17)%70)}" y="${4+((h*3+i*11)%40)}" width="${i%3?1:2}" height="1" fill="${pal[2]}" opacity=".2"/>`).join('');
  const ground=`<path d="M0 42 L80 42 L80 52 L0 52Z" fill="#0e0c09"/><path d="M0 42 L15 39 L28 43 L44 38 L61 42 L80 39 L80 52 L0 52Z" fill="#252019"/>`;
  let body='';
  if(card.type==='rite')body=riteArt(id,pal);
  else if(id==='toad')body=`<path d="M14 39 L18 25 L30 20 L48 20 L64 29 L69 42 L54 40 L48 33 L30 33 L25 42 Z" fill="${pal[1]}"/><circle cx="28" cy="19" r="5" fill="${pal[2]}"/><circle cx="51" cy="19" r="5" fill="${pal[2]}"/><path d="M25 31 Q40 38 56 31" stroke="#11140d" fill="none"/><circle cx="28" cy="18" r="2" fill="#10150d"/><circle cx="51" cy="18" r="2" fill="#10150d"/>`;
  else if(id.includes('rat'))body=`<path d="M15 37 Q14 17 34 22 Q47 15 58 26 L69 30 L58 36 L47 42 L25 42 Z" fill="${pal[1]}"/><circle cx="47" cy="20" r="6" fill="${pal[2]}"/><path d="M18 35 Q4 29 9 18" fill="none" stroke="${pal[2]}" stroke-width="2"/><circle cx="57" cy="27" r="2" fill="#d59054"/>`;
  else if(archetype==='bird')body=`<polygon points="19,30 31,19 47,21 55,27 46,34 31,35" fill="${pal[1]}"/><polygon points="23,28 8,22 18,37 34,33" fill="${pal[2]}"/><rect x="48" y="19" width="10" height="9" fill="${pal[1]}"/><polygon points="58,22 68,25 58,28" fill="${pal[2]}"/><rect x="52" y="21" width="2" height="2" fill="#d59054"/><rect x="32" y="34" width="2" height="8" fill="${pal[2]}"/><rect x="43" y="33" width="2" height="9" fill="${pal[2]}"/>`;
  else if(archetype==='moth')body=`<rect x="38" y="13" width="4" height="27" fill="${pal[2]}"/><polygon points="38,18 17,9 8,16 16,34 38,29" fill="${pal[1]}"/><polygon points="42,18 63,9 72,16 64,34 42,29" fill="${pal[1]}"/><polygon points="34,21 17,14 18,27 35,27" fill="${pal[2]}"/><polygon points="46,21 63,14 62,27 45,27" fill="${pal[2]}"/><rect x="36" y="8" width="2" height="7" fill="${pal[2]}"/><rect x="42" y="8" width="2" height="7" fill="${pal[2]}"/>`;
  else if(archetype==='serpent')body=`<path d="M9 33 C19 16,31 42,43 25 S62 17,70 24" fill="none" stroke="${pal[1]}" stroke-width="7"/><path d="M9 33 C19 16,31 42,43 25 S62 17,70 24" fill="none" stroke="${pal[2]}" stroke-width="2"/><polygon points="67,19 76,24 68,30 62,25" fill="${pal[1]}"/><rect x="70" y="22" width="2" height="2" fill="#d59054"/>`;
  else if(archetype==='fungus')body=`<rect x="21" y="26" width="7" height="16" fill="${pal[2]}"/><polygon points="10,27 18,15 31,14 39,26" fill="${pal[1]}"/><rect x="46" y="23" width="6" height="19" fill="${pal[2]}"/><polygon points="36,24 44,12 56,12 65,24" fill="${pal[1]}"/><rect x="27" y="18" width="4" height="2" fill="${pal[2]}"/><rect x="51" y="16" width="3" height="2" fill="${pal[2]}"/>`;
  else if(archetype==='horned')body=`<polygon points="18,28 24,19 52,20 61,27 55,35 24,35" fill="${pal[1]}"/><polygon points="54,19 66,17 72,24 63,30 53,26" fill="${pal[1]}"/><rect x="27" y="34" width="5" height="10" fill="${pal[1]}"/><rect x="48" y="34" width="5" height="10" fill="${pal[1]}"/><path d="M61 18 L58 9 L52 5 M64 18 L70 10 L74 8" stroke="${pal[2]}" stroke-width="3" fill="none"/><rect x="66" y="21" width="2" height="2" fill="#d59054"/>`;
  else if(archetype==='small')body=`<polygon points="24,30 30,22 47,23 54,29 48,36 30,36" fill="${pal[1]}"/><polygon points="47,23 52,9 56,10 54,25" fill="${pal[2]}"/><polygon points="42,23 44,11 48,10 48,24" fill="${pal[2]}"/><rect x="51" y="26" width="2" height="2" fill="#d59054"/><rect x="27" y="35" width="4" height="7" fill="${pal[1]}"/><rect x="44" y="35" width="4" height="7" fill="${pal[1]}"/>`;
  else if(archetype==='figure')body=`<polygon points="34,11 46,11 50,21 47,28 55,43 25,43 33,28 30,21" fill="${pal[1]}"/><rect x="35" y="15" width="3" height="2" fill="#d59054"/><rect x="42" y="15" width="3" height="2" fill="#d59054"/><path d="M28 31 L15 38 M52 31 L66 38" stroke="${pal[2]}" stroke-width="3"/><rect x="39" y="20" width="2" height="8" fill="${pal[2]}"/>`;
  else body=`<polygon points="14,29 22,20 51,20 61,27 55,36 24,36" fill="${pal[1]}"/><polygon points="51,20 64,18 71,25 63,31 53,28" fill="${pal[1]}"/><polygon points="62,18 64,10 68,18" fill="${pal[2]}"/><polygon points="56,19 58,11 62,19" fill="${pal[2]}"/><polygon points="17,27 7,20 12,33" fill="${pal[2]}"/><rect x="25" y="35" width="5" height="9" fill="${pal[1]}"/><rect x="48" y="35" width="5" height="9" fill="${pal[1]}"/><rect x="65" y="22" width="2" height="2" fill="#d59054"/>`;
  const scars=Array.from({length:5},(_,i)=>`<path d="M${20+i*6} 26 l-3 6" stroke="${pal[2]}" stroke-width=".7" opacity=".3"/>`).join('');
  let identity='';if(/boar/.test(id))identity=`<path d="M62 29 L62 37 L70 30" fill="${pal[2]}"/>`;if(/fox/.test(id))identity=`<path d="M16 30 Q1 18 5 39 L26 36" fill="${pal[2]}"/>`;if(/wolf|hound|dog/.test(id))identity=`<path d="M57 28 L71 25 L68 30 L58 32 Z" fill="#120e0b"/><path d="M61 28 l2 3 2 -3 2 2" stroke="${pal[2]}" fill="none"/>`;
  body+=scars+identity;
  const traits=(card.sigils||[]);
  let traitArt='';
  if(traits.includes('thorn'))traitArt+='<path d="M8 36 l4 -7 4 7 4 -7 4 7 M56 36 l4 -7 4 7 4 -7 4 7" fill="none" stroke="#b28a5d" stroke-width="2"/>';
  if(traits.includes('twin'))traitArt+='<rect x="31" y="18" width="3" height="3" fill="#d59054"/><rect x="45" y="18" width="3" height="3" fill="#d59054"/>';
  if(traits.includes('ward'))traitArt+='<path d="M6 6 H74 V46 H6 Z" fill="none" stroke="#9aab9f" stroke-width="2" stroke-dasharray="5 3"/>';
  if(traits.includes('bleed'))traitArt+='<path d="M18 9 L58 42 M28 7 L67 36" stroke="#8f3025" stroke-width="2"/>';
  if(traits.includes('chain'))traitArt+='<path d="M11 14 h7 v5 h-7z M18 18 h7 v5 h-7z M55 29 h7 v5 h-7z M62 33 h7 v5 h-7z" fill="none" stroke="#92836c" stroke-width="2"/>';
  if(traits.includes('parasite'))traitArt+='<circle cx="23" cy="17" r="3" fill="#657055"/><circle cx="57" cy="31" r="2" fill="#657055"/><circle cx="30" cy="35" r="2" fill="#657055"/>';
  const mutation=(card.mutationLevel||0)>0?'<path d="M15 12 L28 23 L19 34 M62 10 L51 21 L64 31" fill="none" stroke="#8d2f24" stroke-width="2"/><rect x="38" y="10" width="4" height="4" fill="#b14b34"/>':'';
  return `<svg viewBox="0 0 80 52" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true"><rect width="80" height="52" fill="${pal[0]}"/>${dots}${ground}${body}${traitArt}${mutation}${enemy?'<path d="M3 4 L9 4 M71 4 L77 4" stroke="#a26c4c"/>':''}</svg>`;
}
function riteArt(id,p){
  if(id==='salt')return`<path d="M18 32 L40 11 L62 32 L40 41Z" fill="none" stroke="${p[2]}" stroke-width="3"/><rect x="38" y="17" width="4" height="17" fill="${p[1]}"/><rect x="31" y="24" width="18" height="4" fill="${p[1]}"/>`;
  if(id==='needle'||id==='nails')return`<path d="M18 38 L59 12" stroke="${p[2]}" stroke-width="3"/><path d="M25 42 L62 18" stroke="${p[1]}" stroke-width="2"/><rect x="52" y="9" width="10" height="4" fill="${p[2]}"/>`;
  if(id==='milk')return`<polygon points="27,16 53,16 58,39 22,39" fill="${p[1]}"/><rect x="31" y="10" width="18" height="8" fill="${p[2]}"/><path d="M30 27 Q40 20 50 27 Q40 34 30 27" fill="#d4c4a2"/>`;
  if(id==='molt')return`<path d="M17 35 Q24 12 40 14 Q57 13 63 35 Q48 27 40 39 Q31 27 17 35Z" fill="${p[1]}"/><path d="M40 15 L40 39" stroke="${p[2]}" stroke-width="2"/>`;
  if(id==='whisper')return`<path d="M12 30 Q24 13 39 28 T68 24" fill="none" stroke="${p[2]}" stroke-width="3"/><path d="M18 36 Q30 22 42 34 T65 31" fill="none" stroke="${p[1]}" stroke-width="2"/>`;
  if(id==='lash')return`<path d="M12 35 C20 7 58 8 67 32 C50 19 32 44 17 24" fill="none" stroke="${p[2]}" stroke-width="4"/>`;
  return`<rect x="27" y="11" width="26" height="29" fill="${p[1]}"/><path d="M31 25 L49 25 M40 16 L40 35" stroke="${p[2]}" stroke-width="3"/>`;
}
function hashString(s){let h=0;for(let i=0;i<s.length;i++)h=(Math.imul(h,31)+s.charCodeAt(i))|0;return Math.abs(h)}

function renderLedger(){
  if(!run)return;el.ledgerStats.textContent=`${run.deck.length} карт · ${run.relics.length} знаков · ${run.items.length} предметов`;el.relicStrip.replaceChildren();el.deckList.replaceChildren();
  if(!run.relics.length){const d=document.createElement('div');d.className='relic-chip';d.innerHTML='<b>Пусто</b><p>Знаки появятся после ритуалов и боссов.</p>';el.relicStrip.append(d)}
  run.relics.forEach(id=>{const r=RELICS.find(x=>x.id===id);if(!r)return;const d=document.createElement('div');d.className='relic-chip';d.innerHTML=`<b>${r.name}</b><p>${r.text}</p>`;el.relicStrip.append(d)});
  run.deck.forEach(card=>{const c=createCard(card,false);attachCardInput(c,card,()=>openFocus(card));el.deckList.append(c)});
}
function openLedger(){if(!run||resolvingTurn)return;renderLedger();el.ledger.hidden=false;feedback('paper')}
function openRules(){el.settings.hidden=true;el.rulesPanel.hidden=false;feedback('paper')}

function requestNewRun(){const saved=readRun();if(saved&&!saved.result)confirm('Начать заново? Текущая сдача будет потеряна.',newRun);else newRun()}
el.continue.addEventListener('click',continueRun);el.newRun.addEventListener('click',requestNewRun);el.again.addEventListener('click',newRun);
el.resultHome.addEventListener('click',()=>{run=null;save(true);setMode('menu')});
el.eventSkip.addEventListener('click',()=>{if(skipReward(run).ok){feedback('paper');save();setMode('route')}});
el.cancelCard.addEventListener('click',()=>{if(blocked())return;selectedCard=null;selectedItem=null;selectedUnit=null;renderBattle()});el.cast.addEventListener('click',()=>{const c=selectedCardObj();if(!c||blocked())return;void resolveAction(()=>{const r=playCard(run,run.battle,c.instanceId);if(!r.ok)bad(el.cast,r.reason);return r})});
el.endTurn.addEventListener('click',doEndTurn);el.sacrifice.addEventListener('click',doSacrifice);el.heritage.addEventListener('click',cycleHeritage);el.heritage.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();cycleHeritage()}});
el.deckBtn.addEventListener('click',openLedger);el.ledgerClose.addEventListener('click',()=>{el.ledger.hidden=true;feedback('paper')});
el.focusClose.addEventListener('click',()=>{el.focus.hidden=true;feedback('paper')});
el.settingsBtn.addEventListener('click',()=>{cancelDrag?.();el.settings.hidden=false;feedback('wood')});el.settingsClose.addEventListener('click',()=>{el.settings.hidden=true;feedback('wood')});
el.rules.addEventListener('click',openRules);el.rulesFromSettings.addEventListener('click',openRules);el.rulesClose.addEventListener('click',()=>{el.rulesPanel.hidden=true;feedback('paper')});
el.sound.addEventListener('click',()=>{prefs.sound=!prefs.sound;save();audio.setEnabled(prefs.sound);if(prefs.sound)void audio.ensure().then(()=>audio.play('bell'));renderMenu()});
el.haptic.addEventListener('click',()=>{prefs.haptic=!prefs.haptic;save();if(prefs.haptic)haptic(12);renderMenu()});
el.abandon.addEventListener('click',()=>confirm('Завершить текущий забег? Текущая колода и её изменения будут потеряны.',abandon));
el.confirmCancel.addEventListener('click',()=>{el.confirm.hidden=true;confirmAction=null});el.confirmOk.addEventListener('click',()=>{const fn=confirmAction;el.confirm.hidden=true;confirmAction=null;fn?.()});
el.wallSeal.addEventListener('click',claimWallSeal);
window.addEventListener('pagehide',()=>save());document.addEventListener('visibilitychange',()=>{document.body.dataset.paused=String(document.hidden);if(document.hidden){cancelDrag?.();activeDelay?.();save();audio.setEnabled(false)}else audio.setEnabled(prefs.sound)});

document.addEventListener('keydown',event=>{if(event.key!=='Escape')return;cancelDrag?.();if(!el.confirm.hidden){el.confirm.hidden=true;confirmAction=null}else if(!el.focus.hidden)el.focus.hidden=true;else if(!el.rulesPanel.hidden)el.rulesPanel.hidden=true;else if(!el.ledger.hidden)el.ledger.hidden=true;else if(!el.settings.hidden)el.settings.hidden=true;else if(!blocked()){selectedCard=null;selectedItem=null;selectedUnit=null;renderBattle()}});
window.addEventListener('resize',()=>cancelDrag?.());
let previousView=null;try{previousView=sessionStorage.getItem(VIEW_KEY)}catch{}
renderMenu();if(previousView&&previousView!=='menu'&&readRun())continueRun(true);else setMode('menu');
