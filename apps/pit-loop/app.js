import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createVersionedStore } from '../../shared/capabilities/storage.js';

installMobileRuntime();

const canvas = document.querySelector('#fight-canvas');
const arena = document.querySelector('.arena');
const ctx = canvas.getContext('2d', { alpha: true });
const leftHealth = document.querySelector('#left-health');
const rightHealth = document.querySelector('#right-health');
const leftScore = document.querySelector('#left-score');
const rightScore = document.querySelector('#right-score');
const roundLabel = document.querySelector('#round-label');
const roundState = document.querySelector('#round-state');
const winnerBanner = document.querySelector('#winner-banner');
const winnerText = document.querySelector('#winner-text');
const pausePanel = document.querySelector('#pause-panel');
const pauseButton = document.querySelector('#pause-button');
const resumeButton = document.querySelector('#resume-button');
const speedButton = document.querySelector('#speed-button');

const store = createVersionedStore({
  namespace: 'pocket-works:pit-loop',
  version: 1,
  defaults: {
    leftWins: 0,
    rightWins: 0,
    speed: 1
  },
  validate(value) {
    return Boolean(
      value &&
      Number.isInteger(value.leftWins) && value.leftWins >= 0 &&
      Number.isInteger(value.rightWins) && value.rightWins >= 0 &&
      [1, 1.5, 2].includes(value.speed)
    );
  }
});

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const palette = {
  paper: '#e8e0d0',
  ink: '#171817',
  line: 'rgba(23,24,23,0.16)',
  left: '#c94b38',
  right: '#234c61',
  dust: '#8b8579'
};

const ATTACKS = {
  jab: { duration: 0.42, hitAt: 0.21, range: 1.28, damage: 8, lunge: 0.18, knock: 0.32 },
  hook: { duration: 0.62, hitAt: 0.34, range: 1.18, damage: 13, lunge: 0.26, knock: 0.48 },
  kick: { duration: 0.78, hitAt: 0.43, range: 1.53, damage: 17, lunge: 0.18, knock: 0.62 }
};

const SPEEDS = [1, 1.5, 2];
let width = 1;
let height = 1;
let dpr = 1;
let lastFrame = performance.now();
let userPaused = false;
let hiddenPaused = document.hidden;
let simClock = 0;
let impacts = [];
let dust = [];
let shake = 0;

const saved = store.getAll();
const match = {
  phase: 'intro',
  phaseTime: 0,
  leftWins: saved.leftWins,
  rightWins: saved.rightWins,
  speed: saved.speed,
  left: null,
  right: null
};

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function easeOutCubic(t) {
  const p = 1 - clamp(t, 0, 1);
  return 1 - p * p * p;
}

function fighterDirection(fighter, other) {
  return fighter.x <= other.x ? 1 : -1;
}

function createFighter(side) {
  const left = side === 'left';
  return {
    side,
    color: left ? palette.left : palette.right,
    x: left ? -2.35 : 2.35,
    hp: 100,
    state: 'idle',
    stateTime: 0,
    stateDuration: 0,
    cooldown: rand(0.2, 0.55),
    think: rand(0.06, 0.18),
    attack: null,
    attackResolved: false,
    vx: 0,
    flash: 0,
    personality: {
      aggression: rand(0.82, 1.18),
      defense: rand(0.42, 0.68),
      kickBias: rand(0.14, 0.32)
    },
    seed: rand(0, Math.PI * 2)
  };
}

function resetRound() {
  match.left = createFighter('left');
  match.right = createFighter('right');
  match.phase = 'intro';
  match.phaseTime = 0;
  impacts = [];
  dust = [];
  shake = 0;
  winnerBanner.hidden = true;
  updateHud();
}

function currentRound() {
  return match.leftWins + match.rightWins + 1;
}

function setState(fighter, state, duration = 0) {
  fighter.state = state;
  fighter.stateTime = 0;
  fighter.stateDuration = duration;
  if (state !== 'attack') {
    fighter.attack = null;
    fighter.attackResolved = false;
  }
}

function beginAttack(fighter, type) {
  fighter.state = 'attack';
  fighter.stateTime = 0;
  fighter.stateDuration = ATTACKS[type].duration;
  fighter.attack = type;
  fighter.attackResolved = false;
}

function chooseAttack(fighter) {
  const roll = Math.random();
  if (roll < fighter.personality.kickBias) return 'kick';
  if (roll < 0.66) return 'jab';
  return 'hook';
}

function spawnDust(x, direction, strength = 1) {
  if (reducedMotion) return;
  const count = Math.round(2 + strength * 2);
  for (let i = 0; i < count; i += 1) {
    dust.push({
      x: x + rand(-0.12, 0.12),
      y: rand(0.02, 0.11),
      vx: direction * rand(-0.08, 0.18) + rand(-0.12, 0.12),
      vy: rand(0.14, 0.4),
      life: rand(0.24, 0.46),
      maxLife: 0.46
    });
  }
}

function spawnImpact(x, y, color, blocked = false) {
  impacts.push({
    x,
    y,
    color,
    life: blocked ? 0.2 : 0.3,
    maxLife: blocked ? 0.2 : 0.3,
    blocked
  });
  shake = Math.max(shake, blocked ? 1.6 : 4.2);
}

function finishRound(winner) {
  if (match.phase === 'over') return;
  match.phase = 'over';
  match.phaseTime = 0;

  if (winner.side === 'left') match.leftWins += 1;
  else match.rightWins += 1;

  store.patch({ leftWins: match.leftWins, rightWins: match.rightWins });
  winnerText.textContent = `${winner.side === 'left' ? 'А' : 'Б'} ПОБЕДИЛ`;
  winnerText.style.color = winner.color;
  winnerBanner.hidden = false;
  updateHud();
}

function resolveAttack(attacker, defender) {
  if (!attacker.attack || attacker.attackResolved || match.phase !== 'fight') return;
  attacker.attackResolved = true;

  const attack = ATTACKS[attacker.attack];
  const direction = fighterDirection(attacker, defender);
  const distance = Math.abs(defender.x - attacker.x);
  const effectiveDistance = Math.max(0, distance - attack.lunge);

  if (defender.state === 'dodge' || effectiveDistance > attack.range) {
    return;
  }

  const blocked = defender.state === 'block';
  const variance = rand(0.9, 1.1);
  const damage = blocked ? attack.damage * 0.16 : attack.damage * variance;
  defender.hp = clamp(defender.hp - damage, 0, 100);
  defender.flash = blocked ? 0.08 : 0.16;
  defender.vx += direction * attack.knock * (blocked ? 0.35 : 1);

  const impactX = defender.x - direction * 0.18;
  const impactY = attacker.attack === 'kick' ? 1.1 : 2.02;
  spawnImpact(impactX, impactY, blocked ? palette.ink : attacker.color, blocked);

  if (!blocked) {
    setState(defender, 'hit', defender.hp <= 0 ? 0.62 : rand(0.2, 0.3));
  }

  if (defender.hp <= 0) {
    setState(defender, 'down', 1.05);
    defender.stateTime = 0;
    defender.vx += direction * 0.5;
    finishRound(attacker);
  }
}

function decide(fighter, other) {
  if (fighter.state === 'down' || fighter.state === 'hit' || fighter.state === 'attack' || fighter.state === 'block' || fighter.state === 'dodge') return;

  const distance = Math.abs(other.x - fighter.x);
  const direction = fighterDirection(fighter, other);

  if (other.state === 'attack' && other.attack) {
    const incoming = ATTACKS[other.attack];
    const remainingToHit = incoming.hitAt - other.stateTime;
    if (remainingToHit > 0 && remainingToHit < 0.24 && distance < incoming.range + 0.34 && Math.random() < fighter.personality.defense) {
      if (Math.random() < 0.68) {
        setState(fighter, 'block', rand(0.32, 0.46));
      } else {
        setState(fighter, 'dodge', rand(0.34, 0.48));
        fighter.vx -= direction * rand(0.7, 1.0);
      }
      return;
    }
  }

  if (distance > 1.34) {
    fighter.state = 'approach';
    return;
  }

  if (fighter.cooldown <= 0 && Math.random() < 0.74 * fighter.personality.aggression) {
    beginAttack(fighter, chooseAttack(fighter));
    return;
  }

  if (distance < 0.92 && Math.random() < 0.3) {
    setState(fighter, 'dodge', rand(0.28, 0.38));
    fighter.vx -= direction * rand(0.35, 0.65);
    return;
  }

  fighter.state = 'idle';
}

function updateFighter(fighter, other, dt) {
  fighter.flash = Math.max(0, fighter.flash - dt);
  fighter.cooldown = Math.max(0, fighter.cooldown - dt);
  fighter.think -= dt;

  if (fighter.state === 'down') {
    fighter.stateTime = Math.min(fighter.stateTime + dt, fighter.stateDuration);
  } else if (fighter.state === 'attack') {
    fighter.stateTime += dt;
    const attack = ATTACKS[fighter.attack];
    if (!fighter.attackResolved && fighter.stateTime >= attack.hitAt) resolveAttack(fighter, other);
    if (fighter.stateTime >= fighter.stateDuration) {
      fighter.cooldown = rand(0.18, 0.48) / fighter.personality.aggression;
      setState(fighter, 'idle');
    }
  } else if (['block', 'dodge', 'hit'].includes(fighter.state)) {
    fighter.stateTime += dt;
    if (fighter.stateTime >= fighter.stateDuration) {
      setState(fighter, 'idle');
      fighter.cooldown = Math.max(fighter.cooldown, rand(0.08, 0.22));
    }
  } else {
    const distance = Math.abs(other.x - fighter.x);
    const direction = fighterDirection(fighter, other);

    if (fighter.state === 'approach') {
      const pace = 1.08 + fighter.personality.aggression * 0.12;
      if (distance > 1.18) {
        fighter.x += direction * pace * dt;
        if (Math.random() < dt * 5) spawnDust(fighter.x - direction * 0.2, -direction, 0.35);
      } else {
        fighter.state = 'idle';
      }
    }

    if (fighter.think <= 0) {
      fighter.think = rand(0.07, 0.17);
      decide(fighter, other);
    }
  }

  fighter.x += fighter.vx * dt;
  fighter.vx *= Math.pow(0.055, dt);
  fighter.x = clamp(fighter.x, -4.15, 4.15);
}

function separateFighters() {
  const left = match.left;
  const right = match.right;
  const distance = right.x - left.x;
  const minimum = 0.68;
  if (distance >= minimum) return;
  const correction = (minimum - distance) * 0.5;
  left.x -= correction;
  right.x += correction;
}

function updateParticles(dt) {
  impacts.forEach((impact) => { impact.life -= dt; });
  impacts = impacts.filter((impact) => impact.life > 0);

  dust.forEach((particle) => {
    particle.life -= dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vy -= 0.9 * dt;
  });
  dust = dust.filter((particle) => particle.life > 0 && particle.y >= 0);
  shake *= Math.pow(0.015, dt);
}

function update(dt) {
  simClock += dt;
  match.phaseTime += dt;

  if (match.phase === 'intro') {
    if (match.phaseTime >= 0.55) {
      match.phase = 'fight';
      match.phaseTime = 0;
    }
  } else if (match.phase === 'fight') {
    updateFighter(match.left, match.right, dt);
    if (match.phase === 'fight') updateFighter(match.right, match.left, dt);
    separateFighters();
  } else if (match.phase === 'over') {
    updateFighter(match.left, match.right, dt * 0.35);
    updateFighter(match.right, match.left, dt * 0.35);
    if (match.phaseTime >= 2.15) resetRound();
  }

  updateParticles(dt);
  updateHud();
}

function updateHud() {
  const leftRatio = clamp(match.left?.hp ?? 100, 0, 100) / 100;
  const rightRatio = clamp(match.right?.hp ?? 100, 0, 100) / 100;
  leftHealth.style.transform = `scaleX(${leftRatio})`;
  rightHealth.style.transform = `scaleX(${rightRatio})`;
  leftScore.textContent = String(match.leftWins);
  rightScore.textContent = String(match.rightWins);
  roundLabel.textContent = `РАУНД ${currentRound()}`;
  roundState.textContent = match.phase === 'intro' ? 'СХОДЯТСЯ' : match.phase === 'over' ? 'НОКАУТ' : 'БОЙ';
  speedButton.textContent = `×${match.speed}`;
}

function resizeCanvas() {
  const rect = arena.getBoundingClientRect();
  width = Math.max(1, rect.width);
  height = Math.max(1, rect.height);
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function sceneScale() {
  return Math.max(34, Math.min(width / 10.2, height / 5.2));
}

function worldToScreen(x, y) {
  const scale = sceneScale();
  return {
    x: width * 0.5 + x * scale,
    y: height * 0.79 - y * scale
  };
}

function drawArena(offsetX, offsetY) {
  const ground = height * 0.79 + offsetY;
  ctx.save();
  ctx.translate(offsetX, 0);

  ctx.strokeStyle = palette.line;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, ground + 0.5);
  ctx.lineTo(width, ground + 0.5);
  ctx.stroke();

  ctx.globalAlpha = 0.5;
  for (let i = -4; i <= 4; i += 1) {
    const p = worldToScreen(i, 0);
    ctx.beginPath();
    ctx.moveTo(p.x, ground - 5);
    ctx.lineTo(p.x, ground + 5);
    ctx.stroke();
  }

  const center = worldToScreen(0, 0);
  ctx.globalAlpha = 0.8;
  ctx.beginPath();
  ctx.arc(center.x, ground, Math.min(22, sceneScale() * 0.35), Math.PI, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function fighterPose(fighter, other) {
  const state = fighter.state;
  const elapsed = fighter.stateTime;
  const duration = Math.max(0.001, fighter.stateDuration);
  const progress = clamp(elapsed / duration, 0, 1);
  const walk = Math.sin(simClock * 9 + fighter.seed);
  const breathe = Math.sin(simClock * 3.1 + fighter.seed) * 0.025;

  let torsoLean = 0.03 + breathe;
  let headX = 0.02;
  let shoulderY = 2.08;
  let hipY = 1.18;
  let frontElbow = [0.38, 1.78];
  let frontHand = [0.58, 1.62];
  let backElbow = [-0.25, 1.75];
  let backHand = [0.1, 1.48];
  let frontKnee = [0.32, 0.63];
  let frontFoot = [0.43, 0.08];
  let backKnee = [-0.3, 0.62];
  let backFoot = [-0.4, 0.08];

  if (state === 'approach') {
    frontKnee = [0.34 + walk * 0.16, 0.65];
    frontFoot = [0.5 + walk * 0.28, 0.08];
    backKnee = [-0.28 - walk * 0.16, 0.63];
    backFoot = [-0.46 - walk * 0.28, 0.08];
    frontElbow = [0.25 - walk * 0.12, 1.72];
    frontHand = [0.42 - walk * 0.22, 1.52];
    backElbow = [-0.24 + walk * 0.12, 1.76];
    backHand = [0.02 + walk * 0.22, 1.5];
    torsoLean = 0.08;
  } else if (state === 'block') {
    torsoLean = -0.03;
    frontElbow = [0.38, 2.16];
    frontHand = [0.55, 2.44];
    backElbow = [0.16, 2.0];
    backHand = [0.35, 2.3];
  } else if (state === 'dodge') {
    const lean = Math.sin(progress * Math.PI);
    torsoLean = -0.38 * lean;
    headX = -0.32 * lean;
    frontHand = [0.35, 1.7];
    backHand = [-0.08, 1.55];
  } else if (state === 'hit') {
    const snap = Math.sin(Math.min(1, progress * 1.5) * Math.PI * 0.75);
    torsoLean = -0.48 * snap;
    headX = -0.38 * snap;
    frontElbow = [0.12, 1.76];
    frontHand = [-0.06, 1.46];
    backElbow = [-0.3, 1.72];
    backHand = [-0.44, 1.46];
  } else if (state === 'attack' && fighter.attack) {
    const strike = Math.sin(progress * Math.PI);
    const attack = fighter.attack;
    torsoLean = 0.12 * strike;

    if (attack === 'jab') {
      frontElbow = [0.5 + 0.38 * strike, 1.92 + 0.08 * strike];
      frontHand = [0.7 + 0.9 * strike, 1.96 + 0.04 * strike];
      backHand = [0.18, 2.05];
    } else if (attack === 'hook') {
      frontElbow = [0.34 + 0.42 * strike, 2.12 + 0.08 * strike];
      frontHand = [0.42 + 0.78 * strike, 2.28 - 0.22 * strike];
      backHand = [0.15, 2.02];
      torsoLean = 0.2 * strike;
    } else if (attack === 'kick') {
      const kick = easeOutCubic(Math.min(progress * 1.45, 1)) * (1 - Math.max(0, progress - 0.68) / 0.32);
      frontKnee = [0.48 + 0.42 * kick, 0.85 + 0.36 * kick];
      frontFoot = [0.62 + 1.15 * kick, 0.18 + 0.82 * kick];
      frontHand = [0.22, 1.88];
      backHand = [-0.02, 1.68];
      torsoLean = -0.08 * kick;
    }
  }

  return {
    torsoLean,
    headX,
    shoulderY,
    hipY,
    frontElbow,
    frontHand,
    backElbow,
    backHand,
    frontKnee,
    frontFoot,
    backKnee,
    backFoot
  };
}

function strokeLimb(points, color, widthUnits, alpha = 1) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = widthUnits;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i][0], points[i][1]);
  ctx.stroke();
  ctx.restore();
}

function drawFighter(fighter, other, offsetX, offsetY) {
  const scale = sceneScale();
  const screen = worldToScreen(fighter.x, 0);
  const direction = fighterDirection(fighter, other);
  const shadowWidth = fighter.state === 'down' ? 1.45 : 0.72;

  ctx.save();
  ctx.fillStyle = 'rgba(23,24,23,0.13)';
  ctx.beginPath();
  ctx.ellipse(screen.x + offsetX, screen.y + offsetY + 4, shadowWidth * scale, 0.12 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(screen.x + offsetX, screen.y + offsetY);
  ctx.scale(direction * scale, -scale);

  if (fighter.state === 'down') {
    const fall = easeOutCubic(clamp(fighter.stateTime / Math.max(0.001, fighter.stateDuration), 0, 1));
    ctx.rotate(-1.36 * fall);
    ctx.translate(-0.1 * fall, -0.02);
  }

  const pose = fighterPose(fighter, other);
  const color = fighter.flash > 0 ? palette.ink : fighter.color;
  const backAlpha = 0.58;
  const shoulder = [pose.torsoLean, pose.shoulderY];
  const hip = [0, pose.hipY];

  strokeLimb([shoulder, pose.backElbow, pose.backHand], color, 0.12, backAlpha);
  strokeLimb([hip, pose.backKnee, pose.backFoot], color, 0.15, backAlpha);
  strokeLimb([shoulder, hip], color, 0.22, 1);
  strokeLimb([hip, pose.frontKnee, pose.frontFoot], color, 0.17, 1);
  strokeLimb([shoulder, pose.frontElbow, pose.frontHand], color, 0.14, 1);

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(pose.headX + pose.torsoLean * 0.34, 2.56, 0.245, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawParticles(offsetX, offsetY) {
  dust.forEach((particle) => {
    const p = worldToScreen(particle.x, particle.y);
    const alpha = clamp(particle.life / particle.maxLife, 0, 1) * 0.34;
    ctx.fillStyle = `rgba(111,108,99,${alpha})`;
    ctx.beginPath();
    ctx.arc(p.x + offsetX, p.y + offsetY, 2.2, 0, Math.PI * 2);
    ctx.fill();
  });

  impacts.forEach((impact) => {
    const p = worldToScreen(impact.x, impact.y);
    const t = 1 - impact.life / impact.maxLife;
    const alpha = 1 - t;
    const radius = (impact.blocked ? 6 : 10) + t * (impact.blocked ? 15 : 28);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = impact.color;
    ctx.lineWidth = impact.blocked ? 1.5 : 2;
    ctx.beginPath();
    ctx.arc(p.x + offsetX, p.y + offsetY, radius, 0, Math.PI * 2);
    ctx.stroke();

    if (!impact.blocked && !reducedMotion) {
      for (let i = 0; i < 6; i += 1) {
        const a = i * Math.PI / 3 + 0.18;
        const r1 = radius * 0.55;
        const r2 = radius * 0.9;
        ctx.beginPath();
        ctx.moveTo(p.x + offsetX + Math.cos(a) * r1, p.y + offsetY + Math.sin(a) * r1);
        ctx.lineTo(p.x + offsetX + Math.cos(a) * r2, p.y + offsetY + Math.sin(a) * r2);
        ctx.stroke();
      }
    }
    ctx.restore();
  });
}

function render() {
  ctx.clearRect(0, 0, width, height);
  const shakeAmount = reducedMotion ? 0 : shake;
  const offsetX = shakeAmount ? rand(-shakeAmount, shakeAmount) : 0;
  const offsetY = shakeAmount ? rand(-shakeAmount * 0.45, shakeAmount * 0.45) : 0;

  drawArena(offsetX, offsetY);
  drawParticles(offsetX, offsetY);
  drawFighter(match.left, match.right, offsetX, offsetY);
  drawFighter(match.right, match.left, offsetX, offsetY);
}

function setUserPaused(next) {
  userPaused = next;
  pausePanel.hidden = !next;
  pauseButton.textContent = next ? 'Продолжить' : 'Пауза';
  pauseButton.setAttribute('aria-pressed', String(next));
  lastFrame = performance.now();
}

pauseButton.addEventListener('click', () => setUserPaused(!userPaused));
resumeButton.addEventListener('click', () => setUserPaused(false));

speedButton.addEventListener('click', () => {
  const index = SPEEDS.indexOf(match.speed);
  match.speed = SPEEDS[(index + 1) % SPEEDS.length];
  store.set('speed', match.speed);
  updateHud();
});

document.addEventListener('visibilitychange', () => {
  hiddenPaused = document.hidden;
  lastFrame = performance.now();
});

window.addEventListener('pagehide', () => {
  store.patch({ leftWins: match.leftWins, rightWins: match.rightWins, speed: match.speed });
});

window.addEventListener('appdatareset', () => {
  match.leftWins = 0;
  match.rightWins = 0;
  match.speed = 1;
  resetRound();
});

const resizeObserver = new ResizeObserver(resizeCanvas);
resizeObserver.observe(arena);
resizeCanvas();
resetRound();

function frame(now) {
  const rawDt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;

  if (!userPaused && !hiddenPaused) {
    update(rawDt * match.speed);
  }

  render();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
