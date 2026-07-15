const PARTS = [
  './runtime/core-01.txt',
  './runtime/core-02.txt',
  './runtime/core-03.txt',
  './runtime/core-04.txt',
  './runtime/core-05.txt'
];

async function readPart(path) {
  const url = new URL(path, import.meta.url);
  if (url.protocol === 'file:') {
    const { readFile } = await import('node:fs/promises');
    return readFile(url, 'utf8');
  }
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Не удалось загрузить тактическое ядро: ${response.status}`);
  return response.text();
}

const source = (await Promise.all(PARTS.map(readPart))).join('');
const moduleUrl = import.meta.url.startsWith('file:')
  ? `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
  : URL.createObjectURL(new Blob([source, '\n//# sourceURL=polevoy-shtab-core.js'], { type: 'text/javascript' }));
let module;
try { module = await import(moduleUrl); } finally { if (moduleUrl.startsWith('blob:')) URL.revokeObjectURL(moduleUrl); }

export const COLS = module.COLS;
export const ROWS = module.ROWS;
export const OBJECTIVE_TARGET = module.OBJECTIVE_TARGET;
export const TERRAIN = module.TERRAIN;
export const WEATHER = module.WEATHER;
export const DOCTRINES = module.DOCTRINES;
export const UNIT_TYPES = module.UNIT_TYPES;
export const UPGRADES = module.UPGRADES;
export const FACTIONS = module.FACTIONS;
export const COMMANDERS = module.COMMANDERS;
export const OFFICERS = module.OFFICERS;
export const MISSION_TYPES = module.MISSION_TYPES;
export const seededRandom = module.seededRandom;
export const hashSeed = module.hashSeed;
export const clamp = module.clamp;
export const cellIndex = module.cellIndex;
export const inBounds = module.inBounds;
export const manhattan = module.manhattan;
export const neighbors = module.neighbors;
export const createCampaign = module.createCampaign;
export const generateBattle = module.generateBattle;
export const commandPerTurn = module.commandPerTurn;
export const getTerrain = module.getTerrain;
export const getUnitAt = module.getUnitAt;
export const getUnit = module.getUnit;
export const unitMove = module.unitMove;
export const unitRange = module.unitRange;
export const movementCost = module.movementCost;
export const reachableCells = module.reachableCells;
export const attackableUnits = module.attackableUnits;
export const moveUnit = module.moveUnit;
export const attackUnit = module.attackUnit;
export const entrenchUnit = module.entrenchUnit;
export const resupplyUnit = module.resupplyUnit;
export const rallyUnit = module.rallyUnit;
export const useDoctrine = module.useDoctrine;
export const beginEnemyPhase = module.beginEnemyPhase;
export const chooseEnemyAction = module.chooseEnemyAction;
export const executeEnemyAction = module.executeEnemyAction;
export const finishRound = module.finishRound;
export const evaluateBattle = module.evaluateBattle;
export const getUpgradeChoices = module.getUpgradeChoices;
export const completeVictory = module.completeVictory;
export const completeDefeat = module.completeDefeat;
export const campaignRank = module.campaignRank;
export const visibleEnemyIds = module.visibleEnemyIds;
export const summarizeUnit = module.summarizeUnit;
export const migrateCampaignContent = module.migrateCampaignContent;
export const generateFrontChoices = module.generateFrontChoices;
export const applyRouteToBattle = module.applyRouteToBattle;
export const updateMissionProgress = module.updateMissionProgress;
export const missionProgress = module.missionProgress;
export const evaluateMissionState = module.evaluateMissionState;
export const missionTimeoutOutcome = module.missionTimeoutOutcome;
export const generateOfficerChoices = module.generateOfficerChoices;
export const addOfficer = module.addOfficer;
export const routeRewardSummary = module.routeRewardSummary;
