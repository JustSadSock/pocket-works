import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createVersionedStore } from '../../shared/capabilities/storage.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { watchConnectivity } from '../../shared/pwa-utils.js';
import {
  VERSION, BATTLE_COUNT, TINCTURES, FIELDS, ORDINARIES, MAINS, SECONDARIES, COMMANDS, MOTTOS, CATALOGS,
  createCampaign, hydrateCampaign, prepareBattle, recordBattle, applyOffer, doctrineLayers, doctrineName,
  createBattleState, stepBattle, summarizeBattle
} from './engine.js';

installMobileRuntime();
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const store = createVersionedStore({
  namespace: 'pocket-works:blazon', version: VERSION,
  defaults: { settings: { sound: true }, campaign: null, stats: { runs: 0, victories: 0 } }
});
let settings = store.get('settings');
let campaign = hydrateCampaign(store.get('campaign'));
let stats = store.get('stats');
let setup = { field: null, ordinary: null };
let battleState = null;
let battleSummary = null;
let battleRunning = false;
let paused = false;
let speed = 1;
let lastFrame = 0;
let accumulator = 0;
let lastEventCount = 0;
let audio = null;
let flashTimer = 0;

const screens = { menu: $('#menuScreen'), doctrine: $('#doctrineScreen'), battle: $('#battleScreen') };
const dialogs = { setup: $('#setupDialog'), rules: $('#rulesDialog'), result: $('#resultDialog'), reward: $('#rewardDialog'), ending: $('#endingDialog') };
const canvas = $('#battleCanvas');
const ctx = canvas.getContext('2d');

function persist() { store.patch({ settings, campaign, stats }); }
function showScreen(name) { Object.entries(screens).forEach(([key, node]) => node.classList.toggle('is-active', key === name)); }
function openDialog(dialog) { if (!dialog.open) dialog.showModal(); }
function closeDialog(dialog) { if (dialog.open) dialog.close(); }
function fmtTime(value) { const sec = Math.max(0, Math.floor(value)); return `${String(Math.floor(sec / 60)).padStart(2,'0')}:${String(sec % 60).padStart(2,'0')}`; }
function vibrate(v) { try { navigator.vibrate?.(v); } catch {} }
function sound(type) {
  if (!settings.sound) return;
  try {
    audio ||= new AudioContext(); if (audio.state === 'suspended') audio.resume();
    const map = { tap:[220,.04], seal:[150,.1], horn:[95,.35], arrow:[430,.025], hit:[80,.05], win:[180,.45], lose:[90,.4] };
    const [f,d] = map[type] || map.tap; const o = audio.createOscillator(), g = audio.createGain();
    o.type = type === 'horn' ? 'sawtooth' : 'triangle'; o.frequency.setValueAtTime(f,audio.currentTime);
    if (type === 'win') o.frequency.exponentialRampToValueAtTime(f*2.2,audio.currentTime+d);
    g.gain.setValueAtTime(.0001,audio.currentTime); g.gain.exponentialRampToValueAtTime(.045,audio.currentTime+.008); g.gain.exponentialRampToValueAtTime(.0001,audio.currentTime+d);
    o.connect(g).connect(audio.destination); o.start(); o.stop(audio.currentTime+d+.03);
  } catch {}
}

function ordinaryMarkup(id, fill, clip) {
  const common = `fill="${fill}" clip-path="url(#${clip})" class="ordinary"`;
  if (id === 'pale') return `<rect x="45" y="37" width="30" height="121" ${common}/>`;
  if (id === 'fess') return `<rect x="20" y="80" width="80" height="31" ${common}/>`;
  if (id === 'bend') return `<path d="M7 55 29 34 114 142 94 161Z" ${common}/>`;
  if (id === 'chevron') return `<path d="M27 132 60 91 94 132" fill="none" stroke="${fill}" stroke-width="22" stroke-linejoin="miter" clip-path="url(#${clip})"/>`;
  return '';
}
function useCharge(id, x, y, scale, color, detail, cls) {
  return `<g class="${cls}" style="color:${color};--detail:${detail};--charge-outline:${detail}" transform="translate(${x} ${y}) scale(${scale})"><use href="#charge-${id}"></use></g>`;
}
function achievementMarkup(doctrine, id = 'coat', compact = false) {
  const field = TINCTURES[doctrine.field] || TINCTURES.gules;
  const contrast = field.contrast;
  const detail = field.id === 'argent' ? '#201d18' : field.color;
  const clip = `${id}-clip`;
  const main = doctrine.main ? useCharge(doctrine.main, 29, 67, .52, contrast, detail, 'charge-main') : '';
  let secondary = '';
  if (doctrine.secondary) {
    secondary = useCharge(doctrine.secondary, 29, 45, .20, contrast, detail, 'charge-secondary') + useCharge(doctrine.secondary, 67, 45, .20, contrast, detail, 'charge-secondary');
  }
  let external = '';
  if (doctrine.command === 'crown') external = useCharge('crown', 39, 3, .35, '#c49b48', '#3c2a12', 'external-mark');
  if (doctrine.command === 'helmet') external = useCharge('helmet', 39, 4, .35, '#918875', '#302b22', 'external-mark');
  const chain = doctrine.command === 'chain' ? `<ellipse class="achievement-chain" cx="60" cy="105" rx="49" ry="61"/>` : '';
  const motto = doctrine.motto ? (MOTTOS[doctrine.motto]?.name || '') : '—';
  return `<svg viewBox="0 0 120 190" role="img" aria-label="${doctrineName(doctrine)}">
    <defs><clipPath id="${clip}"><path d="M18 38H102V102C102 130 87 151 60 165C33 151 18 130 18 102Z"/></clipPath></defs>
    ${compact ? '' : `<path class="achievement-mantle" d="M23 34C9 53 7 104 19 155L39 131L60 170L81 131L101 155C113 104 111 53 97 34L78 49L60 25L42 49Z"/><path class="achievement-mantle-inner" d="M31 43C18 69 22 116 28 134L43 117L60 154L77 117L92 134C98 116 102 69 89 43L72 56L60 37L48 56Z"/>`}
    ${external}${chain}
    <path class="achievement-shield" fill="${field.color}" d="M18 38H102V102C102 130 87 151 60 165C33 151 18 130 18 102Z"/>
    ${ordinaryMarkup(doctrine.ordinary, contrast, clip)}
    <path class="achievement-inner" d="M23 44H97V101C97 125 84 143 60 156C36 143 23 125 23 101Z"/>
    ${main}${secondary}
    ${compact ? '' : `<path class="motto-scroll" d="M12 159C30 154 90 154 108 159L101 180C83 176 37 176 19 180Z"/><text class="motto-copy" x="60" y="171" text-anchor="middle">${motto}</text>`}
  </svg>`;
}
function layerLabel(slot) { return { field:'Поле', ordinary:'Строй', main:'Ратники', secondary:'Лучники', command:'Командование', motto:'Девиз' }[slot]; }
function renderLedger(node, doctrine) {
  node.innerHTML = doctrineLayers(doctrine).map(({slot,definition}) => `<div class="layer-row${definition?'':' is-empty'}"><span>${layerLabel(slot)}</span><div><strong>${definition?.name || 'Не начертано'}</strong><small>${definition?.summary || 'Этот слой откроется после следующего боя.'}</small></div></div>`).join('');
}
function renderMenu() {
  $('#soundButton').textContent = `Звук: ${settings.sound ? 'вкл' : 'выкл'}`;
  $('#continueButton').hidden = !campaign || campaign.completed;
  if (campaign && !campaign.completed) $('#continueCaption').textContent = `Битва ${campaign.battleIndex + 1} из ${BATTLE_COUNT}`;
  $('#menuHeraldry').innerHTML = achievementMarkup(campaign?.doctrine || {field:'gules',ordinary:'pale',main:'lion',secondary:'eagle',command:'crown',motto:'breach'},'menu',true);
}
function renderDoctrine() {
  campaign = prepareBattle(campaign); persist();
  $('#battleIndexLabel').textContent = `БИТВА ${roman(campaign.battleIndex + 1)} ИЗ ${roman(BATTLE_COUNT)}`;
  $('#integrityMarks').textContent = `${'◆'.repeat(campaign.integrity)}${'◇'.repeat(3-campaign.integrity)}`;
  $('#playerDoctrineName').textContent = doctrineName(campaign.doctrine);
  $('#enemyDoctrineName').textContent = doctrineName(campaign.currentEnemy);
  $('#playerAchievement').innerHTML = achievementMarkup(campaign.doctrine,'player');
  $('#enemyAchievement').innerHTML = achievementMarkup(campaign.currentEnemy,'enemy');
  renderLedger($('#playerLedger'),campaign.doctrine); renderLedger($('#enemyLedger'),campaign.currentEnemy);
}
function roman(n){return ['I','II','III','IV','V','VI'][n-1]||n}

function renderSetup() {
  $('#fieldChoices').innerHTML = Object.values(FIELDS).map((item)=>`<button class="doctrine-choice${setup.field===item.id?' is-selected':''}" data-field="${item.id}"><i style="background:${TINCTURES[item.id].color};color:${TINCTURES[item.id].contrast}"></i><strong>${item.name}</strong><span>${item.summary}</span></button>`).join('');
  $('#ordinaryChoices').innerHTML = Object.values(ORDINARIES).map((item)=>`<button class="doctrine-choice${setup.ordinary===item.id?' is-selected':''}" data-ordinary-choice="${item.id}"><i class="ordinary-preview" data-ordinary="${item.id}"></i><strong>${item.name}</strong><span>${item.summary}</span></button>`).join('');
  $('#sealSetupButton').disabled = !(setup.field && setup.ordinary);
  $$('[data-field]').forEach((b)=>b.addEventListener('click',()=>{setup.field=b.dataset.field;sound('tap');renderSetup()}));
  $$('[data-ordinary-choice]').forEach((b)=>b.addEventListener('click',()=>{setup.ordinary=b.dataset.ordinaryChoice;sound('tap');renderSetup()}));
}
function startNewSetup(){setup={field:null,ordinary:null};renderSetup();openDialog(dialogs.setup)}
function sealSetup(){if(!setup.field||!setup.ordinary)return;campaign=createCampaign(setup.field,setup.ordinary,Date.now());stats.runs++;persist();closeDialog(dialogs.setup);renderDoctrine();showScreen('doctrine');sound('seal');vibrate(15)}
function continueCampaign(){if(!campaign)return;if(campaign.phase==='reward'&&campaign.offers?.length){renderRewards();openDialog(dialogs.reward)}else if(campaign.phase==='ending'){renderEnding();openDialog(dialogs.ending)}else{renderDoctrine();showScreen('doctrine')}}

function startBattle(replay=false){
  if(!replay){campaign=prepareBattle(campaign);persist()}
  battleState=createBattleState(campaign.doctrine,campaign.currentEnemy,campaign.currentSeed);battleSummary=null;battleRunning=true;paused=false;speed=1;lastFrame=performance.now();accumulator=0;lastEventCount=0;
  $$('.speed-controls button').forEach((b)=>b.classList.toggle('is-active',b.dataset.speed==='1'));
  $('#hudPlayerShield').innerHTML=achievementMarkup(campaign.doctrine,'hud-p',true);$('#hudEnemyShield').innerHTML=achievementMarkup(campaign.currentEnemy,'hud-e',true);
  showScreen('battle');sound('horn');requestAnimationFrame(()=>{resizeCanvas();lastFrame=performance.now();requestAnimationFrame(frame)});
}
function resizeCanvas(){const rect=canvas.getBoundingClientRect();const dpr=Math.min(2,devicePixelRatio||1);canvas.width=Math.max(1,Math.floor(rect.width*dpr));canvas.height=Math.max(1,Math.floor(rect.height*dpr));ctx.setTransform(dpr*rect.width/1000,0,0,dpr*rect.height/600,0,0)}
function frame(now){
  if(!battleRunning)return;const elapsed=Math.min(.08,(now-lastFrame)/1000);lastFrame=now;if(!paused){accumulator+=elapsed*speed;while(accumulator>=.05&&battleState.status==='running'){stepBattle(battleState,.05);accumulator-=.05}}
  drawBattle();updateBattleHud();if(battleState.events.length>lastEventCount){const ev=battleState.events.at(-1);lastEventCount=battleState.events.length;if(ev.rule!=='deployment')flashRule(ev.text)}
  if(battleState.status==='finished'){battleRunning=false;battleSummary=summarizeBattle(battleState);setTimeout(showResult,500);return}requestAnimationFrame(frame)
}
function flashRule(text){const n=$('#ruleFlash');n.textContent=text;n.classList.add('is-visible');clearTimeout(flashTimer);flashTimer=setTimeout(()=>n.classList.remove('is-visible'),1250)}
function updateBattleHud(){
  $('#battleClock').textContent=fmtTime(battleState.time);$('#playerFormation').textContent=`${4-battleState.player.brokenCount} / 4`;$('#enemyFormation').textContent=`${4-battleState.enemy.brokenCount} / 4`;
}
function drawBattle(){
  const w=1000,h=600;ctx.clearRect(0,0,w,h);const grad=ctx.createLinearGradient(0,0,0,h);grad.addColorStop(0,'#43563d');grad.addColorStop(1,'#28362a');ctx.fillStyle=grad;ctx.fillRect(0,0,w,h);
  ctx.globalAlpha=.14;ctx.strokeStyle='#d8c894';ctx.lineWidth=1;for(let y=50;y<h;y+=50){ctx.beginPath();ctx.moveTo(0,y);ctx.bezierCurveTo(280,y-14,680,y+14,w,y);ctx.stroke()}ctx.globalAlpha=1;
  ctx.fillStyle='rgba(22,27,21,.26)';ctx.beginPath();ctx.ellipse(500,300,102,238,0,0,Math.PI*2);ctx.fill();
  drawBanner(battleState.player,battleState.player.doctrine);drawBanner(battleState.enemy,battleState.enemy.doctrine);
  for(const a of battleState.arrows)drawArrow(a);
  for(const army of [battleState.player,battleState.enemy]){for(const squad of army.archers)drawSquad(squad,army.doctrine);for(const squad of army.infantry)drawSquad(squad,army.doctrine)}
}
function armyColors(doctrine){const t=TINCTURES[doctrine.field];return{primary:t.color,secondary:t.contrast,ink:t.id==='argent'?'#28231d':'#eadfbd'}}
function drawBanner(army,doctrine){const c=armyColors(doctrine),dir=army.side==='player'?1:-1;ctx.save();ctx.translate(army.banner.x,army.banner.y);ctx.strokeStyle='#6b4b26';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(0,42);ctx.lineTo(0,-56);ctx.stroke();ctx.fillStyle=c.primary;ctx.beginPath();ctx.moveTo(0,-52);ctx.lineTo(dir*62,-44);ctx.lineTo(dir*58,-8);ctx.lineTo(0,-15);ctx.closePath();ctx.fill();ctx.strokeStyle=c.secondary;ctx.lineWidth=3;ctx.stroke();ctx.fillStyle=c.secondary;ctx.beginPath();ctx.arc(dir*30,-30,8,0,Math.PI*2);ctx.fill();ctx.fillStyle='rgba(0,0,0,.2)';ctx.fillRect(-28,46,56,7);ctx.restore();
  if(army.banner.capture>0){ctx.fillStyle='#d9c070';ctx.fillRect(army.banner.x-25,army.banner.y+58,50*(army.banner.capture/3),4)}
}
function drawSquad(squad,doctrine){if(squad.strength<=.15)return;const count=Math.max(1,Math.round(squad.strength));const c=armyColors(doctrine);const dir=squad.side==='player'?1:-1;const cols=squad.type==='infantry'?4:2;const spacing=squad.type==='infantry'?12:15;ctx.save();ctx.translate(squad.x,squad.y);ctx.globalAlpha=.35+.65*squad.morale;
  for(let i=0;i<count;i++){const col=i%cols,row=Math.floor(i/cols);const ox=(col-(cols-1)/2)*spacing*dir;const oy=(row-(Math.ceil(count/cols)-1)/2)*spacing;drawSoldier(ox,oy,squad.type,dir,c,i===0&&squad.leader)}
  ctx.globalAlpha=1;ctx.fillStyle='rgba(0,0,0,.45)';ctx.fillRect(-24,-24,48,3);ctx.fillStyle=squad.morale>.45?'#d6b951':squad.morale>.2?'#c7773d':'#9d3034';ctx.fillRect(-24,-24,48*squad.morale,3);
  if(squad.state==='rout'){ctx.strokeStyle='#efe1b7';ctx.setLineDash([3,3]);ctx.beginPath();ctx.arc(0,0,29,0,Math.PI*2);ctx.stroke();ctx.setLineDash([])}ctx.restore()}
function drawSoldier(x,y,type,dir,c,leader){ctx.save();ctx.translate(x,y);ctx.scale(dir,1);ctx.fillStyle='rgba(0,0,0,.25)';ctx.beginPath();ctx.ellipse(0,8,8,4,0,0,Math.PI*2);ctx.fill();ctx.fillStyle=c.primary;ctx.fillRect(-4,-5,8,13);ctx.fillStyle='#c9a677';ctx.beginPath();ctx.arc(0,-9,4,0,Math.PI*2);ctx.fill();ctx.fillStyle=c.secondary;if(type==='infantry'){ctx.beginPath();ctx.moveTo(1,-3);ctx.lineTo(9,0);ctx.lineTo(7,9);ctx.lineTo(1,7);ctx.closePath();ctx.fill();ctx.strokeStyle='#5e4931';ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(-2,-1);ctx.lineTo(12,-13);ctx.stroke()}else{ctx.strokeStyle='#513b24';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(3,-1,7,-Math.PI/2,Math.PI/2);ctx.stroke();ctx.beginPath();ctx.moveTo(3,-8);ctx.lineTo(3,6);ctx.stroke()}if(leader){ctx.fillStyle='#d4aa4d';ctx.beginPath();ctx.moveTo(-4,-15);ctx.lineTo(0,-22);ctx.lineTo(4,-15);ctx.fill()}ctx.restore()}
function drawArrow(a){const t=a.life/.34;ctx.save();ctx.globalAlpha=Math.min(1,t*2);ctx.strokeStyle='#d9c292';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(a.x2+(a.x1-a.x2)*t,a.y2+(a.y1-a.y2)*t);ctx.lineTo(a.x2+(a.x1-a.x2)*Math.min(1,t+.13),a.y2+(a.y1-a.y2)*Math.min(1,t+.13));ctx.stroke();ctx.restore()}

function showResult(){
  const won=battleSummary.winner==='player';$('#resultEyebrow').textContent=`БИТВА ${roman(campaign.battleIndex+1)} ЗАВЕРШЕНА`;$('#resultTitle').textContent=won?'Вражеское знамя обрушено':'Твой строй разрушен';
  $('#resultMeasures').innerHTML=`<div><span>Время</span><b>${fmtTime(battleSummary.duration)}</b></div><div><span>Твой строй</span><b>${4-battleSummary.playerBroken}/4</b></div><div><span>Вражеский</span><b>${4-battleSummary.enemyBroken}/4</b></div><div><span>Итог</span><b>${won?'Победа':'Поражение'}</b></div>`;
  $('#decisiveEvents').innerHTML=(battleSummary.decisive.length?battleSummary.decisive:[{time:0,text:'Бой решён общим движением строя.'}]).map(e=>`<article><time>${fmtTime(e.time)} · ${e.side==='player'?'ТВОИ':e.side==='enemy'?'ВРАГ':'ПОЛЕ'}</time><span>${e.text}</span></article>`).join('');
  $('#continueResultButton').querySelector('small').textContent=campaign.battleIndex===BATTLE_COUNT-1?'Завершить поход':'Изменить доктрину';openDialog(dialogs.result);sound(won?'win':'lose');vibrate(won?[20,40,20]:80)
}
function continueAfterResult(){
  campaign=recordBattle(campaign,battleSummary);if(battleSummary.winner==='player')stats.victories++;persist();closeDialog(dialogs.result);
  if(campaign.completed){renderEnding();openDialog(dialogs.ending);return}renderRewards();openDialog(dialogs.reward)
}
function rewardHeading(slot){return {main:['ГЛАВНАЯ ФИГУРА','Как будут действовать ратники?'],secondary:['ВТОРИЧНАЯ ФИГУРА','Как лучники свяжутся со строем?'],command:['ВНЕШНИЙ ЭЛЕМЕНТ','Кто задаёт высший порядок?'],motto:['ДЕВИЗ','Какое правило один раз превысит остальные?'],revision:['ПЕРЕСМОТР УСТАВА','Что изменить перед последним полем?']}[slot]||['НОВЫЙ СЛОЙ','Как изменится армия?']}
function renderRewards(){
  const offers=campaign.offers||[];const first=offers[0];const [ey,title]=rewardHeading(first?.revision?'revision':first?.slot);$('#rewardEyebrow').textContent=ey;$('#rewardTitle').textContent=title;
  $('#rewardGrid').innerHTML=offers.map((offer,i)=>`<button class="reward-card" data-offer="${i}"><div class="reward-card-preview">${rewardPreview(offer)}</div><div class="reward-card-copy"><em>${offer.revision?`Заменит: ${CATALOGS[offer.slot][offer.replaces]?.name}`:layerLabel(offer.slot)}</em><strong>${offer.definition.name}</strong><p>${offer.definition.summary}</p><small>${offer.definition.detail||principleCopy(offer.definition.principle)}</small></div></button>`).join('');
  $$('.reward-card').forEach(b=>b.addEventListener('click',()=>chooseReward(Number(b.dataset.offer))))
}
function principleCopy(p){return {pressure:'Создаёт последовательное давление, но делает замысел заметнее.',adaptation:'Лучше реагирует на бой, но чаще прерывает начатое.',cohesion:'Связывает части армии, рискуя сделать их слишком зависимыми.',reserve:'Сохраняет решение до кризиса, ослабляя ранний этап.',breach:'Превращает разрыв в глубокий успех, но открывает прорвавшихся.',recovery:'Возвращает потерянную организацию ценой темпа.'}[p]||'Меняет решение отрядов, а не их характеристики.'}
function rewardPreview(offer){
  if(offer.slot==='main'||offer.slot==='secondary'||offer.slot==='command'){const id=offer.id==='crown'||offer.id==='helmet'?offer.id:offer.id;return `<svg viewBox="0 0 120 120" style="color:#8f2e32;--detail:#d1a849"><use href="#charge-${id}"></use></svg>`}
  if(offer.slot==='field')return `<svg viewBox="0 0 120 120"><path fill="${TINCTURES[offer.id].color}" stroke="#654821" stroke-width="5" d="M14 12h92v54c0 25-17 41-46 52C31 107 14 91 14 66Z"/></svg>`;
  if(offer.slot==='ordinary')return `<div class="ordinary-preview" data-ordinary="${offer.id}" style="width:100px!important;color:#8f2e32"></div>`;
  if(offer.slot==='motto')return `<svg viewBox="0 0 140 100"><path fill="#d9c078" stroke="#735128" d="M8 28c28-7 96-7 124 0l-9 47c-29-5-77-5-106 0Z"/><text x="70" y="57" text-anchor="middle" font-family="Georgia" font-size="11" font-weight="700">${offer.definition.name}</text></svg>`;
  return ''
}
function chooseReward(index){const offer=campaign.offers[index];campaign=applyOffer(campaign,offer);persist();closeDialog(dialogs.reward);renderDoctrine();showScreen('doctrine');sound('seal');vibrate(18)}
function renderEnding(){const won=campaign.integrity>0;$('#endingAchievement').innerHTML=achievementMarkup(campaign.doctrine,'ending');$('#endingTitle').textContent=won?`Доктрина выиграла ${campaign.victories} из ${BATTLE_COUNT}`:'Знамя рода не пережило поход';$('#endingCopy').textContent=`Сохранено целостности: ${campaign.integrity} из 3. Победы: ${campaign.victories}. Никаких скрытых усилений — только работа выбранных правил.`}
function leaveBattle(){battleRunning=false;paused=false;showScreen('doctrine');renderDoctrine()}

$('#newButton').addEventListener('click',startNewSetup);$('#continueButton').addEventListener('click',continueCampaign);$('#sealSetupButton').addEventListener('click',sealSetup);$('#rulesButton').addEventListener('click',()=>openDialog(dialogs.rules));$('#codexButton').addEventListener('click',()=>openDialog(dialogs.rules));$('#doctrineMenuButton').addEventListener('click',()=>{showScreen('menu');renderMenu()});$('#startBattleButton').addEventListener('click',()=>startBattle(false));$('#leaveBattleButton').addEventListener('click',leaveBattle);$('#pauseSimulationButton').addEventListener('click',()=>{paused=!paused;$('#pauseSimulationButton').textContent=paused?'Продолжить':'Пауза'});$('#replayButton').addEventListener('click',()=>{closeDialog(dialogs.result);startBattle(true)});$('#continueResultButton').addEventListener('click',continueAfterResult);$('#endingMenuButton').addEventListener('click',()=>{closeDialog(dialogs.ending);campaign=null;persist();renderMenu();showScreen('menu')});$('#endingRestartButton').addEventListener('click',()=>{closeDialog(dialogs.ending);startNewSetup()});$('#soundButton').addEventListener('click',()=>{settings.sound=!settings.sound;persist();renderMenu();sound('tap')});
$$('[data-close-dialog]').forEach(b=>b.addEventListener('click',()=>closeDialog(b.closest('dialog'))));$$('[data-speed]').forEach(b=>b.addEventListener('click',()=>{speed=Number(b.dataset.speed);$$('[data-speed]').forEach(x=>x.classList.toggle('is-active',x===b));sound('tap')}));
window.addEventListener('resize',()=>{if(screens.battle.classList.contains('is-active'))resizeCanvas()});window.addEventListener('pagehide',persist);document.addEventListener('visibilitychange',()=>{if(document.hidden)persist()});
createWorkshopMode({appName:'БЛАЗОН: Доктрина',version:'3.0.0',cachePrefix:'blazon-',storageNamespace:'pocket-works:blazon',onReset(){store.reset();campaign=null;settings=store.get('settings');stats=store.get('stats');renderMenu();showScreen('menu')}});watchConnectivity((online)=>document.documentElement.dataset.network=online?'online':'offline');
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
renderMenu();showScreen('menu');
