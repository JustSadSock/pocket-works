export type Rgb = readonly [number, number, number];

export type ShipDimensions = {
  hullLength: number;
  waterlineLength: number;
  overallLength: number;
  beam: number;
  draft: number;
  freeboardAft: number;
  mastHeightAboveWater: number;
  displacementKg: number;
};

export type HullPalette = {
  id: string;
  label: string;
  hull: Rgb;
  rail: Rgb;
  trim: Rgb;
  bootStripe: Rgb;
};

export type SailPlan = {
  id: string;
  label: string;
  cloth: Rgb;
  seam: Rgb;
  mainScale: number;
  jibScale: number;
  description: string;
};

export type OarSet = {
  id: string;
  label: string;
  stations: readonly number[];
  pivotY: number;
  activePortX: number;
  outboardReach: number;
  shaftLength: number;
  bladeLength: number;
  bladeWidth: number;
  wood: Rgb;
  description: string;
};

export type ShipDefinition = {
  id: string;
  label: string;
  hullAsset: string;
  dimensions: ShipDimensions;
  palettes: readonly HullPalette[];
  sails: readonly SailPlan[];
  oarSets: readonly OarSet[];
};

export type ShipLoadout = {
  shipId: string;
  paletteId: string;
  sailPlanId: string;
  oarSetId: string;
};

const CUTTER_PALETTES: readonly HullPalette[] = [
  {
    id: 'oxblood',
    label: 'Бычья кровь',
    hull: [0.125, 0.034, 0.012],
    rail: [0.165, 0.045, 0.014],
    trim: [0.70, 0.57, 0.36],
    bootStripe: [0.020, 0.155, 0.135]
  },
  {
    id: 'navy',
    label: 'Ночной синий',
    hull: [0.018, 0.050, 0.083],
    rail: [0.070, 0.034, 0.020],
    trim: [0.79, 0.68, 0.47],
    bootStripe: [0.105, 0.235, 0.205]
  },
  {
    id: 'black-tea',
    label: 'Чёрный чай',
    hull: [0.046, 0.025, 0.015],
    rail: [0.205, 0.073, 0.020],
    trim: [0.74, 0.61, 0.39],
    bootStripe: [0.30, 0.095, 0.045]
  }
] as const;

const CUTTER_SAILS: readonly SailPlan[] = [
  {
    id: 'working-canvas',
    label: 'Рабочий парус',
    cloth: [0.95, 0.90, 0.76],
    seam: [0.34, 0.25, 0.14],
    mainScale: 1,
    jibScale: 1,
    description: 'Полный гафельный комплект для обычного хода.'
  },
  {
    id: 'weathered-tan',
    label: 'Штормовой охристый',
    cloth: [0.69, 0.48, 0.25],
    seam: [0.24, 0.13, 0.055],
    mainScale: 0.90,
    jibScale: 0.82,
    description: 'Меньшая площадь и более тяжёлая парусина для плохой погоды.'
  },
  {
    id: 'cream-racing',
    label: 'Светлый ходовой',
    cloth: [0.91, 0.88, 0.72],
    seam: [0.42, 0.16, 0.08],
    mainScale: 1.07,
    jibScale: 1.08,
    description: 'Чуть более высокий и полный комплект для лёгкого ветра.'
  }
] as const;

const CUTTER_OARS: readonly OarSet[] = [
  {
    id: 'six-sweeps',
    label: '6 пар судовых вёсел',
    stations: [-3.12, -2.10, -1.08, -0.06, 0.96, 1.98],
    pivotY: 0.45,
    activePortX: 1.42,
    outboardReach: 2.34,
    shaftLength: 3.52,
    bladeLength: 0.72,
    bladeWidth: 0.24,
    wood: [0.34, 0.17, 0.065],
    description: 'Основной комплект: двенадцать вёсел с плотной, но правдоподобной расстановкой.'
  },
  {
    id: 'long-sweeps',
    label: '6 пар длинных свипов',
    stations: [-3.15, -2.12, -1.09, -0.06, 0.97, 2.00],
    pivotY: 0.44,
    activePortX: 1.44,
    outboardReach: 2.62,
    shaftLength: 3.88,
    bladeLength: 0.78,
    bladeWidth: 0.26,
    wood: [0.27, 0.115, 0.040],
    description: 'Более тяжёлые длинные вёсла с заметной инерцией и большим плечом.'
  },
  {
    id: 'five-coastal',
    label: '5 пар береговых',
    stations: [-2.95, -1.72, -0.49, 0.74, 1.97],
    pivotY: 0.46,
    activePortX: 1.40,
    outboardReach: 2.18,
    shaftLength: 3.30,
    bladeLength: 0.66,
    bladeWidth: 0.22,
    wood: [0.40, 0.22, 0.09],
    description: 'Более лёгкий комплект для будущих малых и прибрежных вариантов корпуса.'
  }
] as const;

export const SHIPS: readonly ShipDefinition[] = [
  {
    id: 'pelagos-cutter-9m',
    label: 'PELAGOS Cutter 30',
    hullAsset: 'pelagos-cutter.glb',
    // Blender stations run from -4.55 m to +4.58 m. The bowsprit extends the visual overall
    // length to roughly 11.7 m. This is a 30-foot cutter, not a dinghy: the previous four oars
    // per side simply undersold its scale.
    dimensions: {
      hullLength: 9.13,
      waterlineLength: 8.24,
      overallLength: 11.70,
      beam: 3.48,
      draft: 1.65,
      freeboardAft: 1.06,
      mastHeightAboveWater: 8.05,
      displacementKg: 5600
    },
    palettes: CUTTER_PALETTES,
    sails: CUTTER_SAILS,
    oarSets: CUTTER_OARS
  }
] as const;

const STORAGE_KEY = 'pocket-works:pelagos:ship-loadout';
export const DEFAULT_LOADOUT: ShipLoadout = {
  shipId: 'pelagos-cutter-9m',
  paletteId: 'oxblood',
  sailPlanId: 'working-canvas',
  oarSetId: 'six-sweeps'
};

function validLoadout(candidate: Partial<ShipLoadout> | null | undefined): ShipLoadout {
  const ship = SHIPS.find((entry) => entry.id === candidate?.shipId) ?? SHIPS[0];
  const palette = ship.palettes.find((entry) => entry.id === candidate?.paletteId) ?? ship.palettes[0];
  const sail = ship.sails.find((entry) => entry.id === candidate?.sailPlanId) ?? ship.sails[0];
  const oars = ship.oarSets.find((entry) => entry.id === candidate?.oarSetId) ?? ship.oarSets[0];
  return { shipId: ship.id, paletteId: palette.id, sailPlanId: sail.id, oarSetId: oars.id };
}

export function loadShipLoadout(): ShipLoadout {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_LOADOUT };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? validLoadout(JSON.parse(raw) as Partial<ShipLoadout>) : { ...DEFAULT_LOADOUT };
  } catch {
    return { ...DEFAULT_LOADOUT };
  }
}

export function saveShipLoadout(loadout: Partial<ShipLoadout>): ShipLoadout {
  const next = validLoadout({ ...loadShipLoadout(), ...loadout });
  if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function resolveShip(loadout: ShipLoadout = loadShipLoadout()): {
  definition: ShipDefinition;
  palette: HullPalette;
  sail: SailPlan;
  oars: OarSet;
  loadout: ShipLoadout;
} {
  const normalized = validLoadout(loadout);
  const definition = SHIPS.find((entry) => entry.id === normalized.shipId) ?? SHIPS[0];
  return {
    definition,
    palette: definition.palettes.find((entry) => entry.id === normalized.paletteId) ?? definition.palettes[0],
    sail: definition.sails.find((entry) => entry.id === normalized.sailPlanId) ?? definition.sails[0],
    oars: definition.oarSets.find((entry) => entry.id === normalized.oarSetId) ?? definition.oarSets[0],
    loadout: normalized
  };
}

// Equipment is resolved once per page load. Switching hull class, rig or oar geometry is a
// structural operation, so the shipyard persists the new loadout and performs a clean reload.
export const ACTIVE_SHIP = resolveShip();
