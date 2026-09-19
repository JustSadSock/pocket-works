export type DamageZone = 'front' | 'rear' | 'left' | 'right' | 'roof' | 'chassis';
export type ComponentName =
  | 'frontStructure'
  | 'rearStructure'
  | 'leftStructure'
  | 'rightStructure'
  | 'chassis'
  | 'engine'
  | 'cooling'
  | 'transmission'
  | 'steering'
  | 'suspensionFL'
  | 'suspensionFR'
  | 'suspensionRL'
  | 'suspensionRR'
  | 'wheelFL'
  | 'wheelFR'
  | 'wheelRL'
  | 'wheelRR'
  | 'headlightL'
  | 'headlightR'
  | 'taillightL'
  | 'taillightR'
  | 'windshield'
  | 'sideGlassL'
  | 'sideGlassR';

export type DamageState = {
  zoneDamage: Record<DamageZone, number>;
  components: Record<ComponentName, number>;
  temperature: number;
  peakImpact: number;
  impactCount: number;
};

export type ImpactInput = {
  force: number;
  dt: number;
  relativeSpeed: number;
  ownMass: number;
  otherMass: number;
  obstacleStiffness: number;
  contactArea: number;
  angleCos: number;
  zone: DamageZone;
  crushResistance: number;
};

export type DamageEffects = {
  enginePower: number;
  steeringAuthority: number;
  steeringPull: number;
  brakeAuthority: number;
  frontSupportL: number;
  frontSupportR: number;
  rearSupportL: number;
  rearSupportR: number;
  wheelGrip: [number, number, number, number];
  structuralIntegrity: number;
  coolingEfficiency: number;
  transmissionEfficiency: number;
  driveable: boolean;
};

const componentNames: ComponentName[] = [
  'frontStructure','rearStructure','leftStructure','rightStructure','chassis',
  'engine','cooling','transmission','steering',
  'suspensionFL','suspensionFR','suspensionRL','suspensionRR',
  'wheelFL','wheelFR','wheelRL','wheelRR',
  'headlightL','headlightR','taillightL','taillightR',
  'windshield','sideGlassL','sideGlassR'
];

export function createDamageState(): DamageState {
  return {
    zoneDamage: { front: 0, rear: 0, left: 0, right: 0, roof: 0, chassis: 0 },
    components: Object.fromEntries(componentNames.map((name) => [name, 1])) as Record<ComponentName, number>,
    temperature: 0.28,
    peakImpact: 0,
    impactCount: 0
  };
}

export function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

export function reducedMass(a: number, b: number) {
  if (!Number.isFinite(b) || b > 1e8) return a;
  return (a * b) / Math.max(1, a + b);
}

export function computeImpactSeverity(input: ImpactInput, state: DamageState) {
  const closing = Math.max(0, input.relativeSpeed);
  const mu = reducedMass(input.ownMass, input.otherMass);
  const energy = 0.5 * mu * closing * closing;
  const impulse = Math.max(0, input.force) * Math.max(1 / 240, input.dt);
  const concentration = clamp(Math.sqrt(0.72 / Math.max(0.08, input.contactArea)), 0.58, 2.35);
  const angle = 0.42 + 0.58 * clamp(Math.abs(input.angleCos));
  const stiffness = clamp(input.obstacleStiffness, 0.45, 2.6);
  const previous = state.zoneDamage[input.zone];
  const fatigue = 1 + previous * 1.15 + previous * previous * 0.75;
  const raw = (energy / 82000 + impulse / 26000) * 0.52;
  return clamp(raw * concentration * angle * stiffness * fatigue / Math.max(0.55, input.crushResistance), 0, 1.2);
}

const zoneComponents: Record<DamageZone, Array<[ComponentName, number]>> = {
  front: [
    ['frontStructure', 1], ['engine', 0.74], ['cooling', 0.86], ['steering', 0.35],
    ['suspensionFL', 0.32], ['suspensionFR', 0.32], ['headlightL', 0.62], ['headlightR', 0.62], ['windshield', 0.18], ['chassis', 0.16]
  ],
  rear: [
    ['rearStructure', 1], ['transmission', 0.24], ['suspensionRL', 0.27], ['suspensionRR', 0.27],
    ['taillightL', 0.72], ['taillightR', 0.72], ['chassis', 0.14]
  ],
  left: [
    ['leftStructure', 1], ['chassis', 0.22], ['suspensionFL', 0.3], ['suspensionRL', 0.3],
    ['wheelFL', 0.25], ['wheelRL', 0.25], ['sideGlassL', 0.65], ['steering', 0.16]
  ],
  right: [
    ['rightStructure', 1], ['chassis', 0.22], ['suspensionFR', 0.3], ['suspensionRR', 0.3],
    ['wheelFR', 0.25], ['wheelRR', 0.25], ['sideGlassR', 0.65], ['steering', 0.16]
  ],
  roof: [['chassis', 0.45], ['windshield', 0.74], ['sideGlassL', 0.44], ['sideGlassR', 0.44], ['leftStructure', 0.22], ['rightStructure', 0.22]],
  chassis: [['chassis', 1], ['frontStructure', 0.25], ['rearStructure', 0.25], ['leftStructure', 0.25], ['rightStructure', 0.25], ['transmission', 0.2]]
};

export function applyImpact(state: DamageState, input: ImpactInput) {
  const severity = computeImpactSeverity(input, state);
  if (severity < 0.006) return severity;

  state.impactCount += 1;
  state.peakImpact = Math.max(state.peakImpact, severity);
  const oldZone = state.zoneDamage[input.zone];
  state.zoneDamage[input.zone] = clamp(oldZone + severity * (0.35 + oldZone * 0.3));

  for (const [component, weight] of zoneComponents[input.zone]) {
    const oldHealth = state.components[component];
    const weak = 1 + (1 - oldHealth) * 0.8;
    const delta = severity * weight * 0.58 * weak;
    state.components[component] = clamp(oldHealth - delta);
  }

  if (severity > 0.22) {
    state.components.chassis = clamp(state.components.chassis - severity * 0.08);
  }
  return severity;
}

function geometricMean(...values: number[]) {
  return Math.pow(values.reduce((acc, value) => acc * clamp(value, 0.01, 1), 1), 1 / values.length);
}

export function deriveDamageEffects(state: DamageState): DamageEffects {
  const c = state.components;
  const structuralIntegrity = clamp(
    0.34 * c.chassis +
    0.18 * c.frontStructure +
    0.16 * c.rearStructure +
    0.16 * c.leftStructure +
    0.16 * c.rightStructure
  );
  const enginePower = clamp(Math.pow(c.engine, 1.35) * (0.38 + 0.62 * c.transmission) * (state.temperature > 0.9 ? 0.62 : 1));
  const steeringAuthority = clamp(geometricMean(c.steering, c.suspensionFL, c.suspensionFR) * (0.62 + 0.38 * structuralIntegrity));
  const steeringPull = clamp((c.suspensionFR + c.wheelFR - c.suspensionFL - c.wheelFL) * 0.27, -0.38, 0.38);
  const brakeAuthority = clamp(0.45 + 0.55 * structuralIntegrity);
  const wheelGrip: [number, number, number, number] = [
    clamp(c.wheelFL * (0.45 + 0.55 * c.suspensionFL)),
    clamp(c.wheelFR * (0.45 + 0.55 * c.suspensionFR)),
    clamp(c.wheelRL * (0.45 + 0.55 * c.suspensionRL)),
    clamp(c.wheelRR * (0.45 + 0.55 * c.suspensionRR))
  ];

  return {
    enginePower,
    steeringAuthority,
    steeringPull,
    brakeAuthority,
    frontSupportL: c.suspensionFL,
    frontSupportR: c.suspensionFR,
    rearSupportL: c.suspensionRL,
    rearSupportR: c.suspensionRR,
    wheelGrip,
    structuralIntegrity,
    coolingEfficiency: c.cooling,
    transmissionEfficiency: c.transmission,
    driveable: enginePower > 0.055 && structuralIntegrity > 0.08
  };
}

export function stepThermalDamage(state: DamageState, throttle: number, speedMps: number, dt: number) {
  const cooling = state.components.cooling;
  const load = Math.abs(throttle) * (0.25 + 0.75 * (1 - cooling));
  const airflow = clamp(speedMps / 28, 0, 1) * cooling;
  state.temperature = clamp(state.temperature + (load * 0.078 - airflow * 0.052 - 0.018) * dt, 0.18, 1.25);
  if (state.temperature > 1) {
    const over = state.temperature - 1;
    state.components.engine = clamp(state.components.engine - over * 0.028 * dt);
  }
}

export function mostDamagedComponents(state: DamageState, count = 4) {
  return (Object.entries(state.components) as Array<[ComponentName, number]>)
    .sort((a, b) => a[1] - b[1])
    .slice(0, count);
}
