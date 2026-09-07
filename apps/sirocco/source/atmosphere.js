import { Color3, Color4, MeshBuilder, ShaderMaterial, Vector3 } from '@babylonjs/core';

const VERTEX = `
precision highp float;
attribute vec3 position;
uniform mat4 worldViewProjection;
varying vec3 vDir;
void main(void) {
  vDir = normalize(position);
  gl_Position = worldViewProjection * vec4(position, 1.0);
}
`;

const FRAGMENT = `
precision highp float;
varying vec3 vDir;
uniform vec3 sunDirection;
uniform float haze;
vec3 mix3(vec3 a, vec3 b, float t) { return a + (b-a)*t; }
void main(void) {
  vec3 d = normalize(vDir);
  float h = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
  float horizon = pow(1.0 - abs(d.y), 3.0);
  vec3 zenith = vec3(0.20, 0.43, 0.70);
  vec3 upper = vec3(0.43, 0.62, 0.79);
  vec3 horizonColor = vec3(0.94, 0.65, 0.39);
  vec3 col = mix3(horizonColor, upper, smoothstep(0.0, 0.38, h));
  col = mix3(col, zenith, smoothstep(0.42, 0.95, h));
  float sunDot = max(dot(d, normalize(-sunDirection)), 0.0);
  float sunHalo = pow(sunDot, 64.0) * 1.25 + pow(sunDot, 640.0) * 3.2;
  col += vec3(1.0, 0.65, 0.30) * sunHalo;
  col = mix3(col, horizonColor, horizon * haze * 0.35);
  gl_FragColor = vec4(col, 1.0);
}
`;

export class DesertAtmosphere {
  constructor(scene, sunDirection) {
    this.scene = scene;
    scene.clearColor = new Color4(0.77, 0.50, 0.30, 1);
    scene.fogMode = 2;
    scene.fogDensity = 0.00185;
    scene.fogColor = new Color3(0.79, 0.55, 0.34);

    const sky = MeshBuilder.CreateSphere('sky', { diameter: 1700, segments: 18 }, scene);
    sky.infiniteDistance = true;
    sky.isPickable = false;
    const material = new ShaderMaterial('desert-atmosphere', scene, {
      vertexSource: VERTEX,
      fragmentSource: FRAGMENT
    }, {
      attributes: ['position'],
      uniforms: ['worldViewProjection', 'sunDirection', 'haze']
    });
    material.backFaceCulling = false;
    material.disableDepthWrite = true;
    material.setVector3('sunDirection', sunDirection);
    material.setFloat('haze', 0.82);
    sky.material = material;
    sky.renderingGroupId = 0;
    this.sky = sky;
    this.material = material;

    const ipc = scene.imageProcessingConfiguration;
    ipc.toneMappingEnabled = true;
    ipc.exposure = 1.05;
    ipc.contrast = 1.08;
  }

  setQuality(preset) {
    this.scene.fogDensity = preset.id === 'low' ? 0.00225 : preset.id === 'medium' ? 0.00195 : 0.0017;
    this.material.setFloat('haze', preset.id === 'low' ? 0.92 : 0.82);
  }

  dispose() {
    this.sky.dispose();
    this.material.dispose();
  }
}
