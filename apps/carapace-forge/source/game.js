import {
  ArcRotateCamera,
  Color3,
  Color4,
  DirectionalLight,
  Engine,
  HemisphericLight,
  MeshBuilder,
  Scene,
  SceneLoader,
  ShadowGenerator,
  StandardMaterial,
  TransformNode,
  Vector3
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { clamp, clampArena, normalizedOrZero } from './core.js';
import { createCrabAudio } from './audio.js';

const canvas = document.querySelector('#renderCanvas');
const scoreValue = document.querySelector('#scoreValue');
const blenderButton = document.querySelector('#blenderMode');
const babylonButton = document.querySelector('#babylonMode');
const modelBadge = document.querySelector('#modelBadge');
const joystick = document.querySelector('#joystick');
const joystickKnob = document.querySelector('#joystickKnob');
const clawButton = document.querySelector('#clawButton');
const finishPanel = document.querySelector('#finishPanel');
const restartButton = document.querySelector('#restartButton');
const hint = document.querySelector('#hint');

if (!(canvas instanceof HTMLCanvasElement)) throw new Error('CARAPACE FORGE canvas missing');

const engine = new Engine(canvas, true, { preserveDrawingBuffer: false, stencil: true, antialias: true });
const scene = new Scene(engine);
scene.clearColor = new Color4(0.48, 0.72, 0.75, 1);
scene.skipPointerMovePicking = true;

const audio = createCrabAudio();
const playerRoot = new TransformNode('PlayerRoot', scene);
playerRoot.position.y = 0.34;

const camera = new ArcRotateCamera('camera', -Math.PI / 2.15, 1.02, 10.5, new Vector3(0, 0.65, 0), scene);
camera.lowerRadiusLimit = 8.4;
camera.upperRadiusLimit = 12;
camera.minZ = 0.05;
camera.fov = 0.78;

const hemi = new HemisphericLight('sky', new Vector3(0.15, 1, -0.2), scene);
hemi.intensity = 0.92;
hemi.diffuse = new Color3(0.98, 0.88, 0.71);
hemi.groundColor = new Color3(0.18, 0.29, 0.29);

const sun = new DirectionalLight('sun', new Vector3(-0.55, -1, 0.45), scene);
sun.position = new Vector3(8, 13, -8);
sun.intensity = 1.55;
sun.diffuse = new Color3(1.0, 0.82, 0.58);

const shadows = new ShadowGenerator(1024, sun);
shadows.useBlurExponentialShadowMap = true;
shadows.blurKernel = 20;

function mat(name, diffuse, rough = 0.8, specular = new Color3(0.06, 0.06, 0.06)) {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = diffuse;
  material.specularColor = specular;
  material.specularPower = Math.max(8, (1 - rough) * 96);
  return material;
}

const sandMat = mat('warm wet sand', new Color3(0.73, 0.57, 0.37), 0.84);
const wetSandMat = mat('wet edge', new Color3(0.38, 0.34, 0.28), 0.62, new Color3(0.16, 0.18, 0.17));
const waterMat = mat('shallow water', new Color3(0.16, 0.51, 0.56), 0.4, new Color3(0.25, 0.48, 0.48));
waterMat.alpha = 0.86;

const water = MeshBuilder.CreateCylinder('water', { diameter: 30, height: 0.13, tessellation: 72 }, scene);
water.position.y = -0.16;
water.material = waterMat;
water.receiveShadows = true;

const island = MeshBuilder.CreateCylinder('island', { diameter: 15.4, height: 0.34, tessellation: 72 }, scene);
island.position.y = 0.01;
island.material = sandMat;
island.receiveShadows = true;

const wetRing = MeshBuilder.CreateTorus('wetRing', { diameter: 14.8, thickness: 0.52, tessellation: 72 }, scene);
wetRing.position.y = 0.20;
wetRing.scaling.y = 0.17;
wetRing.material = wetSandMat;
wetRing.receiveShadows = true;

const rockMat = mat('coastal rock', new Color3(0.31, 0.30, 0.27), 0.92);
for (let i = 0; i < 18; i += 1) {
  const angle = i / 18 * Math.PI * 2;
  const radius = 7.35 + Math.sin(i * 2.27) * 0.22;
  const rock = MeshBuilder.CreateSphere(`rock-${i}`, { diameter: 0.85 + (i % 4) * 0.13, segments: 10 }, scene);
  rock.position.set(Math.cos(angle) * radius, 0.33, Math.sin(angle) * radius);
  rock.scaling.set(1.25, 0.58 + (i % 3) * 0.12, 0.82);
  rock.rotation.y = angle * 1.7;
  rock.material = rockMat;
  rock.receiveShadows = true;
  shadows.addShadowCaster(rock);
}

function buildPrimitiveCrab() {
  const root = new TransformNode('BabylonPrimitiveCrab', scene);
  root.parent = playerRoot;

  const shellMat = mat('primitive orange', new Color3(0.78, 0.18, 0.08), 0.66);
  const darkMat = mat('primitive dark', new Color3(0.22, 0.05, 0.025), 0.75);
  const eyeMat = mat('primitive eyes', new Color3(0.015, 0.012, 0.01), 0.3);

  const body = MeshBuilder.CreateSphere('primitive-body', { diameter: 2, segments: 16 }, scene);
  body.parent = root;
  body.position.y = 0.55;
  body.scaling.set(1.38, 0.42, 0.92);
  body.material = shellMat;

  const eyes = [];
  [-1, 1].forEach((side) => {
    const stalk = MeshBuilder.CreateBox(`primitive-stalk-${side}`, { width: 0.11, height: 0.52, depth: 0.11 }, scene);
    stalk.parent = root;
    stalk.position.set(side * 0.42, 0.91, 0.68);
    stalk.rotation.x = -0.28;
    stalk.rotation.z = -side * 0.12;
    stalk.material = darkMat;
    const eye = MeshBuilder.CreateSphere(`primitive-eye-${side}`, { diameter: 0.24, segments: 10 }, scene);
    eye.parent = root;
    eye.position.set(side * 0.48, 1.17, 0.84);
    eye.material = eyeMat;
    eyes.push(eye);
  });

  const legPivots = [];
  const legZ = [-0.65, -0.22, 0.22, 0.62];
  [-1, 1].forEach((side) => {
    legZ.forEach((z, index) => {
      const pivot = new TransformNode(`primitive-leg-pivot-${side}-${index}`, scene);
      pivot.parent = root;
      pivot.position.set(side * 0.82, 0.43, z);
      const upper = MeshBuilder.CreateBox(`primitive-leg-upper-${side}-${index}`, { width: 0.86, height: 0.14, depth: 0.16 }, scene);
      upper.parent = pivot;
      upper.position.x = side * 0.42;
      upper.rotation.z = side * -0.18;
      upper.material = shellMat;
      const lower = MeshBuilder.CreateBox(`primitive-leg-lower-${side}-${index}`, { width: 0.74, height: 0.11, depth: 0.13 }, scene);
      lower.parent = pivot;
      lower.position.set(side * 1.03, -0.12, 0.05);
      lower.rotation.z = side * 0.33;
      lower.material = darkMat;
      legPivots.push({ pivot, side, index });
    });
  });

  const clawPivots = [];
  [-1, 1].forEach((side) => {
    const pivot = new TransformNode(`primitive-claw-pivot-${side}`, scene);
    pivot.parent = root;
    pivot.position.set(side * 0.72, 0.62, 0.68);
    const arm = MeshBuilder.CreateBox(`primitive-claw-arm-${side}`, { width: 0.74, height: 0.20, depth: 0.22 }, scene);
    arm.parent = pivot;
    arm.position.set(side * 0.34, 0.06, 0.17);
    arm.rotation.y = side * -0.45;
    arm.material = darkMat;
    const palm = MeshBuilder.CreateSphere(`primitive-claw-${side}`, { diameter: 0.58, segments: 12 }, scene);
    palm.parent = pivot;
    palm.position.set(side * 0.73, 0.13, 0.45);
    palm.scaling.set(1.12, 0.74, 0.92);
    palm.material = shellMat;
    const pincerA = MeshBuilder.CreateBox(`primitive-pincer-a-${side}`, { width: 0.52, height: 0.12, depth: 0.15 }, scene);
    pincerA.parent = pivot;
    pincerA.position.set(side * 1.05, 0.23, 0.63);
    pincerA.rotation.y = side * -0.48;
    pincerA.material = shellMat;
    const pincerB = MeshBuilder.CreateBox(`primitive-pincer-b-${side}`, { width: 0.48, height: 0.11, depth: 0.14 }, scene);
    pincerB.parent = pivot;
    pincerB.position.set(side * 1.02, 0.04, 0.55);
    pincerB.rotation.y = side * -0.28;
    pincerB.material = shellMat;
    clawPivots.push({ pivot, side });
  });

  root.getChildMeshes().forEach((mesh) => shadows.addShadowCaster(mesh));

  return {
    root,
    body,
    legPivots,
    clawPivots,
    update(time, moving, attackAmount, victory) {
      const gait = moving ? 7.8 : 2.2;
      const amplitude = moving ? 0.44 : 0.055;
      body.position.y = 0.55 + Math.sin(time * gait * 1.7) * (moving ? 0.035 : 0.012) + (victory ? Math.abs(Math.sin(time * 5)) * 0.18 : 0);
      legPivots.forEach(({ pivot, side, index }) => {
        const phase = time * gait + index * Math.PI + (side > 0 ? Math.PI : 0);
        pivot.rotation.y = Math.sin(phase) * amplitude;
        pivot.rotation.z = side * (-0.06 - Math.max(0, Math.cos(phase)) * (moving ? 0.18 : 0.02));
      });
      clawPivots.forEach(({ pivot, side }) => {
        pivot.rotation.z = side * (-0.10 - attackAmount * 0.55 - (victory ? 0.75 : 0));
        pivot.rotation.x = victory ? -0.55 : -attackAmount * 0.12;
      });
      eyes.forEach((eye, index) => { eye.position.y = 1.17 + Math.sin(time * 2.5 + index) * 0.025; });
    }
  };
}

const primitive = buildPrimitiveCrab();
const blenderRoot = new TransformNode('BlenderCrabWrapper', scene);
blenderRoot.parent = playerRoot;
blenderRoot.setEnabled(false);

let blenderReady = false;
let blenderGroups = [];
let blenderState = '';
let requestedMode = 'blender';

function findAnimation(name) {
  const needle = name.toLowerCase();
  return blenderGroups.find((group) => group.name.toLowerCase().includes(needle));
}

function playBlender(name, loop = true, speed = 1) {
  if (!blenderReady || blenderState === name) return;
  blenderGroups.forEach((group) => group.stop());
  const group = findAnimation(name) || blenderGroups[0];
  if (group) group.start(loop, speed, group.from, group.to, false);
  blenderState = name;
}

function applyMode() {
  const blenderActive = requestedMode === 'blender' && blenderReady;
  blenderRoot.setEnabled(blenderActive);
  primitive.root.setEnabled(!blenderActive);
  blenderButton.classList.toggle('active', blenderActive);
  babylonButton.classList.toggle('active', !blenderActive);
  modelBadge.textContent = blenderActive ? 'BLENDER · ARMATURE · GLB' : blenderReady ? 'BABYLON · RUNTIME PRIMITIVES' : 'BLENDER ASSET LOADING…';
}

blenderButton.disabled = true;
modelBadge.textContent = 'BLENDER ASSET LOADING…';

SceneLoader.ImportMeshAsync('', './models/', 'forge-crab.glb', scene).then((result) => {
  const importedRoots = result.meshes.filter((mesh) => !mesh.parent);
  importedRoots.forEach((mesh) => { mesh.parent = blenderRoot; });
  result.meshes.forEach((mesh) => {
    mesh.receiveShadows = true;
    shadows.addShadowCaster(mesh, true);
  });
  blenderRoot.scaling.setAll(0.78);
  blenderRoot.rotation.y = Math.PI;
  blenderGroups = result.animationGroups || [];
  blenderReady = true;
  blenderButton.disabled = false;
  playBlender('Idle', true, 1);
  applyMode();
}).catch((error) => {
  console.error('CARAPACE FORGE Blender model failed to load', error);
  requestedMode = 'babylon';
  blenderButton.disabled = true;
  modelBadge.textContent = 'BLENDER GLB UNAVAILABLE';
  applyMode();
});

babylonButton.addEventListener('click', () => {
  requestedMode = 'babylon';
  void audio.unlock();
  applyMode();
});
blenderButton.addEventListener('click', () => {
  requestedMode = 'blender';
  void audio.unlock();
  applyMode();
});

const pearlMat = mat('pearl', new Color3(0.92, 0.88, 0.72), 0.22, new Color3(0.8, 0.75, 0.62));
const shellMat = mat('pearl shell', new Color3(0.61, 0.34, 0.22), 0.74);
const pearlPositions = [
  [-4.7, -2.3], [-2.1, 3.6], [1.5, 4.6], [4.8, 1.6], [3.6, -3.8], [-0.6, -4.7]
];
let pearls = [];
let collected = 0;
let finished = false;

function createPearls() {
  pearls.forEach((item) => item.root.dispose());
  pearls = pearlPositions.map(([x, z], index) => {
    const root = new TransformNode(`pearl-root-${index}`, scene);
    root.position.set(x, 0.42, z);
    const shell = MeshBuilder.CreateTorus(`shell-${index}`, { diameter: 0.7, thickness: 0.14, tessellation: 20 }, scene);
    shell.parent = root;
    shell.rotation.x = Math.PI / 2;
    shell.scaling.z = 0.7;
    shell.material = shellMat;
    const pearl = MeshBuilder.CreateSphere(`pearl-${index}`, { diameter: 0.34, segments: 16 }, scene);
    pearl.parent = root;
    pearl.position.y = 0.16;
    pearl.material = pearlMat;
    shadows.addShadowCaster(pearl);
    return { root, taken: false, phase: index * 0.73 };
  });
}
createPearls();

const input = { x: 0, y: 0, pointer: null };
function updateJoystick(event) {
  const rect = joystick.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = event.clientX - cx;
  const dy = event.clientY - cy;
  const max = rect.width * 0.31;
  const length = Math.hypot(dx, dy);
  const scale = length > max ? max / length : 1;
  const px = dx * scale;
  const py = dy * scale;
  input.x = clamp(px / max, -1, 1);
  input.y = clamp(py / max, -1, 1);
  joystickKnob.style.transform = `translate(${px}px, ${py}px)`;
}
function releaseJoystick(pointerId) {
  if (input.pointer !== pointerId) return;
  input.pointer = null;
  input.x = 0;
  input.y = 0;
  joystickKnob.style.transform = 'translate(0px, 0px)';
}
joystick.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  input.pointer = event.pointerId;
  joystick.setPointerCapture(event.pointerId);
  updateJoystick(event);
  void audio.unlock();
});
joystick.addEventListener('pointermove', (event) => {
  if (input.pointer === event.pointerId) updateJoystick(event);
});
joystick.addEventListener('pointerup', (event) => releaseJoystick(event.pointerId));
joystick.addEventListener('pointercancel', (event) => releaseJoystick(event.pointerId));
joystick.addEventListener('lostpointercapture', (event) => releaseJoystick(event.pointerId));

let attackTimer = 0;
clawButton.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  if (finished) return;
  attackTimer = 0.48;
  void audio.unlock();
  audio.pinch();
  if (blenderReady) {
    blenderState = '';
    playBlender('Pinch', false, 1.15);
  }
});

function resetGame() {
  playerRoot.position.set(0, 0.34, 0);
  playerRoot.rotation.y = 0;
  collected = 0;
  finished = false;
  attackTimer = 0;
  scoreValue.textContent = '0';
  finishPanel.hidden = true;
  createPearls();
  blenderState = '';
  playBlender('Idle', true, 1);
}
restartButton.addEventListener('click', resetGame);

setTimeout(() => hint.classList.add('fade'), 4500);

let lastTime = performance.now();
let stepAccumulator = 0;
engine.runRenderLoop(() => {
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  const time = now / 1000;

  const direction = normalizedOrZero(input.x, -input.y);
  const moving = direction.length > 0.08 && !finished;
  if (moving) {
    const speed = 3.2 * Math.min(1, direction.length);
    const next = clampArena(
      playerRoot.position.x + direction.x * speed * dt,
      playerRoot.position.z + direction.y * speed * dt,
      6.55
    );
    playerRoot.position.x = next.x;
    playerRoot.position.z = next.z;
    const targetYaw = Math.atan2(direction.x, direction.y);
    let deltaYaw = targetYaw - playerRoot.rotation.y;
    while (deltaYaw > Math.PI) deltaYaw -= Math.PI * 2;
    while (deltaYaw < -Math.PI) deltaYaw += Math.PI * 2;
    playerRoot.rotation.y += deltaYaw * Math.min(1, dt * 10);
    stepAccumulator += dt * speed;
    if (stepAccumulator > 0.42) {
      stepAccumulator = 0;
      audio.step(Math.min(1, direction.length));
    }
  }

  attackTimer = Math.max(0, attackTimer - dt);
  const attackAmount = attackTimer > 0 ? Math.sin((1 - attackTimer / 0.48) * Math.PI) : 0;
  primitive.update(time, moving, attackAmount, finished);

  if (blenderReady && !finished && attackTimer <= 0) {
    const desired = moving ? 'Scuttle' : 'Idle';
    if (blenderState !== desired) playBlender(desired, true, moving ? 1.15 : 1);
  }

  pearls.forEach((item, index) => {
    if (item.taken) return;
    item.root.position.y = 0.42 + Math.sin(time * 2.2 + item.phase) * 0.055;
    item.root.rotation.y += dt * 0.7;
    const dx = playerRoot.position.x - item.root.position.x;
    const dz = playerRoot.position.z - item.root.position.z;
    if (dx * dx + dz * dz < 0.78 * 0.78) {
      item.taken = true;
      item.root.setEnabled(false);
      collected += 1;
      scoreValue.textContent = String(collected);
      audio.collect(index);
      if (collected === pearls.length) {
        finished = true;
        finishPanel.hidden = false;
        audio.victory();
        blenderState = '';
        playBlender('Celebrate', true, 1);
      }
    }
  });

  const target = new Vector3(playerRoot.position.x * 0.52, 0.7, playerRoot.position.z * 0.52);
  camera.target = Vector3.Lerp(camera.target, target, 1 - Math.pow(0.001, dt));
  camera.alpha = -Math.PI / 2.15 + Math.sin(time * 0.12) * 0.055;
  scene.render();
});

window.addEventListener('resize', () => engine.resize());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    input.x = 0;
    input.y = 0;
    input.pointer = null;
    joystickKnob.style.transform = 'translate(0px, 0px)';
  }
});

applyMode();
