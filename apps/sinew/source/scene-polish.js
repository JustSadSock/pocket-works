import { MeshBuilder, ShaderMaterial, Vector3 } from '@babylonjs/core';

const SKY_VERTEX = `
precision highp float;
attribute vec3 position;
uniform mat4 worldViewProjection;
varying vec3 vDir;
void main(void) {
  vDir = normalize(position);
  gl_Position = worldViewProjection * vec4(position, 1.0);
}`;

const SKY_FRAGMENT = `
precision highp float;
varying vec3 vDir;
void main(void) {
  vec3 dir = normalize(vDir);
  float h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
  float horizonBand = 1.0 - smoothstep(0.46, 0.68, h);
  vec3 zenith = vec3(0.055, 0.065, 0.078);
  vec3 upper = vec3(0.105, 0.092, 0.086);
  vec3 horizon = vec3(0.285, 0.205, 0.145);
  vec3 color = mix(horizon, upper, smoothstep(0.38, 0.62, h));
  color = mix(color, zenith, smoothstep(0.62, 0.98, h));

  vec3 sunDir = normalize(vec3(-0.50, 0.30, -0.81));
  float sun = max(dot(dir, sunDir), 0.0);
  float glow = pow(sun, 18.0) * 0.22 + pow(sun, 110.0) * 0.52;
  color += vec3(1.0, 0.58, 0.28) * glow * horizonBand;

  float lowHaze = pow(max(0.0, 1.0 - abs(dir.y) * 4.2), 2.0);
  color += vec3(0.10, 0.055, 0.025) * lowHaze;
  gl_FragColor = vec4(color, 1.0);
}`;

function scaleShield(warrior, factor) {
  if (!warrior?.meshes) return;
  warrior.shield.radius = 0.42;
  warrior.meshes.shield.scaling.set(factor, factor, factor);
  warrior.meshes.shieldRim.scaling.set(factor, factor, factor);
  warrior.meshes.shieldBoss.scaling.set(factor * 0.96, factor * 0.96, factor * 0.96);
}

export function installScenePolish(game) {
  const scene = game.scene;
  const sky = MeshBuilder.CreateSphere('sinew-atmosphere', {
    diameter: 58,
    segments: 18,
    sideOrientation: 1
  }, scene);
  const skyMaterial = new ShaderMaterial('sinew-atmosphere-material', scene, {
    vertexSource: SKY_VERTEX,
    fragmentSource: SKY_FRAGMENT
  }, {
    attributes: ['position'],
    uniforms: ['worldViewProjection']
  });
  skyMaterial.backFaceCulling = false;
  sky.material = skyMaterial;
  sky.infiniteDistance = true;
  sky.applyFog = false;
  sky.isPickable = false;

  // A round 84 cm shield still reads as substantial, but no longer becomes a
  // first-person wall on a phone display. Collision and visual size stay aligned.
  scaleShield(game.player, 0.92);
  scaleShield(game.enemy, 0.92);

  game.camera.fov = 1.13;
  game.camera.minZ = 0.045;
  game.scene.fogDensity = Math.min(game.scene.fogDensity, 0.0095);
  game.scene.imageProcessingConfiguration.exposure = 1.16;
  game.scene.imageProcessingConfiguration.contrast = 1.10;

  const originalDispose = game.dispose?.bind(game);
  if (originalDispose) {
    game.dispose = (...args) => {
      sky.dispose(false, true);
      skyMaterial.dispose();
      return originalDispose(...args);
    };
  }

  return { sky, skyMaterial };
}
