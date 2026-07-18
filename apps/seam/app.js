import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { watchConnectivity } from '../../shared/pwa-utils.js';
import { AxisGame, PLAYER, coordKey, parseCoordKey, lineBetween, chooseAIMove, shouldSwapOpening } from './engine.js';
import { BoardView } from './board-view.js?v=2.2.0-visual.2';
const VERSION='2.2.0';
const visual=document.createElement('link');visual.rel='stylesheet';visual.href='./visual.css?v=2.2.0-visual.2';document.head.append(visual);
globalThis.__AXIS_DEPS={installMobileRuntime,createWorkshopMode,watchConnectivity,AxisGame,PLAYER,coordKey,parseCoordKey,lineBetween,chooseAIMove,shouldSwapOpening,BoardView};
const PARTS=['1','2a','2b','3a1','3a2','3b','4','5'];
const loadPart=name=>new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=`./app-part-${name}.js?v=${VERSION}`;script.async=false;script.onload=resolve;script.onerror=()=>reject(Error(`Failed to load ${name}`));document.head.append(script)});
try{for(const part of PARTS)await loadPart(part)}catch(error){console.error(error);document.querySelector('#boardCaption')?.replaceChildren('Game failed to load.')}finally{delete globalThis.__AXIS_DEPS}
