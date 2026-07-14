import { DioramaRenderer as CoreDioramaRenderer } from './render-core14.js';
import { LivingGreenhouseLayer } from './greenhouse15.js';
import { installTerrain18 } from './terrain18.js';
import { upgradeCourseLevel17 } from './course17.js';
import { isCourse18, upgradeCourse18InPlace } from './course18.js';
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
    const visualCache = new WeakMap();
    const integrityCache = new WeakSet();
    installWorldSpaceFlag(greenhouse);
    greenhouse.drawGroundingFringe = () => {};
    greenhouse.drawGlassArchitecture = () => {};

    const visualFor = (level) => {
      if (!level || typeof level !== 'object') return level;
      upgradeCourse18InPlace(level);
      if (!isCourse18(level)) upgradeCourseLevel17(level);
      if (!integrityCache.has(level)) {
        try { level.__integrityVersion = 0; } catch {}
        stabilizeLevelGeometry(level);
        integrityCache.add(level);
      }
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
        if (property === 'terrain18') return terrain;
        if (property === 'drawMesh' && terrain.captureLegacyDrawMesh) return () => {};
        if (property === 'draw') {
          return (level, ball, aim, time, dt, mode) => {
            const visualLevel = visualFor(level);
            const result = target.draw(visualLevel, ball, aim, time, dt, mode);
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
