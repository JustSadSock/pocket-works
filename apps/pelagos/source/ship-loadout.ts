export type ShipPalette = {
  hull: string;
  trim: string;
  deck: string;
  sail: string;
  oarShaft: string;
  oarBlade: string;
};

export type SailModule = {
  id: 'working-gaff' | 'storm-gaff' | 'raider-gaff';
  label: string;
  mainHeightScale: number;
  mainChordScale: number;
  jibHeightScale: number;
  jibChordScale: number;
};

export type OarModule = {
  id: 'balanced-sweeps' | 'heavy-sweeps' | 'light-sweeps';
  label: string;
  stationsPerSide: number;
  firstStationZ: number;
  lastStationZ: number;
  shaftLength: number;
  shaftRadius: number;
  bladeLength: number;
  bladeWidth: number;
  strokeAmplitude: number;
  dipAmplitude: number;
};

export type ShipDimensions = {
  length: number;
  beam: number;
  draft: number;
  displacementKg: number;
  verticalScale: number;
  waterlineCenterY: number;
};

export type ShipLoadout = {
  id: string;
  label: string;
  dimensions: ShipDimensions;
  palette: ShipPalette;
  sails: SailModule;
  oars: OarModule;
};

export type ShipModuleSlot = 'dimensions' | 'palette' | 'sails' | 'oars';

export const BASE_ASSET_LENGTH = 9.35;
export const BASE_ASSET_BEAM = 3.40;

export const SHIP_LOADOUTS: Record<string, ShipLoadout> = {
  'long-cutter': {
    id: 'long-cutter',
    label: 'Long Cutter',
    dimensions: {
      length: 12.8,
      beam: 3.9,
      draft: 1.18,
      displacementKg: 5200,
      verticalScale: 1.08,
      waterlineCenterY: 0.57
    },
    palette: {
      hull: '#315f5f',
      trim: '#f0dfb8',
      deck: '#a77743',
      sail: '#eadfbf',
      oarShaft: '#7b4e2b',
      oarBlade: '#ba8750'
    },
    sails: {
      id: 'working-gaff',
      label: 'Working gaff rig',
      mainHeightScale: 1.08,
      mainChordScale: 1.10,
      jibHeightScale: 1.06,
      jibChordScale: 1.08
    },
    oars: {
      id: 'balanced-sweeps',
      label: 'Balanced sweeps',
      stationsPerSide: 6,
      firstStationZ: -2.82,
      lastStationZ: 2.36,
      shaftLength: 3.62,
      shaftRadius: 0.050,
      bladeLength: 0.74,
      bladeWidth: 0.24,
      strokeAmplitude: 0.76,
      dipAmplitude: 0.50
    }
  },
  'storm-cutter': {
    id: 'storm-cutter',
    label: 'Storm Cutter',
    dimensions: {
      length: 12.8,
      beam: 3.9,
      draft: 1.22,
      displacementKg: 5500,
      verticalScale: 1.08,
      waterlineCenterY: 0.53
    },
    palette: {
      hull: '#253f44',
      trim: '#d6c9a6',
      deck: '#85613e',
      sail: '#c9c3ae',
      oarShaft: '#604329',
      oarBlade: '#8b6845'
    },
    sails: {
      id: 'storm-gaff',
      label: 'Reduced storm rig',
      mainHeightScale: 0.86,
      mainChordScale: 0.82,
      jibHeightScale: 0.78,
      jibChordScale: 0.76
    },
    oars: {
      id: 'heavy-sweeps',
      label: 'Heavy sweeps',
      stationsPerSide: 5,
      firstStationZ: -2.65,
      lastStationZ: 2.12,
      shaftLength: 3.84,
      shaftRadius: 0.058,
      bladeLength: 0.86,
      bladeWidth: 0.29,
      strokeAmplitude: 0.68,
      dipAmplitude: 0.46
    }
  },
  'raider-cutter': {
    id: 'raider-cutter',
    label: 'Raider Cutter',
    dimensions: {
      length: 12.4,
      beam: 3.72,
      draft: 1.08,
      displacementKg: 4700,
      verticalScale: 1.04,
      waterlineCenterY: 0.60
    },
    palette: {
      hull: '#6f3028',
      trim: '#e7d6ab',
      deck: '#9c6c3e',
      sail: '#d8c79f',
      oarShaft: '#6f4528',
      oarBlade: '#b47a42'
    },
    sails: {
      id: 'raider-gaff',
      label: 'Tall raider rig',
      mainHeightScale: 1.13,
      mainChordScale: 1.04,
      jibHeightScale: 1.12,
      jibChordScale: 1.02
    },
    oars: {
      id: 'light-sweeps',
      label: 'Light sweeps',
      stationsPerSide: 7,
      firstStationZ: -2.92,
      lastStationZ: 2.42,
      shaftLength: 3.46,
      shaftRadius: 0.043,
      bladeLength: 0.66,
      bladeWidth: 0.21,
      strokeAmplitude: 0.82,
      dipAmplitude: 0.52
    }
  }
};

function cloneLoadout(loadout: ShipLoadout): ShipLoadout {
  return {
    ...loadout,
    dimensions: { ...loadout.dimensions },
    palette: { ...loadout.palette },
    sails: { ...loadout.sails },
    oars: { ...loadout.oars }
  };
}

let activeLoadout = cloneLoadout(SHIP_LOADOUTS['long-cutter']);
let revision = 0;

function markCustom(slot: ShipModuleSlot, sourceLabel: string): void {
  activeLoadout = {
    ...activeLoadout,
    id: 'custom',
    label: `Custom Cutter · ${slot}: ${sourceLabel}`
  };
  revision += 1;
}

export function getActiveShipLoadout(): ShipLoadout {
  return activeLoadout;
}

export function getShipLoadoutSnapshot(): ShipLoadout {
  return cloneLoadout(activeLoadout);
}

export function getShipLoadoutRevision(): number {
  return revision;
}

export function setActiveShipLoadout(id: string): boolean {
  const preset = SHIP_LOADOUTS[id];
  if (!preset) return false;
  if (activeLoadout.id === id) return true;
  activeLoadout = cloneLoadout(preset);
  revision += 1;
  return true;
}

export function setShipModuleFromPreset(slot: ShipModuleSlot, presetId: string): boolean {
  const preset = SHIP_LOADOUTS[presetId];
  if (!preset) return false;

  if (slot === 'dimensions') activeLoadout.dimensions = { ...preset.dimensions };
  else if (slot === 'palette') activeLoadout.palette = { ...preset.palette };
  else if (slot === 'sails') activeLoadout.sails = { ...preset.sails };
  else activeLoadout.oars = { ...preset.oars };

  markCustom(slot, preset.label);
  return true;
}

export function setShipPalette(palette: Partial<ShipPalette>): void {
  activeLoadout.palette = { ...activeLoadout.palette, ...palette };
  markCustom('palette', 'custom paint');
}

export function getShipScale(loadout = getActiveShipLoadout()): { x: number; y: number; z: number } {
  return {
    x: loadout.dimensions.beam / BASE_ASSET_BEAM,
    y: loadout.dimensions.verticalScale,
    z: loadout.dimensions.length / BASE_ASSET_LENGTH
  };
}

export function getOarStations(module = getActiveShipLoadout().oars): number[] {
  if (module.stationsPerSide <= 1) return [(module.firstStationZ + module.lastStationZ) * 0.5];
  const stations: number[] = [];
  for (let index = 0; index < module.stationsPerSide; index += 1) {
    const t = index / (module.stationsPerSide - 1);
    stations.push(module.firstStationZ + (module.lastStationZ - module.firstStationZ) * t);
  }
  return stations;
}
