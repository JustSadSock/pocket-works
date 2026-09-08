export type ShipPalette = {
  hull: string;
  trim: string;
  deck: string;
  sail: string;
  oarShaft: string;
  oarBlade: string;
  hullRoughness: number;
  deckRoughness: number;
  sailRoughness: number;
};

export type SailModule = {
  id: 'working-gaff' | 'storm-gaff' | 'raider-gaff' | 'merchant-gaff';
  label: string;
  mainHeightScale: number;
  mainChordScale: number;
  jibHeightScale: number;
  jibChordScale: number;
};

export type OarModule = {
  id: 'balanced-sweeps' | 'heavy-sweeps' | 'light-sweeps' | 'harbor-sweeps';
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
export type ShipModuleSelection = Record<ShipModuleSlot, string>;

type ModuleOption<T> = {
  id: string;
  label: string;
  description: string;
  value: T;
};

export const BASE_ASSET_LENGTH = 9.35;
export const BASE_ASSET_BEAM = 3.40;

export const DIMENSION_MODULES: Record<string, ModuleOption<ShipDimensions>> = {
  harbor: {
    id: 'harbor',
    label: 'Harbor Cutter',
    description: '10,8 м · низкий и юркий корпус',
    value: { length: 10.8, beam: 3.35, draft: 0.94, displacementKg: 3600, verticalScale: 0.96, waterlineCenterY: 0.54 }
  },
  long: {
    id: 'long',
    label: 'Long Cutter',
    description: '12,8 м · универсальный морской корпус',
    value: { length: 12.8, beam: 3.9, draft: 1.18, displacementKg: 5200, verticalScale: 1.08, waterlineCenterY: 0.57 }
  },
  bluewater: {
    id: 'bluewater',
    label: 'Bluewater Hull',
    description: '14,4 м · широкий и тяжёлый борт',
    value: { length: 14.4, beam: 4.35, draft: 1.36, displacementKg: 7200, verticalScale: 1.16, waterlineCenterY: 0.51 }
  },
  highboard: {
    id: 'highboard',
    label: 'Highboard Cruiser',
    description: '15,6 м · высокий борт для тяжёлого моря',
    value: { length: 15.6, beam: 4.6, draft: 1.48, displacementKg: 8900, verticalScale: 1.23, waterlineCenterY: 0.47 }
  }
};

export const PALETTE_MODULES: Record<string, ModuleOption<ShipPalette>> = {
  seafoam: {
    id: 'seafoam',
    label: 'Seafoam',
    description: 'Бирюзовый борт · светлая палуба · тёплый парус',
    value: {
      hull: '#315f5f', trim: '#f0dfb8', deck: '#a77743', sail: '#eadfbf', oarShaft: '#7b4e2b', oarBlade: '#ba8750',
      hullRoughness: 0.48, deckRoughness: 0.66, sailRoughness: 0.84
    }
  },
  storm: {
    id: 'storm',
    label: 'Storm Tar',
    description: 'Тёмный просмолённый корпус · матовая оснастка',
    value: {
      hull: '#253f44', trim: '#d6c9a6', deck: '#85613e', sail: '#c9c3ae', oarShaft: '#604329', oarBlade: '#8b6845',
      hullRoughness: 0.67, deckRoughness: 0.76, sailRoughness: 0.90
    }
  },
  oxblood: {
    id: 'oxblood',
    label: 'Oxblood',
    description: 'Тёмно-красный лак · латунь · медовая палуба',
    value: {
      hull: '#6f3028', trim: '#e7d6ab', deck: '#9c6c3e', sail: '#d8c79f', oarShaft: '#6f4528', oarBlade: '#b47a42',
      hullRoughness: 0.38, deckRoughness: 0.58, sailRoughness: 0.80
    }
  },
  navy: {
    id: 'navy',
    label: 'Midnight Navy',
    description: 'Глубокий синий · белая окантовка · холодный парус',
    value: {
      hull: '#183447', trim: '#e5e8dd', deck: '#7d5837', sail: '#dfe2d6', oarShaft: '#62442e', oarBlade: '#9a724b',
      hullRoughness: 0.42, deckRoughness: 0.63, sailRoughness: 0.86
    }
  },
  ivory: {
    id: 'ivory',
    label: 'Ivory Trader',
    description: 'Светлый корпус · ореховая палуба · кремовый парус',
    value: {
      hull: '#b9b19a', trim: '#68472e', deck: '#835936', sail: '#f0e2b9', oarShaft: '#68472e', oarBlade: '#aa7a49',
      hullRoughness: 0.55, deckRoughness: 0.61, sailRoughness: 0.79
    }
  }
};

export const SAIL_MODULES: Record<string, ModuleOption<SailModule>> = {
  'working-gaff': {
    id: 'working-gaff',
    label: 'Working Gaff',
    description: 'Сбалансированный грот и стаксель',
    value: { id: 'working-gaff', label: 'Working gaff rig', mainHeightScale: 1.08, mainChordScale: 1.10, jibHeightScale: 1.06, jibChordScale: 1.08 }
  },
  'storm-gaff': {
    id: 'storm-gaff',
    label: 'Storm Rig',
    description: 'Уменьшенная площадь для тяжёлой погоды',
    value: { id: 'storm-gaff', label: 'Reduced storm rig', mainHeightScale: 0.86, mainChordScale: 0.82, jibHeightScale: 0.78, jibChordScale: 0.76 }
  },
  'raider-gaff': {
    id: 'raider-gaff',
    label: 'Raider Rig',
    description: 'Высокий быстрый комплект с крупным стакселем',
    value: { id: 'raider-gaff', label: 'Tall raider rig', mainHeightScale: 1.13, mainChordScale: 1.04, jibHeightScale: 1.12, jibChordScale: 1.02 }
  },
  'merchant-gaff': {
    id: 'merchant-gaff',
    label: 'Merchant Rig',
    description: 'Широкий грот с умеренным передним парусом',
    value: { id: 'merchant-gaff', label: 'Broad merchant rig', mainHeightScale: 1.02, mainChordScale: 1.22, jibHeightScale: 0.96, jibChordScale: 0.91 }
  }
};

export const OAR_MODULES: Record<string, ModuleOption<OarModule>> = {
  'heavy-sweeps': {
    id: 'heavy-sweeps',
    label: 'Heavy Sweeps',
    description: '5 на борт · длинные тяжёлые лопасти',
    value: { id: 'heavy-sweeps', label: 'Heavy sweeps', stationsPerSide: 5, firstStationZ: -2.65, lastStationZ: 2.12, shaftLength: 3.84, shaftRadius: 0.058, bladeLength: 0.86, bladeWidth: 0.29, strokeAmplitude: 0.68, dipAmplitude: 0.46 }
  },
  'balanced-sweeps': {
    id: 'balanced-sweeps',
    label: 'Balanced Sweeps',
    description: '6 на борт · штатный универсальный комплект',
    value: { id: 'balanced-sweeps', label: 'Balanced sweeps', stationsPerSide: 6, firstStationZ: -2.82, lastStationZ: 2.36, shaftLength: 3.62, shaftRadius: 0.050, bladeLength: 0.74, bladeWidth: 0.24, strokeAmplitude: 0.76, dipAmplitude: 0.50 }
  },
  'light-sweeps': {
    id: 'light-sweeps',
    label: 'Raider Oars',
    description: '7 на борт · быстрый частый гребок',
    value: { id: 'light-sweeps', label: 'Light sweeps', stationsPerSide: 7, firstStationZ: -2.92, lastStationZ: 2.42, shaftLength: 3.46, shaftRadius: 0.043, bladeLength: 0.66, bladeWidth: 0.21, strokeAmplitude: 0.82, dipAmplitude: 0.52 }
  },
  'harbor-sweeps': {
    id: 'harbor-sweeps',
    label: 'Harbor Oars',
    description: '8 на борт · короткие манёвровые вёсла',
    value: { id: 'harbor-sweeps', label: 'Harbor sweeps', stationsPerSide: 8, firstStationZ: -3.0, lastStationZ: 2.48, shaftLength: 3.20, shaftRadius: 0.041, bladeLength: 0.60, bladeWidth: 0.20, strokeAmplitude: 0.88, dipAmplitude: 0.55 }
  }
};

const PRESET_SELECTIONS: Record<string, ShipModuleSelection> = {
  'long-cutter': { dimensions: 'long', palette: 'seafoam', sails: 'working-gaff', oars: 'balanced-sweeps' },
  'storm-cutter': { dimensions: 'bluewater', palette: 'storm', sails: 'storm-gaff', oars: 'heavy-sweeps' },
  'raider-cutter': { dimensions: 'harbor', palette: 'oxblood', sails: 'raider-gaff', oars: 'light-sweeps' }
};

function loadoutFromSelection(id: string, label: string, selection: ShipModuleSelection): ShipLoadout {
  return {
    id,
    label,
    dimensions: { ...DIMENSION_MODULES[selection.dimensions].value },
    palette: { ...PALETTE_MODULES[selection.palette].value },
    sails: { ...SAIL_MODULES[selection.sails].value },
    oars: { ...OAR_MODULES[selection.oars].value }
  };
}

export const SHIP_LOADOUTS: Record<string, ShipLoadout> = {
  'long-cutter': loadoutFromSelection('long-cutter', 'Long Cutter', PRESET_SELECTIONS['long-cutter']),
  'storm-cutter': loadoutFromSelection('storm-cutter', 'Storm Cutter', PRESET_SELECTIONS['storm-cutter']),
  'raider-cutter': loadoutFromSelection('raider-cutter', 'Raider Cutter', PRESET_SELECTIONS['raider-cutter'])
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

const STORAGE_KEY = 'pocket-works:pelagos:shipyard:v1';
let selectedModules: ShipModuleSelection = { ...PRESET_SELECTIONS['long-cutter'] };
let activeLoadout = cloneLoadout(SHIP_LOADOUTS['long-cutter']);
let revision = 0;

function persist(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      selection: selectedModules,
      palette: activeLoadout.palette
    }));
  } catch {
    // Safari private storage can reject writes; customization still works for the current session.
  }
}

function markCustom(slot: ShipModuleSlot, sourceLabel: string): void {
  activeLoadout = {
    ...activeLoadout,
    id: 'custom',
    label: `Custom Cutter · ${slot}: ${sourceLabel}`
  };
  revision += 1;
  persist();
}

function restorePersisted(): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { selection?: Partial<ShipModuleSelection>; palette?: Partial<ShipPalette> };
    const selection: ShipModuleSelection = { ...selectedModules };
    if (parsed.selection?.dimensions && DIMENSION_MODULES[parsed.selection.dimensions]) selection.dimensions = parsed.selection.dimensions;
    if (parsed.selection?.palette && (PALETTE_MODULES[parsed.selection.palette] || parsed.selection.palette === 'custom')) selection.palette = parsed.selection.palette;
    if (parsed.selection?.sails && SAIL_MODULES[parsed.selection.sails]) selection.sails = parsed.selection.sails;
    if (parsed.selection?.oars && OAR_MODULES[parsed.selection.oars]) selection.oars = parsed.selection.oars;

    selectedModules = selection;
    activeLoadout.dimensions = { ...DIMENSION_MODULES[selection.dimensions].value };
    activeLoadout.sails = { ...SAIL_MODULES[selection.sails].value };
    activeLoadout.oars = { ...OAR_MODULES[selection.oars].value };
    const storedPalette = PALETTE_MODULES[selection.palette]?.value ?? PALETTE_MODULES.seafoam.value;
    activeLoadout.palette = selection.palette === 'custom' && parsed.palette
      ? { ...PALETTE_MODULES.seafoam.value, ...parsed.palette }
      : { ...storedPalette };
    activeLoadout.id = 'custom';
    activeLoadout.label = 'Custom Cutter';
  } catch {
    // Ignore stale or malformed stored customization.
  }
}

restorePersisted();

export function getActiveShipLoadout(): ShipLoadout {
  return activeLoadout;
}

export function getShipLoadoutSnapshot(): ShipLoadout {
  return cloneLoadout(activeLoadout);
}

export function getShipModuleSelection(): ShipModuleSelection {
  return { ...selectedModules };
}

export function getShipLoadoutRevision(): number {
  return revision;
}

export function setActiveShipLoadout(id: string): boolean {
  const selection = PRESET_SELECTIONS[id];
  const preset = SHIP_LOADOUTS[id];
  if (!selection || !preset) return false;
  selectedModules = { ...selection };
  activeLoadout = cloneLoadout(preset);
  revision += 1;
  persist();
  return true;
}

export function setShipModule(slot: ShipModuleSlot, moduleId: string): boolean {
  if (slot === 'dimensions') {
    const option = DIMENSION_MODULES[moduleId];
    if (!option) return false;
    activeLoadout.dimensions = { ...option.value };
  } else if (slot === 'palette') {
    const option = PALETTE_MODULES[moduleId];
    if (!option) return false;
    activeLoadout.palette = { ...option.value };
  } else if (slot === 'sails') {
    const option = SAIL_MODULES[moduleId];
    if (!option) return false;
    activeLoadout.sails = { ...option.value };
  } else {
    const option = OAR_MODULES[moduleId];
    if (!option) return false;
    activeLoadout.oars = { ...option.value };
  }

  selectedModules = { ...selectedModules, [slot]: moduleId };
  const sourceLabel = slot === 'dimensions' ? DIMENSION_MODULES[moduleId].label
    : slot === 'palette' ? PALETTE_MODULES[moduleId].label
      : slot === 'sails' ? SAIL_MODULES[moduleId].label
        : OAR_MODULES[moduleId].label;
  markCustom(slot, sourceLabel);
  return true;
}

export function setShipModuleFromPreset(slot: ShipModuleSlot, presetId: string): boolean {
  const selection = PRESET_SELECTIONS[presetId];
  if (!selection) return false;
  return setShipModule(slot, selection[slot]);
}

export function setShipPalette(palette: Partial<ShipPalette>): void {
  activeLoadout.palette = { ...activeLoadout.palette, ...palette };
  selectedModules = { ...selectedModules, palette: 'custom' };
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
