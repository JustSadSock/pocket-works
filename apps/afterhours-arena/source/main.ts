import '../../../shared/mobile-runtime.css';
import '../../../shared/workshop-mode.css';
import './styles.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';
import Phaser from 'phaser';
import { approach } from './core';

installMobileRuntime();
registerEnhancedUpdate({
  appName: 'AFTERHOURS ARENA',
  version: '0.1.0',
  releaseNotes: ["Initial phaser 3 preset release."]
});

createWorkshopMode({
  appName: 'AFTERHOURS ARENA',
  version: '0.1.0',
  cachePrefix: 'afterhours-arena-',
  storageNamespace: 'pocket-works:afterhours-arena'
});

const status = document.querySelector<HTMLOutputElement>('#status');
class PocketScene extends Phaser.Scene {
  private specimen!: Phaser.GameObjects.Rectangle;
  private target = new Phaser.Math.Vector2(160, 160);
  create() {
    this.specimen = this.add.rectangle(160, 160, 54, 54, Number.parseInt(getComputedStyle(document.documentElement).getPropertyValue('--accent').trim().slice(1), 16));
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => this.target.set(pointer.x, pointer.y));
    if (status) status.value = 'Phaser scene active';
  }
  update() {
    this.specimen.x = approach(this.specimen.x, this.target.x, 0.14);
    this.specimen.y = approach(this.specimen.y, this.target.y, 0.14);
    this.specimen.rotation += 0.008;
  }
}
new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'engine-stage',
  backgroundColor: 'transparent',
  scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: 340 },
  scene: PocketScene
});
