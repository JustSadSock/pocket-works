import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createVersionedStore } from '../../shared/capabilities/storage.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { watchConnectivity } from '../../shared/pwa-utils.js';

const APP_VERSION = '1.1.0';
const STORAGE_NAMESPACE = 'pocket-works:emergence-lab';
const MAX_PARTICLES = 620;
const MAX_FOOD = 260;
const INITIAL_PARTICLES = 210;
const INITIAL_FOOD = 90;
const TAU = Math.PI * 2;
const SPECIES_COLORS = ['#dc4a32', '#176f7d', '#d4a819'];
const SPECIES_NAMES = ['Киноварный', 'Бирюзовый', 'Охристый'];
const PRESET_NAMES = { colony: 'Колония', orbit: 'Орбиты', territory: 'Территории', cycle: 'Цикл', crystal: 'Кристалл' };
const VIEW_NAMES = { species: 'Виды', energy: 'Энергия', generation: 'Поколения' };

installMobileRuntime();

const PRESETS = {
  colony: { name: 'Колония', kin: .58, stranger: -.18, reach: 70, swirl: .08, noise: .018, drag: .935, maxSpeed: 2.1, matrix: null },
  orbit: { name: 'Орбиты', kin: -.34, stranger: .78, reach: 102, swirl: .72, noise: .008, drag: .954, maxSpeed: 2.75, matrix: null },
  territory: { name: 'Территории', kin: .64, stranger: -.82, reach: 76, swirl: .02, noise: .02, drag: .928, maxSpeed: 2.2, matrix: null },
  cycle: { name: 'Цикл', kin: .18, stranger: 0, reach: 92, swirl: .18, noise: .012, drag: .947, maxSpeed: 2.5, matrix: [[.18,.88,-.64],[-.64,.18,.88],[.88,-.64,.18]] },
  crystal: { name: 'Кристалл', kin: .92, stranger: .34, reach: 48, swirl: -.05, noise: .002, drag: .84, maxSpeed: 1.15, matrix: null }
};

const defaultState = { presetId: 'colony', config: PRESETS.colony, paused: false, speed: 1, lifeEnabled: true, viewMode: 'species', simTime: 0, world: null };
const storage = createVersionedStore({ namespace: STORAGE_NAMESPACE, version: 2, defaults: defaultState, migrations: { 1: data => ({ ...defaultState, ...data, viewMode: 'species' }) } });

const stage = document.querySelector('#lab-stage');
const canvas = document.querySelector('#world');
const context = canvas?.getContext('2d', { alpha: false, desynchronized: true });
if (!stage || !canvas || !context) throw new Error('Не удалось запустить поле симуляции.');

const $ = selector => document.querySelector(selector);
const elements = {
  loading: $('#loading-state'), empty: $('#empty-state'), inspector: $('#inspector'), toast: $('#toast'), flash: $('#mutation-flash'),
  population: $('#population-readout'), food: $('#food-readout'), time: $('#time-readout'), fps: $('#fps-readout'),
  species: [$('#species-a-count'), $('#species-b-count'), $('#species-c-count')], preset: $('#active-preset-name'),
  kin: $('#kin-input'), stranger: $('#stranger-input'), reach: $('#reach-input'), swirl: $('#swirl-input'),
  kinOut: $('#kin-output'), strangerOut: $('#stranger-output'), reachOut: $('#reach-output'), swirlOut: $('#swirl-output'),
  pause: $('#pause-button'), step: $('#step-button'), speed: $('#speed-button'), speedGlyph: $('#speed-glyph'), life: $('#life-toggle'),
  view: $('#view-button'), viewGlyph: $('#view-glyph'), undo: $('#undo-button'), newDish: $('#new-dish-button'),
  inspectTitle: $('#inspect-title'), inspectAge: $('#inspect-age'), inspectEnergy: $('#inspect-energy'), inspectNeighbors: $('#inspect-neighbors'),
  inspectGeneration: $('#inspect-generation'), inspectSpeed: $('#inspect-speed'), inspectSense: $('#inspect-sense'), inspectReason: $('#inspect-reason')
};

let width = 1, height = 1, dpr = 1;
let particles = [], food = [], nextParticleId = 1;
let selectedParticleId = null, currentTool = 'pull', activePointers = new Map();
let presetId = storage.get('presetId', 'colony');
let config = normalizeConfig(storage.get('config', PRESETS.colony));
let paused = Boolean(storage.get('paused', false));
let speed = [1,2,4].includes(storage.get('speed')) ? storage.get('speed') : 1;
let lifeEnabled = storage.get('lifeEnabled', true) !== false;
let viewMode = ['species','energy','generation'].includes(storage.get('viewMode')) ? storage.get('viewMode') : 'species';
let simTime = Number(storage.get('simTime', 0)) || 0;
let lastFrame = performance.now(), frameCounter = 0, sampleAt = performance.now(), persistTimer = 0, toastTimer = 0;
let fieldClearPending = true, renderedFrames = 0, inspectRefreshAt = 0, mutationWave = 0, newDishArmedUntil = 0;
let history = [], reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const clamp = (v,min,max) => Math.min(max, Math.max(min,v));
const randomBetween = (min,max) => min + Math.random() * (max-min);
const mutateGene = (value, amount, min, max) => clamp(value + randomBetween(-amount, amount), min, max);

function normalizeConfig(value) {
  const source = value && typeof value === 'object' ? value : PRESETS.colony;
  return { name: typeof source.name === 'string' ? source.name : 'Свои правила', kin: clamp(Number(source.kin)||0,-1,1), stranger: clamp(Number(source.stranger)||0,-1,1), reach: clamp(Number(source.reach)||70,34,124), swirl: clamp(Number(source.swirl)||0,-1,1), noise: clamp(Number(source.noise)||.015,0,.08), drag: clamp(Number(source.drag)||.935,.8,.98), maxSpeed: clamp(Number(source.maxSpeed)||2.1,.8,3.6), matrix: Array.isArray(source.matrix) ? source.matrix.map(row => row.map(v => clamp(Number(v)||0,-1,1))) : null };
}

function randomGenome(type) {
  const speciesBias = type === 0 ? .08 : type === 1 ? -.04 : .02;
  return { speed: clamp(randomBetween(.84,1.16)+speciesBias,.72,1.34), sense: randomBetween(.82,1.18), efficiency: randomBetween(.84,1.18), fertility: randomBetween(.82,1.18), hue: randomBetween(-.06,.06) };
}

function createParticle(x,y,type=Math.floor(Math.random()*3),velocityScale=1,parent=null) {
  const angle = Math.random()*TAU;
  const genome = parent ? {
    speed: mutateGene(parent.genome.speed,.045,.68,1.42), sense: mutateGene(parent.genome.sense,.05,.68,1.42),
    efficiency: mutateGene(parent.genome.efficiency,.045,.68,1.42), fertility: mutateGene(parent.genome.fertility,.05,.65,1.5), hue: mutateGene(parent.genome.hue,.018,-.16,.16)
  } : randomGenome(type);
  return { id: nextParticleId++, x: clamp(x,12,Math.max(12,width-12)), y: clamp(y,12,Math.max(12,height-12)), vx: Math.cos(angle)*randomBetween(.15,.75)*velocityScale, vy: Math.sin(angle)*randomBetween(.15,.75)*velocityScale, type: clamp(Math.floor(type),0,2), age: parent ? 0 : randomBetween(0,18), energy: parent ? .72 : randomBetween(.72,1.15), maxAge: parent ? mutateGene(parent.maxAge,8,80,210) : randomBetween(105,175), neighbors: 0, reason: 'дрейф среды', pulse: Math.random()*TAU, generation: parent ? parent.generation+1 : 0, genome };
}

function addFood(x,y,count=1) {
  for (let i=0;i<count && food.length<MAX_FOOD;i++) food.push({ x: clamp(x+randomBetween(-12,12),8,width-8), y: clamp(y+randomBetween(-12,12),8,height-8), energy: randomBetween(.16,.3), phase: Math.random()*TAU });
}

function seedResources(count=INITIAL_FOOD,clear=true) {
  if (clear) food=[];
  for (let i=0;i<count && food.length<MAX_FOOD;i++) addFood(randomBetween(24,width-24),randomBetween(24,height-24));
}

function seedColony(count=INITIAL_PARTICLES,clear=true) {
  if (clear) { particles=[]; selectedParticleId=null; closeInspector(); }
  const cx=width*.5, cy=height*.48;
  for (let i=0;i<count && particles.length<MAX_PARTICLES;i++) { const a=Math.random()*TAU, r=Math.sqrt(Math.random())*Math.min(width,height)*.31; particles.push(createParticle(cx+Math.cos(a)*r,cy+Math.sin(a)*r,i%3,1.1)); }
  if (clear) seedResources();
  elements.empty.hidden = particles.length>0; fieldClearPending=true; updateReadouts(); schedulePersist();
}

function restoreWorld(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.particles) || !snapshot.particles.length) { seedColony(); return; }
  particles=[]; food=[];
  for (const item of snapshot.particles.slice(0,MAX_PARTICLES)) {
    if (!Number.isFinite(item.x)||!Number.isFinite(item.y)) continue;
    const p=createParticle(item.x*width,item.y*height,item.type,0); p.id=Number.isInteger(item.id)?item.id:p.id; p.vx=clamp(Number(item.vx)||0,-4,4); p.vy=clamp(Number(item.vy)||0,-4,4); p.age=clamp(Number(item.age)||0,0,300); p.energy=clamp(Number(item.energy)||1,0,2.5); p.maxAge=clamp(Number(item.maxAge)||130,40,300); p.generation=clamp(Number(item.generation)||0,0,999); if (item.genome) p.genome={ ...p.genome, ...item.genome }; particles.push(p); nextParticleId=Math.max(nextParticleId,p.id+1);
  }
  for (const item of (snapshot.food||[]).slice(0,MAX_FOOD)) if (Number.isFinite(item.x)&&Number.isFinite(item.y)) food.push({ x:item.x*width,y:item.y*height,energy:clamp(Number(item.energy)||.2,.05,.5),phase:Math.random()*TAU });
  if (!food.length) seedResources(); if (!particles.length) seedColony(); elements.empty.hidden=particles.length>0;
}

function serializeWorld() { return { particles: particles.map(p=>({ id:p.id,x:clamp(p.x/width,0,1),y:clamp(p.y/height,0,1),vx:+p.vx.toFixed(3),vy:+p.vy.toFixed(3),type:p.type,age:+p.age.toFixed(2),energy:+p.energy.toFixed(3),maxAge:+p.maxAge.toFixed(2),generation:p.generation,genome:p.genome })), food: food.map(f=>({x:clamp(f.x/width,0,1),y:clamp(f.y/height,0,1),energy:+f.energy.toFixed(3)})) }; }
function persistState(){ clearTimeout(persistTimer); persistTimer=0; storage.patch({presetId,config,paused,speed,lifeEnabled,viewMode,simTime,world:serializeWorld()}); }
function schedulePersist(){ clearTimeout(persistTimer); persistTimer=setTimeout(persistState,900); }
function showToast(message){ elements.toast.textContent=message; elements.toast.classList.add('is-visible'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>elements.toast.classList.remove('is-visible'),1900); }

function formatRule(v){ const a=Math.round(Math.abs(v)*100); return a<=1?'нейтрально':`${v>0?'притяжение':'отталкивание'} ${a}`; }
function formatSpin(v){ const a=Math.round(Math.abs(v)*100); return a<=1?'нет':`${v>0?'по часовой':'против часовой'} ${a}`; }
function syncControls(){
  elements.kin.value=Math.round(config.kin*100); elements.stranger.value=Math.round(config.stranger*100); elements.reach.value=Math.round(config.reach); elements.swirl.value=Math.round(config.swirl*100);
  elements.kinOut.value=formatRule(config.kin); elements.strangerOut.value=formatRule(config.stranger); elements.reachOut.value=`${Math.round(config.reach)} пкс`; elements.swirlOut.value=formatSpin(config.swirl);
  elements.preset.textContent=presetId==='custom'?'Свои правила':(PRESET_NAMES[presetId]||config.name);
  document.querySelectorAll('[data-preset]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.preset===presetId)));
  elements.pause.querySelector('span').textContent=paused?'▶':'Ⅱ'; elements.pause.querySelector('b').textContent=paused?'Продолжить':'Пауза'; elements.step.disabled=!paused; elements.speedGlyph.textContent=`${speed}×`;
  elements.life.setAttribute('aria-pressed',String(lifeEnabled)); elements.life.querySelector('b').textContent=lifeEnabled?'Отбор вкл.':'Отбор выкл.'; elements.view.querySelector('b').textContent=VIEW_NAMES[viewMode]; elements.viewGlyph.textContent=viewMode==='species'?'●':viewMode==='energy'?'◐':'◎'; elements.undo.disabled=!history.length;
}

function applyPreset(id,announce=true){ if(!PRESETS[id])return; history.push({presetId,config:structuredClone(config)}); if(history.length>12)history.shift(); presetId=id; config=normalizeConfig(PRESETS[id]); syncControls(); schedulePersist(); if(announce)showToast(`Загружен режим «${PRESET_NAMES[id]}»`); }
function customFromInputs(){ presetId='custom'; config={...config,name:'Свои правила',kin:+elements.kin.value/100,stranger:+elements.stranger.value/100,reach:+elements.reach.value,swirl:+elements.swirl.value/100,matrix:null}; syncControls(); schedulePersist(); }
function mutateRules(){ history.push({presetId,config:structuredClone(config)}); if(history.length>12)history.shift(); const m=(v,r,min,max)=>clamp(v+randomBetween(-r,r),min,max); config={...config,name:'Мутация',kin:m(config.kin,.55,-1,1),stranger:m(config.stranger,.55,-1,1),reach:Math.round(m(config.reach,28,34,124)),swirl:m(config.swirl,.55,-1,1),noise:m(config.noise,.025,0,.07),drag:m(config.drag,.045,.82,.975),maxSpeed:m(config.maxSpeed,.75,1,3.4),matrix:null}; presetId='custom'; mutationWave=1; elements.flash.classList.remove('is-active'); void elements.flash.offsetWidth; elements.flash.classList.add('is-active'); navigator.vibrate?.(18); syncControls(); schedulePersist(); showToast('Правила изменились. Среда перестраивается.'); }
function undoRules(){ const prev=history.pop(); if(!prev)return; presetId=prev.presetId; config=normalizeConfig(prev.config); syncControls(); schedulePersist(); showToast('Предыдущие правила восстановлены'); }

function resizeCanvas(){ const rect=stage.getBoundingClientRect(), pw=width, ph=height; width=Math.max(1,rect.width); height=Math.max(1,rect.height); dpr=Math.min(devicePixelRatio||1,2); canvas.width=Math.round(width*dpr); canvas.height=Math.round(height*dpr); canvas.style.width=`${width}px`; canvas.style.height=`${height}px`; context.setTransform(dpr,0,0,dpr,0,0); if(pw>1&&ph>1){ const sx=width/pw,sy=height/ph; particles.forEach(p=>{p.x*=sx;p.y*=sy}); food.forEach(f=>{f.x*=sx;f.y*=sy}); } fieldClearPending=true; }
const key=(x,y)=>`${x}:${y}`;
function gridFor(items,cell){ const grid=new Map(); for(const item of items){ const k=key(Math.floor(item.x/cell),Math.floor(item.y/cell)); const bucket=grid.get(k); bucket?bucket.push(item):grid.set(k,[item]); } return grid; }
function interaction(a,b){ return config.matrix ? (config.matrix[a.type]?.[b.type]??0) : a.type===b.type?config.kin:config.stranger; }
function pointerForce(p){ let fx=0,fy=0,influence=0; for(const pointer of activePointers.values()){ if(!['pull','push'].includes(pointer.mode))continue; const dx=pointer.x-p.x,dy=pointer.y-p.y,d2=dx*dx+dy*dy,r=170; if(d2<=1||d2>r*r)continue; const d=Math.sqrt(d2),fall=1-d/r,dir=pointer.mode==='pull'?1:-1,force=dir*fall*fall*.34; fx+=dx/d*force;fy+=dy/d*force;influence+=Math.abs(force);} return{fx,fy,influence}; }
function consumeFood(p){ let best=-1,bestD=14*14; for(let i=0;i<food.length;i++){ const dx=food[i].x-p.x,dy=food[i].y-p.y,d=dx*dx+dy*dy; if(d<bestD){best=i;bestD=d;} } if(best>=0){ p.energy=clamp(p.energy+food[best].energy,0,2.4); food.splice(best,1); return true; } return false; }

function stepSimulation(delta=1){
  if(!particles.length)return;
  const reach=config.reach, cell=Math.max(24,reach), grid=gridFor(particles,cell), births=[], dead=[];
  for(const p of particles){
    const cx=Math.floor(p.x/cell),cy=Math.floor(p.y/cell), personalReach=reach*p.genome.sense; let fx=0,fy=0,neighbors=0,kinForce=0,otherForce=0;
    for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++){ const bucket=grid.get(key(cx+ox,cy+oy)); if(!bucket)continue; for(const q of bucket){ if(q===p)continue; const dx=q.x-p.x,dy=q.y-p.y,d2=dx*dx+dy*dy; if(d2<=.001||d2>personalReach*personalReach)continue; const d=Math.sqrt(d2),nx=dx/d,ny=dy/d,n=d/personalReach; let force=d<9?-(1-d/9)*.62:0; const strength=interaction(p,q); force+=strength>=0?strength*Math.sin(Math.PI*n)*.052:strength*Math.pow(1-n,1.4)*.095; fx+=nx*force;fy+=ny*force; const swirl=config.swirl*Math.sin(Math.PI*n)*.024;fx+=-ny*swirl;fy+=nx*swirl;neighbors++; if(p.type===q.type)kinForce+=Math.abs(force);else otherForce+=Math.abs(force); } }
    const pf=pointerForce(p);fx+=pf.fx;fy+=pf.fy; let wall=0; const edge=42; if(p.x<edge){const f=(edge-p.x)/edge*.18;fx+=f;wall+=f}else if(p.x>width-edge){const f=(p.x-(width-edge))/edge*.18;fx-=f;wall+=f} if(p.y<edge){const f=(edge-p.y)/edge*.18;fy+=f;wall+=f}else if(p.y>height-edge){const f=(p.y-(height-edge))/edge*.18;fy-=f;wall+=f}
    p.pulse+=.04*delta; const na=p.pulse*.73+p.id*1.917;fx+=Math.cos(na)*config.noise;fy+=Math.sin(na)*config.noise;
    p.vx=(p.vx+fx*delta)*Math.pow(config.drag,delta);p.vy=(p.vy+fy*delta)*Math.pow(config.drag,delta); const max=config.maxSpeed*p.genome.speed,s2=p.vx*p.vx+p.vy*p.vy;if(s2>max*max){const s=max/Math.sqrt(s2);p.vx*=s;p.vy*=s} p.x+=p.vx*delta;p.y+=p.vy*delta;
    const pad=13;if(p.x<pad){p.x=pad;p.vx=Math.abs(p.vx)*.72}else if(p.x>width-pad){p.x=width-pad;p.vx=-Math.abs(p.vx)*.72}if(p.y<pad){p.y=pad;p.vy=Math.abs(p.vy)*.72}else if(p.y>height-pad){p.y=height-pad;p.vy=-Math.abs(p.vy)*.72}
    p.neighbors=neighbors; const reasons=[['сородичи',kinForce],['другие виды',otherForce],['граница',wall],['поле касания',pf.influence],['турбулентность',config.noise*3]].sort((a,b)=>b[1]-a[1]); p.reason=reasons.filter(r=>r[1]>.012).slice(0,2).map(r=>r[0]).join(' + ')||'инерция';
    if(lifeEnabled){ p.age+=.0075*delta; const movement=Math.sqrt(s2); p.energy=clamp(p.energy-(.00016+movement*.00012)*delta/p.genome.efficiency,0,2.4); const ate=consumeFood(p); if(ate)p.reason='поглощение ресурса'; if(p.energy>1.45&&neighbors>=2&&neighbors<=9&&particles.length+births.length<MAX_PARTICLES&&Math.random()<.00034*delta*p.genome.fertility){ p.energy*=.58; const mutation=Math.random()<.025; const child=createParticle(p.x+randomBetween(-7,7),p.y+randomBetween(-7,7),mutation?(p.type+1+Math.floor(Math.random()*2))%3:p.type,.65,p); births.push(child); } if(p.age>p.maxAge||p.energy<=.02)dead.push(p.id); }
  }
  if(dead.length){const set=new Set(dead);particles=particles.filter(p=>!set.has(p.id));if(selectedParticleId&&set.has(selectedParticleId))closeInspector()} if(births.length)particles.push(...births);
  if(lifeEnabled&&food.length<MAX_FOOD&&Math.random()<.08*delta)addFood(randomBetween(15,width-15),randomBetween(15,height-15));
  simTime+=.01667*delta;elements.empty.hidden=particles.length>0;
}

function colorFor(p){ if(viewMode==='energy'){ const t=clamp(p.energy/1.7,0,1); return `hsl(${15+110*t} 60% ${42+10*t}%)`; } if(viewMode==='generation'){ const h=(p.generation*33+p.type*95)%360; return `hsl(${h} 58% 46%)`; } return SPECIES_COLORS[p.type]; }
function drawFood(){ context.save(); for(const f of food){ f.phase+=.025; const r=2.1+Math.sin(f.phase)*.5; context.globalAlpha=.72;context.fillStyle='#4e7353';context.beginPath();context.arc(f.x,f.y,r,0,TAU);context.fill(); context.globalAlpha=.14;context.beginPath();context.arc(f.x,f.y,r+4,0,TAU);context.fill(); } context.restore(); }
function drawParticle(p){ const color=colorFor(p), speedValue=Math.hypot(p.vx,p.vy),radius=3+clamp(p.energy,0,1.8)*1.2; if(!reducedMotion&&speedValue>.5){context.globalAlpha=clamp(speedValue/5,.08,.24);context.strokeStyle=color;context.lineWidth=radius*.75;context.beginPath();context.moveTo(p.x,p.y);context.lineTo(p.x-p.vx*4.6,p.y-p.vy*4.6);context.stroke()} context.globalAlpha=.96;context.fillStyle=color;context.strokeStyle='#171714';context.lineWidth=.65;context.beginPath();if(p.type===0)context.arc(p.x,p.y,radius,0,TAU);else if(p.type===1)context.rect(p.x-radius,p.y-radius,radius*2,radius*2);else{context.moveTo(p.x,p.y-radius*1.15);context.lineTo(p.x+radius,p.y+radius*.8);context.lineTo(p.x-radius,p.y+radius*.8);context.closePath()}context.fill();context.stroke(); }
function drawPointers(){context.save();for(const pointer of activePointers.values()){if(!['pull','push'].includes(pointer.mode))continue;const color=pointer.mode==='pull'?'#176f7d':'#dc4a32';context.strokeStyle=color;context.globalAlpha=.38;context.lineWidth=1.2;for(const r of[26,54,88]){context.beginPath();context.arc(pointer.x,pointer.y,r,0,TAU);context.stroke()}}context.restore()}
function drawSelected(){if(!selectedParticleId)return;const p=particles.find(x=>x.id===selectedParticleId);if(!p)return;context.save();context.strokeStyle='#171714';context.lineWidth=1.4;context.setLineDash([4,4]);context.beginPath();context.arc(p.x,p.y,13+Math.sin(performance.now()/180)*2,0,TAU);context.stroke();context.restore()}
function renderField(){context.save();if(fieldClearPending||reducedMotion){context.globalAlpha=1;context.fillStyle='#f2eddc';context.fillRect(0,0,width,height);fieldClearPending=false}else{context.globalAlpha=.2+mutationWave*.13;context.fillStyle='#f2eddc';context.fillRect(0,0,width,height)}if(mutationWave>.001){context.globalAlpha=mutationWave*.08;context.fillStyle='#dc4a32';context.fillRect(0,0,width,height);mutationWave*=.92}drawFood();particles.forEach(drawParticle);context.globalAlpha=1;drawPointers();drawSelected();context.restore()}
function updateReadouts(){elements.population.textContent=particles.length;elements.food.textContent=food.length;elements.time.textContent=simTime<1000?simTime.toFixed(1):`${(simTime/1000).toFixed(1)}k`;const counts=[0,0,0];particles.forEach(p=>counts[p.type]++);counts.forEach((v,i)=>elements.species[i].textContent=v)}
function updateInspector(){if(!selectedParticleId||!elements.inspector.classList.contains('is-open'))return;const p=particles.find(x=>x.id===selectedParticleId);if(!p){closeInspector();return}elements.inspectTitle.textContent=`${SPECIES_NAMES[p.type]} №${p.id}`;elements.inspectAge.textContent=p.age.toFixed(1);elements.inspectEnergy.textContent=`${Math.round(clamp(p.energy/1.7,0,1)*100)}%`;elements.inspectNeighbors.textContent=p.neighbors;elements.inspectGeneration.textContent=p.generation;elements.inspectSpeed.textContent=`${p.genome.speed.toFixed(2)}×`;elements.inspectSense.textContent=`${p.genome.sense.toFixed(2)}×`;elements.inspectReason.textContent=`Сейчас движение сильнее всего определяют: ${p.reason}. Экономность ${p.genome.efficiency.toFixed(2)}×, плодовитость ${p.genome.fertility.toFixed(2)}×.`}
function animationLoop(now){const delta=clamp((now-lastFrame)/16.667,.2,2.4);lastFrame=now;frameCounter++;renderedFrames++;if(!paused&&document.visibilityState==='visible')for(let i=0;i<speed;i++)stepSimulation(delta);renderField();if(now-sampleAt>=500){elements.fps.textContent=Math.round(frameCounter*1000/(now-sampleAt));frameCounter=0;sampleAt=now;updateReadouts()}if(now>=inspectRefreshAt){inspectRefreshAt=now+180;updateInspector()}if(renderedFrames===2)elements.loading.classList.add('is-hidden');requestAnimationFrame(animationLoop)}

function nearest(x,y,r=28){let result=null,best=r*r;for(const p of particles){const d=(p.x-x)**2+(p.y-y)**2;if(d<best){best=d;result=p}}return result}
function openInspector(p){if(!p){showToast('Под зондом нет организма');navigator.vibrate?.(6);return}selectedParticleId=p.id;elements.inspector.classList.add('is-open');elements.inspector.setAttribute('aria-hidden','false');updateInspector()}
function closeInspector(){selectedParticleId=null;elements.inspector.classList.remove('is-open');elements.inspector.setAttribute('aria-hidden','true')}
function localPoint(event){const rect=canvas.getBoundingClientRect();return{x:clamp(event.clientX-rect.left,0,rect.width),y:clamp(event.clientY-rect.top,0,rect.height)}}
function seedAt(x,y,count=9){for(let i=0;i<count&&particles.length<MAX_PARTICLES;i++)particles.push(createParticle(x+randomBetween(-11,11),y+randomBetween(-11,11),Math.floor(Math.random()*3),1.2));elements.empty.hidden=particles.length>0;updateReadouts();schedulePersist()}
function eraseAt(x,y,r=34){const r2=r*r;particles=particles.filter(p=>(p.x-x)**2+(p.y-y)**2>r2);food=food.filter(f=>(f.x-x)**2+(f.y-y)**2>r2);if(selectedParticleId&&!particles.some(p=>p.id===selectedParticleId))closeInspector();elements.empty.hidden=particles.length>0;updateReadouts();schedulePersist()}

canvas.addEventListener('pointerdown',event=>{event.preventDefault();const point=localPoint(event);try{canvas.setPointerCapture?.(event.pointerId)}catch{}activePointers.set(event.pointerId,{...point,startX:point.x,startY:point.y,mode:currentTool,lastActionAt:performance.now()});if(currentTool==='seed')seedAt(point.x,point.y,12);else if(currentTool==='food'){addFood(point.x,point.y,8);updateReadouts()}else if(currentTool==='erase')eraseAt(point.x,point.y,38)});
canvas.addEventListener('pointermove',event=>{const pointer=activePointers.get(event.pointerId);if(!pointer)return;event.preventDefault();const point=localPoint(event);pointer.x=point.x;pointer.y=point.y;const now=performance.now();if(pointer.mode==='seed'&&now-pointer.lastActionAt>34){seedAt(point.x,point.y,3);pointer.lastActionAt=now}else if(pointer.mode==='food'&&now-pointer.lastActionAt>45){addFood(point.x,point.y,3);pointer.lastActionAt=now}else if(pointer.mode==='erase'&&now-pointer.lastActionAt>30){eraseAt(point.x,point.y,32);pointer.lastActionAt=now}});
function endPointer(event){const pointer=activePointers.get(event.pointerId);if(!pointer)return;activePointers.delete(event.pointerId);try{canvas.releasePointerCapture?.(event.pointerId)}catch{}if(pointer.mode==='inspect'&&Math.hypot(pointer.x-pointer.startX,pointer.y-pointer.startY)<10)openInspector(nearest(pointer.x,pointer.y))}
canvas.addEventListener('pointerup',endPointer);canvas.addEventListener('pointercancel',endPointer);canvas.addEventListener('lostpointercapture',e=>activePointers.delete(e.pointerId));

document.querySelectorAll('[data-tool]').forEach(button=>button.addEventListener('click',()=>{currentTool=button.dataset.tool;document.querySelectorAll('[data-tool]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));if(currentTool!=='inspect')closeInspector();showToast(`Инструмент «${button.querySelector('span').textContent}» активен`)}));
document.querySelectorAll('[data-preset]').forEach(button=>button.addEventListener('click',()=>applyPreset(button.dataset.preset)));
[elements.kin,elements.stranger,elements.reach,elements.swirl].forEach(input=>input.addEventListener('input',customFromInputs));
elements.pause.addEventListener('click',()=>{paused=!paused;syncControls();schedulePersist();showToast(paused?'Симуляция остановлена':'Симуляция продолжена')});
elements.step.addEventListener('click',()=>{if(paused){stepSimulation(1);renderField();updateReadouts()}});
elements.speed.addEventListener('click',()=>{speed=speed===1?2:speed===2?4:1;syncControls();schedulePersist();showToast(`Скорость ${speed}×`)});
elements.life.addEventListener('click',()=>{lifeEnabled=!lifeEnabled;syncControls();schedulePersist();showToast(lifeEnabled?'Естественный отбор включён':'Рождение, питание и смерть остановлены')});
elements.view.addEventListener('click',()=>{viewMode=viewMode==='species'?'energy':viewMode==='energy'?'generation':'species';fieldClearPending=true;syncControls();schedulePersist();showToast(`Визуализация: ${VIEW_NAMES[viewMode]}`)});
$('#mutation-button').addEventListener('click',mutateRules);elements.undo.addEventListener('click',undoRules);$('#seed-colony-button').addEventListener('click',()=>seedColony(INITIAL_PARTICLES,true));$('#close-inspector').addEventListener('click',closeInspector);
elements.newDish.addEventListener('click',()=>{const now=Date.now();if(now>newDishArmedUntil){newDishArmedUntil=now+3500;elements.newDish.textContent='Нажмите ещё раз';elements.newDish.dataset.armed='true';setTimeout(()=>{if(Date.now()>newDishArmedUntil){elements.newDish.textContent='Новая среда';delete elements.newDish.dataset.armed}},3600);return}newDishArmedUntil=0;elements.newDish.textContent='Новая среда';delete elements.newDish.dataset.armed;simTime=0;seedColony(INITIAL_PARTICLES,true);navigator.vibrate?.(12);showToast('Создана новая среда')});

new ResizeObserver(resizeCanvas).observe(stage);window.addEventListener('resize',resizeCanvas,{passive:true});window.visualViewport?.addEventListener('resize',resizeCanvas,{passive:true});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){activePointers.clear();persistState()}else{lastFrame=performance.now();fieldClearPending=true}});window.addEventListener('pagehide',persistState);window.addEventListener('beforeunload',persistState);
window.addEventListener('appdatareset',()=>{presetId='colony';config=normalizeConfig(PRESETS.colony);paused=false;speed=1;lifeEnabled=true;viewMode='species';simTime=0;history=[];seedColony(INITIAL_PARTICLES,true);syncControls()});
createWorkshopMode({appName:'Лаборатория эмерджентности',version:APP_VERSION,cachePrefix:'emergence-lab-',storageNamespace:STORAGE_NAMESPACE,onReset(){storage.reset();window.dispatchEvent(new CustomEvent('appdatareset'))}});
watchConnectivity(online=>{document.documentElement.dataset.network=online?'online':'offline';const label=$('#network-state span');if(label)label.textContent=online?'в сети':'готово офлайн'});
resizeCanvas();restoreWorld(storage.get('world'));syncControls();updateReadouts();requestAnimationFrame(animationLoop);
