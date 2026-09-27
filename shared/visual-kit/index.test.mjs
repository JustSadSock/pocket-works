import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createVisualKit } from './index.js';

class Color3 {
  constructor(...rgb) { this.rgb = rgb; }
  static FromHexString(hex) { return new Color3(hex); }
  static Lerp(a, b, t) { return t === 1 ? b : a; }
  clone() { return new Color3(...this.rgb); }
}
class Light {
  constructor(name, direction, scene) { this.name = name; this.direction = direction; scene.lights.push(this); }
  dispose() { this.disposed = true; }
}
class Material { constructor(name) { this.name = name; this.emissiveColor = new Color3(0, 0, 0); } clone(name) { return Object.assign(new Material(name), { emissiveColor: this.emissiveColor.clone() }); } dispose() { this.disposed = true; } }
const B = { Color3, Vector3: class { constructor(...xyz) { this.xyz = xyz; } }, HemisphericLight: Light, DirectionalLight: Light, PBRMaterial: Material, Scene: { FOGMODE_EXP2: 2 } };

test('forest lighting is scoped to the scene and restores fog', () => {
  const scene = { lights: [], fogMode: 0, fogColor: null, fogDensity: 0, clearColor: null };
  const kit = createVisualKit(B);
  const handle = kit.createForestLighting(scene, 'morning');
  assert.equal(scene.lights.length, 2);
  assert.equal(scene.fogMode, 2);
  handle.dispose();
  assert.equal(scene.fogMode, 0);
  assert.ok(scene.lights.every((light) => light.disposed));
  assert.throws(() => kit.createForestLighting(scene, 'bad'), RangeError);
});

test('surface values are bounded and flash cancellation restores emission', () => {
  const kit = createVisualKit(B);
  const material = kit.createSurface({}, 'rock', { roughness: 9, metallic: -2 });
  assert.equal(material.roughness, 1);
  assert.equal(material.metallic, 0);
  const mesh = { material };
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  try {
    const stop = kit.flashHit(mesh);
    assert.notEqual(mesh.material, material);
    stop();
    assert.equal(mesh.material, material);
  } finally {
    delete globalThis.requestAnimationFrame;
    delete globalThis.cancelAnimationFrame;
  }
});
