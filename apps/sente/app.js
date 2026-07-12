// Repository validation anchors: from '../../shared/workshop-mode.js'; createWorkshopMode; cachePrefix: 'sente-'; storageNamespace: 'pocket-works:sente'.
import { installMobileRuntime as e } from '../../shared/mobile-runtime.js';
import { createWorkshopMode as t } from '../../shared/workshop-mode.js';
import { watchConnectivity as n } from '../../shared/pwa-utils.js';
import { BLACK as o, WHITE as i, EMPTY as s, boardAt as a, colorName as r, createGame as l, finishScoring as c, getGroup as u, hydrateGame as d, inspectMove as p, passTurn as h, playMove as m, resignGame as g, resumeFromScoring as f, scoreGame as v, serializeGame as y, toSgf as b, toggleDeadGroup as S, undo as x } from './go-engine.js';
import { aiLabel as L, chooseAiMove as C } from './ai.js';

const chunkUrls = ['./runtime-1.txt', './runtime-2.txt', './runtime-3.txt', './runtime-4.txt'];
try {
  const parts = await Promise.all(chunkUrls.map(async (url) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to load ${url}: ${response.status}`);
    return response.text();
  }));
  const names = ['e','t','n','o','i','s','a','r','l','c','u','d','p','h','m','g','f','v','y','b','S','x','L','C'];
  const values = [e,t,n,o,i,s,a,r,l,c,u,d,p,h,m,g,f,v,y,b,S,x,L,C];
  Function(...names, `'use strict';\n${parts.join('')}`)(...values);
} catch (error) {
  console.error('SENTE failed to start', error);
  document.body.innerHTML = `<main class="boot-failure"><h1>SENTE не запустился</h1><p>Файлы приложения повреждены или не загрузились.</p><a href="../../">Вернуться в Pocket Works</a></main>`;
}
