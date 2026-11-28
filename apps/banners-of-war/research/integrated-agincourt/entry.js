import {initArt,paintArt,pendingArt} from '../battlefield-identity/battle-art.js';
import {E} from '../../engine.js';
// Loaded only by the loopback research server. No production registration.
const supported=new Set(['spear','sword','archer','knight','lightHorse','guard']);
const button=document.createElement('button');button.id='integrated-view';button.type='button';button.hidden=true;button.textContent='Диорама: загрузка';
document.querySelector('.maptools').append(button);
const status=document.createElement('output');status.id='integrated-status';status.setAttribute('aria-live','polite');status.style.cssText='display:block;max-width:180px;font-size:11px;color:#efe7d4;background:#273b30;padding:3px 5px';button.after(status);status.hidden=true;
let ready=false,active=new URLSearchParams(location.search).get('view')!=='schematic',failed=null,last=null,lastPaint=0,enabled=false,wake=true,terrainRef=null,terrainHash='';
const canvas=document.querySelector('#map');
function toggleLabel(){button.textContent=active?'Диорама':'Схема';button.setAttribute('aria-pressed',String(active))}
initArt(canvas).then(()=>{ready=true;wake=true;toggleLabel()}).catch(e=>{failed=String(e);active=false;wake=true;toggleLabel();status.textContent='Ресурсы недоступны: '+failed});
button.onclick=()=>{if(!ready||failed)return;active=!active;wake=true;toggleLabel()};
function hash(s){let v=2166136261;for(let i=0;i<s.length;i++){v=Math.imul(v^s.charCodeAt(i),16777619)}return (v>>>0).toString(16)}
function fingerprint(s){return hash(JSON.stringify([s.time,s.round,s.result,s.units.map(u=>[u.id,u.side,u.type,u.x,u.y,u.a,u.n,u.v,u.contact,u.morale,u.cohesion,u.fatigue,u.rout,u.form,u.cols,u.order,u.sectors])]))}
globalThis.__bowIntegratedPreview={
 update({state,study}){enabled=state?.historical?.id==='agincourt'&&!study;button.hidden=!enabled;status.hidden=!enabled},
 needsPaint(ts){if(wake){wake=false;return true}return enabled&&active&&ready&&!failed&&ts-lastPaint>180&&(last?.reason==='preparing terrain'||pendingArt()>0)},
 present({s,visible,canvas,camera,phase,layer,selected,orders,projected,playing,frame,lastFrame,paletteAlt,study}){
  lastPaint=performance.now();const F=E.forState(s),before=fingerprint(s),{k,o,dpr,portrait}=camera,w=canvas.clientWidth,h=canvas.clientHeight;
  if(terrainRef!==s.terrain){terrainRef=s.terrain;terrainHash=hash(JSON.stringify(s.terrain))}
  const expected=visible.filter(u=>supported.has(u.type)&&!u.pendingArrival);
  const fallback=visible.filter(u=>!supported.has(u.type)||u.pendingArrival);
  const units=visible.map(u=>({id:u.id,side:u.side,type:u.type,n:u.n,x:u.x,y:u.y,a:u.a,projected:projected(u),form:u.form}));
  const cam={axis:portrait?'tall':'wide',mode:'C',k,u:(w/2-o.x)/k-(portrait?F.H:0),v:(h/2-o.y)/k,x:portrait?(h/2-o.y)/k:(w/2-o.x)/k,y:portrait?F.H-(w/2-o.x)/k:(h/2-o.y)/k};
  last={phase,playing,frame,lastFrame,time:s.time,round:s.round,result:s.result,signature:before,terrainHash,camera:{k,o,dpr,portrait},art:false,units,selected:[...selected],orders:JSON.parse(JSON.stringify(orders)),fallback:fallback.map(u=>u.id),stats:null,reason:null};
  if(!enabled||!active||!ready||failed||layer!=='normal'||paletteAlt||study){last.reason=failed||(!ready?'loading':layer!=='normal'?'diagnostic layer':paletteAlt?'alternative palette':'schematic');status.textContent=failed?'Схема · ошибка ресурсов':active&&!ready?'Загрузка миниатюр':'Схематический атлас';return null}
  try{
   // Visibility comes from the native UI. Unsupported troops use native renderRegiment.
   // No independently advancing state, no substitution of crossbows with longbows.
   const ids=new Set(visible.map(u=>u.id)),drawState={...s,presentationTerrainKey:s.historical.id+'|'+terrainHash,units:expected,shots:(s.shots||[]).filter(q=>ids.has(q.id))};
   const stats=paintArt(drawState,{w,h,d:dpr},cam);
   if(stats.terrain.uncovered>0){last.reason='preparing terrain';status.textContent='Подготовка поверхности · схема';return null}
   if(before!==fingerprint(s))throw Error('Renderer mutated authoritative state');
   const represented=new Map((stats.regiments||[]).map(r=>[r.id,r.represented]));
   for(const u of expected)if(represented.get(u.id)!==Math.round(u.n))throw Error('Representation mismatch '+u.id);
   last.art=true;last.stats={...stats};last.covered=expected.map(u=>u.id);last.immutable=true;
   status.textContent='Диорама · '+(fallback.length?fallback.length+' полка в схеме (нет ресурса)':'все видимые полки');
   return new Set(last.covered);
  }catch(e){failed=String(e);active=false;last.reason=failed;status.textContent='Схема · '+failed;toggleLabel();return null}
 },
 receipt(){return last?JSON.parse(JSON.stringify(last)):null}
};
// Read-only evidence, no synthetic orders or state injection.
globalThis.integratedQA={receipt:()=>globalThis.__bowIntegratedPreview.receipt()};
await import('../../app.js');
