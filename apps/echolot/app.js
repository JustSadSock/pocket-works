import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { watchConnectivity } from '../../shared/pwa-utils.js';
import {missions,key,inside,fresh,transition,target} from './core.mjs';
installMobileRuntime();
const $=id=>document.getElementById(id),storage='pocket-works:echolot:state';
let active=0,states=missions.map(fresh),armed=false,storageError=false;
try{const saved=JSON.parse(localStorage.getItem(storage)||'null');if(saved&&Number.isInteger(saved.active)&&missions[saved.active]&&Array.isArray(saved.states)&&saved.states.length===missions.length){active=saved.active;states=saved.states.map((s,i)=>s&&inside(s.x,s.y)&&Number.isInteger(s.oxygen)&&s.oxygen>=0&&s.oxygen<=missions[i].oxygen&&Number.isInteger(s.hull)&&s.hull>=0&&s.hull<=3&&Number.isInteger(s.turns)&&s.turns>=0&&Number.isInteger(s.scans)&&s.scans>=0&&Array.isArray(s.samples)&&s.samples.every(k=>missions[i].samples.some(([x,y])=>key(x,y)===k))&&new Set(s.samples).size===s.samples.length&&Array.isArray(s.known)&&s.known.every(k=>typeof k==='string'&&/^[0-9]+,[0-9]+$/.test(k))&&['active','won','lost'].includes(s.result)&&typeof s.message==='string'?s:fresh(missions[i]));}}catch{}
function save(){try{localStorage.setItem(storage,JSON.stringify({active,states}));storageError=false}catch{storageError=true}}
function switchMission(i){active=i;armed=false;save();render()}
const pos=n=>20+40*n;
function renderRadar(m,s,ping=false){const known=new Set(s.known),found=new Set(s.samples),[tx,ty]=target(m,s),x=pos(s.x),y=pos(s.y),angle=Math.atan2(ty-s.y,tx-s.x)*180/Math.PI;
let out='<defs><radialGradient id="sea"><stop stop-color="#254d62"/><stop offset="1" stop-color="#0e2b3e"/></radialGradient><clipPath id="disc"><circle cx="260" cy="260" r="245"/></clipPath></defs><circle cx="260" cy="260" r="247" fill="url(#sea)" stroke="#87a2ad" stroke-width="2"/><g clip-path="url(#disc)">';
for(const r of [40,80,120,160,200,240])out+='<circle cx="260" cy="260" r="'+r+'" class="ring"/>';
out+='<path d="M260 10V510M10 260H510" class="cross"/>';
for(let i=0;i<36;i++){const a=i*Math.PI/18,rx=Math.cos(a),ry=Math.sin(a);out+='<line x1="'+(260+rx*235)+'" y1="'+(260+ry*235)+'" x2="'+(260+rx*245)+'" y2="'+(260+ry*245)+'" class="tick"/>'}
for(let yy=0;yy<=12;yy++)for(let xx=0;xx<=12;xx++){if(!inside(xx,yy)||!known.has(key(xx,yy)))continue;out+='<circle cx="'+pos(xx)+'" cy="'+pos(yy)+'" r="5" class="seen"/>'}
for(const [rx,ry] of m.rocks)if(known.has(key(rx,ry))){const xx=pos(rx),yy=pos(ry);out+='<path d="M'+(xx-10)+' '+(yy+8)+'l10 -19 10 19Z" class="rock"/>'}
for(const [sx,sy] of m.samples)if(known.has(key(sx,sy))){const xx=pos(sx),yy=pos(sy);out+='<rect x="'+(xx-7)+'" y="'+(yy-7)+'" width="14" height="14" transform="rotate(45 '+xx+' '+yy+')" class="'+(found.has(key(sx,sy))?'collected':'sample')+'"/>'}
out+='<rect x="'+(pos(m.home[0])-10)+'" y="'+(pos(m.home[1])-10)+'" width="20" height="20" class="home"/>';
if(ping)out+='<circle cx="'+x+'" cy="'+y+'" r="12" class="pulse"/>';
if(s.result==='active')out+='<g transform="translate('+x+' '+y+') rotate('+angle+')"><path d="M18 0H58" class="bearing"/><path d="M58 0l-9 -5v10Z" class="arrow"/></g>';
out+='<circle cx="'+x+'" cy="'+y+'" r="13" class="sub-halo"/><circle cx="'+x+'" cy="'+y+'" r="7" class="sub"/>';
out+='</g><text x="260" y="33" class="compass" text-anchor="middle">N</text><text x="490" y="265" class="compass" text-anchor="middle">E</text><text x="260" y="497" class="compass" text-anchor="middle">S</text><text x="30" y="265" class="compass" text-anchor="middle">W</text>';
$('radar').innerHTML=out;
}
function render(ping=false){const m=missions[active],s=states[active];$('mission-number').textContent=String(active+1).padStart(2,'0');$('mission-title').textContent=m.title;$('coords').textContent='X'+String(s.x).padStart(2,'0')+' Y'+String(s.y).padStart(2,'0');$('oxygen').max=m.oxygen;$('oxygen').value=s.oxygen;$('oxygen-text').textContent=s.oxygen+' / '+m.oxygen;$('hull').textContent='●'.repeat(s.hull)+'○'.repeat(3-s.hull);$('samples').textContent=s.samples.length+' / '+m.samples.length;$('turns').textContent='ШАГ '+s.turns+' · PING '+s.scans;$('status').textContent=(armed?'Подтверди новый рейс повторным нажатием.':s.message)+(storageError?' (Сохранение недоступно.)':'');$('restart').textContent=armed?'Подтвердить':s.result==='active'?'Новый рейс':'Повторить рейс';$('next').disabled=s.result!=='won'||active===missions.length-1;document.querySelectorAll('[data-move]').forEach(b=>b.disabled=s.result!=='active');$('scan').disabled=s.result!=='active'||s.oxygen<3;document.querySelectorAll('[data-mission]').forEach((b,i)=>{b.setAttribute('aria-pressed',String(i===active));b.textContent=String(i+1).padStart(2,'0')+(states[i].result==='won'?' ✓':'')});renderRadar(m,s,ping)}
function act(a){armed=false;const old=states[active],next=transition(missions[active],old,a);states[active]=next;save();render(a.type==='scan'&&next.scans>old.scans)}
missions.forEach((m,i)=>{const b=document.createElement('button');b.type='button';b.dataset.mission=String(i);b.dataset.nativePress='';b.setAttribute('aria-label',m.title);b.onclick=()=>switchMission(i);$('missions').append(b)});
document.querySelectorAll('[data-move]').forEach(b=>b.onclick=()=>{const [dx,dy]=b.dataset.move.split(',').map(Number);act({type:'move',dx,dy})});
$('scan').onclick=()=>act({type:'scan'});$('restart').onclick=()=>{if(states[active].result==='active'&&!armed&&states[active].turns>0){armed=true;render();return}states[active]=fresh(missions[active]);armed=false;save();render()};$('next').onclick=()=>{if(states[active].result==='won'&&active<missions.length-1)switchMission(active+1)};
document.addEventListener('keydown',e=>{if(e.altKey||e.ctrlKey||e.metaKey||e.repeat||e.target.closest('button,input,select,textarea,[contenteditable]'))return;const map={ArrowUp:[0,-1],w:[0,-1],ArrowDown:[0,1],s:[0,1],ArrowLeft:[-1,0],a:[-1,0],ArrowRight:[1,0],d:[1,0]};const v=map[e.key]||map[e.key.toLowerCase()];if(v){e.preventDefault();act({type:'move',dx:v[0],dy:v[1]})}else if(e.code==='Space'){e.preventDefault();act({type:'scan'})}});
createWorkshopMode({appName:'ЭХОЛОТ',version:'1.0.0',cachePrefix: 'echolot-',storageNamespace: 'pocket-works:echolot',onReset(){states=missions.map(fresh);active=0;armed=false;save();render()}});
watchConnectivity(online=>document.documentElement.dataset.network=online?'online':'offline');render();