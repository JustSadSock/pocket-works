import { BALL_RADIUS } from './physics.js';
import { levelBounds } from './levels.js';
import { terrainGradientAt, terrainHeightAt, zoneCenter } from './terrain.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;

function smooth(current, target, dt, speed = .002) {
  return lerp(current, target, 1 - Math.pow(speed, Math.max(1 / 240, dt)));
}

function createOverlay(canvas) {
  const overlay = document.createElement('canvas');
  overlay.className = 'moss-terrain-cues';
  overlay.setAttribute('aria-hidden', 'true');
  Object.assign(overlay.style, {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    zIndex: '4',
    pointerEvents: 'none'
  });
  const rendererOverlay = canvas.parentElement?.querySelector('.moss-render-overlay');
  (rendererOverlay || canvas).insertAdjacentElement('afterend', overlay);
  return overlay;
}

function zoneCorners(zone) {
  return [
    { x: zone.x, y: zone.y },
    { x: zone.x + zone.w, y: zone.y },
    { x: zone.x + zone.w, y: zone.y + zone.h },
    { x: zone.x, y: zone.y + zone.h }
  ];
}

export function installLivingTerrain(renderer, canvas, getState) {
  const overlay = createOverlay(canvas);
  const ctx = overlay.getContext('2d');
  const camera = {
    overview: false,
    overviewProgress: 0,
    introUntil: 0,
    levelKey: null,
    x: 0,
    y: 0,
    scale: 1
  };
  let dpr = 1;

  function resizeOverlay() {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(320, rect.width || window.innerWidth);
    const height = Math.max(480, rect.height || window.innerHeight);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(height * dpr);
    if (overlay.width !== pixelWidth || overlay.height !== pixelHeight) {
      overlay.width = pixelWidth;
      overlay.height = pixelHeight;
    }
    overlay.style.width = `${width}px`;
    overlay.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { width, height };
  }

  renderer.surfaceHeight = (level, ball) => terrainHeightAt(level, ball.x, ball.y);
  renderer.ballHeight = (level, ball) => Number.isFinite(ball.z) ? ball.z : terrainHeightAt(level, ball.x, ball.y) + BALL_RADIUS;
  renderer.ballScreenPoint = (ball) => renderer.worldToScreen(ball.x, ball.y, Number.isFinite(ball.z) ? ball.z : BALL_RADIUS);

  renderer.fit = (level, providedBall, providedDt) => {
    const state = getState();
    const ball = providedBall || state.ball;
    const dt = Number.isFinite(providedDt) ? providedDt : 1 / 60;
    const bounds = levelBounds(level);
    const boardWidth = Math.max(1, bounds.maxX - bounds.minX);
    const boardHeight = Math.max(1, bounds.maxY - bounds.minY);
    const width = renderer.width || canvas.clientWidth || window.innerWidth;
    const height = renderer.height || canvas.clientHeight || window.innerHeight;
    const key = level.renderId ?? level.id;
    if (camera.levelKey !== key) {
      camera.levelKey = key;
      camera.introUntil = performance.now() + (level.endless ? 1050 : 1750);
      camera.x = (bounds.minX + bounds.maxX) * .5;
      camera.y = (bounds.minY + bounds.maxY) * .5;
      camera.scale = Math.min((width - 34) / boardWidth, (height - 148) / (boardHeight * .82));
    }

    const autoOverview = performance.now() < camera.introUntil;
    const overviewTarget = camera.overview || autoOverview || state.mode !== 'playing';
    camera.overviewProgress = smooth(camera.overviewProgress, overviewTarget ? 1 : 0, dt, overviewTarget ? .0005 : .002);

    const fullScale = Math.min((width - 34) / boardWidth, (height - 148) / (boardHeight * .82));
    const followScale = Math.max(fullScale, Math.min((width - 30) / 720, (height - 156) / (900 * .82)));
    const targetScale = lerp(followScale, fullScale, camera.overviewProgress);
    camera.scale = smooth(camera.scale || targetScale, targetScale, dt, .0015);

    const centerX = (bounds.minX + bounds.maxX) * .5;
    const centerY = (bounds.minY + bounds.maxY) * .5;
    const speed = Math.hypot(ball?.vx || 0, ball?.vy || 0);
    const lookAhead = clamp(speed * .10, 0, 170);
    const velocityLength = speed || 1;
    let targetX = centerX;
    let targetY = centerY;
    if (camera.overviewProgress < .98 && ball) {
      targetX = ball.x + ball.vx / velocityLength * lookAhead;
      targetY = ball.y + ball.vy / velocityLength * lookAhead;
      const halfWorldWidth = width / Math.max(.001, camera.scale) * .5;
      const halfWorldHeight = (height - 122) / Math.max(.001, camera.scale * .82) * .5;
      targetX = boardWidth <= halfWorldWidth * 2 ? centerX : clamp(targetX, bounds.minX + halfWorldWidth - 80, bounds.maxX - halfWorldWidth + 80);
      targetY = boardHeight <= halfWorldHeight * 2 ? centerY : clamp(targetY, bounds.minY + halfWorldHeight - 60, bounds.maxY - halfWorldHeight + 60);
    }
    targetX = lerp(targetX, centerX, camera.overviewProgress);
    targetY = lerp(targetY, centerY, camera.overviewProgress);
    camera.x = smooth(camera.x, targetX, dt, camera.overviewProgress > .5 ? .0008 : .003);
    camera.y = smooth(camera.y, targetY, dt, camera.overviewProgress > .5 ? .0008 : .003);

    renderer.cameraX = camera.x;
    renderer.cameraY = camera.y;
    renderer.cameraZoom = 1;
    renderer.scale = camera.scale;
    renderer.offsetX = width * .5 - camera.x * camera.scale;
    renderer.offsetY = 78 + (height - 112) * .5 - camera.y * camera.scale * .82;
    renderer.parallaxX = smooth(renderer.parallaxX || 0, renderer.targetParallaxX || 0, dt, .035);
    renderer.parallaxY = smooth(renderer.parallaxY || 0, renderer.targetParallaxY || 0, dt, .035);
  };

  function pathRect(zone, zOffset = 0) {
    const points = zoneCorners(zone).map((point) => renderer.worldToScreen(point.x, point.y, terrainHeightAt({ zones: [zone] }, point.x, point.y) + zOffset));
    ctx.beginPath();
    points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
    ctx.closePath();
  }

  function drawSand(zone) {
    ctx.save();
    pathRect(zone, 1.2);
    ctx.strokeStyle = 'rgba(69,47,26,.62)';
    ctx.lineWidth = Math.max(1.2, renderer.scale * 5);
    ctx.stroke();
    pathRect(zone, 2.1);
    ctx.strokeStyle = 'rgba(239,219,158,.46)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 7]);
    ctx.stroke();
    ctx.setLineDash([]);
    const rows = 5;
    for (let row = 1; row < rows; row += 1) {
      const y = zone.y + zone.h * row / rows;
      const a = renderer.worldToScreen(zone.x + 18, y, Number(zone.baseZ ?? -6) + 2);
      const b = renderer.worldToScreen(zone.x + zone.w - 18, y, Number(zone.baseZ ?? -6) + 2);
      ctx.strokeStyle = 'rgba(96,69,36,.28)';
      ctx.lineWidth = .8;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo((a.x + b.x) * .5, (a.y + b.y) * .5 + Math.sin(row) * 3, b.x, b.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawSlope(zone) {
    const gradient = terrainGradientAt({ zones: [zone] }, zone.x + zone.w * .5, zone.y + zone.h * .5);
    const vertical = Math.abs(gradient.y) >= Math.abs(gradient.x);
    const bands = 6;
    ctx.save();
    pathRect(zone, 2.2);
    ctx.strokeStyle = zone.ramp ? 'rgba(226,202,133,.7)' : 'rgba(230,222,171,.38)';
    ctx.lineWidth = zone.ramp ? 1.5 : 1;
    ctx.stroke();
    for (let index = 1; index < bands; index += 1) {
      const t = index / bands;
      let a;
      let b;
      if (vertical) {
        const y = zone.y + zone.h * t;
        a = { x: zone.x + 12, y };
        b = { x: zone.x + zone.w - 12, y };
      } else {
        const x = zone.x + zone.w * t;
        a = { x, y: zone.y + 12 };
        b = { x, y: zone.y + zone.h - 12 };
      }
      const pa = renderer.worldToScreen(a.x, a.y, terrainHeightAt({ zones: [zone] }, a.x, a.y) + 2.4);
      const pb = renderer.worldToScreen(b.x, b.y, terrainHeightAt({ zones: [zone] }, b.x, b.y) + 2.4);
      ctx.strokeStyle = zone.ramp ? 'rgba(238,218,158,.34)' : 'rgba(244,237,196,.25)';
      ctx.lineWidth = .75 + index / bands * .45;
      ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
    }
    const center = zoneCenter(zone);
    const high = { x: center.x + gradient.x * 1600, y: center.y + gradient.y * 1600 };
    const start = renderer.worldToScreen(center.x, center.y, terrainHeightAt({ zones: [zone] }, center.x, center.y) + 5);
    const end = renderer.worldToScreen(high.x, high.y, terrainHeightAt({ zones: [zone] }, high.x, high.y) + 5);
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy) || 1;
    const ux = dx / length;
    const uy = dy / length;
    ctx.strokeStyle = zone.ramp ? 'rgba(244,222,157,.78)' : 'rgba(239,232,190,.48)';
    ctx.lineWidth = 1.15;
    ctx.beginPath(); ctx.moveTo(start.x - ux * 14, start.y - uy * 14); ctx.lineTo(start.x + ux * 14, start.y + uy * 14); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(start.x + ux * 14, start.y + uy * 14);
    ctx.lineTo(start.x + ux * 7 - uy * 5, start.y + uy * 7 + ux * 5);
    ctx.moveTo(start.x + ux * 14, start.y + uy * 14);
    ctx.lineTo(start.x + ux * 7 + uy * 5, start.y + uy * 7 - ux * 5);
    ctx.stroke();
    ctx.restore();
  }

  function drawWater(zone) {
    ctx.save();
    pathRect(zone, 1.6);
    ctx.strokeStyle = 'rgba(183,224,215,.5)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    for (let row = 1; row <= 4; row += 1) {
      const y = zone.y + zone.h * row / 5;
      const a = renderer.worldToScreen(zone.x + 14, y, 2);
      const b = renderer.worldToScreen(zone.x + zone.w - 14, y, 2);
      ctx.strokeStyle = `rgba(190,231,223,${.11 + row * .025})`;
      ctx.lineWidth = .8;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.bezierCurveTo(a.x + (b.x - a.x) * .3, a.y - 3, a.x + (b.x - a.x) * .7, b.y + 3, b.x, b.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawBridge(zone) {
    ctx.save();
    pathRect(zone, Number(zone.height ?? 10) + 1);
    ctx.strokeStyle = 'rgba(226,248,239,.62)';
    ctx.lineWidth = 1.1;
    ctx.stroke();
    const slats = 6;
    for (let index = 1; index < slats; index += 1) {
      const y = zone.y + zone.h * index / slats;
      const a = renderer.worldToScreen(zone.x, y, Number(zone.height ?? 10) + 1.5);
      const b = renderer.worldToScreen(zone.x + zone.w, y, Number(zone.height ?? 10) + 1.5);
      ctx.strokeStyle = 'rgba(226,248,239,.17)';
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    ctx.restore();
  }

  function drawOffscreenHole(level) {
    const hole = renderer.worldToScreen(level.hole.x, level.hole.y, terrainHeightAt(level, level.hole.x, level.hole.y) + 78);
    const margin = 66;
    const width = renderer.width || canvas.clientWidth;
    const height = renderer.height || canvas.clientHeight;
    if (hole.x >= margin && hole.x <= width - margin && hole.y >= margin && hole.y <= height - margin) return;
    const center = { x: width * .5, y: height * .5 };
    const dx = hole.x - center.x;
    const dy = hole.y - center.y;
    const angle = Math.atan2(dy, dx);
    const radiusX = width * .5 - 34;
    const radiusY = height * .5 - 92;
    const scale = Math.min(radiusX / Math.max(1, Math.abs(dx)), radiusY / Math.max(1, Math.abs(dy)));
    const x = center.x + dx * scale;
    const y = center.y + dy * scale;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = 'rgba(238,225,174,.72)';
    ctx.beginPath();
    ctx.moveTo(9, 0); ctx.lineTo(-6, -5); ctx.lineTo(-3, 0); ctx.lineTo(-6, 5); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function drawAirborne(ball, level) {
    if (!ball?.airborne || ball.inCup) return;
    const ground = terrainHeightAt(level, ball.x, ball.y);
    const groundPoint = renderer.worldToScreen(ball.x, ball.y, ground + 1);
    const ballPoint = renderer.worldToScreen(ball.x, ball.y, ball.z);
    const gap = Math.max(0, groundPoint.y - ballPoint.y);
    ctx.save();
    ctx.strokeStyle = `rgba(223,238,224,${clamp(gap / 120, .12, .42)})`;
    ctx.setLineDash([2, 5]);
    ctx.beginPath(); ctx.moveTo(ballPoint.x, ballPoint.y + BALL_RADIUS * renderer.scale); ctx.lineTo(groundPoint.x, groundPoint.y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = `rgba(4,14,8,${clamp(.38 - gap / 400, .12, .34)})`;
    ctx.beginPath(); ctx.ellipse(groundPoint.x, groundPoint.y, BALL_RADIUS * renderer.scale * 1.05, BALL_RADIUS * renderer.scale * .34, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function draw(level, ball, time, mode) {
    const size = resizeOverlay();
    ctx.clearRect(0, 0, size.width, size.height);
    if (!level) return;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const zone of level.zones || []) {
      if (!Number.isFinite(zone.w) || !Number.isFinite(zone.h)) continue;
      const center = renderer.worldToScreen(zone.x + zone.w * .5, zone.y + zone.h * .5, terrainHeightAt(level, zone.x + zone.w * .5, zone.y + zone.h * .5));
      if (center.x < -300 || center.x > size.width + 300 || center.y < -300 || center.y > size.height + 300) continue;
      if (zone.type === 'sand') drawSand(zone);
      else if (zone.type === 'slope') drawSlope(zone);
      else if (zone.type === 'water') drawWater(zone);
      else if (zone.type === 'bridge') drawBridge(zone);
    }
    ctx.restore();
    drawAirborne(ball, level);
    if (mode === 'playing' && camera.overviewProgress < .7) drawOffscreenHole(level);
    if (camera.overviewProgress > .5) {
      ctx.fillStyle = `rgba(238,233,211,${(camera.overviewProgress - .5) * .22})`;
      ctx.font = '700 10px "Avenir Next", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('ВСЯ ТЕРРИТОРИЯ', size.width * .5, size.height - 34);
    }
  }

  return {
    draw,
    setOverview(value) { camera.overview = Boolean(value); },
    toggleOverview() { camera.overview = !camera.overview; return camera.overview; },
    isOverview() { return camera.overview; },
    cancelOverview() { camera.overview = false; },
    beginLevel() { camera.introUntil = performance.now() + 1750; },
    get progress() { return camera.overviewProgress; }
  };
}
