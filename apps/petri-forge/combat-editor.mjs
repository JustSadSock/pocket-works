import {presetRules,validateCombatRules,addArenaObject,serializeCombatRules,importCombatRules} from './combat-rules.mjs';
import {CW,CH,arenaWalls} from './combat-core.mjs';
const SESSION='pocket-works:petri-forge:combat-current-v1',LIBRARY='pocket-works:petri-forge:combat-scenes-v1';
const bounds={hp:[60,220,10],speed:[70,220,10],energyRegen:[3,35,1],bolt:[5,55,1],dash:[20,120,5],shield:[10,75,1],strike:[8,65,1],mine:[8,65,1],heal:[8,60,1]};
const labels={hp:'Здоровье',speed:'Скорость',energyRegen:'Энергия / сек',bolt:'Импульс',dash:'Рывок',shield:'Щит',strike:'Удар',mine:'Мина',heal:'Ремонт'};
const clone=x=>JSON.parse(JSON.stringify(x)),read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))||fallback}catch{return fallback}};
export function mountCombatEditor({panel,canvas,onChange=()=>{},notify=()=>{}}){
 let rules;try{rules=validateCombatRules(read(SESSION,presetRules('duel')))}catch{rules=presetRules('duel')}
 let past=[],future=[],editing=false,busy=false;
 const root=document.createElement('section');root.className='lab-group combat-studio';root.innerHTML="\n<div class=\"lab-title\"><h2>Конструктор боёв</h2><span id=\"studioCount\">0 объектов</span></div>\n<label class=\"stack\">Шаблон <select id=\"studioPreset\"><option value=\"duel\">Тактическая дуэль</option><option value=\"control\">Захват центра</option><option value=\"score\">Охота за очками</option></select></label>\n<div class=\"split form-spacing\">\n<label class=\"stack\">Победа <select id=\"studioMode\"><option value=\"elimination\">Уничтожение</option><option value=\"control\">Захват точки</option><option value=\"score\">Урон</option></select></label>\n<label class=\"stack\">Время, с <input id=\"studioTime\" type=\"number\" min=\"10\" max=\"120\"></label>\n</div>\n<label class=\"stack form-spacing\" id=\"studioScoreWrap\">Целевой счёт <input id=\"studioScore\" type=\"number\" min=\"20\" max=\"600\"></label>\n<div class=\"studio-toolbar\"><button id=\"studioEdit\" class=\"btn-outline\">✎ Рисовать на арене</button><button id=\"studioUndo\">↶</button><button id=\"studioRedo\">↷</button></div>\n<label class=\"stack\" id=\"studioBrushWrap\" hidden>Инструмент <select id=\"studioBrush\"><option value=\"wall\">■ Укрытие</option><option value=\"danger\">● Опасная зона</option><option value=\"point\">◎ Точка захвата</option><option value=\"erase\">⌫ Стереть объект</option></select></label>\n<p id=\"studioHint\" class=\"minor\" hidden>Нажмите на поле, чтобы разместить объект. Стартовые зоны бойцов остаются свободными.</p>\n<details><summary>Характеристики сторон</summary><div id=\"studioStats\"></div></details>\n<details><summary>Силы способностей</summary><div id=\"studioPowers\"></div></details>\n<div class=\"studio-storage\">\n<label class=\"stack\">Имя эксперимента <input id=\"studioName\" maxlength=\"64\"></label>\n<div class=\"split actions\"><button id=\"studioSave\">Сохранить арену</button><button id=\"studioExport\">Экспорт JSON</button></div>\n<label class=\"stack form-spacing\">Библиотека <select id=\"studioLibrary\"></select></label>\n<div class=\"split actions\"><button id=\"studioLoad\">Загрузить</button><button id=\"studioDelete\">Удалить</button></div>\n<label class=\"file-import\">Импортировать правила JSON<input id=\"studioImport\" type=\"file\" accept=\".json,application/json\"></label>\n</div>";
 panel.querySelector('.lab-group').before(root);
 const $=id=>root.querySelector('#'+id),inputs=[];
 function control(parent,side,key){
  const [min,max,step]=bounds[key],wrap=document.createElement('label');wrap.className='studio-param';
  const name=document.createElement('span');name.textContent=labels[key];
  const range=document.createElement('input');range.type='range';range.min=min;range.max=max;range.step=step;
  const output=document.createElement('output');wrap.append(name,range,output);$(parent).append(wrap);
  range.oninput=()=>output.textContent=range.value;
  range.onchange=()=>commit(next=>{if(side===null)next.skillPower[key]=Number(range.value);else next.teams[side][key]=Number(range.value)});
  inputs.push({side,key,range,output});
 }
 for(const side of [0,1]){
  const title=document.createElement('p');title.className='studio-team-heading';title.textContent='КОМАНДА '+(side+1);
  $('studioStats').append(title);for(const key of ['hp','speed','energyRegen'])control('studioStats',side,key);
 }
 for(const key of ['bolt','dash','shield','strike','mine','heal'])control('studioPowers',null,key);
 function refresh(){
  $('studioName').value=rules.name;$('studioMode').value=rules.mode;$('studioTime').value=rules.limitSeconds;
  $('studioScore').value=rules.targetScore||75;$('studioScoreWrap').hidden=rules.mode==='elimination';
  $('studioCount').textContent=rules.walls.length+' стен · '+rules.zones.length+' зон';
  for(const {side,key,range,output} of inputs){const v=side===null?rules.skillPower[key]:rules.teams[side][key];range.value=v;output.textContent=v}
 }
 function preview(){
  const ctx=canvas.getContext('2d');if(!ctx)return;
  ctx.fillStyle='#182c22';ctx.fillRect(0,0,CW,CH);ctx.strokeStyle='#435b49';ctx.lineWidth=1;
  for(let x=0;x<CW;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,CH);ctx.stroke()}
  for(let y=0;y<CH;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(CW,y);ctx.stroke()}
  for(const w of [...arenaWalls(document.getElementById('battleArena').value),...rules.walls]){
   ctx.fillStyle='#0d1f17';ctx.fillRect(w.x+7,w.y+7,w.w,w.h);
   ctx.fillStyle='#78917e';ctx.fillRect(w.x,w.y,w.w,w.h);
   ctx.strokeStyle='#b7cba7';ctx.lineWidth=2;ctx.strokeRect(w.x,w.y,w.w,w.h)
  }
  for(const z of rules.zones){ctx.fillStyle='rgba(228,99,63,.28)';ctx.beginPath();ctx.arc(z.x,z.y,z.r,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#f1ae83';ctx.lineWidth=2;ctx.stroke()}
  if(rules.mode==='control'){const p=rules.point;ctx.fillStyle='rgba(164,207,151,.25)';ctx.strokeStyle='#c6edaa';ctx.lineWidth=3;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();ctx.stroke()}
  for(const team of [0,1])for(const y of [163,317]){ctx.strokeStyle=team?'#d68f6f':'#93d2d2';ctx.lineWidth=2;ctx.setLineDash([5,5]);ctx.strokeRect((team?690:110)-20,y-20,40,40);ctx.setLineDash([])}
  ctx.fillStyle='#e1eed8';ctx.font='bold 15px system-ui';ctx.fillText('РЕДАКТОР • '+rules.name,16,26);
 }
 function changed(){
  refresh();try{localStorage.setItem(SESSION,JSON.stringify(rules))}catch{notify('Локальные сохранения недоступны')}
  onChange(rules,editing);if(editing)preview();
 }
 function commit(change){
  if(busy){notify('Остановите обучение перед изменением мира');return;}
  const before=clone(rules),next=clone(rules);
  try{change(next);const checked=validateCombatRules(next);if(JSON.stringify(before)===JSON.stringify(checked))return;
   rules=checked;past.push(before);if(past.length>45)past.shift();future=[];changed();
  }catch(e){notify(e.message);refresh()}
 }
 function toggle(value){
  editing=!!value&&!busy;$('studioEdit').textContent=editing?'✓ Завершить рисование':'✎ Рисовать на арене';
  $('studioBrushWrap').hidden=!editing;$('studioHint').hidden=!editing;
  canvas.style.cursor=editing?'crosshair':'default';if(editing)preview();else onChange(rules,false);
 }
 $('studioEdit').onclick=()=>toggle(!editing);
 $('studioPreset').onchange=()=>{
  const id=$('studioPreset').value;if(!confirm('Заменить настройки выбранным шаблоном?'))return;
  commit(next=>Object.assign(next,presetRules(id)));toggle(true);
 };
 $('studioMode').onchange=()=>commit(next=>{next.mode=$('studioMode').value;next.targetScore=next.mode==='elimination'?0:next.mode==='control'?75:180});
 $('studioTime').onchange=()=>commit(next=>{next.limitSeconds=Number($('studioTime').value)});
 $('studioScore').onchange=()=>commit(next=>{next.targetScore=Number($('studioScore').value)});
 $('studioName').onchange=()=>commit(next=>{next.name=$('studioName').value.trim()||'Мой бой'});
 $('studioUndo').onclick=()=>{if(!past.length||busy)return;future.push(clone(rules));rules=past.pop();changed()};
 $('studioRedo').onclick=()=>{if(!future.length||busy)return;past.push(clone(rules));rules=future.pop();changed()};
 canvas.addEventListener('pointerdown',e=>{
  if(!editing||busy)return;e.preventDefault();
  const rect=canvas.getBoundingClientRect(),x=(e.clientX-rect.left)*CW/rect.width,y=(e.clientY-rect.top)*CH/rect.height;
  commit(next=>Object.assign(next,addArenaObject(next,$('studioBrush').value,x,y)));
 });
 function updateLibrary(){
  const models=read(LIBRARY,{}),select=$('studioLibrary'),old=select.value;select.replaceChildren();
  for(const [id,value] of Object.entries(models)){try{validateCombatRules(value)}catch{continue}
   const opt=document.createElement('option');opt.value=id;opt.textContent=value.name;select.append(opt)}
  if(select.querySelector('option[value="'+old+'"]'))select.value=old;
  if(!select.options.length){const opt=document.createElement('option');opt.value='';opt.textContent='Нет сохранений';select.append(opt)}
 }
 $('studioSave').onclick=()=>{
  try{const models=read(LIBRARY,{}),id='map-'+Date.now().toString(36);
   models[id]=validateCombatRules(rules);localStorage.setItem(LIBRARY,JSON.stringify(models));
   updateLibrary();$('studioLibrary').value=id;notify('Арена сохранена');
  }catch(e){notify('Ошибка сохранения: '+e.message)}
 };
 $('studioLoad').onclick=()=>{
  const model=read(LIBRARY,{})[$('studioLibrary').value];if(!model){notify('Выберите арену');return}
  commit(next=>Object.assign(next,validateCombatRules(model)));toggle(true);
 };
 $('studioDelete').onclick=()=>{
  const id=$('studioLibrary').value;if(!id||!confirm('Удалить сохранённую арену?'))return;
  const models=read(LIBRARY,{});delete models[id];
  try{localStorage.setItem(LIBRARY,JSON.stringify(models));updateLibrary();notify('Арена удалена')}catch(e){notify(e.message)}
 };
 $('studioExport').onclick=()=>{
  try{const url=URL.createObjectURL(new Blob([serializeCombatRules(rules)],{type:'application/json'})),a=document.createElement('a');
   a.href=url;a.download='petri-combat-rules.json';document.body.append(a);a.click();a.remove();
   setTimeout(()=>URL.revokeObjectURL(url),1000);notify('Правила экспортированы')
  }catch(e){notify(e.message)}
 };
 $('studioImport').onchange=async event=>{
  const file=event.target.files?.[0];event.target.value='';if(!file)return;
  if(file.size>30000){notify('Файл превышает 30 КБ');return}
  try{const parsed=importCombatRules(await file.text());commit(next=>Object.assign(next,parsed));toggle(true);notify('Правила импортированы')}
  catch(e){notify('Ошибка импорта: '+e.message)}
 };
 updateLibrary();refresh();
 return {getRules:()=>clone(rules),isEditing:()=>editing,paintPreview:preview,finishEdit:()=>toggle(false),
 setBusy(v){busy=v;if(busy&&editing)toggle(false);for(const input of root.querySelectorAll('input,select,button'))input.disabled=busy}};
}
