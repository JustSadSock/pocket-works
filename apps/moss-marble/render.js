import { DioramaRenderer as CoreDioramaRenderer } from './render-core14.js';
import { LivingGreenhouseLayer } from './greenhouse15.js';
import { installTerrain18 } from './terrain18.js';
import { upgradeCourseLevel17 } from './course17.js';
import { isCourse18 } from './course18.js';
import { upgradeCourse19InPlace } from './course19.js';
import { CoursePolishLayer } from './polish19.js';
import { stabilizeLevelGeometry } from './integrity.js';

export { polygonArea, triangulatePolygon } from './render-core14.js';

const lerp = (a, b, t) => a + (b - a) * t;

function installWorldSpaceFlag(greenhouse) {
  greenhouse.drawFlag = function drawFlag(ctx, level, time) {
    if (!this.renderer.worldToScreen || !level?.hole) return;
    const hole = level.hole;
    const ground = level.course18?.field?.heightAt?.(hole.x, hole.y) || 0;
    const poleX = hole.x + hole.r * .24;
    const poleY = hole.y - hole.r * .08;
    const top = this.renderer.worldToScreen(poleX, poleY, ground + 126);
    const tip = this.renderer.worldToScreen(poleX + 58, poleY + 3, ground + 112);
    const bottom = this.renderer.worldToScreen(poleX, poleY, ground + 94);
    const lowerTip = this.renderer.worldToScreen(poleX + 48, poleY + 3, ground + 102);
    const wave = this.reducedMotion ? 0 : Math.sin(time * 2.15 + hole.x * .01) * 3 + this.wind * 3.5;
    ctx.save();
    ctx.fillStyle = 'rgba(210,169,84,.92)';
    ctx.strokeStyle = 'rgba(117,88,39,.64)';
    ctx.lineWidth = .8;
    ctx.beginPath();
    ctx.moveTo(top.x, top.y);
    ctx.quadraticCurveTo(lerp(top.x, tip.x, .52), top.y + wave - 2, tip.x, tip.y + wave * .45);
    ctx.quadraticCurveTo(lerp(lowerTip.x, bottom.x, .42), lowerTip.y - wave * .35, bottom.x, bottom.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  };
}

function markCompiledIntegrity(level) {
  try {
    Object.defineProperty(level, '__integrityVersion', { value: 2, writable: true, configurable: true, enumerable: false });
    Object.defineProperty(level, '__integrityReport', {
      value: { source: 'course19-compiler', movedObstacles: 0, removedObstacles: 0, movedRotors: 0, removedRotors: 0 },
      writable: true,
      configurable: true,
      enumerable: false
    });
  } catch {
    level.__integrityVersion = 2;
  }
}

function orientExitPortal(level) {
  if (!isCourse18(level) || level.__course19ExitOriented) return;
  const tunnel = level.tunnels?.[0];
  const visual = tunnel?.visualExit || level.course18?.tunnelVisuals?.[0]?.exit;
  if (!visual) return;

  const travelX = visual.axisX;
  const travelY = visual.axisY;
  visual.axisX = -travelX;
  visual.axisY = -travelY;
  visual.angle = Math.atan2(visual.axisY, visual.axisX);

  const half = visual.width * .5;
  const normalX = -visual.axisY;
  const normalY = visual.axisX;
  const sideLength = visual.depth * .64;
  for (const wall of level.walls || []) {
    if (!String(wall.tunnelWall || '').startsWith('exit-')) continue;
    const sign = String(wall.tunnelWall).endsWith('--1') ? -1 : 1;
    wall.ax = visual.x + normalX * half * sign;
    wall.ay = visual.y + normalY * half * sign;
    wall.bx = wall.ax + visual.axisX * sideLength;
    wall.by = wall.ay + visual.axisY * sideLength;
  }

  if (tunnel?.exit) {
    tunnel.exit.axisX = travelX;
    tunnel.exit.axisY = travelY;
    tunnel.exit.angle = Math.atan2(travelY, travelX);
  }
  try { Object.defineProperty(level, '__course19ExitOriented', { value: true, configurable: true }); }
  catch { level.__course19ExitOriented = true; }
}

function prepareTunnelTrigger(level, ball) {
  if (!isCourse18(level) || !ball) return;
  const tunnel = level.tunnels?.[0];
  const entry = tunnel?.entry;
  const visual = tunnel?.visualEntry;
  if (!entry || !visual) return;
  if (!Number.isFinite(entry.__baseRadius)) {
    try { Object.defineProperty(entry, '__baseRadius', { value: Number(entry.r || 28), writable: false, configurable: true }); }
    catch { entry.__baseRadius = Number(entry.r || 28); }
  }
  const baseRadius = Number(entry.__baseRadius || 28);
  const speed = Math.hypot(ball.vx || 0, ball.vy || 0);
  const inwardSpeed = (ball.vx || 0) * visual.axisX + (ball.vy || 0) * visual.axisY;
  const dx = ball.x - visual.x;
  const dy = ball.y - visual.y;
  const longitudinal = dx * visual.axisX + dy * visual.axisY;
  const lateral = Math.abs(dx * -visual.axisY + dy * visual.axisX);
  const inCorridor = longitudinal > -baseRadius * 2.2 && longitudinal < visual.depth + baseRadius * 2.4 && lateral < visual.width * .62;
  const directionAllowed = speed < 12 || (inwardSpeed > Math.max(18, speed * .08) && inCorridor);
  entry.r = directionAllowed ? baseRadius : 0;
}

function createVisualLevel(level) {
  if (isCourse18(level)) {
    return {
      ...level,
      renderId: `${level.renderId ?? level.id}:visual`,
      zones: [],
      obstacles: [],
      walls: [],
      tunnels: [],
      decorations: [],
      terrainWalls: [],
      terrainTunnels: []
    };
  }
  return {
    ...level,
    renderId: `${level.renderId ?? level.id}:terrain-17`,
    zones: (level.zones || []).map((zone) => ({ ...zone, physicsType: zone.physicsType || zone.type, type: 'terrain-17' })),
    terrainWalls: (level.walls || []).map((wall) => ({ ...wall })),
    terrainTunnels: (level.tunnels || []).map((tunnel) => ({ entry: tunnel.entry ? { ...tunnel.entry } : null, exit: tunnel.exit ? { ...tunnel.exit } : null })),
    walls: [],
    tunnels: []
  };
}

export class DioramaRenderer {
  constructor(canvas) {
    const core = new CoreDioramaRenderer(canvas);
    const terrain = installTerrain18(core, canvas);
    const greenhouse = new LivingGreenhouseLayer(canvas, core);
    const polish = new CoursePolishLayer(canvas, core);
    const visualCache = new WeakMap();
    const integrityCache = new WeakSet();
    installWorldSpaceFlag(greenhouse);
    greenhouse.drawGroundingFringe = () => {};
    greenhouse.drawGlassArchitecture = () => {};

    const visualFor = (level) => {
      if (!level || typeof level !== 'object') return level;
      upgradeCourse19InPlace(level);
      if (isCourse18(level)) {
        orientExitPortal(level);
        markCompiledIntegrity(level);
      } else {
        upgradeCourseLevel17(level);
        if (!integrityCache.has(level)) {
          try { level.__integrityVersion = 0; } catch {}
          stabilizeLevelGeometry(level);
        }
      }
      integrityCache.add(level);
      let visual = visualCache.get(level);
      if (!visual) {
        visual = createVisualLevel(level);
        visualCache.set(level, visual);
      }
      return visual;
    };

    return new Proxy(core, {
      get(target, property) {
        if (property === 'livingGreenhouse') return greenhouse;
        if (property === 'terrain19') return terrain;
        if (property === 'drawMesh' && terrain.captureLegacyDrawMesh) return () => {};
        if (property === 'draw') {
          return (level, ball, aim, time, dt, mode) => {
            const visualLevel = visualFor(level);
            prepareTunnelTrigger(level, ball);
            const result = target.draw(visualLevel, ball, aim, time, dt, mode);
            polish.draw(visualLevel, time, dt, ball);
            greenhouse.draw(visualLevel, ball, aim, time, dt, mode);
            return result;
          };
        }
        if (property === 'emit') {
          return (x, y, type, amount) => {
            target.emit?.(x, y, type, amount);
            greenhouse.emit(x, y, type, amount);
          };
        }
        if (property === 'destroy') {
          return () => {
            terrain.destroy();
            polish.destroy();
            greenhouse.destroy();
            target.destroy?.();
          };
        }
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
      set(target, property, value) {
        Reflect.set(target, property, value, target);
        return true;
      }
    });
  }
}
