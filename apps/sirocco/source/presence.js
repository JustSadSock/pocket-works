import { DesertWind } from './wind.js';
import { WindErosion } from './wind-erosion.js';

export class DesertPresence {
  constructor(game) {
    this.game = game;
    this.wind = new DesertWind();
    this.erosion = new WindErosion(game.sand);
    this.lastPreset = '';
    this.baseFog = game.scene.fogDensity;
    this.observer = null;
  }

  start() {
    if (this.observer || !this.game?.scene) return;
    this.applyQuality();
    this.observer = this.game.scene.onBeforeRenderObservable.add(() => this.update());
  }

  applyQuality() {
    const preset = this.game.quality?.preset;
    if (!preset || preset.id === this.lastPreset) return;
    this.lastPreset = preset.id;
    this.erosion.setQuality(preset);
    this.baseFog = preset.id === 'low' ? 0.00225 : preset.id === 'medium' ? 0.00195 : 0.0017;
  }

  update() {
    const game = this.game;
    if (!game?.running || game.paused || document.hidden || game.orientationBlocked) return;
    const dt = Math.min(0.04, game.engine.getDeltaTime() / 1000);
    this.applyQuality();

    const state = this.wind.update(dt, game.controller.globalX, game.controller.globalZ);
    const moved = this.erosion.update(dt, game.controller.globalX, game.controller.globalZ, state);
    if (moved) game.sandDirty = true;

    game.particles?.wind(
      dt,
      game.controller.localPosition,
      state,
      (localX, localZ) => {
        const gx = localX + game.controller.worldOffsetX;
        const gz = localZ + game.controller.worldOffsetZ;
        return game.sandSurface.sampleHeight(gx, gz);
      }
    );

    // Override the baseline audio update with the same gust value that drives
    // visible sand. That coherence makes the desert feel much less synthetic.
    game.audio?.update(game.controller.speed, game.controller.lastSlope, state);

    // Gust fronts carry a little more dust near the horizon. Keep the range
    // tiny so LOD silhouettes never disappear and High remains crisp.
    const gustFog = this.baseFog * (1 + state.gust * state.strength * 0.18);
    game.scene.fogDensity += (gustFog - game.scene.fogDensity) * Math.min(1, dt * 1.8);
    game.atmosphere?.material?.setFloat?.('haze', 0.78 + state.gust * state.strength * 0.12);
  }

  dispose() {
    if (this.observer && this.game?.scene) this.game.scene.onBeforeRenderObservable.remove(this.observer);
    this.observer = null;
  }
}
