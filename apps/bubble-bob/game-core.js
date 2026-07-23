import { createVersionedStore } from '../../shared/capabilities/storage.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { watchConnectivity } from '../../shared/pwa-utils.js';
import { createRenderer } from './game-draw.js';

export function startBubbleBob() {
  const STORAGE_NAMESPACE = 'pocket-works:bubble-bob';
  const store = createVersionedStore({
    namespace: STORAGE_NAMESPACE,
    version: 1,
    defaults: {
      best: 0,
      sound: true,
      games: 0,
      totalPatties: 0
    }
  });

  const canvas = document.querySelector('#gameCanvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const startScreen = document.querySelector('#startScreen');
  const gameOverScreen = document.querySelector('#gameOverScreen');
  const pauseDialog = document.querySelector('#pauseDialog');
  const scoreValue = document.querySelector('#scoreValue');
  const comboValue = document.querySelector('#comboValue');
  const comboBox = document.querySelector('#comboBox');
  const bestValue = document.querySelector('#bestValue');
  const lifeStrip = document.querySelector('#lifeStrip');
  const powerStrip = document.querySelector('#powerStrip');
  const powerBar = powerStrip.querySelector('i');
  const resultScore = document.querySelector('#resultScore');
  const resultCombo = document.querySelector('#resultCombo');
  const resultPatties = document.querySelector('#resultPatties');
  const recordBadge = document.querySelector('#recordBadge');
  const soundButton = document.querySelector('#soundButton');
  const pauseButton = document.querySelector('#pauseButton');
  const toastElement = document.querySelector('#toast');

  const TAU = Math.PI * 2;
  const state = {
    mode: 'menu',
    paused: false,
    score: 0,
    combo: 0,
    bestCombo: 1,
    lives: 3,
    patties: 0,
    time: 0,
    spawnClock: 0,
    nextSpawn: 0.78,
    shieldUntil: 0,
    shake: 0,
    flash: 0,
    sound: store.get('sound', true),
    pointerActive: false,
    keyboardDirection: 0
  };

  let viewWidth = 390;
  let viewHeight = 844;
  let dpr = 1;
  let lastFrame = performance.now();
  let audioContext = null;
  let toastTimer = 0;

  const player = {
    x: 195,
    targetX: 195,
    y: 720,
    width: 66,
    height: 84,
    tilt: 0,
    squash: 0,
    invulnerableUntil: 0
  };

  const entities = [];
  const particles = [];
  const floaters = [];
  const backgroundBubbles = Array.from({ length: 18 }, (_, index) => ({
    x: (index * 73) % 390,
    y: (index * 137) % 844,
    r: 4 + (index % 5) * 2.4,
    speed: 7 + (index % 4) * 4,
    drift: index * 0.9
  }));

  const flowerShapes = [
    { x: .13, y: .19, size: 24, rotation: .1, alpha: .12 },
    { x: .82, y: .27, size: 34, rotation: .6, alpha: .1 },
    { x: .64, y: .54, size: 19, rotation: .2, alpha: .09 },
    { x: .22, y: .68, size: 29, rotation: .9, alpha: .08 }
  ];

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    viewWidth = Math.max(320, rect.width);
    viewHeight = Math.max(520, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(viewWidth * dpr);
    canvas.height = Math.round(viewHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    player.y = viewHeight - Math.max(84, viewHeight * .105);
    player.x = clamp(player.x, 44, viewWidth - 44);
    player.targetX = clamp(player.targetX, 44, viewWidth - 44);
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function random(minimum, maximum) {
    return minimum + Math.random() * (maximum - minimum);
  }

  function ease(current, target, speed, dt) {
    return current + (target - current) * (1 - Math.exp(-speed * dt));
  }

  function setSound(enabled) {
    state.sound = Boolean(enabled);
    store.set('sound', state.sound);
    soundButton.textContent = state.sound ? '♪' : '×';
    soundButton.setAttribute('aria-label', state.sound ? 'Выключить звук' : 'Включить звук');
  }

  function unlockAudio() {
    if (!state.sound) return;
    const AudioEngine = window.AudioContext || window.webkitAudioContext;
    if (!AudioEngine) return;
    if (!audioContext) audioContext = new AudioEngine();
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
  }

  function tone(frequency, duration = .08, type = 'sine', volume = .045, slide = 0) {
    if (!state.sound) return;
    unlockAudio();
    if (!audioContext) return;
    const now = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    if (slide) oscillator.frequency.exponentialRampToValueAtTime(Math.max(40, frequency + slide), now + duration);
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + .01);
    gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + .02);
  }

  function haptic(pattern) {
    if ('vibrate' in navigator) navigator.vibrate(pattern);
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    toastElement.textContent = message;
    toastElement.classList.add('is-visible');
    toastTimer = window.setTimeout(() => toastElement.classList.remove('is-visible'), 1100);
  }

  function updateHud() {
    scoreValue.textContent = Math.floor(state.score).toLocaleString('ru-RU');
    const multiplier = comboMultiplier();
    comboValue.textContent = `×${multiplier.toFixed(multiplier % 1 ? 1 : 0)}`;
    [...lifeStrip.children].forEach((heart, index) => heart.classList.toggle('is-lost', index >= state.lives));
    const shieldRemaining = Math.max(0, state.shieldUntil - state.time);
    powerStrip.hidden = shieldRemaining <= 0;
    if (shieldRemaining > 0) powerBar.style.transform = `scaleX(${shieldRemaining / 6})`;
  }

  function pulseCombo() {
    comboBox.classList.remove('is-hot');
    void comboBox.offsetWidth;
    comboBox.classList.add('is-hot');
  }

  function comboMultiplier() {
    return Math.min(3, 1 + Math.floor(state.combo / 5) * .25);
  }

  function startGame() {
    unlockAudio();
    Object.assign(state, {
      mode: 'playing', paused: false, score: 0, combo: 0, bestCombo: 1,
      lives: 3, patties: 0, time: 0, spawnClock: 0, nextSpawn: .7,
      shieldUntil: 0, shake: 0, flash: 0
    });
    entities.length = 0;
    particles.length = 0;
    floaters.length = 0;
    Object.assign(player, {
      x: viewWidth / 2, targetX: viewWidth / 2, tilt: 0, squash: 0, invulnerableUntil: 0
    });
    startScreen.hidden = true;
    gameOverScreen.hidden = true;
    pauseButton.disabled = false;
    updateHud();
    tone(392, .08, 'square', .035, 170);
    window.setTimeout(() => tone(659, .12, 'square', .035, 140), 80);
  }

  function returnToMenu() {
    state.mode = 'menu';
    state.paused = false;
    entities.length = particles.length = floaters.length = 0;
    gameOverScreen.hidden = true;
    startScreen.hidden = false;
    pauseButton.disabled = true;
    bestValue.textContent = store.get('best', 0).toLocaleString('ru-RU');
    updateHud();
  }

  function finishGame() {
    if (state.mode !== 'playing') return;
    state.mode = 'gameover';
    state.paused = false;
    pauseButton.disabled = true;
    const finalScore = Math.floor(state.score);
    const previousBest = store.get('best', 0);
    const isRecord = finalScore > previousBest;
    store.patch({
      best: Math.max(previousBest, finalScore),
      games: store.get('games', 0) + 1,
      totalPatties: store.get('totalPatties', 0) + state.patties
    });
    resultScore.textContent = finalScore.toLocaleString('ru-RU');
    resultCombo.textContent = `×${state.bestCombo.toFixed(state.bestCombo % 1 ? 1 : 0)}`;
    resultPatties.textContent = String(state.patties);
    recordBadge.hidden = !isRecord;
    bestValue.textContent = Math.max(previousBest, finalScore).toLocaleString('ru-RU');
    gameOverScreen.hidden = false;
    tone(280, .18, 'sawtooth', .04, -90);
    window.setTimeout(() => tone(160, .28, 'triangle', .035, -70), 120);
    haptic([70, 50, 120]);
  }

  function pauseGame() {
    if (state.mode !== 'playing' || state.paused) return;
    state.paused = true;
    if (!pauseDialog.open) pauseDialog.showModal();
  }

  function resumeGame() {
    if (pauseDialog.open) pauseDialog.close();
    state.paused = false;
    lastFrame = performance.now();
  }

  function spawnEntity() {
    const difficulty = Math.min(1, state.time / 75);
    const roll = Math.random();
    let type = 'patty';
    if (roll < .18 + difficulty * .06) type = 'jelly';
    else if (roll < .46) type = 'bubble';
    else if (roll > .97 && state.time > 8 && state.shieldUntil <= state.time) type = 'spatula';

    const radius = type === 'jelly' ? 25 : type === 'patty' ? 22 : type === 'spatula' ? 20 : 18;
    const baseSpeed = 135 + difficulty * 135;
    entities.push({
      type,
      x: random(radius + 8, viewWidth - radius - 8),
      y: -radius - 16,
      radius,
      speed: baseSpeed * random(.88, 1.18) * (type === 'bubble' ? .8 : 1),
      spin: random(-2.2, 2.2),
      rotation: random(0, TAU),
      phase: random(0, TAU),
      caught: false
    });
  }

  function collides(entity) {
    const box = {
      left: player.x - player.width * .34,
      right: player.x + player.width * .34,
      top: player.y - player.height * .42,
      bottom: player.y + player.height * .43
    };
    const dx = entity.x - clamp(entity.x, box.left, box.right);
    const dy = entity.y - clamp(entity.y, box.top, box.bottom);
    return dx * dx + dy * dy < entity.radius * entity.radius * .72;
  }

  function catchEntity(entity) {
    entity.caught = true;
    if (entity.type === 'jelly') {
      hitPlayer();
      burst(entity.x, entity.y, '#ff7ca9', 15, 150);
      return;
    }
    if (entity.type === 'spatula') {
      state.shieldUntil = state.time + 6;
      state.combo += 2;
      burst(entity.x, entity.y, '#ffd83d', 20, 190);
      addFloater(entity.x, entity.y, 'ЩИТ!', '#ffd83d');
      tone(520, .12, 'square', .04, 410);
      haptic(35);
      showToast('Золотая лопатка: медузы временно идут лесом');
      updateHud();
      return;
    }

    state.combo += 1;
    const multiplier = comboMultiplier();
    state.bestCombo = Math.max(state.bestCombo, multiplier);
    const basePoints = entity.type === 'patty' ? 10 : 4;
    const earned = Math.round(basePoints * multiplier);
    state.score += earned;
    if (entity.type === 'patty') state.patties += 1;
    burst(entity.x, entity.y, entity.type === 'patty' ? '#ffd83d' : '#c9f6ff', entity.type === 'patty' ? 12 : 8, 120);
    addFloater(entity.x, entity.y, `+${earned}`, entity.type === 'patty' ? '#ffd83d' : '#e9fbff');
    player.squash = entity.type === 'patty' ? .28 : .16;
    tone(entity.type === 'patty' ? 430 + Math.min(state.combo, 18) * 12 : 700, .07, entity.type === 'patty' ? 'square' : 'sine', .035, 90);
    haptic(entity.type === 'patty' ? 16 : 8);
    pulseCombo();
    updateHud();
  }

  function hitPlayer() {
    if (state.shieldUntil > state.time) {
      state.score += 12;
      addFloater(player.x, player.y - 55, 'ОТБИТО!', '#ffd83d');
      tone(180, .08, 'square', .04, 360);
      state.shake = .2;
      haptic(22);
      return;
    }
    if (player.invulnerableUntil > state.time) return;
    player.invulnerableUntil = state.time + 1.15;
    state.lives -= 1;
    state.combo = 0;
    state.shake = .45;
    state.flash = .35;
    addFloater(player.x, player.y - 56, 'АЙ!', '#ff8ba9');
    tone(170, .18, 'sawtooth', .05, -80);
    haptic([70, 40, 70]);
    updateHud();
    if (state.lives <= 0) window.setTimeout(finishGame, 250);
  }

  function burst(x, y, color, amount, speed) {
    for (let index = 0; index < amount; index += 1) {
      const angle = random(0, TAU);
      const velocity = random(speed * .35, speed);
      particles.push({
        x, y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        life: random(.38, .72), maxLife: .72,
        size: random(2.5, 7), color
      });
    }
  }

  function addFloater(x, y, text, color) {
    floaters.push({ x, y, text, color, life: .8, maxLife: .8 });
  }

  function update(dt) {
    state.time += dt;
    state.spawnClock += dt;
    state.shake = Math.max(0, state.shake - dt * 2.4);
    state.flash = Math.max(0, state.flash - dt * 2.8);
    player.squash = ease(player.squash, 0, 8, dt);
    if (state.keyboardDirection) player.targetX += state.keyboardDirection * 300 * dt;
    player.targetX = clamp(player.targetX, 38, viewWidth - 38);
    const previousX = player.x;
    player.x = ease(player.x, player.targetX, 15, dt);
    player.tilt = ease(player.tilt, clamp((player.x - previousX) * .035, -.18, .18), 10, dt);

    const difficulty = Math.min(1, state.time / 75);
    if (state.spawnClock >= state.nextSpawn) {
      state.spawnClock = 0;
      spawnEntity();
      state.nextSpawn = random(.48, .82) * (1 - difficulty * .34);
    }

    for (let index = entities.length - 1; index >= 0; index -= 1) {
      const entity = entities[index];
      entity.y += entity.speed * dt;
      entity.rotation += entity.spin * dt;
      entity.phase += dt * 3;
      if (!entity.caught && collides(entity)) catchEntity(entity);
      if (entity.caught || entity.y - entity.radius > viewHeight + 20) {
        if (!entity.caught && entity.type === 'patty' && state.combo > 0) state.combo = 0;
        entities.splice(index, 1);
      }
    }

    for (let index = particles.length - 1; index >= 0; index -= 1) {
      const particle = particles[index];
      particle.life -= dt;
      particle.vy += 170 * dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      if (particle.life <= 0) particles.splice(index, 1);
    }
    for (let index = floaters.length - 1; index >= 0; index -= 1) {
      const floater = floaters[index];
      floater.life -= dt;
      floater.y -= 45 * dt;
      if (floater.life <= 0) floaters.splice(index, 1);
    }
    backgroundBubbles.forEach((bubble) => {
      bubble.y -= bubble.speed * dt;
      bubble.x += Math.sin(state.time * .7 + bubble.drift) * 2.2 * dt;
      if (bubble.y < -20) {
        bubble.y = viewHeight + random(10, 120);
        bubble.x = random(10, viewWidth - 10);
      }
    });
    updateHud();
  }

  const renderer = createRenderer(ctx, () => ({
    viewWidth, viewHeight, state, player, entities, particles, floaters,
    backgroundBubbles, flowerShapes
  }));

  function frame(now) {
    const dt = Math.min(.035, Math.max(0, (now - lastFrame) / 1000));
    lastFrame = now;
    if (state.mode === 'playing' && !state.paused) update(dt);
    else backgroundBubbles.forEach((bubble) => {
      bubble.y -= bubble.speed * dt * .35;
      if (bubble.y < -20) bubble.y = viewHeight + random(10, 90);
    });
    renderer.draw();
    requestAnimationFrame(frame);
  }

  function setPointerTarget(event) {
    const rect = canvas.getBoundingClientRect();
    player.targetX = clamp(event.clientX - rect.left, 38, rect.width - 38);
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (state.mode !== 'playing' || state.paused) return;
    state.pointerActive = true;
    canvas.setPointerCapture?.(event.pointerId);
    setPointerTarget(event);
    unlockAudio();
  });
  canvas.addEventListener('pointermove', (event) => {
    if (state.pointerActive && state.mode === 'playing' && !state.paused) setPointerTarget(event);
  });
  canvas.addEventListener('pointerup', () => { state.pointerActive = false; });
  canvas.addEventListener('pointercancel', () => { state.pointerActive = false; });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') state.keyboardDirection = -1;
    if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') state.keyboardDirection = 1;
    if (event.key === 'Escape' && state.mode === 'playing') state.paused ? resumeGame() : pauseGame();
  });
  window.addEventListener('keyup', (event) => {
    if (['ArrowLeft', 'ArrowRight', 'a', 'd', 'A', 'D'].includes(event.key)) state.keyboardDirection = 0;
  });
  window.addEventListener('resize', resizeCanvas, { passive: true });
  window.addEventListener('orientationchange', () => window.setTimeout(resizeCanvas, 180), { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.mode === 'playing' && !state.paused) pauseGame();
  });

  soundButton.addEventListener('click', () => {
    setSound(!state.sound);
    if (state.sound) tone(620, .08, 'sine', .035, 120);
  });
  pauseButton.addEventListener('click', pauseGame);
  document.querySelector('#startButton').addEventListener('click', startGame);
  document.querySelector('#restartButton').addEventListener('click', startGame);
  document.querySelector('#menuButton').addEventListener('click', returnToMenu);
  document.querySelector('#resumeButton').addEventListener('click', resumeGame);
  document.querySelector('#pauseRestartButton').addEventListener('click', () => { resumeGame(); startGame(); });
  document.querySelector('#quitButton').addEventListener('click', () => { resumeGame(); finishGame(); });
  pauseDialog.addEventListener('cancel', (event) => { event.preventDefault(); resumeGame(); });

  window.addEventListener('appdatareset', () => {
    bestValue.textContent = '0';
    setSound(true);
    showToast('Рекорд сброшен');
  });

  createWorkshopMode({
    appName: 'СПАНЧ: Пузырьковый Переполох',
    version: '1.0.0',
    cachePrefix: 'bubble-bob-',
    storageNamespace: STORAGE_NAMESPACE,
    onReset() {
      store.reset();
      window.dispatchEvent(new CustomEvent('appdatareset'));
    }
  });

  watchConnectivity((online) => {
    document.documentElement.dataset.network = online ? 'online' : 'offline';
  });

  setSound(state.sound);
  bestValue.textContent = store.get('best', 0).toLocaleString('ru-RU');
  pauseButton.disabled = true;
  resizeCanvas();
  updateHud();
  requestAnimationFrame(frame);
}
