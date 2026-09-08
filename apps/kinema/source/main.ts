import {
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
  Vector3
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import './styles.css';
import { LocomotionMixer } from './animation';
import { FootstepAudio } from './audio';
import { InputController } from './input';
import { MAX_SPEED, exponentialApproach, speedFromMagnitude } from './locomotion';

const VERSION = '1.1.0';
const STORAGE_KEY = 'pocket-works:kinema:settings';
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function element<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id}`);
  return node as T;
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

    loadingBar.style.width = '39%';
    loadingText.textContent = 'Blender / body / clothing / textures';
    const result = await SceneLoader.ImportMeshAsync('', './models/', 'kinema-character.glb', scene);
    if (!result.meshes.length) throw new Error('Blender GLB загрузился без геометрии.');
    for (const mesh of result.meshes) {
      if (!mesh.parent) mesh.parent = leanRoot;
      if (mesh.getTotalVertices() > 0) shadows.addShadowCaster(mesh, false);
    }

    loadingBar.style.width = '78%';
    loadingText.textContent = 'Armature / animation actions';
    if (!result.animationGroups.length) throw new Error('Blender GLB не содержит animation actions.');
    const mixer = new LocomotionMixer(result.animationGroups);

    loadingBar.style.width = '100%';
    loadingText.textContent = `${result.animationGroups.length} clips / ready`;
    await new Promise((resolve) => setTimeout(resolve, 150));
    loading.classList.add('hidden');

    let speed = 0;
    let direction = new Vector3(0, 0, -1);
    let retainedDirection = direction.clone();
    let stepTravel = 0;
    let stepSide = -1;
    let last = performance.now();
    let hidden = document.hidden;

    const updateCamera = (dt: number) => {
      const running = clamp(speed / MAX_SPEED, 0, 1);
      const target = characterRoot.position.add(new Vector3(0, 1.22 + running * 0.035, 0));
      const radius = 4.18 + running * 0.66;
      const cp = Math.cos(input.cameraPitch);
      const desired = new Vector3(
        target.x + Math.sin(input.cameraYaw) * cp * radius,
        target.y + Math.sin(input.cameraPitch) * radius,
        target.z + Math.cos(input.cameraYaw) * cp * radius
      );
      camera.position = Vector3.Lerp(camera.position, desired, 1 - Math.exp(-11 * dt));
      camera.setTarget(Vector3.Lerp(camera.getTarget(), target, 1 - Math.exp(-14 * dt)));
      camera.fov = exponentialApproach(camera.fov, 0.64 + running * 0.045, 6.2, dt);
    };

    const update = (dt: number) => {
      const move = input.sample(dt);
      const targetSpeed = speedFromMagnitude(move.magnitude);
      const previousSpeed = speed;
      speed = exponentialApproach(speed, targetSpeed, targetSpeed > speed ? 6.6 : 8.8, dt);
      if (targetSpeed === 0 && speed < 0.035) speed = 0;

      const forward = new Vector3(-Math.sin(input.cameraYaw), 0, -Math.cos(input.cameraYaw));
      const right = new Vector3(Math.cos(input.cameraYaw), 0, -Math.sin(input.cameraYaw));
      const wanted = forward.scale(move.y).add(right.scale(move.x));
      if (wanted.lengthSquared() > 0.0001) {
        wanted.normalize();
        direction = Vector3.Lerp(direction, wanted, 1 - Math.exp(-(speed > 3.5 ? 9.5 : 13) * dt)).normalize();
        retainedDirection = direction.clone();
        const yaw = Math.atan2(-direction.x, -direction.z);
        characterRoot.rotationQuaternion = Quaternion.Slerp(
          characterRoot.rotationQuaternion || Quaternion.Identity(),
          Quaternion.FromEulerAngles(0, yaw, 0),
          1 - Math.exp(-(7.2 + speed * 0.7) * dt)
        );
      } else {
        direction = retainedDirection.clone();
      }
      if (speed > 0.001) characterRoot.position.addInPlace(direction.scale(speed * dt));

      const acceleration = dt > 0 ? (speed - previousSpeed) / dt : 0;
      const running = clamp(speed / MAX_SPEED, 0, 1);
      const pitch = clamp(-0.01 - acceleration * 0.0045 - running * 0.028, -0.085, 0.045);
      const roll = clamp(-move.x * running * 0.055, -0.065, 0.065);
      leanRoot.rotationQuaternion = Quaternion.Slerp(
        leanRoot.rotationQuaternion || Quaternion.Identity(),
        Quaternion.FromEulerAngles(pitch, 0, roll),
        1 - Math.exp(-7 * dt)
      );

      const gait = mixer.update(speed);
      gaitLabel.textContent = gait.toUpperCase();
      speedLabel.textContent = `${speed.toFixed(1)} m/s`;
      speedBar.style.width = `${(speed / MAX_SPEED * 100).toFixed(1)}%`;

      if (speed > 0.45) {
        stepTravel += speed * dt;
        const spacing = 0.54 + running * 0.25;
        if (stepTravel >= spacing) {
          stepTravel %= spacing;
          stepSide *= -1;
          audio.step(running, stepSide);
        }
      } else stepTravel = 0;
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
    console.error('[KINEMA] boot failed', error);
    loading.classList.add('hidden');
    errorText.textContent = error instanceof Error ? error.message : 'Неизвестная ошибка 3D-сцены.';
    errorScreen.classList.remove('hidden');
  }
}

void registerWorker();
void start();
console.info(`[KINEMA] ${VERSION}`);
