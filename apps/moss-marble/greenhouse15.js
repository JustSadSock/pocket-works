const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;
const DEFAULT_VISUAL = Object.freeze({
  skyTop: '#405748', skyMid: '#1f382c', skyBottom: '#0b1711',
  glow: '240,224,161', beam: '243,225,155', pollen: '226,215,145', mist: '142,184,154', flora: 'fern', motif: 'drop', accent: '205,224,180'
});

function visualTheme(level) {
  return { ...DEFAULT_VISUAL, ...(level?.visual || {}) };
}

function tint(rgb, alpha) {
  return `rgba(${rgb},${alpha})`;
}

function hashNoise(x, y = 0, seed = 0) {
  const value = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453;
  return value - Math.floor(value);
}

function createLayerCanvas(className, zIndex, anchor, before = false) {
  const layer = document.createElement('canvas');
  layer.className = className;
  layer.setAttribute('aria-hidden', 'true');
  Object.assign(layer.style, {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    zIndex: String(zIndex),
    pointerEvents: 'none'
  });
  if (before) anchor.insertAdjacentElement('beforebegin', layer);
  else anchor.insertAdjacentElement('afterend', layer);
  return layer;
}

function polygonCentroid(points) {
  if (!points?.length) return { x: 0, y: 0 };
  return points.reduce((sum, point) => ({
    x: sum.x + point.x / points.length,
    y: sum.y + point.y / points.length
  }), { x: 0, y: 0 });
}

export class LivingGreenhouseLayer {
  constructor(canvas, renderer) {
    this.canvas = canvas;
    this.renderer = renderer;
    const renderOverlay = canvas.parentElement?.querySelector('.moss-render-overlay') || canvas;
    this.backdrop = createLayerCanvas('moss-greenhouse-backdrop', 1, canvas, true);
    this.foreground = createLayerCanvas('moss-greenhouse-foreground', 5, renderOverlay, false);
    this.backdropCtx = this.backdrop.getContext('2d', { alpha: false });
    this.foregroundCtx = this.foreground.getContext('2d');
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.quality = 1;
    this.frameCost = 16;
    this.lastQualityChange = 0;
    this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches || false;
    this.hidden = document.visibilityState === 'hidden';
    this.wind = 0;
    this.windTarget = 0;
    this.pulses = [];
    this.pollen = Array.from({ length: 28 }, (_, index) => ({
      x: hashNoise(index, 11),
      y: hashNoise(index, 23),
      depth: .25 + hashNoise(index, 37) * .75,
      phase: hashNoise(index, 41) * TAU,
      speed: .035 + hashNoise(index, 53) * .07
    }));
    this.condensation = Array.from({ length: 20 }, (_, index) => ({
      x: hashNoise(index, 67),
      y: hashNoise(index, 71),
      length: 18 + hashNoise(index, 73) * 72,
      speed: .008 + hashNoise(index, 79) * .018,
      alpha: .035 + hashNoise(index, 83) * .08
    }));
    this.vines = Array.from({ length: 8 }, (_, index) => ({
      x: .05 + hashNoise(index, 91) * .9,
      length: .12 + hashNoise(index, 97) * .22,
      phase: hashNoise(index, 101) * TAU,
      leaves: 3 + Math.floor(hashNoise(index, 103) * 4),
      side: index % 3 === 0 ? -1 : index % 3 === 1 ? 1 : 0
    }));

    canvas.style.background = 'transparent';
    document.addEventListener('visibilitychange', () => { this.hidden = document.visibilityState === 'hidden'; });
    window.matchMedia?.('(prefers-reduced-motion: reduce)')?.addEventListener?.('change', (event) => {
      this.reducedMotion = event.matches;
    });
    this.resize(true);
  }

  destroy() {
    this.backdrop.remove();
    this.foreground.remove();
  }

  emit(x, y, type = 'grass', amount = 8) {
    this.pulses.push({ x, y, type, life: .8, maxLife: .8, amount: clamp(amount, 3, 18) });
    if (this.pulses.length > 18) this.pulses.splice(0, this.pulses.length - 18);
  }

  updateBudget(dt) {
    const frameMs = clamp(dt * 1000, 4, 80);
    this.frameCost = lerp(this.frameCost, frameMs, .045);
    const now = performance.now();
    if (now - this.lastQualityChange < 1200) return;
    const next = this.reducedMotion ? .58 : this.frameCost > 31 ? .5 : this.frameCost > 23 ? .72 : 1;
    if (Math.abs(next - this.quality) > .08) {
      this.quality = next;
      this.lastQualityChange = now;
      this.resize(true);
    }
  }

  resize(force = false) {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(320, rect.width || window.innerWidth);
    const height = Math.max(480, rect.height || window.innerHeight);
    const targetDpr = Math.min(window.devicePixelRatio || 1, this.quality < .6 ? 1 : 1.6);
    if (!force && width === this.width && height === this.height && targetDpr === this.dpr) return;
    this.width = width;
    this.height = height;
    this.dpr = targetDpr;
    const pixelWidth = Math.round(width * targetDpr);
    const pixelHeight = Math.round(height * targetDpr);
    for (const [layer, ctx] of [[this.backdrop, this.backdropCtx], [this.foreground, this.foregroundCtx]]) {
      layer.width = pixelWidth;
      layer.height = pixelHeight;
      layer.style.width = `${width}px`;
      layer.style.height = `${height}px`;
      ctx.setTransform(targetDpr, 0, 0, targetDpr, 0, 0);
    }
  }

  draw(level, ball, aim, time, dt, mode) {
    if (this.hidden) return;
    this.updateBudget(dt);
    this.resize();
    const speed = Math.hypot(ball?.vx || 0, ball?.vy || 0);
    const directional = clamp(((ball?.vx || 0) - (ball?.vy || 0) * .25) / 900, -1, 1);
    this.windTarget = clamp((this.renderer.parallaxX || 0) * .45 + directional * .55, -1, 1);
    this.wind = lerp(this.wind, this.windTarget, 1 - Math.pow(.004, Math.max(dt, 1 / 240)));
    const theme = visualTheme(level);
    this.drawBackdrop(level, ball, time, mode, theme);
    this.drawForeground(level, ball, aim, time, dt, mode, speed, theme);
  }

  drawBackdrop(level, ball, time, mode, theme) {
    const ctx = this.backdropCtx;
    const { width, height } = this;
    ctx.clearRect(0, 0, width, height);

    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, theme.skyTop);
    sky.addColorStop(.42, theme.skyMid);
    sky.addColorStop(1, theme.skyBottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    const warm = ctx.createRadialGradient(width * .76, height * .06, 0, width * .76, height * .06, width * .72);
    warm.addColorStop(0, tint(theme.glow, .24));
    warm.addColorStop(.34, tint(theme.glow, .08));
    warm.addColorStop(1, tint(theme.glow, 0));
    ctx.fillStyle = warm;
    ctx.fillRect(0, 0, width, height * .86);

    this.drawGreenhouseFrame(ctx, time, theme);
    this.drawThemeLandmark(ctx, time, theme);
    this.drawDistantPlants(ctx, time, theme);
    if (this.quality > .55) this.drawCondensation(ctx, time);
    this.drawFloorMist(ctx, time, mode, theme);
  }

  drawGreenhouseFrame(ctx, time, theme) {
    const { width, height } = this;
    const px = (this.renderer.parallaxX || 0) * 12;
    const py = (this.renderer.parallaxY || 0) * 6;
    const horizon = height * .49;
    const roofTop = -height * .08;
    const frame = 'rgba(10,27,19,.66)';
    const frameLight = 'rgba(148,167,133,.20)';

    ctx.save();
    ctx.translate(px, py);
    ctx.lineCap = 'round';
    ctx.strokeStyle = frame;
    ctx.lineWidth = 8;
    for (let column = -1; column <= 5; column += 1) {
      const x = width * (column / 4);
      ctx.beginPath();
      ctx.moveTo(x, horizon + height * .18);
      ctx.quadraticCurveTo(width * .5, roofTop, width - x, horizon + height * .18);
      ctx.stroke();
      ctx.strokeStyle = frameLight;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.strokeStyle = frame;
      ctx.lineWidth = 8;
    }

    ctx.lineWidth = 7;
    for (let row = 0; row < 5; row += 1) {
      const t = row / 4;
      const y = lerp(height * .03, horizon + height * .17, t * t * .72 + t * .28);
      ctx.beginPath();
      ctx.moveTo(-40, y);
      ctx.quadraticCurveTo(width * .5, y - (1 - t) * 34, width + 40, y);
      ctx.stroke();
      ctx.strokeStyle = frameLight;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.strokeStyle = frame;
      ctx.lineWidth = 7;
    }

    ctx.globalCompositeOperation = 'screen';
    const shaftPulse = this.reducedMotion ? .62 : .56 + Math.sin(time * .22) * .06;
    for (let index = 0; index < 3; index += 1) {
      const startX = width * (.66 + index * .1);
      const spread = width * (.18 + index * .04);
      const beam = ctx.createLinearGradient(startX, 0, startX - spread, height * .8);
      beam.addColorStop(0, tint(theme.beam, .10 * shaftPulse));
      beam.addColorStop(1, tint(theme.beam, 0));
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(startX - 22, 0);
      ctx.lineTo(startX + 30, 0);
      ctx.lineTo(startX - spread + 160, height * .82);
      ctx.lineTo(startX - spread, height * .82);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  drawThemeLandmark(ctx, time, theme) {
    const { width, height } = this;
    const x = width * .16 + (this.renderer.parallaxX || 0) * 9;
    const y = height * .23 + (this.renderer.parallaxY || 0) * 4;
    const size = clamp(Math.min(width, height) * .12, 48, 112);
    const pulse = this.reducedMotion ? .5 : .5 + Math.sin(time * .55) * .5;
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = tint(theme.accent, .12 + pulse * .035);
    ctx.fillStyle = tint(theme.accent, .035 + pulse * .018);
    ctx.lineWidth = Math.max(1, size * .014);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (theme.motif === 'cup') {
      ctx.beginPath(); ctx.ellipse(0, size * .30, size * .62, size * .16, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-size * .40, -size * .17); ctx.quadraticCurveTo(-size * .34, size * .23, 0, size * .24); ctx.quadraticCurveTo(size * .34, size * .23, size * .40, -size * .17); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(size * .43, 0, size * .22, size * .28, 0, -Math.PI * .55, Math.PI * .55); ctx.stroke();
    } else if (theme.motif === 'fern' || theme.motif === 'leaf') {
      ctx.beginPath(); ctx.moveTo(-size * .34, size * .48); ctx.quadraticCurveTo(-size * .05, 0, size * .30, -size * .48); ctx.stroke();
      for (let index = 0; index < 6; index += 1) {
        const t = (index + 1) / 7;
        const px = lerp(-size * .29, size * .25, t);
        const py = lerp(size * .40, -size * .40, t);
        const spread = size * (.24 - t * .10);
        ctx.beginPath(); ctx.moveTo(px, py); ctx.quadraticCurveTo(px - spread, py - size * .02, px - spread * .78, py - size * .17); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(px, py); ctx.quadraticCurveTo(px + spread, py + size * .02, px + spread * .78, py + size * .17); ctx.stroke();
      }
    } else if (theme.motif === 'dial') {
      ctx.beginPath(); ctx.arc(0, 0, size * .46, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, size * .31, 0, TAU); ctx.stroke();
      for (let index = 0; index < 10; index += 1) {
        const angle = index / 10 * TAU;
        ctx.beginPath(); ctx.moveTo(Math.cos(angle) * size * .36, Math.sin(angle) * size * .36); ctx.lineTo(Math.cos(angle) * size * .44, Math.sin(angle) * size * .44); ctx.stroke();
      }
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(-1.1 + pulse * .18) * size * .28, Math.sin(-1.1 + pulse * .18) * size * .28); ctx.stroke();
    } else if (theme.motif === 'spoon') {
      ctx.save(); ctx.rotate(-.48);
      ctx.beginPath(); ctx.ellipse(0, -size * .23, size * .24, size * .34, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, size * .08); ctx.quadraticCurveTo(size * .025, size * .35, 0, size * .62); ctx.stroke();
      ctx.restore();
    } else if (theme.motif === 'pane') {
      ctx.save(); ctx.rotate(-.10);
      ctx.strokeRect(-size * .43, -size * .48, size * .86, size * .96);
      ctx.beginPath(); ctx.moveTo(-size * .43, size * .08); ctx.lineTo(size * .43, -size * .18); ctx.moveTo(-size * .12, -size * .48); ctx.lineTo(size * .16, size * .48); ctx.stroke();
      ctx.fillRect(-size * .37, -size * .42, size * .13, size * .72);
      ctx.restore();
    } else if (theme.motif === 'lantern') {
      const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, size * .58);
      glow.addColorStop(0, tint(theme.accent, .15 + pulse * .08)); glow.addColorStop(1, tint(theme.accent, 0));
      ctx.fillStyle = glow; ctx.fillRect(-size, -size, size * 2, size * 2);
      ctx.strokeStyle = tint(theme.accent, .18);
      ctx.beginPath(); ctx.moveTo(-size * .18, -size * .48); ctx.quadraticCurveTo(0, -size * .68, size * .18, -size * .48); ctx.stroke();
      ctx.beginPath(); ctx.roundRect(-size * .32, -size * .44, size * .64, size * .88, size * .15); ctx.fill(); ctx.stroke();
      ctx.fillStyle = tint(theme.accent, .32 + pulse * .15); ctx.beginPath(); ctx.arc(0, size * .05, size * .065, 0, TAU); ctx.fill();
    } else {
      for (let ring = 0; ring < 3; ring += 1) {
        ctx.beginPath(); ctx.ellipse(0, size * .34, size * (.22 + ring * .15), size * (.055 + ring * .025), 0, 0, TAU); ctx.stroke();
      }
      ctx.beginPath(); ctx.moveTo(0, -size * .52); ctx.bezierCurveTo(size * .34, -size * .12, size * .26, size * .13, 0, size * .23); ctx.bezierCurveTo(-size * .26, size * .13, -size * .34, -size * .12, 0, -size * .52); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }

  drawDistantPlants(ctx, time, theme) {
    const { width, height } = this;
    const horizon = height * .48;
    ctx.save();
    ctx.globalAlpha = .72;
    for (let index = 0; index < 18; index += 1) {
      const x = hashNoise(index, 201) * width;
      const baseY = horizon + hashNoise(index, 205) * height * .2;
      const scale = .65 + hashNoise(index, 211) * 1.25;
      const sway = this.reducedMotion ? 0 : Math.sin(time * (.22 + hashNoise(index, 213) * .22) + index) * 4 * scale + this.wind * 3;
      ctx.strokeStyle = index % 4 === 0 ? tint(theme.mist, .32) : 'rgba(20,55,35,.78)';
      ctx.lineWidth = 2.4 * scale;
      ctx.beginPath();
      ctx.moveTo(x, baseY + 58 * scale);
      ctx.quadraticCurveTo(x + sway * .4, baseY + 22 * scale, x + sway, baseY - 42 * scale);
      ctx.stroke();
      const leaves = 3 + Math.floor(hashNoise(index, 217) * 4);
      for (let leaf = 0; leaf < leaves; leaf += 1) {
        const t = (leaf + 1) / (leaves + 1);
        const lx = lerp(x, x + sway, t);
        const ly = lerp(baseY + 58 * scale, baseY - 42 * scale, t);
        this.drawLeaf(ctx, lx, ly, 10 * scale, (leaf % 2 ? 1 : -1) * (.7 + t * .45), tint(theme.mist, .30));
      }
    }
    ctx.restore();
  }

  drawCondensation(ctx, time) {
    const { width, height } = this;
    ctx.save();
    ctx.lineCap = 'round';
    for (const drop of this.condensation) {
      const x = drop.x * width + (this.renderer.parallaxX || 0) * 4;
      const y = ((drop.y + time * drop.speed) % 1) * height * .55;
      const alpha = drop.alpha * (.8 + Math.sin(time * .35 + drop.x * 9) * .2);
      ctx.strokeStyle = `rgba(223,239,230,${alpha})`;
      ctx.lineWidth = .65;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + 1.5, y + drop.length * .5, x - .5, y + drop.length);
      ctx.stroke();
      ctx.fillStyle = `rgba(239,248,241,${alpha * 1.4})`;
      ctx.beginPath();
      ctx.ellipse(x, y, 1.1, 2.4, 0, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  drawFloorMist(ctx, time, mode, theme) {
    const { width, height } = this;
    const mist = ctx.createLinearGradient(0, height * .58, 0, height);
    mist.addColorStop(0, 'rgba(11,25,18,0)');
    mist.addColorStop(.56, 'rgba(16,39,28,.12)');
    mist.addColorStop(1, 'rgba(3,10,7,.54)');
    ctx.fillStyle = mist;
    ctx.fillRect(0, height * .54, width, height * .46);

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = mode === 'menu' ? .24 : .12;
    for (let index = 0; index < 5; index += 1) {
      const y = height * (.72 + index * .055);
      const drift = this.reducedMotion ? 0 : Math.sin(time * .1 + index * 1.7) * 18;
      const band = ctx.createLinearGradient(0, y, width, y);
      band.addColorStop(0, tint(theme.mist, 0));
      band.addColorStop(.5, tint(theme.mist, .18));
      band.addColorStop(1, tint(theme.mist, 0));
      ctx.strokeStyle = band;
      ctx.lineWidth = 18 + index * 3;
      ctx.beginPath();
      ctx.moveTo(-40 + drift, y);
      ctx.bezierCurveTo(width * .32, y - 12, width * .68, y + 15, width + 40 + drift, y - 3);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawForeground(level, ball, aim, time, dt, mode, speed, theme) {
    const ctx = this.foregroundCtx;
    ctx.clearRect(0, 0, this.width, this.height);
    this.drawGroundingFringe(ctx, level, time);
    this.drawGlassArchitecture(ctx, level, time);
    this.drawReadabilityCues(ctx, level, ball, aim, time, mode, speed, theme);
    this.drawFlag(ctx, level, time);
    this.drawVines(ctx, time, mode);
    this.drawPollen(ctx, time, speed, theme);
    this.drawPulses(ctx, dt);
    this.drawVignette(ctx, mode);
  }

  traceGroundRing(ctx, field, x, y, radius, ground, lift = .9, count = 36) {
    ctx.beginPath();
    for (let index = 0; index <= count; index += 1) {
      const angle = index / count * TAU;
      const wx = x + Math.cos(angle) * radius;
      const wy = y + Math.sin(angle) * radius;
      const z = Number.isFinite(ground) ? ground : (field?.heightAt?.(wx, wy) || 0);
      const point = this.renderer.worldToScreen(wx, wy, z + lift);
      if (index) ctx.lineTo(point.x, point.y);
      else ctx.moveTo(point.x, point.y);
    }
  }

  drawReadabilityCues(ctx, level, ball, aim, time, mode, speed, theme) {
    if (mode !== 'playing' || !this.renderer.worldToScreen || !level?.hole || !ball) return;
    const field = level.course18?.field;
    const hole = level.hole;
    const holeGround = field?.heightAt?.(hole.x, hole.y) || 0;
    const holeBase = this.renderer.worldToScreen(hole.x, hole.y, holeGround + 1.2);
    const holeTop = this.renderer.worldToScreen(hole.x, hole.y, holeGround + 78);
    const holeOnScreen = holeBase.x > -70 && holeBase.x < this.width + 70 && holeBase.y > -80 && holeBase.y < this.height + 80;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (holeOnScreen) {
      const pulse = this.reducedMotion ? .5 : .5 + Math.sin(time * 1.25 + hole.x * .004) * .5;
      this.traceGroundRing(ctx, field, hole.x, hole.y, hole.r + 12 + pulse * 3, holeGround, 1.15);
      ctx.strokeStyle = 'rgba(4,16,10,.66)';
      ctx.lineWidth = 3.4;
      ctx.stroke();
      this.traceGroundRing(ctx, field, hole.x, hole.y, hole.r + 12 + pulse * 3, holeGround, 1.35);
      ctx.setLineDash([4, 7]);
      ctx.lineDashOffset = this.reducedMotion ? 0 : -time * 3.5;
      ctx.strokeStyle = tint(theme.beam, .58 + pulse * .16);
      ctx.lineWidth = 1.25;
      ctx.stroke();
      ctx.setLineDash([]);

      const beacon = ctx.createLinearGradient(holeBase.x, holeBase.y, holeTop.x, holeTop.y);
      beacon.addColorStop(0, tint(theme.beam, 0));
      beacon.addColorStop(.35, tint(theme.beam, .18));
      beacon.addColorStop(1, tint(theme.beam, .48 + pulse * .12));
      ctx.strokeStyle = beacon;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(holeBase.x, holeBase.y);
      ctx.lineTo(holeTop.x, holeTop.y);
      ctx.stroke();
      ctx.fillStyle = tint(theme.beam, .62 + pulse * .16);
      ctx.beginPath();
      ctx.arc(holeTop.x, holeTop.y, 1.6 + pulse, 0, TAU);
      ctx.fill();
    }

    if (!ball.sunk && !ball.inCup) {
      const ground = Number.isFinite(ball.groundZ) ? ball.groundZ : (field?.heightAt?.(ball.x, ball.y) || 0);
      const steady = speed < 8 && !ball.airborne;
      const visibility = aim?.active ? .88 : steady ? .64 : .24;
      const cueRadius = 35 + (steady && !this.reducedMotion ? Math.sin(time * 1.7) * 1.5 : 0);
      this.traceGroundRing(ctx, field, ball.x, ball.y, cueRadius, ground, 1.1, 32);
      ctx.strokeStyle = `rgba(2,12,7,${visibility * .72})`;
      ctx.lineWidth = 3.2;
      ctx.stroke();
      this.traceGroundRing(ctx, field, ball.x, ball.y, cueRadius, ground, 1.35, 32);
      ctx.setLineDash([3, 8]);
      ctx.lineDashOffset = this.reducedMotion ? 0 : time * 2.2;
      ctx.strokeStyle = tint(theme.accent, visibility);
      ctx.lineWidth = 1.15;
      ctx.stroke();
      ctx.setLineDash([]);

      const ballZ = Number.isFinite(ball.z) ? ball.z : ground + 22;
      const center = this.renderer.worldToScreen(ball.x, ball.y, ballZ);
      const screenRadius = clamp(22 * (this.renderer.scale || 1), 5.5, 22);
      ctx.globalCompositeOperation = 'screen';
      ctx.strokeStyle = `rgba(242,255,247,${.28 + visibility * .34})`;
      ctx.lineWidth = 1.15;
      ctx.beginPath();
      ctx.arc(center.x, center.y, screenRadius + 1.25, Math.PI * 1.03, Math.PI * 1.63);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawGroundingFringe(ctx, level, time) {
    const outline = level.outline || [];
    if (outline.length < 2 || !this.renderer.worldToScreen) return;
    const centroid = polygonCentroid(outline);
    ctx.save();
    ctx.lineCap = 'round';
    for (let index = 0; index < outline.length; index += 1) {
      const a = outline[index];
      const b = outline[(index + 1) % outline.length];
      const midpointY = (a.y + b.y) * .5;
      if (midpointY < centroid.y - 12) continue;
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      const blades = Math.min(18, Math.max(3, Math.floor(length / 42)));
      for (let blade = 0; blade <= blades; blade += 1) {
        if (this.quality < .7 && blade % 2) continue;
        const t = blade / Math.max(1, blades);
        const wx = lerp(a.x, b.x, t);
        const wy = lerp(a.y, b.y, t);
        const base = this.renderer.worldToScreen(wx, wy, 14.5);
        const seed = hashNoise(index, blade, level.id || 0);
        const height = 4 + seed * 9;
        const sway = this.reducedMotion ? 0 : Math.sin(time * (1.1 + seed) + seed * 8) * 1.4 + this.wind * 1.8;
        ctx.strokeStyle = seed > .55 ? 'rgba(112,145,83,.82)' : 'rgba(48,91,54,.9)';
        ctx.lineWidth = .7 + seed * .8;
        ctx.beginPath();
        ctx.moveTo(base.x, base.y + 1);
        ctx.quadraticCurveTo(base.x + sway * .45, base.y - height * .55, base.x + sway, base.y - height);
        ctx.stroke();
      }
    }

    for (let index = 0; index < (level.obstacles || []).length; index += 1) {
      const obstacle = level.obstacles[index];
      const tufts = this.quality < .7 ? 5 : 9;
      for (let tuft = 0; tuft < tufts; tuft += 1) {
        const angle = Math.PI * (.08 + tuft / Math.max(1, tufts - 1) * .84);
        const radius = obstacle.r * (.84 + hashNoise(index, tuft, 301) * .18);
        const wx = obstacle.x + Math.cos(angle) * radius;
        const wy = obstacle.y + Math.sin(angle) * radius;
        const base = this.renderer.worldToScreen(wx, wy, 2.5);
        const height = 3 + hashNoise(index, tuft, 307) * 7;
        ctx.strokeStyle = obstacle.material === 'stone' ? 'rgba(61,101,58,.78)' : 'rgba(79,113,63,.72)';
        ctx.lineWidth = .8;
        ctx.beginPath();
        ctx.moveTo(base.x, base.y);
        ctx.quadraticCurveTo(base.x + this.wind, base.y - height * .55, base.x + this.wind * 1.7, base.y - height);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  drawGlassArchitecture(ctx, level, time) {
    if (!this.renderer.worldToScreen) return;
    ctx.save();
    for (let index = 0; index < (level.walls || []).length; index += 1) {
      const wall = level.walls[index];
      if (wall.material !== 'glass') continue;
      const a0 = this.renderer.worldToScreen(wall.ax, wall.ay, 8);
      const b0 = this.renderer.worldToScreen(wall.bx, wall.by, 8);
      const a1 = this.renderer.worldToScreen(wall.ax, wall.ay, 72);
      const b1 = this.renderer.worldToScreen(wall.bx, wall.by, 72);
      const shimmer = this.reducedMotion ? .5 : .5 + Math.sin(time * 1.15 + index * 1.9) * .5;
      const panel = ctx.createLinearGradient(a1.x, a1.y, b0.x, b0.y);
      panel.addColorStop(0, `rgba(214,238,224,${.045 + shimmer * .055})`);
      panel.addColorStop(.48, 'rgba(155,201,180,.02)');
      panel.addColorStop(1, `rgba(235,244,220,${.035 + (1 - shimmer) * .045})`);
      ctx.fillStyle = panel;
      ctx.beginPath();
      ctx.moveTo(a0.x, a0.y); ctx.lineTo(b0.x, b0.y); ctx.lineTo(b1.x, b1.y); ctx.lineTo(a1.x, a1.y); ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = 'rgba(26,54,39,.92)';
      ctx.lineWidth = Math.max(2.2, (this.renderer.scale || 1) * 7);
      ctx.beginPath(); ctx.moveTo(a0.x, a0.y); ctx.lineTo(a1.x, a1.y); ctx.moveTo(b0.x, b0.y); ctx.lineTo(b1.x, b1.y); ctx.stroke();
      ctx.strokeStyle = 'rgba(196,213,180,.46)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(a1.x, a1.y); ctx.lineTo(b1.x, b1.y); ctx.moveTo(a0.x, a0.y); ctx.lineTo(b0.x, b0.y); ctx.stroke();

      const t = this.reducedMotion ? .46 : (time * .12 + index * .27) % 1;
      const sx0 = lerp(a1.x, b1.x, t);
      const sy0 = lerp(a1.y, b1.y, t);
      const sx1 = lerp(a0.x, b0.x, clamp(t + .17, 0, 1));
      const sy1 = lerp(a0.y, b0.y, clamp(t + .17, 0, 1));
      ctx.globalCompositeOperation = 'screen';
      ctx.strokeStyle = 'rgba(239,248,225,.42)';
      ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.moveTo(sx0, sy0); ctx.lineTo(sx1, sy1); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';

      for (const point of [a0, b0]) {
        ctx.fillStyle = 'rgba(181,151,78,.82)';
        ctx.beginPath(); ctx.arc(point.x, point.y, 1.6, 0, TAU); ctx.fill();
      }
    }

    for (let index = 0; index < (level.zones || []).length; index += 1) {
      const zone = level.zones[index];
      if (zone.type !== 'bridge') continue;
      const corners = [
        this.renderer.worldToScreen(zone.x, zone.y, 10.8),
        this.renderer.worldToScreen(zone.x + zone.w, zone.y, 10.8),
        this.renderer.worldToScreen(zone.x + zone.w, zone.y + zone.h, 10.8),
        this.renderer.worldToScreen(zone.x, zone.y + zone.h, 10.8)
      ];
      ctx.strokeStyle = 'rgba(29,60,44,.86)';
      ctx.lineWidth = Math.max(1.8, (this.renderer.scale || 1) * 5.5);
      ctx.beginPath();
      corners.forEach((point, corner) => corner ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
      ctx.closePath(); ctx.stroke();
      const shine = (time * .16 + index * .31) % 1;
      const start = { x: lerp(corners[0].x, corners[3].x, shine), y: lerp(corners[0].y, corners[3].y, shine) };
      const end = { x: lerp(corners[1].x, corners[2].x, shine), y: lerp(corners[1].y, corners[2].y, shine) };
      ctx.globalCompositeOperation = 'screen';
      ctx.strokeStyle = 'rgba(230,246,226,.28)';
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
  }

  drawFlag(ctx, level, time) {
    if (!this.renderer.worldToScreen || !level?.hole) return;
    const hole = level.hole;
    const poleX = hole.x + hole.r * .24;
    const poleY = hole.y - hole.r * .08;
    const top = this.renderer.worldToScreen(poleX, poleY, 126);
    const middle = this.renderer.worldToScreen(poleX, poleY, 109);
    const bottom = this.renderer.worldToScreen(poleX, poleY, 94);
    const wave = this.reducedMotion ? 0 : Math.sin(time * 2.15 + hole.x * .01) * 4 + this.wind * 5;
    ctx.save();
    ctx.fillStyle = 'rgba(210,169,84,.92)';
    ctx.strokeStyle = 'rgba(117,88,39,.64)';
    ctx.lineWidth = .8;
    ctx.beginPath();
    ctx.moveTo(top.x, top.y);
    ctx.quadraticCurveTo(top.x + 31, top.y + wave - 2, top.x + 58, middle.y + wave * .45);
    ctx.quadraticCurveTo(top.x + 32, bottom.y - wave * .35, bottom.x, bottom.y);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  drawVines(ctx, time, mode) {
    const { width, height } = this;
    ctx.save();
    for (let index = 0; index < this.vines.length; index += 1) {
      if (this.quality < .7 && index % 2) continue;
      const vine = this.vines[index];
      const originX = vine.side < 0 ? -8 : vine.side > 0 ? width + 8 : vine.x * width;
      const originY = vine.side === 0 ? -12 : height * (.14 + vine.x * .58);
      const direction = vine.side < 0 ? 1 : vine.side > 0 ? -1 : 0;
      const sway = this.reducedMotion ? 0 : Math.sin(time * .55 + vine.phase) * 9 + this.wind * 7;
      const endX = vine.side === 0 ? originX + sway : originX + direction * width * vine.length;
      const endY = vine.side === 0 ? height * vine.length : originY + height * .11 + sway * .25;
      ctx.strokeStyle = mode === 'menu' ? 'rgba(31,75,42,.94)' : 'rgba(29,68,39,.84)';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(originX, originY);
      ctx.bezierCurveTo(
        lerp(originX, endX, .32) + sway * .25,
        lerp(originY, endY, .25),
        lerp(originX, endX, .68) - sway * .12,
        lerp(originY, endY, .72),
        endX,
        endY
      );
      ctx.stroke();
      for (let leaf = 0; leaf < vine.leaves; leaf += 1) {
        const t = (leaf + 1) / (vine.leaves + 1);
        const lx = lerp(originX, endX, t) + Math.sin(t * Math.PI) * sway * .2;
        const ly = lerp(originY, endY, t);
        const angle = (leaf % 2 ? 1 : -1) * (.82 + t * .45) + (vine.side ? 0 : .3);
        this.drawLeaf(ctx, lx, ly, 9 + t * 5, angle, leaf % 3 === 0 ? 'rgba(83,118,62,.92)' : 'rgba(48,98,53,.94)');
      }
    }
    ctx.restore();
  }

  drawLeaf(ctx, x, y, size, angle, fill) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(-size, 0);
    ctx.quadraticCurveTo(-size * .15, -size * .55, size, 0);
    ctx.quadraticCurveTo(-size * .12, size * .55, -size, 0);
    ctx.fill();
    ctx.strokeStyle = 'rgba(188,204,145,.18)';
    ctx.lineWidth = .55;
    ctx.beginPath(); ctx.moveTo(-size * .7, 0); ctx.lineTo(size * .72, 0); ctx.stroke();
    ctx.restore();
  }

  drawPollen(ctx, time, speed, theme) {
    const { width, height } = this;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const count = Math.floor(this.pollen.length * this.quality);
    for (let index = 0; index < count; index += 1) {
      const mote = this.pollen[index];
      const motion = this.reducedMotion ? 0 : time * mote.speed;
      const x = ((mote.x + motion * .14 + this.wind * .025 * mote.depth) % 1) * width;
      const y = ((mote.y + motion + Math.sin(time * .31 + mote.phase) * .012) % 1) * height;
      const radius = .7 + mote.depth * 1.45;
      const alpha = .08 + mote.depth * .16 + Math.min(.08, speed / 12000);
      ctx.fillStyle = tint(theme.pollen, alpha);
      ctx.beginPath(); ctx.arc(x, y, radius, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  drawPulses(ctx, dt) {
    for (const pulse of this.pulses) pulse.life -= dt;
    this.pulses = this.pulses.filter((pulse) => pulse.life > 0);
    if (!this.renderer.worldToScreen) return;
    ctx.save();
    for (const pulse of this.pulses) {
      const t = 1 - pulse.life / pulse.maxLife;
      const point = this.renderer.worldToScreen(pulse.x, pulse.y, 4 + t * 18);
      const radius = 5 + t * (12 + pulse.amount * .8);
      const alpha = (1 - t) * .38;
      ctx.strokeStyle = pulse.type === 'water' ? `rgba(168,219,210,${alpha})` : pulse.type === 'cup' ? `rgba(230,201,112,${alpha})` : `rgba(173,193,124,${alpha})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.ellipse(point.x, point.y, radius, radius * .42, 0, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }

  drawVignette(ctx, mode) {
    const { width, height } = this;
    const vignette = ctx.createRadialGradient(width * .5, height * .45, Math.min(width, height) * .16, width * .5, height * .48, Math.max(width, height) * .72);
    vignette.addColorStop(.54, 'rgba(3,11,7,0)');
    vignette.addColorStop(1, mode === 'menu' ? 'rgba(2,9,6,.28)' : 'rgba(2,9,6,.18)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
  }
}
