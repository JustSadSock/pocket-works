import { MeshBuilder, ShaderMaterial } from '@babylonjs/core';

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
  vec3 zenith = vec3(0.060, 0.072, 0.090);
  vec3 upper = vec3(0.125, 0.112, 0.104);
  vec3 horizon = vec3(0.33, 0.235, 0.165);
  vec3 color = mix(horizon, upper, smoothstep(0.38, 0.62, h));
  color = mix(color, zenith, smoothstep(0.62, 0.98, h));

  vec3 sunDir = normalize(vec3(-0.50, 0.30, -0.81));
  float sun = max(dot(dir, sunDir), 0.0);
  float glow = pow(sun, 18.0) * 0.24 + pow(sun, 110.0) * 0.54;
  color += vec3(1.0, 0.61, 0.32) * glow * horizonBand;

  float lowHaze = pow(max(0.0, 1.0 - abs(dir.y) * 4.2), 2.0);
  color += vec3(0.12, 0.065, 0.032) * lowHaze;
  gl_FragColor = vec4(color, 1.0);
}`;

function setShieldScale(warrior, radius) {
  if (!warrior?.meshes || !warrior?.shield) return;
  warrior.shield.radius = radius;
  const factor = radius / 0.45;
  warrior.meshes.shield.scaling.setAll(factor);
  warrior.meshes.shieldRim.scaling.setAll(factor);
  warrior.meshes.shieldBoss.scaling.setAll(factor * 0.96);
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

  // The first-person shield must read as a real object held at arm's length,
  // not as a permanent full-screen wall. The opponent keeps a broader target
  // because it is viewed from several metres away.
  setShieldScale(game.player, 0.32);
  setShieldScale(game.enemy, 0.39);

  game.camera.fov = 1.25;
  game.camera.minZ = 0.045;
  game.scene.fogDensity = Math.min(game.scene.fogDensity, 0.0090);
  game.scene.imageProcessingConfiguration.exposure = 1.24;
  game.scene.imageProcessingConfiguration.contrast = 1.06;

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
