import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { watchConnectivity } from '../../shared/pwa-utils.js';
import {levels,slots,pieces,payload,valid,evaluate,place} from './core.mjs';
installMobileRuntime();
const $=id=>document.getElementById(id),ns='pocket-works:pereves:state';
let level=0,plans=levels.map(()=>({})),histories=levels.map(()=>[]),selected='0-0',message='',saveError=false,previousTilt=[],previousLevel=-1;
try{const s=JSON.parse(localStorage.getItem(ns)||'null');if(s&&Number.isInteger(s.level)&&levels[s.level]&&Array.isArray(s.plans)&&s.plans.length===levels.length){level=s.level;plans=s.plans.map((p,i)=>valid(levels[i],p)?p:{});selected=pieces(levels[level])[0].id}}catch{}
function save(){try{localStorage.setItem(ns,JSON.stringify({level,plans}));saveError=false}catch{saveError=true}}
function button(label,fn){const b=document.createElement('button');b.type='button';b.textContent=label;b.dataset.nativePress='';b.onclick=fn;return b}
function switchLevel(i){level=i;selected=pieces(levels[i])[0].id;message='';save();render()}
function change(id,s){const l=levels[level],p=plans[level],q=place(l,p,id,s);if(JSON.stringify(p)===JSON.stringify(q)){message='Выбери свободное место на нужной перекладине.';render();return}histories[level].push({...p});if(histories[level].length>100)histories[level].shift();plans[level]=q;message='';save();render()}
function render(){
const l=levels[level],p=plans[level],ps=pieces(l),r=evaluate(l,p),sel=ps.find(w=>w.id===selected)||ps[0];selected=sel.id;
$('title').textContent=l.name;$('edition').textContent='СКУЛЬПТУРА '+String(level+1).padStart(2,'0')+' / '+levels.length;
$('level-list').replaceChildren(...levels.map((_,i)=>{const b=button(String(i+1)+(evaluate(levels[i],plans[i]).win?' ✓':''),()=>switchLevel(i));b.setAttribute('aria-pressed',String(i===level));return b}));
$('selection').textContent='Выбран '+sel.mass+' · '+(sel.beam===0?'верх':'низ');
$('moment').textContent=r.torque.map((t,i)=>(i===0?'Верх':'Низ')+' '+(t>0?'+':'')+t).join(' / ');
$('progress').textContent=r.placed+' / '+ps.length+' грузов';
const rows=l.beams.length===1?[180]:[100,272],tilt=r.torque.map(t=>Math.max(-8,Math.min(8,t*1.15)));
const prior=previousLevel===level?previousTilt:tilt;previousTilt=tilt.slice();previousLevel=level;
let out='<path d="M180 0V'+rows[0]+'" class="suspension"/>';
if(l.anchor!==null){const a=tilt[0]*Math.PI/180,x=180+l.anchor*43*Math.cos(a),y=rows[0]+l.anchor*43*Math.sin(a);out+='<path d="M'+x+' '+y+' L180 '+rows[1]+'" class="suspension"/>'}
for(let b=0;b<rows.length;b++){
const y=rows[b],a=tilt[b];out+='<g class="beam" style="transform-origin:180px '+y+'px;--from:'+ (prior[b]??a)+'deg;--to:'+a+'deg;transform:rotate('+a+'deg)"><path d="M38 '+y+'H322" class="rod"/><circle cx="180" cy="'+y+'" r="6" class="pivot"/>';
for(const s of slots){const x=180+s*43,w=ps.find(w=>w.beam===b&&p[w.id]===s),anchor=b===0&&s===l.anchor;out+='<text x="'+x+'" y="'+(y-16)+'" class="slot-number" text-anchor="middle">'+(s>0?'+':'')+s+'</text>';if(anchor){out+='<rect x="'+(x-9)+'" y="'+(y-7)+'" width="18" height="14" rx="3" class="anchor"/><text x="'+x+'" y="'+(y+23)+'" class="mass-label" text-anchor="middle">↓'+payload(l,p)+'</text>';continue}
out+='<g data-slot="'+s+'" data-beam="'+b+'" tabindex="0" role="button" aria-label="'+(b===0?'Верх':'Низ')+', место '+s+(w?', груз '+w.mass:'')+'" class="slot '+(sel.beam===b?'eligible':'')+'"><rect x="'+(x-21)+'" y="'+(y-12)+'" width="42" height="91" fill="transparent"/><circle cx="'+x+'" cy="'+y+'" r="8" class="hole"/>';
if(w){const radius=11+w.mass*1.45;out+='<path d="M'+x+' '+y+'V'+(y+29)+'" class="thread"/><circle cx="'+x+'" cy="'+(y+29+radius)+'" r="'+radius+'" class="weight weight-'+b+(w.id===selected?' selected':'')+'"/><text x="'+x+'" y="'+(y+33+radius)+'" text-anchor="middle" class="weight-number">'+w.mass+'</text>'}else out+='<path d="M'+x+' '+(y+10)+'v15" class="empty-thread"/>';out+='</g>'}
out+='</g>'}
$('mobile').innerHTML=out;
$('mobile').querySelectorAll('[data-slot]').forEach(g=>{const act=()=>{const b=Number(g.dataset.beam),s=Number(g.dataset.slot);if(sel.beam===b)change(sel.id,s);else{const w=ps.find(w=>w.beam===b&&p[w.id]===s);if(w){selected=w.id;message='';render()}else{message='Этот груз принадлежит другой перекладине.';render()}}};g.addEventListener('click',act);g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();act()}})});
$('tray').replaceChildren(...ps.map(w=>{const el=button('',()=>{selected=w.id;message='';render()});el.className='piece piece-'+w.beam+(p[w.id]!=null?' hung':'');el.innerHTML='<b>'+w.mass+'</b><small>'+(w.beam===0?'В':'Н')+(p[w.id]!=null?' · '+(p[w.id]>0?'+':'')+p[w.id]:'')+'</small>';el.setAttribute('aria-label','Груз '+w.mass+', '+(w.beam===0?'верх':'низ'));el.setAttribute('aria-pressed',String(w.id===selected));return el}));
$('remove').disabled=p[selected]==null;$('undo').disabled=!histories[level].length;$('restart').disabled=!r.placed;$('next').disabled=!r.win||level===levels.length-1;
$('status').textContent=(r.win?'Равновесие. Скульптура собрана!':message||'Отрицательный момент тянет влево, положительный — вправо.')+(saveError?' Сохранение недоступно.':'');$('status').classList.toggle('won',r.win)
}
$('remove').onclick=()=>change(selected,null);$('undo').onclick=()=>{const p=histories[level].pop();if(p){plans[level]=p;message='';save();render()}};$('restart').onclick=()=>{if(Object.keys(plans[level]).length){histories[level].push({...plans[level]});plans[level]={};message='';save();render()}};$('next').onclick=()=>{if(evaluate(levels[level],plans[level]).win&&level<levels.length-1)switchLevel(level+1)};
createWorkshopMode({appName:'ПЕРЕВЕС',version:'1.0.0',cachePrefix: 'pereves-',storageNamespace: 'pocket-works:pereves',onReset(){plans=levels.map(()=>({}));histories=levels.map(()=>[]);switchLevel(0)}});watchConnectivity(online=>document.documentElement.dataset.network=online?'online':'offline');render();
