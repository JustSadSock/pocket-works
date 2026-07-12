export const ENHANCED_PRESETS = {
  vite: {
    label: 'Vite TypeScript',
    description: 'A typed Vite and Workbox application with a tested state transition.',
    tags: ['vite', 'typescript', 'workbox', 'vitest'],
    markup: `<h2 id="stage-title">A compiled shell for applications that need modules and tests.</h2>
      <button id="primary-action" type="button" data-native-press>Advance state</button>
      <output id="status" aria-live="polite">Ready</output>`,
    imports: `import { nextCount } from './core';`,
    script: `const action = document.querySelector<HTMLButtonElement>('#primary-action');
const status = document.querySelector<HTMLOutputElement>('#status');
let count = 0;
action?.addEventListener('click', () => {
  count = nextCount(count);
  if (status) status.value = \`Compiled interaction · \${count}\`;
});`,
    core: `export function nextCount(value: number) {
  if (!Number.isFinite(value)) throw new TypeError('value must be finite');
  return value + 1;
}
`,
    test: `import { describe, expect, it } from 'vitest';
import { nextCount } from './core';
describe('nextCount', () => {
  it('advances a finite counter', () => expect(nextCount(4)).toBe(5));
});
`,
    styles: ''
  },
  pixi: {
    label: 'PixiJS 8',
    description: 'A high-performance PixiJS scene with direct pointer steering.',
    tags: ['pixi', 'webgl', 'game', 'typescript', 'workbox'],
    markup: `<h2 id="stage-title">A WebGL specimen follows direct input.</h2>
      <div class="engine-stage" id="engine-stage" data-gesture-surface data-block-callout></div>
      <output id="status" aria-live="polite">Starting renderer…</output>`,
    imports: `import { Application, Graphics } from 'pixi.js';
import { clamp } from './core';`,
    script: `const host = document.querySelector<HTMLElement>('#engine-stage');
const status = document.querySelector<HTMLOutputElement>('#status');
if (!host) throw new Error('Missing Pixi host');
const app = new Application();
await app.init({ resizeTo: host, antialias: true, backgroundAlpha: 0 });
host.append(app.canvas);
const specimen = new Graphics().circle(0, 0, 28).fill(getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
app.stage.addChild(specimen);
let targetX = host.clientWidth / 2;
let targetY = host.clientHeight / 2;
specimen.position.set(targetX, targetY);
host.addEventListener('pointermove', (event) => {
  const rect = host.getBoundingClientRect();
  targetX = clamp(event.clientX - rect.left, 28, rect.width - 28);
  targetY = clamp(event.clientY - rect.top, 28, rect.height - 28);
});
app.ticker.add(() => {
  specimen.x += (targetX - specimen.x) * 0.16;
  specimen.y += (targetY - specimen.y) * 0.16;
});
if (status) status.value = 'PixiJS renderer active';`,
    core: `export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
`,
    test: `import { describe, expect, it } from 'vitest';
import { clamp } from './core';
describe('clamp', () => {
  it('keeps values inside bounds', () => expect(clamp(12, 0, 10)).toBe(10));
});
`,
    styles: `.engine-stage { min-height: 340px; border: 1px solid color-mix(in srgb, var(--fg) 28%, transparent); touch-action: none; overflow: hidden; }
.engine-stage canvas { display: block; width: 100%; height: 100%; }`
  },
  phaser: {
    label: 'Phaser 3',
    description: 'A Phaser scene with a responsive pointer-driven movement loop.',
    tags: ['phaser', 'game', 'canvas', 'typescript', 'workbox'],
    markup: `<h2 id="stage-title">A game scene with an explicit update loop.</h2>
      <div class="engine-stage" id="engine-stage" data-gesture-surface data-block-callout></div>
      <output id="status" aria-live="polite">Starting scene…</output>`,
    imports: `import Phaser from 'phaser';
import { approach } from './core';`,
    script: `const status = document.querySelector<HTMLOutputElement>('#status');
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
});`,
    core: `export function approach(current: number, target: number, factor: number) {
  return current + (target - current) * factor;
}
`,
    test: `import { describe, expect, it } from 'vitest';
import { approach } from './core';
describe('approach', () => {
  it('moves toward the target', () => expect(approach(0, 10, 0.2)).toBe(2));
});
`,
    styles: `.engine-stage { min-height: 340px; border: 1px solid color-mix(in srgb, var(--fg) 28%, transparent); touch-action: none; overflow: hidden; }
.engine-stage canvas { display: block; }`
  },
  tone: {
    label: 'Tone.js',
    description: 'A transport-aware Tone.js instrument that unlocks from deliberate input.',
    tags: ['tone', 'audio', 'music', 'typescript', 'workbox'],
    markup: `<h2 id="stage-title">A small instrument with scheduled Web Audio.</h2>
      <div class="tone-steps" id="tone-steps" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
      <button id="primary-action" type="button" data-native-press>Play sequence</button>
      <output id="status" aria-live="polite">Audio locked</output>`,
    imports: `import * as Tone from 'tone';
import { sequenceForRun } from './core';`,
    script: `const action = document.querySelector<HTMLButtonElement>('#primary-action');
const status = document.querySelector<HTMLOutputElement>('#status');
const steps = [...document.querySelectorAll<HTMLElement>('#tone-steps i')];
let synth: Tone.Synth | null = null;
action?.addEventListener('click', async () => {
  await Tone.start();
  synth ||= new Tone.Synth({ volume: -12 }).toDestination();
  const notes = sequenceForRun(4);
  const now = Tone.now();
  notes.forEach((note, index) => synth?.triggerAttackRelease(note, '16n', now + index * 0.14));
  steps.forEach((step, index) => setTimeout(() => step.classList.toggle('is-live'), index * 140));
  if (status) status.value = 'Sequence scheduled';
});`,
    core: `const SCALE = ['C4', 'E4', 'G4', 'B4', 'C5'];
export function sequenceForRun(length: number) {
  const safeLength = Math.max(1, Math.min(8, Math.floor(length)));
  return Array.from({ length: safeLength }, (_, index) => SCALE[index % SCALE.length]);
}
`,
    test: `import { describe, expect, it } from 'vitest';
import { sequenceForRun } from './core';
describe('sequenceForRun', () => {
  it('creates a bounded sequence', () => expect(sequenceForRun(4)).toEqual(['C4', 'E4', 'G4', 'B4']));
});
`,
    styles: `.tone-steps { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; min-height: 180px; align-items: end; }
.tone-steps i { display: block; height: 24%; background: var(--accent); transition: height 180ms ease; }
.tone-steps i.is-live { height: 100%; }`
  }
};

export function getEnhancedPreset(name) {
  const preset = ENHANCED_PRESETS[name];
  if (!preset) throw new Error(`Unknown enhanced preset ${name}. Available: ${Object.keys(ENHANCED_PRESETS).join(', ')}`);
  return preset;
}
