// @ts-nocheck
import { FORMAT_VERSION, migrateSnapshot, validateCustomMaterial } from './core.ts';

const DB_NAME='pocket-works:veshchestvo';
const DB_VERSION=1;
const STORE='records';

function openDb(){return new Promise((resolve,reject)=>{if(!('indexedDB'in globalThis)){resolve(null);return;}const req=indexedDB.open(DB_NAME,DB_VERSION);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE);};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
export async function dbGet(key,fallback=null){try{const db=await openDb();if(!db){const raw=localStorage.getItem(`${DB_NAME}:${key}`);return raw?JSON.parse(raw):fallback;}return await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readonly'),req=tx.objectStore(STORE).get(key);req.onsuccess=()=>resolve(req.result??fallback);req.onerror=()=>reject(req.error);});}catch{return fallback;}}
export async function dbSet(key,value){try{const db=await openDb();if(!db){localStorage.setItem(`${DB_NAME}:${key}`,JSON.stringify(value));return true;}await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(value,key);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});return true;}catch{return false;}}
export async function dbDelete(key){try{const db=await openDb();if(!db){localStorage.removeItem(`${DB_NAME}:${key}`);return true;}await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(key);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});return true;}catch{return false;}}

export const DEFAULT_SETTINGS={sound:true,haptics:true,quality:'auto',lastMaterial:'sand',lastTool:'brush',brushSize:5,timeScale:1,layer:'normal',camera:{zoom:1,panX:0,panY:0},favorites:['water','sand','lava','stone'],recent:['sand','water','lava'],onboarding:true};
export async function loadSettings(){const stored=await dbGet('settings',{});return{...DEFAULT_SETTINGS,...stored,camera:{...DEFAULT_SETTINGS.camera,...stored?.camera}};}
export function saveSettings(settings){return dbSet('settings',settings);}
export async function loadAutosave(){const raw=await dbGet('autosave',null);if(!raw)return null;return migrateSnapshot(raw.world)?raw:null;}
export function saveAutosave(payload){return dbSet('autosave',{...payload,savedAt:Date.now(),formatVersion:FORMAT_VERSION});}
export async function listWorlds(){const items=await dbGet('worlds',[]);return Array.isArray(items)?items.filter(x=>x&&x.id&&migrateSnapshot(x.world)):[];}
export async function saveWorld(record){const worlds=await listWorlds();const next={...record,id:record.id||crypto.randomUUID(),updatedAt:Date.now(),formatVersion:FORMAT_VERSION};const index=worlds.findIndex(x=>x.id===next.id);if(index>=0)worlds[index]=next;else worlds.unshift(next);await dbSet('worlds',worlds.slice(0,24));return next;}
export async function deleteWorld(id){const worlds=(await listWorlds()).filter(x=>x.id!==id);return dbSet('worlds',worlds);}
export async function loadCustomMaterials(){const list=await dbGet('materials',[]);if(!Array.isArray(list))return[];return list.map(x=>validateCustomMaterial(x)).filter(x=>x.ok).map(x=>x.value).slice(0,64);}
export async function saveCustomMaterials(list){const valid=list.map(x=>validateCustomMaterial(x)).filter(x=>x.ok).map(x=>x.value).slice(0,64);await dbSet('materials',valid);return valid;}
export function downloadJson(filename,data){const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),500);}
export async function readJsonFile(file){if(!file||file.size>15*1024*1024)throw new Error('Файл слишком большой.');const text=await file.text();let data;try{data=JSON.parse(text);}catch{throw new Error('Это не JSON-файл.');}return data;}
export function validateImport(data){if(!data||typeof data!=='object')throw new Error('Пустой файл.');if(data.kind==='veshchestvo-bundle'){const world=migrateSnapshot(data.world);if(!world)throw new Error('Мир в файле повреждён.');const materials=Array.isArray(data.materials)?data.materials.map(x=>validateCustomMaterial(x)).filter(x=>x.ok).map(x=>x.value):[];return{world,materials,meta:data.meta||{}};}const world=migrateSnapshot(data.world||data);if(!world)throw new Error('Формат мира не поддерживается.');return{world,materials:world.customMaterials||[],meta:{}};}
