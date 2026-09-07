import { OceanWorld } from './world';

export class PelagosGame {
  private readonly world: OceanWorld;

  constructor(canvas: HTMLCanvasElement) {
    this.world = new OceanWorld(canvas, 'auto');
  }

  async boot(): Promise<void> {
    await this.world.scene.whenReadyAsync();
    this.world.engine.runRenderLoop(() => this.world.render());
  }

  resetAll(): void {}

  showBootError(error: unknown): void {
    console.error('[PELAGOS] diagnostic boot failure', error);
  }
}
