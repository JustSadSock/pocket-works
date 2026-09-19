export type VehicleId = 'kestrel' | 'meridian' | 'bastion';

export type VisualPreset = {
  id: string;
  name: string;
  paint: string;
  trim: string;
  wheel: string;
};

export type VehicleSpec = {
  id: VehicleId;
  name: string;
  role: string;
  mass: number;
  width: number;
  length: number;
  bodyHeight: number;
  cabinHeight: number;
  wheelBase: number;
  track: number;
  wheelRadius: number;
  wheelWidth: number;
  suspensionRest: number;
  suspensionTravel: number;
  suspensionStiffness: number;
  suspensionDamping: number;
  maxSuspensionForce: number;
  engineForce: number;
  brakeForce: number;
  steerMax: number;
  tireGrip: number;
  aeroDrag: number;
  crushResistance: number;
  structuralReserve: number;
  presets: VisualPreset[];
};

export const VEHICLES: VehicleSpec[] = [
  {
    id: 'kestrel',
    name: 'KESTREL',
    role: 'ЛЁГКИЙ ХЭТЧ',
    mass: 1080,
    width: 1.78,
    length: 4.06,
    bodyHeight: 0.72,
    cabinHeight: 1.18,
    wheelBase: 2.48,
    track: 1.49,
    wheelRadius: 0.31,
    wheelWidth: 0.205,
    suspensionRest: 0.31,
    suspensionTravel: 0.19,
    suspensionStiffness: 31,
    suspensionDamping: 5.4,
    maxSuspensionForce: 9800,
    engineForce: 3500,
    brakeForce: 58,
    steerMax: 0.52,
    tireGrip: 2.65,
    aeroDrag: 0.013,
    crushResistance: 0.82,
    structuralReserve: 0.82,
    presets: [
      { id: 'ember', name: 'EMBER', paint: '#e85c24', trim: '#202325', wheel: '#bebcb5' },
      { id: 'chalk', name: 'CHALK', paint: '#d9d7cc', trim: '#232628', wheel: '#9d9d98' },
      { id: 'moss', name: 'MOSS', paint: '#64715d', trim: '#202325', wheel: '#b9b6aa' }
    ]
  },
  {
    id: 'meridian',
    name: 'MERIDIAN',
    role: 'СБАЛАНСИРОВАННЫЙ СЕДАН',
    mass: 1490,
    width: 1.86,
    length: 4.72,
    bodyHeight: 0.76,
    cabinHeight: 1.25,
    wheelBase: 2.82,
    track: 1.57,
    wheelRadius: 0.335,
    wheelWidth: 0.225,
    suspensionRest: 0.34,
    suspensionTravel: 0.2,
    suspensionStiffness: 36,
    suspensionDamping: 6.2,
    maxSuspensionForce: 12800,
    engineForce: 4400,
    brakeForce: 68,
    steerMax: 0.45,
    tireGrip: 2.9,
    aeroDrag: 0.015,
    crushResistance: 1,
    structuralReserve: 1,
    presets: [
      { id: 'oxide', name: 'OXIDE', paint: '#a94c32', trim: '#222629', wheel: '#c6c3ba' },
      { id: 'graphite', name: 'GRAPHITE', paint: '#54585a', trim: '#17191a', wheel: '#9a9b99' },
      { id: 'ivory', name: 'IVORY', paint: '#dad4c2', trim: '#25282a', wheel: '#b1afa8' }
    ]
  },
  {
    id: 'bastion',
    name: 'BASTION',
    role: 'ТЯЖЁЛЫЙ SUV',
    mass: 2220,
    width: 2.02,
    length: 4.95,
    bodyHeight: 0.9,
    cabinHeight: 1.48,
    wheelBase: 2.96,
    track: 1.72,
    wheelRadius: 0.39,
    wheelWidth: 0.255,
    suspensionRest: 0.39,
    suspensionTravel: 0.245,
    suspensionStiffness: 43,
    suspensionDamping: 7.4,
    maxSuspensionForce: 17800,
    engineForce: 5700,
    brakeForce: 82,
    steerMax: 0.39,
    tireGrip: 3.0,
    aeroDrag: 0.021,
    crushResistance: 1.28,
    structuralReserve: 1.28,
    presets: [
      { id: 'clay', name: 'CLAY', paint: '#b66b46', trim: '#242729', wheel: '#aaa9a3' },
      { id: 'forest', name: 'FOREST', paint: '#4b5a4e', trim: '#1f2223', wheel: '#aaa9a1' },
      { id: 'steel', name: 'STEEL', paint: '#8d9495', trim: '#222527', wheel: '#c1beb5' }
    ]
  }
];

export const VEHICLE_BY_ID = Object.fromEntries(VEHICLES.map((vehicle) => [vehicle.id, vehicle])) as Record<VehicleId, VehicleSpec>;
