// @ts-nocheck
import { BASE_MATERIALS, CATEGORIES, STATE } from './materials.ts';
import { MatterEngine, cloneRegion, pasteRegion, clamp, validateCustomMaterial, hexToRgb } from './core.ts';
import { EXPERIMENTS, TASKS, loadExperiment, loadTask } from './scenes.ts';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, loadAutosave, saveAutosave, listWorlds, saveWorld, deleteWorld, loadCustomMaterials, saveCustomMaterials, downloadJson, readJsonFile, validateImport, dbDelete } from './storage.ts';
import shard01 from './ui-shard-01.ts';
import shard02 from './ui-shard-02.ts';
import shard03 from './ui-shard-03.ts';

const encoded=[shard01,shard02,shard03].join('');
const compressed=Uint8Array.from(atob(encoded),character=>character.charCodeAt(0));
const stream=new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'));
const source=await new Response(stream).text();
const start=new Function('BASE_MATERIALS','CATEGORIES','STATE','hexToRgb','MatterEngine','cloneRegion','pasteRegion','clamp','validateCustomMaterial','EXPERIMENTS','TASKS','loadExperiment','loadTask','DEFAULT_SETTINGS','loadSettings','saveSettings','loadAutosave','saveAutosave','listWorlds','saveWorld','deleteWorld','loadCustomMaterials','saveCustomMaterials','downloadJson','readJsonFile','validateImport','dbDelete',source);
start(BASE_MATERIALS,CATEGORIES,STATE,hexToRgb,MatterEngine,cloneRegion,pasteRegion,clamp,validateCustomMaterial,EXPERIMENTS,TASKS,loadExperiment,loadTask,DEFAULT_SETTINGS,loadSettings,saveSettings,loadAutosave,saveAutosave,listWorlds,saveWorld,deleteWorld,loadCustomMaterials,saveCustomMaterials,downloadJson,readJsonFile,validateImport,dbDelete);
