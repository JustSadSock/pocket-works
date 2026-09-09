import {
  AbstractMesh,
  Color3,
  Color4,
  DirectionalLight,
  Engine,
  HemisphericLight,
  ImageProcessingConfiguration,
  MeshBuilder,
  PBRMaterial,
  Quaternion,
  Scene,
  SceneLoader,
  ShadowGenerator,
  TransformNode,
  UniversalCamera,
  Vector3,
  VertexBuffer
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import './styles.css';
import { LocomotionMixer } from './animation';
import { FootstepAudio } from './audio';
import { InputController } from './input';
import {
  MAX_SPEED,
  exponentialApproach,
  localMotionComponents,
  moveAngleTowards,
  shortestAngleDelta,
  speedFromMagnitude
} from './locomotion';

const VERSION = '1.7.0';
const STORAGE_KEY = 'pocket-works:kinema:settings';
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
type GaitName = 'idle' | 'walk' | 'jog' | 'run';
type QaState = {
  version: string;
  loadingState: 'booting' | 'loading-model' | 'warming' | 'ready' | 'error';
  playerPosition: { x: number; y: number; z: number };
  speed: number;
  peakSpeed: number;
  gait: GaitName;
  peakGait: GaitName;
  motionMode: string;
  peakDirectionalBlend: number;
  travelDistance: number;
  grounded: boolean;
  animationClips: number;
  directionalClips: number;
  noUvMaterialFallbacks: number;
  materialsReady: boolean;
};

declare global {
  interface Window {
    __AI_TEST_STATE__?: QaState;
  }
}

const FALLBACK_MATERIAL_COLORS: Array<[string, Color3]> = [
  ['olive_canvas', new Color3(0.205, 0.285, 0.235)],
  ['canvas_seams', new Color3(0.125, 0.165, 0.142)],
  ['charcoal_twill', new Color3(0.075, 0.082, 0.080)],
  ['trouser_seams', new Color3(0.055, 0.060, 0.059)],
  ['skin', new Color3(0.60, 0.39, 0.275)],
  ['hair', new Color3(0.036, 0.030, 0.027)],
  ['boot_leather', new Color3(0.073, 0.045, 0.033)]
];

function element<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id}`);
  return node as T;
}

function fallbackColorForMaterial(name: string): Color3 | null {
  const key = name.toLowerCase();
  return FALLBACK_MATERIAL_COLORS.find(([token]) => key.includes(token))?.[1]?.clone() || null;
}

function stabilizeNoUvMaterials(meshes: AbstractMesh[]): number {
  let patched = 0;
  for (const mesh of meshes) {
    if (mesh.getTotalVertices() <= 0 || mesh.isVerticesDataPresent(VertexBuffer.UVKind)) continue;
    const source = mesh.material;
    if (!(source instanceof PBRMaterial) || !source.albedoTexture) continue;
    const material = source.clone(`${source.name}-no-uv-${mesh.uniqueId}`);
    material.albedoTexture = null;
    const color = fallbackColorForMaterial(source.name);
    if (color) material.albedoColor = color;
    mesh.material = material;
    patched += 1;
  }
  return patched;
}

async function warmScene(scene: Scene): Promise<void> {
  await scene.whenReadyAsync();
  scene.render();
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  scene.render();
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function loadSoundSetting(): boolean {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}').sound !== false; }
  catch { return true; }
}

function saveSoundSetting(sound: boolean): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ sound })); } catch { /* optional */ }
}

async function registerWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  try { await navigator.serviceWorker.register('./sw.js', { scope: './' }); } catch { /* first online load still works */ }
}

async function start(): Promise<void> {
  const qa: QaState = {
    version: VERSION,
    loadingState: 'booting',
    playerPosition: { x: 0, y: 0.015, z: 0 },
    speed: 0,
    peakSpeed: 0,
    gait: 'idle',
    peakGait: 'idle',
    motionMode: 'idle',
    peakDirectionalBlend: 0,
    travelDistance: 0,
    grounded: true,
    animationClips: 0,
    directionalClips: 0,
    noUvMaterialFallbacks: 0,
    materialsReady: false
  };
  window.__AI_TEST_STATE__ = qa;

  const canvas = element<HTMLCanvasElement>('renderCanvas');
  const loading = element<HTMLElement>('loading');
  const loadingBar = element<HTMLElement>('loadingBar');
  const loadingText = element<HTMLElement>('loadingText');
  const errorScreen = element<HTMLElement>('errorScreen');
  const errorText = element<HTMLElement>('errorText');
  const retry = element<HTMLButtonElement>('retryButton');
  const hint = element<HTMLElement>('hint');
  const gaitLabel = element<HTMLElement>('gaitLabel');
  const speedLabel = element<HTMLElement>('speedLabel');
  const speedBar = element<HTMLElement>('speedBar');
  const soundButton = element<HTMLButtonElement>('soundButton');

  retry.addEventListener('click', () => location.reload());
  if (!Engine.isSupported()) {
    qa.loadingState = 'error';
    loading.classList.add('hidden');
    errorText.textContent = 'WebGL недоступен. KINEMA требует аппаратный 3D-рендеринг.';
    errorScreen.classList.remove('hidden');
    return;
  }

  const input = new InputController(
    element('joystick'),
    element('joystickKnob'),
    element('lookZone')
  );
  let soundEnabled = loadSoundSetting();
  const audio = new FootstepAudio(soundEnabled);
  const syncSoundButton = () => {
    soundButton.textContent = `SOUND / ${soundEnabled ? 'ON' : 'OFF'}`;
    soundButton.setAttribute('aria-label', soundEnabled ? 'Выключить звук' : 'Включить звук');
  };
  syncSoundButton();
  soundButton.addEventListener('click', async () => {
    soundEnabled = !soundEnabled;
    saveSoundSetting(soundEnabled);
    audio.setEnabled(soundEnabled);
    syncSoundButton();
    if (soundEnabled) await audio.unlock();
  });
  input.onInteract = () => {
    hint.classList.add('dismissed');
    void audio.unlock();
  };

  try {
    loadingBar.style.width = '16%';
    loadingText.textContent = 'Babylon.js / camera / light';
    const engine = new Engine(canvas, true, {
      preserveDrawingBuffer: false,
      stencil: true,
      powerPreference: 'high-performance'
    }, false);
    const deviceRatio = window.devicePixelRatio || 1;
    const targetRatio = Math.min(deviceRatio, 1.6);
    engine.setHardwareScalingLevel(Math.max(1, deviceRatio / targetRatio));

    const scene = new Scene(engine);
    scene.clearColor = Color4.FromHexString('#d5d0c7ff');
    scene.fogMode = Scene.FOGMODE_EXP2;
    scene.fogDensity = 0.0072;
    scene.fogColor = Color3.FromHexString('#d5d0c7');
    const image = scene.imageProcessingConfiguration;
    image.toneMappingEnabled = true;
    image.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
    image.exposure = 1.02;
    image.contrast = 1.12;

    const camera = new UniversalCamera('third-person', new Vector3(0, 2.22, 4.25), scene);
    camera.minZ = 0.05;
    camera.maxZ = 150;
    camera.fov = 0.64;
    camera.setTarget(new Vector3(0, 1.22, 0));
    scene.activeCamera = camera;

    const fill = new HemisphericLight('soft-fill', new Vector3(0.15, 1, 0.18), scene);
    fill.intensity = 0.72;
    fill.diffuse = Color3.FromHexString('#f0e6d9');
    fill.groundColor = Color3.FromHexString('#59645e');

    const sun = new DirectionalLight('key-light', new Vector3(-0.46, -1, -0.35), scene);
    sun.position = new Vector3(7.5, 11.5, 7.2);
    sun.intensity = 2.45;
    sun.diffuse = Color3.FromHexString('#fff0dd');

    const floor = MeshBuilder.CreateGround('studio-floor', { width: 180, height: 180 }, scene);
    const floorMat = new PBRMaterial('studio-floor-mat', scene);
    floorMat.albedoColor = Color3.FromHexString('#c3bdb3');
    floorMat.roughness = 0.96;
    floorMat.metallic = 0;
    floor.material = floorMat;
    floor.receiveShadows = true;

    const shadows = new ShadowGenerator(innerWidth >= 900 ? 2048 : 1024, sun);
    shadows.usePercentageCloserFiltering = true;
    shadows.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
    shadows.bias = 0.00032;
    shadows.normalBias = 0.015;

    const characterRoot = new TransformNode('character-root', scene);
    characterRoot.position.set(0, 0.015, 0);
    characterRoot.rotationQuaternion = Quaternion.Identity();
    const leanRoot = new TransformNode('character-lean', scene);
    leanRoot.parent = characterRoot;
    leanRoot.rotationQuaternion = Quaternion.Identity();
    const modelRoot = new TransformNode('blender-forward-correction', scene);
    modelRoot.parent = leanRoot;
    modelRoot.rotationQuaternion = Quaternion.FromEulerAngles(0, Math.PI, 0);

    qa.loadingState = 'loading-model';
    loadingBar.style.width = '39%';
    loadingText.textContent = 'Blender / body / clothing / textures';
    const result = await SceneLoader.ImportMeshAsync('', './models/', 'kinema-character.glb', scene);
    if (!result.meshes.length) throw new Error('Blender GLB загрузился без геометрии.');
    qa.noUvMaterialFallbacks = stabilizeNoUvMaterials(result.meshes);
    qa.materialsReady = true;
    for (const mesh of result.meshes) {
      if (!mesh.parent) mesh.parent = modelRoot;
      if (mesh.getTotalVertices() > 0) shadows.addShadowCaster(mesh, false);
    }

    loadingBar.style.width = '78%';
    loadingText.textContent = 'Armature / nine motion actions';
    if (!result.animationGroups.length) throw new Error('Blender GLB не содержит animation actions.');
    qa.animationClips = result.animationGroups.length;
    const mixer = new LocomotionMixer(result.animationGroups);
    qa.directionalClips = mixer.directionalClipCount;

    qa.loadingState = 'warming';
    loadingBar.style.width = '94%';
    loadingText.textContent = 'Safari / shaders / first frame';
    await warmScene(scene);
    loadingBar.style.width = '100%';
    loadingText.textContent = `${result.animationGroups.length} clips / ready`;
    loading.classList.add('hidden');
    qa.loadingState = 'ready';

    let speed = 0;
    let velocity = Vector3.Zero();
    let retainedDirection = new Vector3(0, 0, -1);
    let facingYaw = 0;
    let turnRate = 0;
    let stepTravel = 0;
    let stepSide = -1;
    let last = performance.now();
    let hidden = document.hidden;
    const gaitRank: Record<GaitName, number> = { idle: 0, walk: 1, jog: 2, run: 3 };

    const updateCamera = (dt: number) => {
      const running = clamp(speed / MAX_SPEED, 0, 1);
      const motionDirection = speed > 0.05 ? velocity.scale(1 / speed) : retainedDirection;
      const lead = motionDirection.scale(0.10 + running * 0.24);
      const target = characterRoot.position
        .add(new Vector3(0, 1.22 + running * 0.035, 0))
        .add(lead);
      const radius = 4.18 + running * 0.66;
      const cp = Math.cos(input.cameraPitch);
      const desired = new Vector3(
        target.x + Math.sin(input.cameraYaw) * cp * radius,
        target.y + Math.sin(input.cameraPitch) * radius,
        target.z + Math.cos(input.cameraYaw) * cp * radius
      );
      camera.position = Vector3.Lerp(camera.position, desired, 1 - Math.exp(-10.5 * dt));
      camera.setTarget(Vector3.Lerp(camera.getTarget(), target, 1 - Math.exp(-13 * dt)));
      camera.fov = exponentialApproach(camera.fov, 0.64 + running * 0.045, 6.2, dt);
    };

    const update = (dt: number) => {
      const move = input.sample(dt);
      const targetSpeed = speedFromMagnitude(move.magnitude);
      const previousSpeed = speed;
      const previousVelocity = velocity.clone();

      const cameraForward = new Vector3(-Math.sin(input.cameraYaw), 0, -Math.cos(input.cameraYaw));
      const cameraRight = new Vector3(Math.cos(input.cameraYaw), 0, -Math.sin(input.cameraYaw));
      const wanted = cameraForward.scale(move.y).add(cameraRight.scale(move.x));
      const hasIntent = wanted.lengthSquared() > 0.0001;
      if (hasIntent) wanted.normalize();

      const desiredVelocity = hasIntent ? wanted.scale(targetSpeed) : Vector3.Zero();
      const reversal = speed > 0.2 && hasIntent ? Math.max(0, -Vector3.Dot(retainedDirection, wanted)) : 0;
      const velocitySharpness = targetSpeed > speed ? 5.5 + reversal * 1.2 : targetSpeed === 0 ? 9.5 : 7.2;
      velocity = Vector3.Lerp(velocity, desiredVelocity, 1 - Math.exp(-velocitySharpness * dt));
      speed = velocity.length();
      if (targetSpeed === 0 && speed < 0.035) {
        velocity = Vector3.Zero();
        speed = 0;
      }
      if (speed > 0.03) retainedDirection = velocity.scale(1 / speed);

      const desiredFacingYaw = hasIntent ? Math.atan2(-wanted.x, -wanted.z) : facingYaw;
      const turnError = shortestAngleDelta(facingYaw, desiredFacingYaw);
      const previousFacingYaw = facingYaw;
      const turnRateLimit = 5.0 - clamp(speed / MAX_SPEED, 0, 1) * 1.45;
      facingYaw = moveAngleTowards(facingYaw, desiredFacingYaw, turnRateLimit * dt);
      turnRate = dt > 0.0001 ? shortestAngleDelta(previousFacingYaw, facingYaw) / dt : 0;
      characterRoot.rotationQuaternion = Quaternion.FromEulerAngles(0, facingYaw, 0);

      if (speed > 0.001) {
        const displacement = velocity.scale(dt);
        characterRoot.position.addInPlace(displacement);
        qa.travelDistance += displacement.length();
      }

      const local = localMotionComponents(velocity.x, velocity.z, facingYaw);
      const acceleration = dt > 0.0001 ? velocity.subtract(previousVelocity).scale(1 / dt) : Vector3.Zero();
      const facingForward = new Vector3(-Math.sin(facingYaw), 0, -Math.cos(facingYaw));
      const facingRight = new Vector3(Math.cos(facingYaw), 0, -Math.sin(facingYaw));
      const forwardAcceleration = Vector3.Dot(acceleration, facingForward);
      const sideAcceleration = Vector3.Dot(acceleration, facingRight);
      const running = clamp(speed / MAX_SPEED, 0, 1);
      const pitch = clamp(-0.008 - forwardAcceleration * 0.006 - running * 0.022, -0.09, 0.05);
      const roll = clamp(
        -sideAcceleration * 0.005 - local.right * running * 0.035 - turnRate * running * 0.012,
        -0.078,
        0.078
      );
      leanRoot.rotationQuaternion = Quaternion.Slerp(
        leanRoot.rotationQuaternion || Quaternion.Identity(),
        Quaternion.FromEulerAngles(pitch, 0, roll),
        1 - Math.exp(-7.5 * dt)
      );

      const motion = mixer.update(speed, {
        localForward: local.forward,
        localRight: local.right,
        turnError
      });
      const motionLabel = motion.mode === 'strafe'
        ? `STRAFE ${local.right < 0 ? 'L' : 'R'}`
        : motion.mode === 'pivot'
          ? `PIVOT ${turnError < 0 ? 'L' : 'R'}`
          : motion.mode.toUpperCase();
      gaitLabel.textContent = motionLabel;
      speedLabel.textContent = `${speed.toFixed(1)} m/s`;
      speedBar.style.width = `${(speed / MAX_SPEED * 100).toFixed(1)}%`;
      qa.speed = speed;
      qa.peakSpeed = Math.max(qa.peakSpeed, speed);
      qa.gait = motion.gait;
      qa.motionMode = motion.mode;
      qa.peakDirectionalBlend = Math.max(qa.peakDirectionalBlend, motion.directionalWeight);
      if (gaitRank[motion.gait] > gaitRank[qa.peakGait]) qa.peakGait = motion.gait;
      qa.playerPosition = {
        x: characterRoot.position.x,
        y: characterRoot.position.y,
        z: characterRoot.position.z
      };

      if (speed > 0.45) {
        stepTravel += speed * dt;
        const spacing = 0.52 + running * 0.27;
        if (stepTravel >= spacing) {
          stepTravel %= spacing;
          stepSide *= -1;
          audio.step(running, stepSide);
        }
      } else stepTravel = 0;

      if (previousSpeed > 0.2 && speed === 0) turnRate = 0;
      updateCamera(dt);
    };

    document.addEventListener('visibilitychange', () => {
      hidden = document.hidden;
      if (!hidden) last = performance.now();
    });
    window.addEventListener('resize', () => engine.resize());
    engine.runRenderLoop(() => {
      if (hidden) return;
      const now = performance.now();
      const dt = clamp((now - last) / 1000, 0, 0.05);
      last = now;
      update(dt);
      scene.render();
    });
    updateCamera(1 / 60);
  } catch (error) {
    qa.loadingState = 'error';
    console.error('[KINEMA] boot failed', error);
    loading.classList.add('hidden');
    errorText.textContent = error instanceof Error ? error.message : 'Неизвестная ошибка 3D-сцены.';
    errorScreen.classList.remove('hidden');
  }
}

void registerWorker();
void start();
console.info(`[KINEMA] ${VERSION}`);
