import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const core = [1, 2, 3, 4].map((part) => fs.readFileSync(new URL(`../runtime/v4/16-0${part}.txt`, import.meta.url), 'utf8')).join('\n');
const overlay = [1, 2, 3].map((part) => fs.readFileSync(new URL(`../runtime/v4/17-0${part}.txt`, import.meta.url), 'utf8')).join('\n');

function genome(overrides = {}) {
  return {
    thermal:.54,moisture:.5,altitude:.35,waterAffinity:.08,aquatic:.05,size:1,speed:1,vision:1,metabolism:.9,
    diet:.12,armor:.25,fertility:1,hue:110,pattern:.4,plantDiet:.9,preyDiet:.06,carrionDiet:.1,filterDiet:.02,
    nocturnal:.25,mateChoice:.4,migration:.5,parentalCare:.35,cooperation:.5,social:.5,reproStrategy:.5,
    wing:0,fins:0,burrow:.2,chromosome:2,...overrides
  };
}

function createContext() {
  let nextOrganismId = 100;
  const listeners = [];
  const element = () => ({
    addEventListener: (...args) => listeners.push(args), querySelector: () => null, insertAdjacentHTML: () => {},
    closest: () => null, textContent: '', value: '62', hidden: false, setAttribute: () => {}, click: () => {}
  });
  const species = [
    { id:1,parentId:null,born:0,extinct:null,name:'A a',common:'зелёный',centroid:genome(),peak:12,lastSeen:20,niche:'grazer' },
    { id:2,parentId:1,born:5,extinct:null,name:'B b',common:'морской',centroid:genome({waterAffinity:.94,aquatic:.9,filterDiet:.95,plantDiet:.08,diet:.2,fins:.8,hue:196}),peak:12,lastSeen:20,niche:'filterer' },
    { id:3,parentId:1,born:7,extinct:null,name:'C c',common:'хищник',centroid:genome({preyDiet:.92,plantDiet:.05,diet:.88,size:1.15,speed:1.2,hue:18}),peak:8,lastSeen:20,niche:'predator' }
  ];
  const organisms = [];
  for (let i=0;i<14;i++) organisms.push({id:i+1,x:.55+i*.002,y:.5,energy:10,age:300,generation:20,speciesId:1,genome:genome(),vx:0,vy:0});
  for (let i=0;i<12;i++) organisms.push({id:20+i,x:.08+i*.002,y:.18,energy:10,age:300,generation:20,speciesId:2,genome:genome({waterAffinity:.94,aquatic:.9,filterDiet:.95,plantDiet:.08,diet:.2,fins:.8,hue:196}),vx:0,vy:0});
  for (let i=0;i<7;i++) organisms.push({id:40+i,x:.58+i*.002,y:.54,energy:10,age:300,generation:20,speciesId:3,genome:genome({preyDiet:.92,plantDiet:.05,diet:.88,size:1.15,speed:1.2,hue:18}),vx:0,vy:0});
  const ctx = {
    console, globalThis:null, window:null, Math, JSON, Date, setTimeout, clearTimeout,
    Blob, File: class File extends Blob { constructor(parts,name,opts){super(parts,opts);this.name=name;} },
    URL:{createObjectURL:()=> 'blob:x',revokeObjectURL:()=>{}}, navigator:{canShare:()=>false},
    document:{querySelector:()=>null,createElement:()=>element()}, sheetBody:element(),
    temperatureInput:element(),foodInput:element(),mutationInput:element(),populationOutput:element(),speciesOutput:element(),
    state:{seed:'garden',rng:123456,generation:20,step:4400,env:{temperature:.52,food:.62,mutation:.24},terrainSeed:9182,originMode:'mature',
      organisms,species,populations:[],nextPopulationId:1,nextSpeciesId:4,history:[],events:[],interactions:{},mortality:{},statistics:{births:0,deaths:0,hybrids:0,speciations:0},season:0,fossilIndex:null},
    LIVING:{originMode:'mature'},MAX_ORGANISMS:260,MAX_HISTORY:72,GENERATION_STEPS:220,
    clamp:(v,min=0,max=1)=>Math.max(min,Math.min(max,v)),lerp:(a,b,t)=>a+(b-a)*t,
    deepClone:(v)=>JSON.parse(JSON.stringify(v)),
    random(){ctx.state.rng=(ctx.state.rng*1664525+1013904223)>>>0;return ctx.state.rng/4294967296;},
    randomRange(a,b){return a+(b-a)*ctx.random();},
    terrainAt(x,y){const water=x<.26;return {water,coast:x>=.26&&x<.34,biome:water?'ocean':x<.34?'wetland':y<.35?'forest':'grassland',temperature:.52+(y-.5)*.15,moisture:water?.94:.58,elevation:water?.2:.52,region:`${Math.floor(x*4)}${Math.floor(y*3)}${water?'W':'L'}`};},
    enrichGenome:(g)=>g,
    makeGenome:(base=null)=>genome(base||{}),
    stabilityInferRaw:()=>{},stabilityExpressGenome:(g)=>g,
    livingCentroid(members){const result=genome(members[0]?.genome||{});for(const key of Object.keys(result)){if(typeof result[key]==='number')result[key]=members.reduce((s,m)=>s+(m.genome[key]||0),0)/members.length;}return result;},
    makeOrganism(args={}){return {id:nextOrganismId++,x:args.x??.5,y:args.y??.5,vx:0,vy:0,energy:args.energy??10,age:200,generation:args.generation??0,speciesId:args.speciesId,genome:args.genome||genome()};},
    snapshotOrganism:(o)=>({id:o.id,x:o.x,y:o.y,energy:o.energy,speciesId:o.speciesId,genome:o.genome}),
    buildWorld:()=>{},migrateLivingState:()=>{},simulateStep(){ctx.state.step+=1;if(ctx.state.step%220===0){ctx.state.generation+=1;ctx.finalizeGeneration?.();}},
    newSpecies(g,parentId){const id=ctx.state.nextSpeciesId++;ctx.state.species.push({id,parentId,born:ctx.state.generation,extinct:null,name:`S${id}`,common:`вид ${id}`,centroid:g,peak:1,lastSeen:ctx.state.generation,niche:null});return id;},
    seedAt:()=>{},applyCataclysm:()=>{},openMenuSheet:()=>{},updateReadouts:()=>{},finalizeGeneration:()=>{},
    saveState:()=>{},syncAllUI:()=>{},updateTimeline:()=>{},showToast:()=>{},snapshot:()=>{},
  };
  ctx.globalThis=ctx;ctx.window=ctx;
  return ctx;
}

test('overlay migrates the real visible world into macro demes and advances it', () => {
  const ctx=createContext();
  vm.createContext(ctx);vm.runInContext(core,ctx);vm.runInContext(overlay,ctx);
  const before=vm.runInContext('META.summarize(state.metacommunity)',ctx);
  assert.ok(before.richness>=3);
  assert.ok(before.guilds.filterer>0);
  vm.runInContext('metaFinalizeGeneration()',ctx);
  const after=vm.runInContext('META.summarize(state.metacommunity)',ctx);
  assert.equal(ctx.state.generation,21);
  assert.ok(after.abundance>0);
  assert.ok(ctx.state.populations.length>=3);
  assert.ok(ctx.state.organisms.length>0&&ctx.state.organisms.length<=260);
});

test('compact diagnostic is machine-readable and much smaller than a full pretty world archive', () => {
  const ctx=createContext();
  vm.createContext(ctx);vm.runInContext(core,ctx);vm.runInContext(overlay,ctx);
  const compact=vm.runInContext('JSON.stringify(buildCompactDiagnostic())',ctx);
  const parsed=JSON.parse(compact);
  assert.equal(parsed.schema,'clada-diagnostic-v1');
  assert.ok(parsed.species.length>=3);
  assert.ok(parsed.demes.length>=3);
  assert.ok(compact.length<120000);
  const full=JSON.stringify(ctx.state,null,2);
  assert.ok(compact.length<full.length*.75);
});
