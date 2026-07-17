import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createVersionedStore } from '../../shared/capabilities/storage.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { watchConnectivity } from '../../shared/pwa-utils.js';
import {
  AUGMENTS,
  CHARGES,
  HOUSES,
  OPPONENTS,
  ORDINARIES,
  SLOT_META,
  TINCTURES,
  cardDefinition,
  campaignSummary,
  chooseEnemyAction,
  chooseReward,
  createCampaign,
  finishBattle,
  hydrateCampaign,
  isLegalPlacement,
  playRound,
  previewAction,
  restartBattle
} from './engine.js';

installMobileRuntime();

const store = createVersionedStore({
  namespace: 'pocket-works:blazon',
  version: 1,
  defaults: {
    settings: { sound: true, seenRules: false },
    campaign: null,
    stats: { campaigns: 0, duelsWon: 0, completed: 0 }
  }
});

const $ = (selector) => document.querySelector(selector);
const menuScreen = $('#menuScreen');
const gameScreen = $('#gameScreen');
const handElement = $('#hand');
const shieldTargets = $('#shieldTargets');
const ordinaryTarget = $('#ordinaryTarget');
const houseDialog = $('#houseDialog');
const rulesDialog = $('#rulesDialog');
const pauseDialog = $('#pauseDialog');
const rewardDialog = $('#rewardDialog');
const resultDialog = $('#resultDialog');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

let settings = store.get('settings');
let stats = store.get('stats');
let campaign = hydrateCampaign(store.get('campaign'));
let selectedCardId = null;
let busy = false;
let audioContext = null;
let toastTimer = 0;
let resultAction = 'menu';

const SHIELD_PATH = 'M9 7 H91 V53 C91 78 77 96 50 108 C23 96 9 78 9 53 Z';
const INNER_PATH = 'M13 11 H87 V52 C87 74 74 91 50 102 C26 91 13 74 13 52 Z';

function persist() {
  store.patch({ settings, campaign, stats });
}

function showScreen(name) {
  menuScreen.classList.toggle('is-active', name === 'menu');
  gameScreen.classList.toggle('is-active', name === 'game');
}

function openDialog(dialog) {
  if (!dialog.open) dialog.showModal();
}

function closeDialog(dialog) {
  if (dialog.open) dialog.close();
}

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 1500);
}

function svgUse(device, className = '') {
  return `<use class="${className}" href="#sigil-${device}"></use>`;
}

function ordinaryMarkup(ordinary, clipId, opacity = 1) {
  if (!ordinary) return '';
  const fill = TINCTURES[ordinary.tincture]?.color || '#d7aa32';
  const common = `fill="${fill}" class="ordinary-mark" opacity="${opacity}" clip-path="url(#${clipId})"`;
  switch (ordinary.device) {
    case 'pale': return `<rect x="40" y="5" width="20" height="104" ${common}/>`;
    case 'bend': return `<path d="M-5 17 9 3 105 93 91 109 Z" ${common}/>`;
    case 'chevron': return `<path d="M18 83 50 49 82 83" fill="none" stroke="${fill}" stroke-width="16" stroke-linejoin="miter" opacity="${opacity}" clip-path="url(#${clipId})" class="ordinary-mark"/>`;
    case 'chief': return `<rect x="6" y="5" width="88" height="31" ${common}/>`;
    case 'saltire': return `<path d="M2 12 14 1 98 94 86 107 Z M86 1 98 12 14 107 2 94 Z" ${common}/>`;
    case 'bordure': return `<path d="${SHIELD_PATH}" fill="none" stroke="${fill}" stroke-width="10" opacity="${opacity}" clip-path="url(#${clipId})" class="ordinary-mark"/>`;
    default: return '';
  }
}

function shieldMarkup(combatant, id, options = {}) {
  const field = TINCTURES[combatant.field] || TINCTURES.gules;
  const clipId = `${id}-shield-clip`;
  const charges = [];
  combatant.board?.forEach((card, index) => {
    if (!card) return;
    const slot = SLOT_META[index];
    const tincture = TINCTURES[card.tincture] || TINCTURES.or;
    const size = options.compact ? 18 : 22;
    const scale = size / 100;
    const x = slot.x - size / 2;
    const y = slot.y - size / 2 + 4;
    const newClass = options.newCardId === card.id ? ' is-new' : '';
    charges.push(`<g class="charge-mark${newClass}" style="color:${tincture.color};--sigil-eye:${tincture.ink}" transform="translate(${x} ${y}) scale(${scale})">${svgUse(card.device)}</g>`);
  });

  if (options.watermark && (!combatant.board || combatant.board.every((card) => !card))) {
    const tincture = TINCTURES[options.watermarkTincture || 'or'];
    charges.push(`<g class="charge-mark" opacity=".94" style="color:${tincture.color};--sigil-eye:${tincture.ink}" transform="translate(27 32) scale(.46)">${svgUse(options.watermark)}</g>`);
  }

  return `
    <defs><clipPath id="${clipId}"><path d="${SHIELD_PATH}"/></clipPath></defs>
    <path d="${SHIELD_PATH}" fill="${field.color}" class="shield-inner"/>
    <g clip-path="url(#${clipId})">
      <path d="${SHIELD_PATH}" fill="url(#${id}-grain)" opacity=".13"/>
      ${ordinaryMarkup(combatant.ordinary, clipId)}
      ${charges.join('')}
    </g>
    <path d="${SHIELD_PATH}" class="shield-outline"/>
    <path d="${INNER_PATH}" fill="none" stroke="rgba(255,255,255,.2)" stroke-width="1"/>
  `;
}

function standaloneShieldSvg(combatant, id, options = {}) {
  return `<svg viewBox="0 0 100 112" aria-hidden="true">${shieldMarkup(combatant, id, options)}</svg>`;
}

function housePreviewCombatant(house) {
  return {
    field: house.field,
    ordinary: null,
    board: [null, null, null, { kind: 'charge', device: house.charge, tincture: TINCTURES[house.field].class === 'color' ? 'or' : 'gules' }, null, null, null]
  };
}

function renderMenuEmblem() {
  const house = campaign ? HOUSES[campaign.houseId] : HOUSES.lion;
  $('#menuEmblem').innerHTML = standaloneShieldSvg(housePreviewCombatant(house), 'menu-emblem');
}

function renderMenu() {
  renderMenuEmblem();
  $('#soundButton').textContent = `Звук: ${settings.sound ? 'вкл' : 'выкл'}`;
  const continueButton = $('#continueButton');
  const strip = $('#campaignStrip');
  if (!campaign) {
    continueButton.hidden = true;
    strip.hidden = true;
    $('#newCampaignButton').querySelector('span').textContent = 'Поднять знамя';
    return;
  }

  const summary = campaignSummary(campaign);
  continueButton.hidden = false;
  strip.hidden = false;
  $('#campaignHouse').textContent = summary.house.short;
  $('#campaignProgress').textContent = summary.completed ? 'ПОХОД ЗАВЕРШЁН' : `${summary.stage + 1} / ${OPPONENTS.length}`;
  $('#campaignOpponent').textContent = summary.completed ? 'Три великих дома признали твоё знамя' : `Противник: ${summary.opponent.short}`;
  $('#continueCaption').textContent = summary.completed
    ? 'Посмотреть итог похода'
    : campaign.battle.phase === 'reward'
      ? 'Забрать пожалование'
      : `Ход ${Math.min(campaign.battle.turn, campaign.battle.maxTurns)} · ${summary.opponent.short}`;
  $('#newCampaignButton').querySelector('span').textContent = 'Новый поход';
}

function renderHouseGrid() {
  const grid = $('#houseGrid');
  grid.replaceChildren();
  Object.values(HOUSES).forEach((house) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'house-card';
    button.dataset.house = house.id;
    button.innerHTML = `
      <div class="house-shield">${standaloneShieldSvg(housePreviewCombatant(house), `house-${house.id}`)}</div>
      <div><strong>${house.name}</strong><em>«${house.motto}»</em><small>${house.passive}</small></div>
    `;
    button.addEventListener('click', () => startCampaign(house.id));
    grid.append(button);
  });
}

function startCampaign(houseId) {
  campaign = createCampaign(houseId, Date.now());
  stats.campaigns += 1;
  selectedCardId = null;
  busy = false;
  persist();
  closeDialog(houseDialog);
  showScreen('game');
  renderBattle();
  playSound('seal');
  vibrate(18);
  if (!settings.seenRules) {
    settings.seenRules = true;
    persist();
    setTimeout(() => openDialog(rulesDialog), reduceMotion ? 0 : 360);
  }
}

function continueCampaign() {
  if (!campaign) {
    openDialog(houseDialog);
    return;
  }
  showScreen('game');
  renderBattle();
  if (campaign.completed || campaign.battle.winner) setTimeout(showBattleResult, 80);
}

function renderCombatant(side, combatant) {
  const prefix = side === 'player' ? 'player' : 'enemy';
  $(`#${prefix}Renown`).textContent = Math.max(0, combatant.renown);
  $(`#${prefix}Guard`).textContent = combatant.guard;
  $(`#${prefix}Honor`).textContent = combatant.honor;
  $(`#${prefix}Fury`).textContent = combatant.fury;
  const fill = Math.max(0, Math.min(100, (combatant.renown / combatant.maxRenown) * 100));
  $(`#${prefix}RenownFill`).style.width = `${fill}%`;
}

function renderShields(lastClash = null) {
  const battle = campaign.battle;
  const playerNew = lastClash?.player?.card?.id;
  const enemyNew = lastClash?.enemy?.card?.id;
  $('#playerShield').innerHTML = shieldMarkup(battle.player, 'player', { newCardId: playerNew });
  $('#enemyShield').innerHTML = shieldMarkup(battle.enemy, 'enemy', { compact: true, newCardId: enemyNew });
}

function ordinaryMiniSvg(card, under) {
  const clipId = `mini-${card.id.replace(/[^a-z0-9-]/gi, '')}`;
  return `<svg viewBox="0 0 100 112" aria-hidden="true">
    <defs><clipPath id="${clipId}"><path d="${SHIELD_PATH}"/></clipPath></defs>
    <path d="${SHIELD_PATH}" fill="${TINCTURES[under].color}" opacity=".18"/>
    ${ordinaryMarkup(card, clipId, 1)}
    <path d="${SHIELD_PATH}" fill="none" stroke="rgba(32,29,23,.6)" stroke-width="2"/>
  </svg>`;
}

function cardDescription(card, preview) {
  const def = cardDefinition(card);
  if (card.kind === 'ordinary') return `${def.verb}. Меняет слой под отмеченными позициями.`;
  const tags = [];
  if (def.attack >= 4) tags.push('удар');
  if (def.guard >= 3) tags.push('оборона');
  if (def.honor >= 1) tags.push('честь');
  if (def.heal >= 1) tags.push('исцеление');
  if (def.pierce >= 1) tags.push('пробитие');
  return `${def.verb}. ${tags.join(' · ') || (preview.legal ? 'законный строй' : 'яростный риск')}.`;
}

function renderHand() {
  const battle = campaign.battle;
  handElement.replaceChildren();
  battle.player.hand.forEach((card) => {
    const target = card.kind === 'ordinary' ? 'ordinary' : 3;
    const preview = previewAction(battle, 'player', card, target);
    const def = cardDefinition(card);
    const tincture = TINCTURES[card.tincture];
    const under = TINCTURES[preview.underTincture];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `herald-card${selectedCardId === card.id ? ' is-selected' : ''}`;
    button.dataset.cardId = card.id;
    button.style.setProperty('--card-tincture', tincture.color);
    button.style.setProperty('--card-ink', tincture.ink);
    button.style.setProperty('--card-under', under.color);
    button.style.setProperty('--law-color', preview.legal ? '#356651' : '#9f3229');
    const deviceMarkup = card.kind === 'ordinary'
      ? ordinaryMiniSvg(card, preview.underTincture)
      : `<span class="mini-shield"></span><svg viewBox="0 0 100 100" aria-hidden="true" style="--sigil-eye:${tincture.ink}">${svgUse(card.device)}</svg>`;
    button.innerHTML = `
      <span class="card-law">${preview.legal ? 'ЗАКОН' : 'ЕРЕСЬ'}</span>
      <span class="card-tincture" data-short="${tincture.short}"></span>
      <span class="card-device">${deviceMarkup}</span>
      <strong>${def.name}</strong>
      <small>${cardDescription(card, preview)}</small>
      <span class="card-values"><span>⚔ ${preview.attack}</span><span>▰ ${preview.guard}</span><span>✦ ${preview.honor}</span></span>
    `;
    button.addEventListener('click', () => selectCard(card.id));
    handElement.append(button);
  });
}

function ensureShieldTargets() {
  if (shieldTargets.childElementCount) return;
  SLOT_META.forEach((slot) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'shield-slot';
    button.dataset.slot = slot.id;
    button.setAttribute('aria-label', `Поставить фигуру: ${slot.label}`);
    button.style.left = `${slot.x}%`;
    button.style.top = `${slot.y}%`;
    button.addEventListener('click', () => commitPlayerMove(slot.id));
    shieldTargets.append(button);
  });
}

function selectCard(cardId) {
  if (busy || campaign?.battle?.winner) return;
  const card = campaign.battle.player.hand.find((item) => item.id === cardId);
  if (!card) return;
  selectedCardId = selectedCardId === cardId ? null : cardId;
  renderHand();
  renderTargets();
  playSound('tap');
  vibrate(8);
}

function renderTargets() {
  ensureShieldTargets();
  const battle = campaign.battle;
  const card = battle.player.hand.find((item) => item.id === selectedCardId);
  shieldTargets.classList.toggle('is-active', !!card && card.kind === 'charge' && !busy);
  ordinaryTarget.hidden = !(card && card.kind === 'ordinary' && !busy);

  if (!card) {
    $('#placementHint').textContent = busy ? 'Герольды сводят знаки…' : 'Выбери фигуру из руки.';
    return;
  }

  const def = cardDefinition(card);
  if (card.kind === 'ordinary') {
    const legal = isLegalPlacement(battle.player, card, null);
    ordinaryTarget.textContent = `${legal ? 'Законно' : 'Ересь'}: наложить ${def.name.toLowerCase()}`;
    $('#placementHint').textContent = `${def.name}: изменит слой щита и усилит отмеченные позиции.`;
    return;
  }

  shieldTargets.querySelectorAll('.shield-slot').forEach((button) => {
    const slot = Number(button.dataset.slot);
    const legal = isLegalPlacement(battle.player, card, slot);
    button.dataset.legal = String(legal);
    button.dataset.law = legal ? 'ЗАКОН' : 'ЕРЕСЬ';
  });
  $('#placementHint').textContent = `${def.name}: зелёные позиции законны, красные дадут ярость ценой славы.`;
}

function updateClashRibbon(clash = null) {
  const ribbon = $('#clashRibbon');
  ribbon.dataset.state = clash ? 'clash' : 'ready';
  if (!clash) {
    $('#clashEnemy').textContent = 'Соперник ждёт';
    $('#clashCenter').textContent = busy ? 'ГЕРОЛЬДЫ СУДЯТ' : 'ВЫБЕРИ ФИГУРУ';
    $('#clashPlayer').textContent = busy ? 'Ход принят' : 'Твой ход';
    return;
  }
  const enemyDef = cardDefinition(clash.enemy.card);
  const playerDef = cardDefinition(clash.player.card);
  $('#clashEnemy').textContent = `${enemyDef.name}: −${clash.damageToPlayer}`;
  $('#clashCenter').textContent = clash.player.legal ? 'ЗАКОН УСТОЯЛ' : 'ЕРЕСЬ УДАРИЛА';
  $('#clashPlayer').textContent = `${playerDef.name}: −${clash.damageToEnemy}`;
  ribbon.classList.remove('pulse');
  void ribbon.offsetWidth;
  ribbon.dataset.state = 'clash';
}

function renderAugments() {
  const line = $('#augmentLine');
  if (!campaign.augments.length) {
    line.textContent = 'Без пожалований';
    return;
  }
  line.textContent = campaign.augments.map((id) => AUGMENTS[id]?.name).filter(Boolean).join(' · ');
}

function renderBattle() {
  if (!campaign?.battle) return;
  const battle = campaign.battle;
  $('#opponentName').textContent = battle.enemy.short;
  $('#enemyMotto').textContent = `«${battle.enemy.motto}»`;
  $('#playerHouseName').textContent = battle.player.short;
  $('#roundLabel').textContent = battle.winner ? 'Дуэль завершена' : `Ход ${Math.min(battle.turn, battle.maxTurns)} / ${battle.maxTurns}`;
  renderCombatant('player', battle.player);
  renderCombatant('enemy', battle.enemy);
  renderShields(battle.lastClash);
  renderAugments();
  renderHand();
  renderTargets();
  updateClashRibbon(battle.lastClash);
}

function scheduleResult() {
  setTimeout(showBattleResult, reduceMotion ? 0 : 520);
}

function commitPlayerMove(target) {
  if (busy || !campaign?.battle || campaign.battle.winner) return;
  const card = campaign.battle.player.hand.find((item) => item.id === selectedCardId);
  if (!card) {
    showToast('Сначала выбери фигуру.');
    playSound('bad');
    return;
  }
  if (card.kind === 'ordinary' && target !== 'ordinary') return;
  busy = true;
  renderTargets();
  updateClashRibbon();
  playSound('select');

  const resolve = () => {
    const enemyChoice = chooseEnemyAction(campaign.battle);
    const result = playRound(campaign.battle, card.id, target, enemyChoice);
    if (!result.ok) {
      busy = false;
      showToast(result.error);
      renderBattle();
      playSound('bad');
      return;
    }

    campaign.battle = result.battle;
    if (result.battle.winner === 'player') {
      stats.duelsWon += 1;
      campaign = finishBattle(campaign, result.battle);
      if (campaign.completed) stats.completed += 1;
    }
    selectedCardId = null;
    busy = false;
    persist();
    renderBattle();
    updateClashRibbon(result.clash);
    const dealt = result.clash.damageToEnemy;
    const taken = result.clash.damageToPlayer;
    playSound(result.battle.winner ? (result.battle.winner === 'player' ? 'win' : 'lose') : dealt > taken ? 'hit' : taken > dealt ? 'hurt' : 'seal');
    vibrate(result.battle.winner ? [25, 35, 55] : dealt + taken > 4 ? 25 : 10);
    if (result.battle.winner) scheduleResult();
  };

  setTimeout(resolve, reduceMotion ? 0 : 260);
}

function renderRewards() {
  const grid = $('#rewardGrid');
  grid.replaceChildren();
  campaign.rewards.forEach((id) => {
    const reward = AUGMENTS[id];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'reward-card';
    button.innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true">${svgUse('crown')}</svg><span><strong>${reward.name}</strong><small>${reward.detail}</small></span><b>→</b>`;
    button.addEventListener('click', () => acceptReward(id));
    grid.append(button);
  });
}

function acceptReward(id) {
  campaign = chooseReward(campaign, id);
  selectedCardId = null;
  persist();
  closeDialog(rewardDialog);
  showScreen('game');
  renderBattle();
  playSound('reward');
  vibrate([15, 30, 15]);
}

function showBattleResult() {
  if (!campaign?.battle?.winner && !campaign.completed) return;
  const battle = campaign.battle;
  const won = battle.winner === 'player';
  $('#resultVictories').textContent = campaign.victories;
  $('#resultHonor').textContent = battle.player.honor;
  $('#resultAugments').textContent = campaign.augments.length;

  if (campaign.completed) {
    $('#resultKicker').textContent = 'Великий гербовник закрыт';
    $('#resultTitle').textContent = 'Твоё знамя признано';
    $('#resultCopy').textContent = `${HOUSES[campaign.houseId].name} прошёл три суда. Закон, ересь и хитрость теперь записаны как одна победная родословная.`;
    $('#resultPrimaryButton').querySelector('span').textContent = 'Начать новый поход';
    resultAction = 'new';
  } else if (won) {
    $('#resultKicker').textContent = battle.resultReason === 'judgement' ? 'Суд герольдов' : 'Знамя соперника сломано';
    $('#resultTitle').textContent = 'Дом признал поражение';
    $('#resultCopy').textContent = `${battle.enemy.name} уступает дорогу. Победа даёт право добавить к гербу новое пожалование.`;
    $('#resultPrimaryButton').querySelector('span').textContent = 'Принять пожалование';
    resultAction = 'reward';
  } else {
    $('#resultKicker').textContent = battle.resultReason === 'judgement' ? 'Суд герольдов' : 'Твоё знамя пало';
    $('#resultTitle').textContent = 'Род ещё не мёртв';
    $('#resultCopy').textContent = `${battle.enemy.name} выиграл эту дуэль. Пожалования сохранены — можно немедленно потребовать реванш.`;
    $('#resultPrimaryButton').querySelector('span').textContent = 'Потребовать реванш';
    resultAction = 'restart';
  }
  openDialog(resultDialog);
}

function runResultPrimary() {
  closeDialog(resultDialog);
  if (resultAction === 'reward') {
    renderRewards();
    openDialog(rewardDialog);
    return;
  }
  if (resultAction === 'restart') {
    campaign = restartBattle(campaign);
    selectedCardId = null;
    persist();
    showScreen('game');
    renderBattle();
    return;
  }
  if (resultAction === 'new') {
    openDialog(houseDialog);
    return;
  }
  showScreen('menu');
  renderMenu();
}

function toggleSound() {
  settings.sound = !settings.sound;
  persist();
  renderMenu();
  if (settings.sound) playSound('tap');
}

function vibrate(pattern) {
  try { navigator.vibrate?.(pattern); } catch {}
}

function playSound(type) {
  if (!settings.sound) return;
  try {
    audioContext ||= new AudioContext();
    if (audioContext.state === 'suspended') audioContext.resume();
    const now = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const map = {
      tap: [310, 0.045, 'sine'], select: [185, 0.08, 'triangle'], seal: [130, 0.11, 'triangle'],
      hit: [95, 0.16, 'sawtooth'], hurt: [70, 0.18, 'square'], bad: [78, 0.07, 'square'],
      reward: [260, 0.22, 'triangle'], win: [220, 0.34, 'triangle'], lose: [120, 0.3, 'sawtooth']
    };
    const [frequency, duration, wave] = map[type] || map.tap;
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(frequency, now);
    if (type === 'win' || type === 'reward') oscillator.frequency.exponentialRampToValueAtTime(frequency * 2.4, now + duration);
    if (type === 'lose' || type === 'hurt') oscillator.frequency.exponentialRampToValueAtTime(Math.max(42, frequency * .55), now + duration);
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(type === 'hit' ? .075 : .045, now + .008);
    gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + .03);
  } catch {}
}

$('#soundButton').addEventListener('click', toggleSound);
$('#newCampaignButton').addEventListener('click', () => openDialog(houseDialog));
$('#continueButton').addEventListener('click', continueCampaign);
$('#rulesButton').addEventListener('click', () => openDialog(rulesDialog));
$('#gameRulesButton').addEventListener('click', () => openDialog(rulesDialog));
$('#pauseButton').addEventListener('click', () => { if (!busy) openDialog(pauseDialog); });
$('#resumeButton').addEventListener('click', () => closeDialog(pauseDialog));
$('#restartBattleButton').addEventListener('click', () => {
  campaign = restartBattle(campaign);
  selectedCardId = null;
  persist();
  closeDialog(pauseDialog);
  renderBattle();
});
$('#pauseMenuButton').addEventListener('click', () => {
  closeDialog(pauseDialog);
  showScreen('menu');
  renderMenu();
});
ordinaryTarget.addEventListener('click', () => commitPlayerMove('ordinary'));
$('#resultPrimaryButton').addEventListener('click', runResultPrimary);
$('#resultMenuButton').addEventListener('click', () => {
  closeDialog(resultDialog);
  showScreen('menu');
  renderMenu();
});
document.querySelectorAll('[data-close-dialog]').forEach((button) => {
  button.addEventListener('click', () => closeDialog(button.closest('dialog')));
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    const open = document.querySelector('dialog[open]');
    if (open) closeDialog(open);
    else if (gameScreen.classList.contains('is-active') && !busy) openDialog(pauseDialog);
    return;
  }
  if (!gameScreen.classList.contains('is-active') || busy) return;
  const index = Number(event.key) - 1;
  if (index >= 0 && index < campaign.battle.player.hand.length) selectCard(campaign.battle.player.hand[index].id);
});

window.addEventListener('pagehide', persist);
document.addEventListener('visibilitychange', () => { if (document.hidden) persist(); });
window.addEventListener('appdatareset', () => {
  campaign = null;
  settings = store.get('settings');
  stats = store.get('stats');
  selectedCardId = null;
  showScreen('menu');
  renderMenu();
});

createWorkshopMode({
  appName: 'БЛАЗОН',
  version: '1.0.0',
  cachePrefix: 'blazon-',
  storageNamespace: 'pocket-works:blazon',
  onReset() {
    store.reset();
    settings = store.get('settings');
    stats = store.get('stats');
    campaign = null;
    selectedCardId = null;
    closeDialog(pauseDialog);
    closeDialog(resultDialog);
    closeDialog(rewardDialog);
    showScreen('menu');
    renderMenu();
  }
});

watchConnectivity((online) => {
  document.documentElement.dataset.network = online ? 'online' : 'offline';
});

renderHouseGrid();
renderMenu();
showScreen('menu');
