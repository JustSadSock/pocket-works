import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createVersionedStore } from '../../shared/capabilities/storage.js';
import { createAudioFeedback } from '../../shared/capabilities/audio.js';

installMobileRuntime();
globalThis.__VELORIA_DEPS__={createVersionedStore,createAudioFeedback};
const PARTS=['./sim/part-01.txt','./sim/part-02.txt','./sim/part-03.txt','./sim/part-04.txt','./sim/part-05.txt','./runtime/part-01.txt','./runtime/part-02.txt','./runtime/part-03.txt','./runtime/part-04.txt'];
try{
  const sources=await Promise.all(PARTS.map(async path=>{const r=await fetch(path,{cache:'no-store'});if(!r.ok)throw new Error(`Не удалось загрузить ${path}: ${r.status}`);return r.text()}));
  const url=URL.createObjectURL(new Blob([sources.join('')],{type:'text/javascript'}));
  try{await import(url)}finally{URL.revokeObjectURL(url);delete globalThis.__VELORIA_DEPS__}
}catch(error){
  console.error('VELORIA startup failed',error);
  const root=document.querySelector('[data-app-shell]');
  if(root)root.innerHTML=`<section style="position:absolute;inset:0;display:grid;place-content:center;gap:14px;padding:28px;background:#e7dfc9;color:#183b39;text-align:center"><h1 style="margin:0;font:700 32px Georgia">VELORIA не загрузилась</h1><p style="max-width:38ch;margin:0 auto">Перезапустите приложение. Сохранённая кампания останется на устройстве.</p><a href="../../" data-app-control data-native-press style="min-height:48px;display:grid;place-items:center;border:2px solid currentColor;color:inherit;text-decoration:none">Вернуться в Pocket Works</a></section>`;
}
