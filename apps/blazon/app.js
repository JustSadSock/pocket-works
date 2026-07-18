import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createVersionedStore } from '../../shared/capabilities/storage.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { watchConnectivity } from '../../shared/pwa-utils.js';
import {
  VERSION, BATTLE_COUNT, TINCTURES, FIELDS, ORDINARIES, MOTTOS, CATALOGS,
  createCampaign, hydrateCampaign, prepareBattle, recordBattle, applyOffer,
  doctrineLayers, doctrineName, createBattleState, stepBattle, summarizeBattle
} from './engine.js';
import {
  HERALDIC_SCHOOLS, heraldicIdentity, schoolForDoctrine, liveryForDoctrine
} from './heraldry.js';

installMobileRuntime();
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
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
function fmtTime(value) { const sec = Math.max(0, Math.floor(value)); return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`; }
function roman(number) { return ['I','II','III','IV','V','VI'][number - 1] || number; }
function vibrate(value) { try { navigator.vibrate?.(value); } catch {} }
function sound(type) {
  if (!settings.sound) return;
  try {
    audio ||= new AudioContext();
    if (audio.state === 'suspended') audio.resume();
    const map = { tap:[220,.04], seal:[150,.1], horn:[95,.35], win:[180,.45], lose:[90,.4] };
    const [frequency, duration] = map[type] || map.tap;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = type === 'horn' ? 'sawtooth' : 'triangle';
    oscillator.frequency.setValueAtTime(frequency, audio.currentTime);
    if (type === 'win') oscillator.frequency.exponentialRampToValueAtTime(frequency * 2.2, audio.currentTime + duration);
    gain.gain.setValueAtTime(.0001, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(.045, audio.currentTime + .008);
    gain.gain.exponentialRampToValueAtTime(.0001, audio.currentTime + duration);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(); oscillator.stop(audio.currentTime + duration + .03);
  } catch {}
}

function ordinaryMarkup(id, fill, clip) {
  const common = `fill="${fill}" clip-path="url(#${clip})" class="ordinary"`;
  if (id === 'pale') return `<rect x="45" y="30" width="30" height="146" ${common}/>`;
  if (id === 'fess') return `<rect x="14" y="79" width="92" height="31" ${common}/>`;
  if (id === 'bend') return `<path d="M-5 48 18 26 126 146 104 169Z" ${common}/>`;
  if (id === 'chevron') return `<path d="M22 134 60 86 99 134" fill="none" stroke="${fill}" stroke-width="22" stroke-linejoin="miter" clip-path="url(#${clip})" class="ordinary"/>`;
  return '';
}

function useCharge(id, placement, color, outline, className) {
  if (!id || !placement) return '';
  const flip = placement.flip ? -1 : 1;
  const rotate = placement.rotate || 0;
  const anchorX = placement.flip ? placement.x + 120 * placement.scale : placement.x;
  const transform = `translate(${anchorX} ${placement.y}) rotate(${rotate}) scale(${placement.scale * flip} ${placement.scale})`;
  return `<g class="${className}" style="color:${color};--detail:${outline};--charge-outline:${outline}" transform="${transform}"><use href="#charge-${id}"></use></g>`;
}

function schoolOrnament(identity, compact) {
  if (compact) return '';
  const { school, palette } = identity;
  if (school.id === 'imperial') return `<path class="mantle mantle-imperial" d="M22 34C5 59 7 121 18 160L39 133L60 177L81 133L102 160C113 121 115 59 98 34L78 52L60 25L42 52Z"/><path class="mantle-lining" d="M30 45C18 73 21 119 28 141L44 119L60 158L76 119L92 141C99 119 102 73 90 45L73 59L60 39L47 59Z"/>`;
  if (school.id === 'civic') return `<g class="civic-wreath" style="color:${palette.accent}"><path d="M18 151C5 116 8 80 28 51M102 151c13-35 10-71-10-100"/><path d="m20 130-14-10m18-7-16-8m21-9-16-6m75 40 14-10m-18-7 16-8m-21-9 16-6"/></g><path class="mural-crown" d="M35 29V15h10v8h10v-8h10v8h10v-8h10v14Z"/>`;
  if (school.id === 'knightly') return `<path class="mantle mantle-knightly" d="M25 39C8 67 10 128 24 159L42 128L60 170L78 128L96 159C110 128 112 67 95 39L77 55L60 31L43 55Z"/><path class="mantle-lining" d="M34 50C24 79 27 117 32 136L46 114L60 151L74 114L88 136C93 117 96 79 86 50L70 62L60 45L50 62Z"/>`;
  return `<path class="mantle mantle-northern" d="M29 34C15 62 16 120 25 160L43 133L60 179L77 133L95 160C104 120 105 62 91 34L76 51L60 27L44 51Z"/><path class="fur-edge" d="M30 42c6 4 10-5 16 0 6 5 9-6 15 0 6 5 10-5 16 0 6 5 9-5 14 0"/>`;
}

function commandMarkup(doctrine, identity) {
  const { palette, school } = identity;
  if (doctrine.command === 'crown') {
    const y = school.id === 'civic' ? 18 : 3;
    return useCharge('crown', {x:39,y,scale:.35}, palette.metal, palette.ink, 'external-mark command-crown');
  }
  if (doctrine.command === 'helmet') {
    return `${useCharge('helmet', {x:38,y:2,scale:.37}, '#8e8b82', palette.ink, 'external-mark command-helmet')}<path class="crest-plume" style="fill:${palette.accent}" d="M52 9C61-8 80-5 86 8C73 4 65 10 59 22Z"/>`;
  }
  if (doctrine.command === 'chain') return `<ellipse class="achievement-chain" cx="60" cy="106" rx="49" ry="62" style="stroke:${palette.metal}"/>`;
  return '';
}

function achievementMarkup(doctrine, id = 'coat', compact = false) {
  const identity = heraldicIdentity(doctrine);
  const { palette, shield, composition, school } = identity;
  const clip = `${id}-clip`;
  const gradient = `${id}-field`;
  const main = doctrine.main ? useCharge(doctrine.main, composition.main, palette.main, palette.ink, 'charge-main') : '';
  const secondary = doctrine.secondary ? composition.secondary.map((placement) => useCharge(doctrine.secondary, placement, palette.accent, palette.metal, 'charge-secondary')).join('') : '';
  const motto = doctrine.motto ? (MOTTOS[doctrine.motto]?.name || '') : '—';
  return `<svg class="achievement achievement-${school.id}" data-school="${school.id}" viewBox="0 0 120 190" role="img" aria-label="${doctrineName(doctrine)}">
    <defs>
      <clipPath id="${clip}"><path d="${shield.path}"/></clipPath>
      <linearGradient id="${gradient}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${palette.field}"/><stop offset=".5" stop-color="${palette.field}"/><stop offset="1" stop-color="${palette.ink}" stop-opacity=".28"/></linearGradient>
      <pattern id="${id}-grain" width="7" height="7" patternUnits="userSpaceOnUse"><path d="M0 1h7M2 0v7" stroke="rgba(255,255,255,.055)" stroke-width=".45"/></pattern>
    </defs>
    ${schoolOrnament(identity, compact)}
    ${compact ? '' : commandMarkup(doctrine, identity)}
    <path class="achievement-shadow" d="${shield.path}" transform="translate(0 2)"/>
    <path class="achievement-shield" fill="url(#${gradient})" d="${shield.path}"/>
    <path class="achievement-grain" fill="url(#${id}-grain)" d="${shield.path}"/>
    ${ordinaryMarkup(doctrine.ordinary, palette.metal, clip)}
    <path class="ordinary-highlight" d="${shield.path}" clip-path="url(#${clip})"/>
    <path class="achievement-inner" d="${shield.inner}"/>
    ${main}${secondary}
    <path class="achievement-edge" d="${shield.path}" style="stroke:${palette.metal}"/>
    ${compact ? '' : `<path class="motto-scroll" style="fill:${palette.metal};stroke:${palette.ink}" d="M11 158C31 153 89 153 109 158L101 181C81 176 39 176 19 181Z"/><text class="motto-copy" x="60" y="171" text-anchor="middle">${motto}</text>`}
  </svg>`;
}

function layerLabel(slot) { return { field:'Поле', ordinary:'Строй', main:'Ратники', secondary:'Лучники', command:'Командование', motto:'Девиз' }[slot]; }
function renderLedger(node, doctrine) {
  node.innerHTML = doctrineLayers(doctrine).map(({slot, definition}) => `<div class="layer-row${definition ? '' : ' is-empty'}"><span>${layerLabel(slot)}</span><div><strong>${definition?.name || 'Не начертано'}</strong><small>${definition?.summary || 'Этот слой откроется после следующего боя.'}</small></div></div>`).join('');
}

function renderMenu() {
  $('#soundButton').textContent = `Звук: ${settings.sound ? 'вкл' : 'выкл'}`;
  $('#continueButton').hidden = !campaign || campaign.completed;
  if (campaign && !campaign.completed) $('#continueCaption').textContent = `Битва ${campaign.battleIndex + 1} из ${BATTLE_COUNT}`;
  const menuDoctrine = campaign?.doctrine || {field:'gules', ordinary:'bend', main:'lion', secondary:'eagle', command:'helmet', motto:'breach'};
  $('#menuHeraldry').innerHTML = achievementMarkup(menuDoctrine, 'menu', true);
}

function renderDoctrine() {
  campaign = prepareBattle(campaign); persist();
  const playerSchool = HERALDIC_SCHOOLS[schoolForDoctrine(campaign.doctrine)];
  const enemySchool = HERALDIC_SCHOOLS[schoolForDoctrine(campaign.currentEnemy)];
  $('#battleIndexLabel').textContent = `БИТВА ${roman(campaign.battleIndex + 1)} ИЗ ${roman(BATTLE_COUNT)}`;
  $('#integrityMarks').textContent = `${'◆'.repeat(campaign.integrity)}${'◇'.repeat(3 - campaign.integrity)}`;
  $('#playerDoctrineName').textContent = doctrineName(campaign.doctrine);
  $('#enemyDoctrineName').textContent = doctrineName(campaign.currentEnemy);
  $('#playerSchoolName').textContent = playerSchool.name;
  $('#enemySchoolName').textContent = enemySchool.name;
  $('#playerAchievement').innerHTML = achievementMarkup(campaign.doctrine, 'player');
  $('#enemyAchievement').innerHTML = achievementMarkup(campaign.currentEnemy, 'enemy');
  renderLedger($('#playerLedger'), campaign.doctrine);
  renderLedger($('#enemyLedger'), campaign.currentEnemy);
}

function renderSetup() {
  $('#fieldChoices').innerHTML = Object.values(FIELDS).map((item) => {
    const livery = liveryForDoctrine({field:item.id, ordinary:setup.ordinary || 'pale'});
    return `<button class="doctrine-choice${setup.field === item.id ? ' is-selected' : ''}" data-field="${item.id}"><i class="tincture-swatch" style="--field:${livery.primary};--metal:${livery.metal};--accent:${livery.accent}"></i><strong>${item.name}</strong><span>${item.summary}</span></button>`;
  }).join('');
  $('#ordinaryChoices').innerHTML = Object.values(ORDINARIES).map((item) => {
    const school = HERALDIC_SCHOOLS[schoolForDoctrine({ordinary:item.id})];
    return `<button class="doctrine-choice${setup.ordinary === item.id ? ' is-selected' : ''}" data-ordinary-choice="${item.id}"><i class="ordinary-preview" data-ordinary="${item.id}" data-school="${school.id}"></i><em>${school.short}</em><strong>${item.name}</strong><span>${item.summary}</span></button>`;
  }).join('');
  $('#sealSetupButton').disabled = !(setup.field && setup.ordinary);
  $$('[data-field]').forEach((button) => button.addEventListener('click', () => { setup.field = button.dataset.field; sound('tap'); renderSetup(); }));
  $$('[data-ordinary-choice]').forEach((button) => button.addEventListener('click', () => { setup.ordinary = button.dataset.ordinaryChoice; sound('tap'); renderSetup(); }));
}
function startNewSetup() { setup = { field:null, ordinary:null }; renderSetup(); openDialog(dialogs.setup); }
function sealSetup() {
  if (!setup.field || !setup.ordinary) return;
  campaign = createCampaign(setup.field, setup.ordinary, Date.now());
  stats.runs += 1; persist(); closeDialog(dialogs.setup); renderDoctrine(); showScreen('doctrine'); sound('seal'); vibrate(15);
}
function continueCampaign() {
  if (!campaign) return;
  if (campaign.phase === 'reward' && campaign.offers?.length) { renderRewards(); openDialog(dialogs.reward); }
  else if (campaign.phase === 'ending') { renderEnding(); openDialog(dialogs.ending); }
  else { renderDoctrine(); showScreen('doctrine'); }
}

function startBattle(replay = false) {
  if (!replay) { campaign = prepareBattle(campaign); persist(); }
  battleState = createBattleState(campaign.doctrine, campaign.currentEnemy, campaign.currentSeed);
  battleSummary = null; battleRunning = true; paused = false; speed = 1; accumulator = 0; lastEventCount = 0;
  $$('.speed-controls button').forEach((button) => button.classList.toggle('is-active', button.dataset.speed === '1'));
  $('#hudPlayerShield').innerHTML = achievementMarkup(campaign.doctrine, 'hud-player', true);
  $('#hudEnemyShield').innerHTML = achievementMarkup(campaign.currentEnemy, 'hud-enemy', true);
  showScreen('battle'); sound('horn');
  requestAnimationFrame(() => { resizeCanvas(); lastFrame = performance.now(); requestAnimationFrame(frame); });
}
function resizeCanvas() {
  const rect = canvas.getBoundingClientRect(); const dpr = Math.min(2, devicePixelRatio || 1);
  canvas.width = Math.max(1, Math.floor(rect.width * dpr)); canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  ctx.setTransform(dpr * rect.width / 1000, 0, 0, dpr * rect.height / 600, 0, 0);
}
function frame(now) {
  if (!battleRunning) return;
  const elapsed = Math.min(.08, (now - lastFrame) / 1000); lastFrame = now;
  if (!paused) { accumulator += elapsed * speed; while (accumulator >= .05 && battleState.status === 'running') { stepBattle(battleState, .05); accumulator -= .05; } }
  drawBattle(); updateBattleHud();
  if (battleState.events.length > lastEventCount) { const event = battleState.events.at(-1); lastEventCount = battleState.events.length; if (event.rule !== 'deployment') flashRule(event.text); }
  if (battleState.status === 'finished') { battleRunning = false; battleSummary = summarizeBattle(battleState); setTimeout(showResult, 500); return; }
  requestAnimationFrame(frame);
}
function flashRule(text) { const node = $('#ruleFlash'); node.textContent = text; node.classList.add('is-visible'); clearTimeout(flashTimer); flashTimer = setTimeout(() => node.classList.remove('is-visible'), 1250); }
function updateBattleHud() {
  $('#battleClock').textContent = fmtTime(battleState.time);
  $('#playerFormation').textContent = `${4 - battleState.player.brokenCount} / 4`;
  $('#enemyFormation').textContent = `${4 - battleState.enemy.brokenCount} / 4`;
}

function drawBattle() {
  const width = 1000, height = 600; ctx.clearRect(0, 0, width, height);
  const sky = ctx.createLinearGradient(0, 0, 0, height); sky.addColorStop(0, '#5b684d'); sky.addColorStop(.48, '#46573f'); sky.addColorStop(1, '#263329');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, width, height);
  ctx.globalAlpha = .12; ctx.strokeStyle = '#e4d5a3'; ctx.lineWidth = 1;
  for (let y = 48; y < height; y += 46) { ctx.beginPath(); ctx.moveTo(0, y); ctx.bezierCurveTo(250, y - 12, 720, y + 14, width, y - 4); ctx.stroke(); }
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(18,24,18,.24)'; ctx.beginPath(); ctx.ellipse(500, 300, 105, 240, 0, 0, Math.PI * 2); ctx.fill();
  drawBanner(battleState.player, battleState.player.doctrine); drawBanner(battleState.enemy, battleState.enemy.doctrine);
  for (const arrow of battleState.arrows) drawArrow(arrow);
  for (const army of [battleState.player, battleState.enemy]) {
    for (const squad of army.archers) drawSquad(squad, army.doctrine);
    for (const squad of army.infantry) drawSquad(squad, army.doctrine);
  }
}

function drawTinyEmblem(id, x, y, size, color) {
  ctx.save(); ctx.translate(x, y); ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, size * .12);
  if (id === 'lion') { ctx.beginPath(); ctx.arc(0, 0, size * .27, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.moveTo(-size*.2, size*.15); ctx.lineTo(-size*.42, size*.42); ctx.moveTo(size*.18,size*.15); ctx.lineTo(size*.42,size*.4); ctx.stroke(); }
  else if (id === 'boar') { ctx.beginPath(); ctx.ellipse(0, 0, size*.38, size*.24, 0, 0, Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.moveTo(size*.28,-size*.05); ctx.lineTo(size*.48,-size*.18); ctx.lineTo(size*.37,size*.08); ctx.fill(); }
  else if (id === 'tower') { ctx.fillRect(-size*.32,-size*.3,size*.64,size*.65); for(let i=-1;i<=1;i++)ctx.fillRect(i*size*.23-size*.08,-size*.45,size*.16,size*.18); }
  else if (id === 'stag') { ctx.beginPath(); ctx.arc(0,size*.05,size*.2,0,Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.moveTo(-size*.12,-size*.12);ctx.lineTo(-size*.32,-size*.43);ctx.moveTo(size*.12,-size*.12);ctx.lineTo(size*.32,-size*.43);ctx.stroke(); }
  else if (id === 'eagle') { ctx.beginPath();ctx.moveTo(0,size*.3);ctx.lineTo(-size*.46,-size*.25);ctx.lineTo(-size*.08,-size*.08);ctx.lineTo(0,-size*.38);ctx.lineTo(size*.08,-size*.08);ctx.lineTo(size*.46,-size*.25);ctx.closePath();ctx.fill(); }
  else if (id === 'rose') { for(let i=0;i<5;i++){ctx.save();ctx.rotate(i*Math.PI*2/5);ctx.beginPath();ctx.ellipse(0,-size*.24,size*.15,size*.28,0,0,Math.PI*2);ctx.fill();ctx.restore();} }
  else if (id === 'key') { ctx.beginPath();ctx.arc(-size*.18,-size*.16,size*.16,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(-size*.05,-size*.04);ctx.lineTo(size*.35,size*.36);ctx.moveTo(size*.2,size*.2);ctx.lineTo(size*.34,size*.07);ctx.stroke(); }
  else if (id === 'sun') { ctx.beginPath();ctx.arc(0,0,size*.24,0,Math.PI*2);ctx.fill();for(let i=0;i<8;i++){ctx.save();ctx.rotate(i*Math.PI/4);ctx.beginPath();ctx.moveTo(0,-size*.32);ctx.lineTo(0,-size*.5);ctx.stroke();ctx.restore();} }
  ctx.restore();
}

function drawBanner(army, doctrine) {
  const livery = liveryForDoctrine(doctrine); const dir = army.side === 'player' ? 1 : -1;
  ctx.save(); ctx.translate(army.banner.x, army.banner.y); ctx.strokeStyle = '#60401f'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(0, 45); ctx.lineTo(0, -58); ctx.stroke();
  ctx.fillStyle = livery.primary; ctx.beginPath(); ctx.moveTo(0,-53); ctx.quadraticCurveTo(dir*30,-58,dir*65,-45); ctx.lineTo(dir*60,-7); ctx.quadraticCurveTo(dir*27,-18,0,-14); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = livery.metal; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = livery.metal;
  if (doctrine.ordinary === 'pale') ctx.fillRect(dir*27,-51,dir*13,39);
  else if (doctrine.ordinary === 'fess') ctx.fillRect(Math.min(dir*60,0),-36,60,10);
  else if (doctrine.ordinary === 'bend') { ctx.save();ctx.translate(dir*31,-31);ctx.rotate(-dir*.55);ctx.fillRect(-5,-28,10,56);ctx.restore(); }
  else { ctx.strokeStyle=livery.metal;ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(dir*13,-17);ctx.lineTo(dir*31,-39);ctx.lineTo(dir*49,-17);ctx.stroke(); }
  drawTinyEmblem(doctrine.main, dir*31, -31, 21, livery.emblem);
  ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fillRect(-28, 48, 56, 7); ctx.restore();
  if (army.banner.capture > 0) { ctx.fillStyle = livery.metal; ctx.fillRect(army.banner.x - 25, army.banner.y + 59, 50 * (army.banner.capture / 3), 4); }
}

function drawSquad(squad, doctrine) {
  if (squad.strength <= .15) return;
  const count = Math.max(1, Math.round(squad.strength)); const livery = liveryForDoctrine(doctrine); const dir = squad.side === 'player' ? 1 : -1;
  const cols = squad.type === 'infantry' ? 4 : 2; const spacing = squad.type === 'infantry' ? 12 : 15;
  ctx.save(); ctx.translate(squad.x, squad.y); ctx.globalAlpha = .35 + .65 * squad.morale;
  for (let index = 0; index < count; index++) {
    const column = index % cols, row = Math.floor(index / cols);
    const offsetX = (column - (cols - 1) / 2) * spacing * dir;
    const offsetY = (row - (Math.ceil(count / cols) - 1) / 2) * spacing;
    drawSoldier(offsetX, offsetY, squad.type, dir, livery, doctrine, index === 0 && squad.leader);
  }
  ctx.globalAlpha = 1; ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(-24,-24,48,3);
  ctx.fillStyle = squad.morale > .45 ? '#d6b951' : squad.morale > .2 ? '#c7773d' : '#9d3034'; ctx.fillRect(-24,-24,48*squad.morale,3);
  if (squad.state === 'rout') { ctx.strokeStyle='#efe1b7';ctx.setLineDash([3,3]);ctx.beginPath();ctx.arc(0,0,29,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]); }
  ctx.restore();
}

function drawSoldier(x, y, type, dir, livery, doctrine, leader) {
  ctx.save(); ctx.translate(x,y); ctx.scale(dir,1);
  ctx.fillStyle='rgba(0,0,0,.28)';ctx.beginPath();ctx.ellipse(0,8,8,4,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=livery.primary;ctx.fillRect(-4,-5,8,13);
  ctx.fillStyle=livery.accent;ctx.fillRect(-4,-5,8,3);
  ctx.fillStyle='#c8a578';ctx.beginPath();ctx.arc(0,-9,4,0,Math.PI*2);ctx.fill();
  if(type==='infantry'){
    ctx.fillStyle=livery.metal;ctx.beginPath();ctx.moveTo(1,-4);ctx.quadraticCurveTo(10,-2,8,9);ctx.lineTo(2,8);ctx.closePath();ctx.fill();
    ctx.strokeStyle=livery.ink;ctx.lineWidth=.8;ctx.stroke();
    ctx.save();ctx.translate(5,2);ctx.scale(.35,.35);drawTinyEmblem(doctrine.main,0,0,10,livery.emblem);ctx.restore();
    ctx.strokeStyle='#59442c';ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(-2,-1);ctx.lineTo(12,-13);ctx.stroke();
  } else {
    ctx.fillStyle=livery.accent;ctx.beginPath();ctx.arc(0,-9,4.5,Math.PI,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#4e3923';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(3,-1,7,-Math.PI/2,Math.PI/2);ctx.stroke();ctx.beginPath();ctx.moveTo(3,-8);ctx.lineTo(3,6);ctx.stroke();
    drawTinyEmblem(doctrine.secondary, -2, 3, 5, livery.metal);
  }
  if(leader){ctx.fillStyle=livery.metal;ctx.beginPath();ctx.moveTo(-4,-15);ctx.lineTo(0,-22);ctx.lineTo(4,-15);ctx.fill();}
  ctx.restore();
}

function drawArrow(arrow) {
  const progress = arrow.life / .34; ctx.save(); ctx.globalAlpha = Math.min(1, progress * 2); ctx.strokeStyle='#d9c292';ctx.lineWidth=1.2;
  ctx.beginPath();ctx.moveTo(arrow.x2+(arrow.x1-arrow.x2)*progress,arrow.y2+(arrow.y1-arrow.y2)*progress);ctx.lineTo(arrow.x2+(arrow.x1-arrow.x2)*Math.min(1,progress+.13),arrow.y2+(arrow.y1-arrow.y2)*Math.min(1,progress+.13));ctx.stroke();ctx.restore();
}

function showResult() {
  const won = battleSummary.winner === 'player';
  $('#resultEyebrow').textContent = `БИТВА ${roman(campaign.battleIndex + 1)} ЗАВЕРШЕНА`;
  $('#resultTitle').textContent = won ? 'Вражеское знамя обрушено' : 'Твой строй разрушен';
  $('#resultMeasures').innerHTML = `<div><span>Время</span><b>${fmtTime(battleSummary.duration)}</b></div><div><span>Твой строй</span><b>${4-battleSummary.playerBroken}/4</b></div><div><span>Вражеский</span><b>${4-battleSummary.enemyBroken}/4</b></div><div><span>Итог</span><b>${won?'Победа':'Поражение'}</b></div>`;
  $('#decisiveEvents').innerHTML = (battleSummary.decisive.length ? battleSummary.decisive : [{time:0,text:'Бой решён общим движением строя.'}]).map((event) => `<article><time>${fmtTime(event.time)} · ${event.side==='player'?'ТВОИ':event.side==='enemy'?'ВРАГ':'ПОЛЕ'}</time><span>${event.text}</span></article>`).join('');
  $('#continueResultButton').querySelector('small').textContent = campaign.battleIndex === BATTLE_COUNT - 1 ? 'Завершить поход' : 'Изменить доктрину';
  openDialog(dialogs.result); sound(won?'win':'lose'); vibrate(won?[20,40,20]:80);
}
function continueAfterResult() {
  campaign = recordBattle(campaign, battleSummary); if (battleSummary.winner === 'player') stats.victories += 1; persist(); closeDialog(dialogs.result);
  if (campaign.completed) { renderEnding(); openDialog(dialogs.ending); return; }
  renderRewards(); openDialog(dialogs.reward);
}
function rewardHeading(slot) {
  return { main:['ГЛАВНАЯ ФИГУРА','Как будут действовать ратники?'], secondary:['ВТОРИЧНАЯ ФИГУРА','Как лучники свяжутся со строем?'], command:['ВНЕШНИЙ ЭЛЕМЕНТ','Кто задаёт высший порядок?'], motto:['ДЕВИЗ','Какое правило один раз превысит остальные?'], revision:['ПЕРЕСМОТР УСТАВА','Что изменить перед последним полем?'] }[slot] || ['НОВЫЙ СЛОЙ','Как изменится армия?'];
}
function principleCopy(principle) {
  return { pressure:'Создаёт последовательное давление, но делает замысел заметнее.', adaptation:'Лучше реагирует на бой, но чаще прерывает начатое.', cohesion:'Связывает части армии, рискуя сделать их слишком зависимыми.', reserve:'Сохраняет решение до кризиса, ослабляя ранний этап.', breach:'Превращает разрыв в глубокий успех, но открывает прорвавшихся.', recovery:'Возвращает потерянную организацию ценой темпа.' }[principle] || 'Меняет решение отрядов, а не их характеристики.';
}
function rewardPreview(offer, index) {
  const previewDoctrine = { ...campaign.doctrine, [offer.slot]: offer.id };
  return achievementMarkup(previewDoctrine, `reward-${campaign.battleIndex}-${index}`, true);
}
function renderRewards() {
  const offers = campaign.offers || []; const first = offers[0]; const [eyebrow,title] = rewardHeading(first?.revision ? 'revision' : first?.slot);
  $('#rewardEyebrow').textContent = eyebrow; $('#rewardTitle').textContent = title;
  $('#rewardGrid').innerHTML = offers.map((offer,index) => `<button class="reward-card" data-offer="${index}"><div class="reward-card-preview">${rewardPreview(offer,index)}</div><div class="reward-card-copy"><em>${offer.revision?`Заменит: ${CATALOGS[offer.slot][offer.replaces]?.name}`:layerLabel(offer.slot)}</em><strong>${offer.definition.name}</strong><p>${offer.definition.summary}</p><small>${offer.definition.detail || principleCopy(offer.definition.principle)}</small></div></button>`).join('');
  $$('.reward-card').forEach((button) => button.addEventListener('click', () => chooseReward(Number(button.dataset.offer))));
}
function chooseReward(index) { const offer=campaign.offers[index];campaign=applyOffer(campaign,offer);persist();closeDialog(dialogs.reward);renderDoctrine();showScreen('doctrine');sound('seal');vibrate(18); }
function renderEnding() {
  const won = campaign.integrity > 0; $('#endingAchievement').innerHTML = achievementMarkup(campaign.doctrine,'ending');
  $('#endingTitle').textContent = won ? `Доктрина выиграла ${campaign.victories} из ${BATTLE_COUNT}` : 'Знамя рода не пережило поход';
  $('#endingCopy').textContent = `Сохранено целостности: ${campaign.integrity} из 3. Победы: ${campaign.victories}. Геральдическая школа: ${HERALDIC_SCHOOLS[schoolForDoctrine(campaign.doctrine)].name}.`;
}
function leaveBattle() { battleRunning=false;paused=false;showScreen('doctrine');renderDoctrine(); }

$('#newButton').addEventListener('click', startNewSetup);
$('#continueButton').addEventListener('click', continueCampaign);
$('#sealSetupButton').addEventListener('click', sealSetup);
$('#rulesButton').addEventListener('click', () => openDialog(dialogs.rules));
$('#codexButton').addEventListener('click', () => openDialog(dialogs.rules));
$('#doctrineMenuButton').addEventListener('click', () => { showScreen('menu'); renderMenu(); });
$('#startBattleButton').addEventListener('click', () => startBattle(false));
$('#leaveBattleButton').addEventListener('click', leaveBattle);
$('#pauseSimulationButton').addEventListener('click', () => { paused=!paused;$('#pauseSimulationButton').textContent=paused?'Продолжить':'Пауза'; });
$('#replayButton').addEventListener('click', () => { closeDialog(dialogs.result); startBattle(true); });
$('#continueResultButton').addEventListener('click', continueAfterResult);
$('#endingMenuButton').addEventListener('click', () => { closeDialog(dialogs.ending); campaign=null; persist(); renderMenu(); showScreen('menu'); });
$('#endingRestartButton').addEventListener('click', () => { closeDialog(dialogs.ending); startNewSetup(); });
$('#soundButton').addEventListener('click', () => { settings.sound=!settings.sound;persist();renderMenu();sound('tap'); });
$$('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => closeDialog(button.closest('dialog'))));
$$('[data-speed]').forEach((button) => button.addEventListener('click', () => { speed=Number(button.dataset.speed);$$('[data-speed]').forEach((other)=>other.classList.toggle('is-active',other===button));sound('tap'); }));
window.addEventListener('resize', () => { if (screens.battle.classList.contains('is-active')) resizeCanvas(); });
window.addEventListener('pagehide', persist);
document.addEventListener('visibilitychange', () => { if (document.hidden) persist(); });
createWorkshopMode({ appName:'БЛАЗОН: Доктрина', version:'3.1.0', cachePrefix:'blazon-', storageNamespace:'pocket-works:blazon', onReset(){store.reset();campaign=null;settings=store.get('settings');stats=store.get('stats');renderMenu();showScreen('menu');} });
watchConnectivity((online) => document.documentElement.dataset.network = online ? 'online' : 'offline');
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
renderMenu(); showScreen('menu');
