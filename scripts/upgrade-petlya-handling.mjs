import { readFile, writeFile } from 'node:fs/promises';

const mainPath = 'apps/petlya-17/source/main.ts';
let source = await readFile(mainPath, 'utf8');

function exact(before, after) {
  if (!source.includes(before)) throw new Error(`Missing exact fragment:\n${before.slice(0, 220)}`);
  source = source.replace(before, after);
}

function regex(pattern, after, label) {
  if (!pattern.test(source)) throw new Error(`Missing regex fragment: ${label}`);
  source = source.replace(pattern, after);
}

exact(
  "import { Texture } from '@babylonjs/core/Materials/Textures/texture';",
  "import { Texture } from '@babylonjs/core/Materials/Textures/texture';\nimport { RenderTargetTexture } from '@babylonjs/core/Materials/Textures/renderTargetTexture';"
);
exact(
  "import { catmullRomClosed, clamp, lerp, signedWrappedDelta, speedFeel, wrap, type Vec3Tuple } from './core';",
  "import { catmullRomClosed, clamp, lerp, signedWrappedDelta, speedFeel, wrap, type Vec3Tuple } from './core';\nimport { cornerSpeedKmh, createVehicleDynamics, racingLineTarget, resolveVehicleContact, stepVehicle, type VehicleDynamics } from './handling';"
);

regex(
  /const VERSION = '3\.0\.0';[\s\S]*?\n\s*]\n\s*}\);/,
  `const VERSION = '3.1.0';
const APP_NAME = 'ПЕТЛЯ 17';
const NS = 'pocket-works:petlya-17';
const LAPS = 3;
const MAX_SPEED = 322;
const ROAD_HALF = 5.9;
const PATH_SEGMENTS = 900;
const UP = Vector3.Up();

installMobileRuntime();
registerEnhancedUpdate({
  appName: APP_NAME,
  version: VERSION,
  releaseNotes: [
    'Добавлена единая simcade-модель машины с запасом сцепления, углом скольжения, рысканием, переносом нагрузки и прогрессивным срывом шин.',
    'Боты теперь анализируют реальную кривизну трассы, тормозят до поворота, занимают внешнюю линию перед входом и атакуют апекс.',
    'Столкновения обмениваются продольным и боковым импульсом вместо простого умножения скорости и ощущаются через кузов, камеру, звук и вибрацию.',
    'Кокпит реагирует на боковую перегрузку, скольжение, разгон и торможение, а состояние сцепления передаётся без отдельной аркадной шкалы.',
    'Оба зеркала получили настоящее низкоразрешённое изображение с задней камеры, обновляемое через кадр для сохранения производительности.'
  ]
});`,
  'version and release notes'
);

regex(
  /const player = \{[\s\S]*?\n\};\n\nconst controlPoints/,
  `const player = {
  totalDistance: 0,
  lane: 0,
  lap: 1,
  drafting: 0,
  ...createVehicleDynamics()
};

const controlPoints`,
  'player state'
);

exact(
  `function yawFromTangent(tangent: Vector3): number {
  return Math.atan2(tangent.x, tangent.z);
}`,
  `function yawFromTangent(tangent: Vector3): number {
  return Math.atan2(tangent.x, tangent.z);
}

function trackCurvature(distance: number, lookAhead = 18): number {
  const current = sampleTrack(distance);
  const ahead = sampleTrack(distance + lookAhead);
  const cross = Vector3.Cross(current.tangent, ahead.tangent).y;
  const dot = clamp(Vector3.Dot(current.tangent, ahead.tangent), -1, 1);
  return Math.atan2(cross, dot) / Math.max(1, lookAhead);
}`
);

exact(
  `  update(speed: number, active: boolean, offroad: number, drafting: number): void {`,
  `  update(speed: number, active: boolean, offroad: number, drafting: number, slipAngle = 0): void {`
);
exact(
  `    this.tyreGain.gain.setTargetAtTime(active && settings.sound ? 0.012 + feel * 0.025 + offroad * 0.08 : 0.0001, now, 0.08);`,
  `    const slipNoise = clamp(Math.abs(slipAngle) * 0.72, 0, 0.16);\n    this.tyreGain.gain.setTargetAtTime(active && settings.sound ? 0.012 + feel * 0.025 + offroad * 0.08 + slipNoise : 0.0001, now, 0.055);`
);

exact(
  `const camera = new UniversalCamera('cockpit-camera', new Vector3(0, 2, 0), scene);
camera.inputs.clear();
camera.minZ = 0.04;
camera.maxZ = 900;
camera.fov = 1.02;
scene.activeCamera = camera;`,
  `const camera = new UniversalCamera('cockpit-camera', new Vector3(0, 2, 0), scene);
camera.inputs.clear();
camera.minZ = 0.04;
camera.maxZ = 900;
camera.fov = 1.02;
camera.layerMask = 0x3;
scene.activeCamera = camera;

const rearCamera = new UniversalCamera('rear-camera', new Vector3(0, 2, 0), scene);
rearCamera.inputs.clear();
rearCamera.minZ = 0.08;
rearCamera.maxZ = 320;
rearCamera.fov = 1.08;
rearCamera.layerMask = 0x1;
const mirrorTexture = new RenderTargetTexture('rear-view', { width: 320, height: 96 }, scene, false);
mirrorTexture.activeCamera = rearCamera;
mirrorTexture.refreshRate = 2;
mirrorTexture.renderParticles = false;
mirrorTexture.uScale = -1;
mirrorTexture.uOffset = 1;
scene.customRenderTargets.push(mirrorTexture);`
);

exact(
  `const mirrorMaterial = material('mirror-glass', new Color3(0.12, 0.23, 0.24), 0.7);
mirrorMaterial.emissiveColor = new Color3(0.025, 0.055, 0.055);`,
  `const mirrorMaterial = material('mirror-glass', new Color3(0.12, 0.23, 0.24), 0.7);
mirrorMaterial.diffuseTexture = mirrorTexture;
mirrorMaterial.emissiveTexture = mirrorTexture;
mirrorMaterial.emissiveColor = new Color3(0.72, 0.78, 0.75);
mirrorMaterial.disableLighting = true;`
);

exact(
  `  mesh.material = mat;
  mesh.alwaysSelectAsActiveMesh = true;`,
  `  mesh.material = mat;
  mesh.layerMask = 0x2;
  mesh.alwaysSelectAsActiveMesh = true;`
);
exact(
  `  wheel.material = cockpitMaterial;`,
  `  wheel.material = cockpitMaterial;
  wheel.layerMask = 0x2;`
);
exact(
  `    streak.material = streakMaterial;
    streak.isPickable = false;`,
  `    streak.material = streakMaterial;
    streak.layerMask = 0x2;
    streak.isPickable = false;`
);

regex(
  /type Bot = \{[\s\S]*?\n\};\n\nconst botTemplates/,
  `type Bot = VehicleDynamics & {
  name: string;
  color: Color3;
  stripe: Color3;
  pace: number;
  aggression: number;
  totalDistance: number;
  lane: number;
  targetLane: number;
  decisionAt: number;
  phase: number;
  root: TransformNode;
};

const botTemplates`,
  'bot type'
);

regex(
  /function makeBots\(\): Bot\[] \{[\s\S]*?\n\}\n\nfunction disposeBots/,
  `function makeBots(): Bot[] {
  const gaps = [42, 72, 108, 148, 194];
  return botTemplates.map((template, index) => ({
    ...template,
    ...createVehicleDynamics(),
    totalDistance: gaps[index],
    targetLane: template.lane,
    decisionAt: 1 + index * 0.25,
    phase: Math.random() * Math.PI * 2,
    root: createCar(template, index)
  }));
}

function disposeBots`,
  'make bots'
);

exact(
  `function updateBotTransform(bot: Bot): void {
  const sample = sampleTrack(bot.totalDistance);
  bot.root.position.copyFrom(sample.position.add(sample.right.scale(bot.lane)));
  bot.root.position.y += 0.18;
  bot.root.rotationQuaternion = Quaternion.FromEulerAngles(0, yawFromTangent(sample.tangent), clamp((bot.targetLane - bot.lane) * -0.018, -0.05, 0.05));
}`,
  `function updateBotTransform(bot: Bot): void {
  const sample = sampleTrack(bot.totalDistance);
  bot.root.position.copyFrom(sample.position.add(sample.right.scale(bot.lane)));
  bot.root.position.y += 0.18 + Math.sin(bot.totalDistance * 1.8 + bot.phase) * Math.min(0.018, bot.speed / 16000);
  bot.root.rotationQuaternion = Quaternion.FromEulerAngles(
    bot.bodyPitch * 0.38,
    yawFromTangent(sample.tangent) + bot.yawOffset,
    bot.bodyRoll
  );
}`
);

exact(
  `  Object.assign(player, { totalDistance: 0, speed: 0, lane: 0, laneVelocity: 0, lap: 1, acceleration: 0, drafting: 0 });`,
  `  Object.assign(player, { totalDistance: 0, lane: 0, lap: 1, drafting: 0, ...createVehicleDynamics() });`
);

regex(
  /function updateBots\(delta: number\): void \{[\s\S]*?\n\}\n\nfunction collide/,
  `function updateBots(delta: number): void {
  for (const bot of bots) {
    const curvatureNow = trackCurvature(bot.totalDistance, 16);
    const curvatureNear = trackCurvature(bot.totalDistance + 26, 18);
    const curvatureFar = trackCurvature(bot.totalDistance + 58, 24);
    const cornerCurvature = [curvatureNow, curvatureNear, curvatureFar]
      .sort((a, b) => Math.abs(b) - Math.abs(a))[0];
    const maximum = 302 + bot.pace * 8;
    const targetSpeed = Math.min(
      maximum,
      cornerSpeedKmh(cornerCurvature, 0.9 + bot.pace * 0.08, 0.94 + bot.aggression * 0.06, maximum)
    );

    if (raceTimeMs / 1000 > bot.decisionAt) {
      const line = racingLineTarget(curvatureNow, curvatureFar, ROAD_HALF - 1.25, bot.aggression);
      let avoidance = 0;
      let overtake = 0;
      const traffic = [
        ...bots.filter((other) => other !== bot).map((other) => ({ distance: other.totalDistance, lane: other.lane, speed: other.speed })),
        { distance: player.totalDistance, lane: player.lane, speed: player.speed }
      ];
      for (const other of traffic) {
        const longitudinal = other.distance - bot.totalDistance;
        if (longitudinal < -4 || longitudinal > 24) continue;
        const lateral = bot.lane - other.lane;
        const pressure = 1 - clamp(Math.abs(longitudinal) / 24, 0, 1);
        avoidance += Math.sign(lateral || Math.sin(bot.phase)) * pressure * 1.15;
        if (longitudinal > 2 && other.speed < bot.speed - 4) {
          const openLeft = Math.abs(other.lane + 2.4) < ROAD_HALF - 1;
          overtake += (openLeft ? -1 : 1) * (0.9 + bot.aggression * 0.8);
        }
      }
      bot.targetLane = clamp(line + avoidance + overtake, -ROAD_HALF + 1.05, ROAD_HALF - 1.05);
      bot.decisionAt = raceTimeMs / 1000 + 0.42 + Math.random() * 0.72;
    }

    const aiSteer = clamp((bot.targetLane - bot.lane) * 0.34 - bot.lateralSpeed * 0.11 - bot.yawOffset * 0.6, -1, 1);
    const speedError = targetSpeed - bot.speed;
    const aiThrottle = speedError > 3 ? 1 : speedError > -1 ? 0.35 : 0;
    const aiBrake = speedError < -4 ? clamp(-speedError / 48, 0, 1) : 0;
    const offroad = clamp((Math.abs(bot.lane) - ROAD_HALF + 0.75) / 1.1, 0, 1);
    const step = stepVehicle(bot, {
      steer: aiSteer,
      throttle: aiThrottle,
      brake: aiBrake,
      curvature: curvatureNow,
      offroad,
      drafting: 0,
      maxSpeed: maximum,
      gripScale: 0.96 + bot.pace * 0.04
    }, delta);
    Object.assign(bot, step);
    bot.lane += step.laneDelta;
    bot.lane = clamp(bot.lane, -ROAD_HALF - 0.45, ROAD_HALF + 0.45);
    bot.totalDistance += step.longitudinalMeters;
    updateBotTransform(bot);
  }
}

function collide`,
  'bot behaviour'
);

regex(
  /function collide\(\): void \{[\s\S]*?\n\}\n\nfunction finish/,
  `function collide(): void {
  if (collisionCooldown > 0) return;
  for (const bot of bots) {
    const longitudinal = bot.totalDistance - player.totalDistance;
    const lateralOffset = bot.lane - player.lane;
    const lateral = Math.abs(lateralOffset);
    if (longitudinal > -2.9 && longitudinal < 5.2 && lateral < 1.45) {
      const overlap = 1 - lateral / 1.45;
      const response = resolveVehicleContact(player.speed, bot.speed, lateralOffset, overlap);
      collisionCooldown = lerp(0.28, 0.62, response.severity);
      player.speed = clamp(player.speed + response.playerSpeedDelta, 0, MAX_SPEED + 18);
      bot.speed = clamp(bot.speed + response.opponentSpeedDelta, 0, MAX_SPEED + 10);
      player.lateralSpeed += response.playerLateralImpulse;
      bot.lateralSpeed += response.opponentLateralImpulse;
      player.yawOffset = clamp(player.yawOffset + response.yawImpulse, -0.62, 0.62);
      bot.yawOffset = clamp(bot.yawOffset - response.yawImpulse * 0.72, -0.48, 0.48);
      player.lane += response.playerLateralImpulse * 0.045;
      bot.lane += response.opponentLateralImpulse * 0.035;
      cameraImpact = Math.max(cameraImpact, response.severity);
      audio.impact(response.severity);
      haptic(response.severity > 0.65 ? [30, 18, 44] : [16, 12, 22]);
      say(response.severity > 0.7 ? 'ЖЁСТКИЙ КОНТАКТ' : 'КОНТАКТ', 540);
      break;
    }
  }
}

function finish`,
  'contacts'
);

regex(
  /  player\.drafting = draftStrength\(\);[\s\S]*?\n\s*const before = player\.totalDistance;/,
  `  player.drafting = draftStrength();
  const curvature = trackCurvature(player.totalDistance, 18);
  const offroad = clamp((Math.abs(player.lane) - ROAD_HALF + 0.72) / 1.15, 0, 1);
  const step = stepVehicle(player, {
    steer,
    throttle: throttle ? 1 : 0,
    brake: braking ? 1 : 0,
    curvature,
    offroad,
    drafting: player.drafting,
    maxSpeed: MAX_SPEED
  }, delta);
  Object.assign(player, step);
  player.lane += step.laneDelta;

  if (Math.abs(player.lane) > ROAD_HALF + 1.2) {
    player.lane = Math.sign(player.lane) * (ROAD_HALF + 1.2);
    player.lateralSpeed *= -0.28;
    player.yawOffset *= -0.34;
    player.speed *= 0.82;
    cameraImpact = Math.max(cameraImpact, 0.72);
    audio.impact(0.65);
    haptic([22, 16, 24]);
  }

  const before = player.totalDistance;`,
  'player dynamics'
);
exact(
  `  player.totalDistance += player.speed / 3.6 * delta;`,
  `  player.totalDistance += step.longitudinalMeters;`
);

exact(
  `  if (settings.haptics && player.speed > 235 && hapticTimer <= 0) {
    haptic(4);
    hapticTimer = lerp(0.32, 0.12, speedFeel(player.speed, MAX_SPEED));
  }`,
  `  if (settings.haptics && step.atLimit && hapticTimer <= 0) {
    haptic(player.grip < 0.38 ? [5, 7, 5] : 4);
    hapticTimer = lerp(0.14, 0.055, 1 - player.grip);
  } else if (settings.haptics && player.speed > 235 && hapticTimer <= 0) {
    haptic(4);
    hapticTimer = lerp(0.32, 0.12, speedFeel(player.speed, MAX_SPEED));
  }
  document.documentElement.dataset.handlingState = player.grip < 0.4 ? 'sliding' : step.atLimit ? 'limit' : 'grip';
  document.documentElement.dataset.grip = player.grip.toFixed(2);
  document.documentElement.dataset.slip = player.slipAngle.toFixed(3);`
);

exact(
  `  const aheadPosition = ahead.position.add(ahead.right.scale(player.lane * 0.82));`,
  `  const aheadPosition = ahead.position
    .add(ahead.right.scale(player.lane * 0.82))
    .add(current.right.scale(player.yawOffset * lookAheadDistance * 0.62));`
);
exact(
  `  camera.rotation.z = clamp(-steer * 0.055 - player.laneVelocity * 0.016, -0.095, 0.095);`,
  `  camera.rotation.z = clamp(-steer * 0.045 + player.bodyRoll * 0.72 - player.lateralSpeed * 0.008, -0.16, 0.16);`
);
exact(
  `  cockpitRoot.position.y = surface * 0.4 - brakingPitch * 0.24 + accelerationSink * 0.25;
  cockpitRoot.position.z = braking ? 0.08 + feel * 0.08 : -accelerationSink * 0.16;
  cockpitRoot.rotation.z = clamp(steer * -0.018 - player.laneVelocity * 0.01, -0.04, 0.04);
  wheelRoot.rotation.z = steer * -0.62;`,
  `  cockpitRoot.position.y = surface * 0.4 - brakingPitch * 0.24 + accelerationSink * 0.25;
  cockpitRoot.position.z = braking ? 0.08 + feel * 0.08 : -accelerationSink * 0.16;
  cockpitRoot.rotation.x = player.bodyPitch * 0.58;
  cockpitRoot.rotation.z = clamp(player.bodyRoll * 0.48 - player.slipAngle * 0.12, -0.11, 0.11);
  wheelRoot.rotation.z = steer * -0.62 + player.yawOffset * 0.18;

  const rear = sampleTrack(player.totalDistance - lerp(10, 20, feel));
  rearCamera.position.copyFrom(lanePosition.add(current.tangent.scale(1.35)).add(new Vector3(0, 1.23, 0)));
  rearCamera.setTarget(rear.position.add(rear.right.scale(player.lane * 0.9)).add(new Vector3(0, 1.02, 0)));
  rearCamera.fov = lerp(1.03, 1.17, feel);`
);
exact(
  `  audio.update(player.speed, mode === 'racing' || mode === 'countdown', offroad, player.drafting);`,
  `  audio.update(player.speed, mode === 'racing' || mode === 'countdown', offroad, player.drafting, player.slipAngle);`
);

await writeFile(mainPath, source);

const packagePath = 'apps/petlya-17/package.json';
const packageJson = JSON.parse(await readFile(packagePath, 'utf8'));
packageJson.version = '3.1.0';
await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);

const configPath = 'apps/petlya-17/app.config.json';
const config = JSON.parse(await readFile(configPath, 'utf8'));
config.description = 'Полноценная 3D-гонка из кокпита с simcade-физикой сцепления, тормозящими перед поворотами соперниками, импульсными контактами и настоящими зеркалами.';
config.version = '3.1.0';
config.releaseDate = '2026-07-14';
config.releaseDateTime = '2026-07-14T16:30:00Z';
config.changelog = [
  'Добавлена единая simcade-модель машины с запасом сцепления, углом скольжения, рысканием, переносом нагрузки и прогрессивным срывом шин.',
  'Боты теперь анализируют реальную кривизну трассы, тормозят до поворота, занимают внешнюю линию перед входом и атакуют апекс.',
  'Столкновения обмениваются продольным и боковым импульсом вместо простого умножения скорости и ощущаются через кузов, камеру, звук и вибрацию.',
  'Кокпит реагирует на боковую перегрузку, скольжение, разгон и торможение, а состояние сцепления передаётся без отдельной аркадной шкалы.',
  'Оба зеркала получили настоящее низкоразрешённое изображение с задней камеры, обновляемое через кадр для сохранения производительности.'
];
config.cacheName = 'petlya-17-v3.1.0';
await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);

const htmlPath = 'apps/petlya-17/source/index.html';
let html = await readFile(htmlPath, 'utf8');
html = html.replace('content="3.0.0"', 'content="3.1.0"');
html = html.replace('ПЕТЛЯ 17 / 3D ENGINE', 'ПЕТЛЯ 17 / HANDLING 3.1');
html = html.replace('Настоящая 3D-трасса. Камера внутри болида. Телефон — руль. Газ справа, тормоз слева.', 'Настоящая 3D-трасса и simcade-физика сцепления. Тормози до апекса, держи машину на пределе и не надейся, что соперники уступят линию.');
await writeFile(htmlPath, html);
