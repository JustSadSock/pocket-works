import { DesertWind } from './wind.js';
import { WindErosion } from './wind-erosion.js';

export class DesertPresence {
  constructor(game) {
    this.game = game;
    this.wind = new DesertWind();
    this.erosion = new WindErosion(game.sand);
    this.lastPreset = '';
    this.baseFog = game.scene.fogDensity;
    this.baseHaze = 0.82;
    this.observer = null;
    this.time = 0;
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
    this.baseHaze = preset.id === 'low' ? 0.92 : 0.82;
  }

  update() {
    const game = this.game;
    if (!game?.running || game.paused || document.hidden || game.orientationBlocked) return;
    const dt = Math.min(0.04, game.engine.getDeltaTime() / 1000);
    this.time += dt;
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

    // Secondary garment motion is intentionally tiny and applied after the
    // locomotion update. It reads as wind pressure, not as another walk cycle.
    const polish = game.characterPolish;
    if (polish?.cosmeticsVisible) {
      const pressure = state.strength * (0.35 + state.gust * 0.65);
      const flutter = Math.sin(this.time * (4.2 + state.gust * 2.4)) * 0.012 * pressure;
      if (polish.shoulderDrape) polish.shoulderDrape.rotation.z = -state.x * 0.035 * pressure + flutter;
      if (polish.scarfLayer) polish.scarfLayer.rotation.y = state.z * 0.055 * pressure + flutter * 0.7;
      if (polish.waterSkin) polish.waterSkin.rotation.x = state.x * 0.020 * pressure;
    }

    // Gust fronts carry a little more dust near the horizon. Keep the range
    // tiny so LOD silhouettes never disappear and every quality mode retains
    // its authored baseline visibility.
    const gustFog = this.baseFog * (1 + state.gust * state.strength * 0.18);
    game.scene.fogDensity += (gustFog - game.scene.fogDensity) * Math.min(1, dt * 1.8);
    game.atmosphere?.material?.setFloat?.('haze', this.baseHaze + state.gust * state.strength * 0.10);
  }

  dispose() {
    if (this.observer && this.game?.scene) this.game.scene.onBeforeRenderObservable.remove(this.observer);
    this.observer = null;
  }
}
