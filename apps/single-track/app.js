import {installMobileRuntime} from '../../shared/mobile-runtime.js';
import {createWorkshopMode} from '../../shared/workshop-mode.js';
import {levels,slots,conflicts,evaluate,optimum,valid} from './core.mjs';
installMobileRuntime();
const key='pocket-works:single-track:state', $=x=>document.getElementById(x);
let level=0,plans=levels.map(()=>({})),selected='A',storageFailed=false;
try{const s=JSON.parse(localStorage.getItem(key)||'null');if(s&&Number.isInteger(s.level)&&levels[s.level]&&Array.isArray(s.plans)&&s.plans.length===levels.length){level=s.level;plans=s.plans.map((p,i)=>p&&typeof p==='object'&&valid(levels[i],p)?p:{});}}catch{}
function save(){try{localStorage.setItem(key,JSON.stringify({level,plans}));storageFailed=false}catch{storageFailed=true}}
function button(label,fn){const b=document.createElement('button');b.textContent=label;b.dataset.nativePress='';b.onclick=fn;return b}
function change(i){level=i;selected=levels[i][0].id;save();render()}
function render(){const ts=levels[level],p=plans[level],bad=conflicts(ts,p),r=evaluate(ts,p),t=ts.find(t=>t.id===selected)||ts[0];selected=t.id;
$('levels').replaceChildren(...levels.map((_,i)=>{const b=button('Задача '+(i+1),()=>change(i));b.setAttribute('aria-pressed',String(i===level));return b}));
$('axis').replaceChildren(document.createElement('span'),...Array.from({length:slots},(_,i)=>{const s=document.createElement('span');s.textContent=i+1;return s}));
$('trains').replaceChildren(...ts.map(train=>{const row=document.createElement('div');row.className='train';const b=button(train.id,()=>{selected=train.id;render()});b.setAttribute('aria-pressed',String(train.id===selected));b.setAttribute('aria-label','Поезд '+train.id);row.append(b);for(let i=0;i<slots;i++){const c=document.createElement('span');if(i>=train.earliest&&i<train.latest+train.duration)c.className='window';if(p[train.id]!=null&&i>=p[train.id]&&i<p[train.id]+train.duration)c.className='occupied '+(bad.has(train.id)?'conflict':'');row.append(c)}return row}));
$('selected').textContent='Поезд '+t.id+' · '+t.duration+' интервала · штраф '+t.weight+' за задержку';
$('times').replaceChildren(...Array.from({length:t.latest-t.earliest+1},(_,i)=>{const s=t.earliest+i,b=button(String(s+1),()=>{p[t.id]=s;save();render()});b.disabled=s+t.duration>slots;b.setAttribute('aria-pressed',String(p[t.id]===s));return b}));
$('remove').disabled=p[t.id]==null;$('result').textContent=(bad.size?'Конфликт: '+[...bad].join(', '):r.complete?'График готов! Штраф '+r.score+' · минимум '+optimum(ts)+(r.score===optimum(ts)?' · идеально':''): 'Назначено '+ts.filter(t=>p[t.id]!=null).length+' из '+ts.length)+(storageFailed?' · сохранение недоступно':'');$('next').disabled=!r.complete||level===levels.length-1}
$('remove').onclick=()=>{delete plans[level][selected];save();render()};$('reset').onclick=()=>{plans[level]={};save();render()};$('next').onclick=()=>change(level+1);render();
createWorkshopMode({appName:'ОДНОПУТКА',version:'1.0.0',cachePrefix:'single-track-',storageNamespace:'pocket-works:single-track',onReset(){plans=levels.map(()=>({}));change(0)}});
