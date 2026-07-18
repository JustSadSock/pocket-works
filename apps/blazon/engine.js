const BUILD='5.3.0';
const isCore=new URL(import.meta.url).searchParams.has('core');

if(!isCore&&typeof document!=='undefined'){
  const enhancements=[
    './menu-input-hotfix.js',
    './critical-readability.js',
    './progression-art.js',
    './progression-runtime.js',
    './armorial-composition-runtime.js',
    './release-indicator.js'
  ];
  queueMicrotask(()=>{
    for(const path of enhancements){
      import(`${path}?v=${BUILD}`).catch(error=>console.warn(`[БЛАЗОН] optional module failed: ${path}`,error));
    }
  });
}

const selected=await import(isCore?`./core-engine.js?v=${BUILD}`:`./progression-engine.js?v=${BUILD}`);
const clarity=await import(`./combat-clarity.js?v=${BUILD}`);

export const VERSION=selected.VERSION;
export const BATTLE_COUNT=selected.BATTLE_COUNT;
export const WORLD_WIDTH=selected.WORLD_WIDTH;
export const WORLD_HEIGHT=selected.WORLD_HEIGHT;
export const TINCTURES=selected.TINCTURES;
export const FIELDS=selected.FIELDS;
export const ORDINARIES=selected.ORDINARIES;
export const MAINS=selected.MAINS;
export const SECONDARIES=selected.SECONDARIES;
export const COMMANDS=selected.COMMANDS;
export const MOTTOS=selected.MOTTOS;
export const SCHOOLS=selected.SCHOOLS;
export const EVOLUTIONS=selected.EVOLUTIONS;
export const CATALOGS=selected.CATALOGS;
export const emptyDoctrine=selected.emptyDoctrine;
export const createCampaign=selected.createCampaign;
export const hydrateCampaign=selected.hydrateCampaign;
export const doctrineLayers=selected.doctrineLayers;
export const doctrineName=selected.doctrineName;
export const nextUpgradeSlot=selected.nextUpgradeSlot;
export const generateOffers=selected.generateOffers;
export const applyOffer=selected.applyOffer;
export const prepareBattle=selected.prepareBattle;
export const recordBattle=selected.recordBattle;
export const createBattleState=(...args)=>clarity.createBattleState(selected.createBattleState,...args);
export const stepBattle=(state,dt)=>clarity.stepBattle(selected.stepBattle,state,dt);
export const summarizeBattle=selected.summarizeBattle;
export const simulateBattle=(a,b,seed=1,max=110)=>clarity.simulateBattle(selected.createBattleState,selected.stepBattle,selected.summarizeBattle,a,b,seed,max);
export const randomDoctrine=selected.randomDoctrine;
export const botAudit=(iterations=100,seed=1)=>clarity.botAudit(selected.randomDoctrine,selected.createBattleState,selected.stepBattle,selected.summarizeBattle,iterations,seed);
