// @ts-nocheck
import { BASE_MATERIALS, CATEGORIES, STATE, hexToRgb } from './materials.ts';
import { MatterEngine, cloneRegion, pasteRegion, clamp, validateCustomMaterial } from './core.ts';
import { EXPERIMENTS, TASKS, loadExperiment, loadTask } from './scenes.ts';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, loadAutosave, saveAutosave, listWorlds, saveWorld, deleteWorld, loadCustomMaterials, saveCustomMaterials, downloadJson, readJsonFile, validateImport, dbDelete } from './storage.ts';
import shard01 from './ui-shard-01.ts';
import shard02 from './ui-shard-02.ts';
import shard03 from './ui-shard-03.ts';
import shard04 from './ui-shard-04.ts';
import shard05 from './ui-shard-05.ts';
import shard06 from './ui-shard-06.ts';
import shard07 from './ui-shard-07.ts';

const encoded=[shard01,shard02,shard03,shard04,shard05,shard06,shard07].join('');
const bytes=Uint8Array.from(atob(encoded),character=>character.charCodeAt(0));
const source=new TextDecoder().decode(bytes);
const start=new Function('BASE_MATERIALS','CATEGORIES','STATE','hexToRgb','MatterEngine','cloneRegion','pasteRegion','clamp','validateCustomMaterial','EXPERIMENTS','TASKS','loadExperiment','loadTask','DEFAULT_SETTINGS','loadSettings','saveSettings','loadAutosave','saveAutosave','listWorlds','saveWorld','deleteWorld','loadCustomMaterials','saveCustomMaterials','downloadJson','readJsonFile','validateImport','dbDelete',source);
start(BASE_MATERIALS,CATEGORIES,STATE,hexToRgb,MatterEngine,cloneRegion,pasteRegion,clamp,validateCustomMaterial,EXPERIMENTS,TASKS,loadExperiment,loadTask,DEFAULT_SETTINGS,loadSettings,saveSettings,loadAutosave,saveAutosave,listWorlds,saveWorld,deleteWorld,loadCustomMaterials,saveCustomMaterials,downloadJson,readJsonFile,validateImport,dbDelete);
