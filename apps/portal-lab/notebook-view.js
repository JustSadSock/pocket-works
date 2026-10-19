import {
 NOTEBOOK_SCHEMA,NOTEBOOK_MAX,MODE_LABELS,createRecord,validateRecords,
 appendRecord,removeRecord,renameRecord,compareRecords,
 exportNotebook,importNotebook
} from './notebook.js';

const $=id=>document.getElementById(id);
const key='pocket-works:portal-lab:experiments-v1';
const escapeHTML=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const N=x=>Number.isFinite(x)?Number(x.toPrecision(6)).toString():'—';
const hh=t=>{try{return new Date(t).toLocaleString('ru-RU',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}catch{return '—'}};
const colors=['#94cab1','#dba782','#f4ddae','#90bdcc','#cea8d0'];
export function createNotebook(canvas,{onSave,onRestore,onAction,onDirty}={}){
 let records=[],filter='all',left='',right='',selected='',confirmDelete='',confirmClear=false,message='',active=false;
 let recordsTimestamp=0;
 try{
  const raw=localStorage.getItem(key);
  if(raw){const data=JSON.parse(raw);records=validateRecords(data.records||[]);}
 }catch(e){message='Предыдущий журнал повреждён. Старые записи не изменялись.';}
 const store=()=>{
  try{localStorage.setItem(key,JSON.stringify({schema:NOTEBOOK_SCHEMA,records}));return true;}
  catch(e){message='Не удалось сохранить журнал: память устройства заполнена или запрещена.';return false;}
 };
 /** Make local disk confirmation part of every archive mutation. */
 function commit(next,success){
  const old=records;
  records=next;
  if(!store()){records=old;return false;}
  message=success;
  return true;
 }
 const latest=()=>records.at(-1);
 const find=id=>records.find(r=>r.id===id);
 const visible=()=>filter==='all'?records:records.filter(x=>x.mode===filter);
 function exportFile(data,name){
  const blob=new Blob([data],{type:'application/json'});
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=name;document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1200);
 }
 function recordName(mode){
  return MODE_LABELS[mode]+' · опыт '+(records.filter(x=>x.mode===mode).length+1);
 }
 function capture(){
  const input=onSave?.();
  if(!input){message='Откройте исследовательский режим, чтобы сохранить опыт.';render();return false;}
  const now=Date.now();
  const record=createRecord({...input,
   id:'exp-'+now.toString(36)+'-'+(++recordsTimestamp).toString(36),
   at:now,title:recordName(input.mode)});
  if(!commit(appendRecord(records,record),'Опыт сохранён вместе с настройками и измерениями.')){render();return false;}
  selected=record.id;if(!left)left=record.id;
  right=record.id;filter='all';confirmDelete='';confirmClear=false;
  onAction?.('mount');render();return true;
 }
 function restore(id){
  const record=find(id);if(!record)return;
  try{onRestore?.(record);message='Исходные параметры восстановлены. Расчёт запускается заново.';onAction?.('mount');}
  catch(e){message='Не удалось восстановить опыт: '+String(e.message||e);render();}
 }
 function render(){
  const shown=visible();
  $('notebook-count').textContent=records.length+'/'+NOTEBOOK_MAX;
  $('notebook-notice').textContent=message||'Выберите опыт или сохраните измерения из другого режима.';
  $('notebook-filter').value=filter;
  $('notebook-list').innerHTML=shown.length?shown.map(r=>{
   const main=Object.values(r.measures)[0];
   return '<div class="notebook-entry'+(selected===r.id?' selected':'')+'" data-id="'+escapeHTML(r.id)+'">'+
   '<div class="notebook-entry-top"><span>'+escapeHTML(MODE_LABELS[r.mode])+'</span><span>'+escapeHTML(hh(r.at))+'</span></div>'+
   '<strong>'+escapeHTML(r.title)+'</strong>'+
   '<div class="notebook-entry-bottom"><span>'+escapeHTML(main?.label||'Эксперимент')+
   ': '+escapeHTML(N(main?.value))+' '+escapeHTML(main?.unit||'')+'</span>'+
   '<button type="button" data-action="select" data-id="'+escapeHTML(r.id)+'">Выбрать</button></div></div>';
  }).join(''):'<div class="notebook-empty"><strong>Записей пока нет</strong><p>Откройте любую лабораторию, проведите эксперимент и нажмите «Сохранить опыт» в верхней панели.</p></div>';
  $('notebook-export').disabled=records.length===0;
  $('notebook-clear').disabled=records.length===0;
  $('notebook-clear').textContent=confirmClear?'Подтвердить очистку':'Очистить журнал';
  $('notebook-import').disabled=false;
  const focused=find(selected);
  $('notebook-detail').hidden=!focused;
  if(focused){
   $('notebook-title').value=focused.title;
   $('notebook-mode').textContent=MODE_LABELS[focused.mode];
   $('notebook-date').textContent=hh(focused.at);
   $('notebook-metrics').innerHTML=Object.values(focused.measures).map(m=>
    '<div><span>'+escapeHTML(m.label)+'</span><strong>'+escapeHTML(N(m.value))+
    ' '+escapeHTML(m.unit)+'</strong></div>').join('');
   $('notebook-delete').textContent=confirmDelete===focused.id?'Подтвердить удаление':'Удалить опыт';
  }
  const choose=id=>'<option value="'+escapeHTML(id||'')+'">'+
   escapeHTML(find(id)?.title||'Выберите опыт')+'</option>';
  const makeOptions=()=>'<option value="">Выберите опыт</option>'+records.map(r=>
   '<option value="'+escapeHTML(r.id)+'">'+escapeHTML(r.title)+'</option>').join('');
  $('notebook-compare-a').innerHTML=makeOptions();
  $('notebook-compare-b').innerHTML=makeOptions();
  $('notebook-compare-a').value=find(left)?left:'';
  $('notebook-compare-b').value=find(right)?right:'';
  if(find(left)&&find(right)&&left!==right){
   const info=compareRecords(find(left),find(right));
   $('notebook-comparison').innerHTML=
    '<div class="notebook-compare-title">'+escapeHTML(info.left.title)+' ↔ '+escapeHTML(info.right.title)+'</div>'+
    '<div class="notebook-compare-captions"><span>ИЗМЕРЕНИЕ</span><span>A</span><span>B</span><span>Δ (B−A)</span></div>'+
    info.rows.map(m=>'<div class="notebook-comparison-row"><span>'+escapeHTML(m.label)+
    ' <small>'+escapeHTML(m.unit)+'</small></span><b>'+escapeHTML(N(m.left))+
    '</b><b>'+escapeHTML(N(m.right))+'</b><b>'+escapeHTML(m.comparable?N(m.delta):'—')+
    '</b></div>').join('')+
    '<p class="notebook-comparison-note">'+info.shared+' сопоставимых показателей. Разные единицы или определения не сравниваются численно.</p>';
  }else $('notebook-comparison').innerHTML=
   '<p class="notebook-comparison-note">Выберите две разные записи. Их исходные измерения останутся неизменными даже после повторного запуска опыта.</p>';
  onDirty?.();
 }
 function setActive(v){active=v;if(v)render();}
 function draw(ctx,w,h){
  if(!active)return;
  const bg=ctx.createLinearGradient(0,0,w,h);bg.addColorStop(0,'#142d2d');bg.addColorStop(1,'#091b23');
  ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
  const pad=w<550?22:45;
  const rows=visible().slice(-16);
  const minH=Math.max(140,h-165),leftX=pad,rightX=w-pad;
  ctx.textBaseline='middle';
  function text(t,x,y,size=12,color='#c7dac7',align='left',weight=500){
   ctx.fillStyle=color;ctx.font=weight+' '+size+'px ui-monospace,Consolas,monospace';ctx.textAlign=align;ctx.fillText(t,x,y);
  }
  text('ЛАБОРАТОРНЫЙ ЖУРНАЛ · '+records.length+' ЗАПИСЕЙ',pad,32,w<550?12:15,'#d6ead7','left',700);
  text('ВРЕМЕННАЯ ЛЕНТА ИЗМЕРЕНИЙ',pad,58,10,'#8eb5a1');
  ctx.strokeStyle='#597f7444';ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(pad,91);ctx.lineTo(rightX,91);ctx.stroke();
  if(!rows.length){
   text('01 / ПОДГОТОВЬТЕ ОПЫТ',pad,145,w<550?13:17,'#e1d5b1');
   text('СОХРАНИТЕ ЕГО ИЗ ЛЮБОГО РЕЖИМА',pad,173,w<550?10:13,'#99c3ae');
   for(let i=0;i<7;i++){
    const x=pad+(rightX-pad)*(i+.5)/7;
    ctx.strokeStyle='#9dd3bb30';ctx.beginPath();ctx.moveTo(x,225);ctx.lineTo(x,h-50);ctx.stroke();
   }
   return;
  }
  const step=(rightX-leftX)/Math.max(1,rows.length),midY=Math.max(172,h*.55);
  rows.forEach((r,i)=>{
   const x=leftX+step*(i+.5),main=Object.values(r.measures)[0],value=main?.value??0;
   const amount=Math.min(1,Math.log1p(Math.abs(value))/Math.log(25));
   const lineY=midY-(amount*(h*.30));
   ctx.strokeStyle='#8ba99c36';ctx.beginPath();ctx.moveTo(x,96);ctx.lineTo(x,h-58);ctx.stroke();
   ctx.fillStyle=colors[['observer','matter','wave','designer','rotation','causality','atlas','map','profile'].indexOf(r.mode)%colors.length];
   ctx.beginPath();ctx.arc(x,midY,4,0,Math.PI*2);ctx.fill();
   ctx.lineWidth=r.id===selected?3:1.3;ctx.strokeStyle=r.id===selected?'#f7e7b8':'#bedcca';
   ctx.beginPath();ctx.moveTo(x,midY);ctx.lineTo(x,lineY);ctx.stroke();
   ctx.beginPath();ctx.arc(x,lineY,r.id===selected?8:5,0,Math.PI*2);ctx.fill();ctx.stroke();
   if(rows.length<=9||r.id===selected)text(String(i+1),x,h-36,10,'#b5cebe','center');
  });
  const pick=find(selected)||rows.at(-1),main=Object.values(pick.measures)[0];
  text('АКТИВНАЯ ЗАПИСЬ',pad,h-115,10,'#96b9aa');
  text(pick.title.slice(0,32),pad,h-86,w<550?14:20,'#e9dfbf','left',700);
  text(main?.label+': '+N(main?.value)+' '+(main?.unit||''),pad,h-58,w<550?11:14,'#b0d3ba');
  text('Высота штриха — log(1 + |первого показателя|), условная шкала.',pad,h-15,9,'#84a79b');
 }
 const byID=id=>records.find(x=>x.id===id);
 $('notebook-capture').addEventListener('click',capture);
 $('notebook-filter').addEventListener('change',e=>{filter=e.target.value;selected=visible().at(-1)?.id||'';render()});
 $('notebook-list').addEventListener('click',e=>{
  const target=e.target.closest('[data-id]');if(!target)return;
  selected=target.dataset.id;confirmDelete='';render();
 });
 $('notebook-restore').addEventListener('click',()=>restore(selected));
 $('notebook-rename').addEventListener('click',()=>{
  try{commit(renameRecord(records,selected,$('notebook-title').value),'Название изменено.');}
  catch(e){message=e.message;}render();
 });
 $('notebook-delete').addEventListener('click',()=>{
  if(!find(selected))return;
  if(confirmDelete!==selected){confirmDelete=selected;render();return;}
  if(!commit(removeRecord(records,selected),'Опыт удалён.')){render();return;}
  selected=latest()?.id||'';
  if(!find(left))left='';if(!find(right))right='';
  confirmDelete='';render();
 });
 $('notebook-clear').addEventListener('click',()=>{
  if(!records.length)return;
  if(!confirmClear){confirmClear=true;render();return;}
  if(!commit([],'Журнал очищен.')){render();return;}
  selected=left=right='';confirmClear=false;render();
 });
 $('notebook-export').addEventListener('click',()=>{
  if(records.length)exportFile(exportNotebook(records),'shov-experiments-v1.json');
  message='Файл журнала сформирован.';render();
 });
 $('notebook-import').addEventListener('click',()=>$('notebook-file').click());
 $('notebook-file').addEventListener('change',async e=>{
  const input=e.target, file=input.files?.[0];
  if(!file)return;
  try{
   if(file.size>250000)throw Error('Файл больше 250 КБ');
   const data=await file.text();
   const merged=importNotebook(data,records,'merge');
   if(commit(merged,'Импорт завершён: '+merged.length+' записей.')){
    selected=records.at(-1)?.id||'';filter='all';
   }
  }catch(e){message='Импорт отклонён: '+e.message;}
  input.value='';render();
 });
 $('notebook-compare-a').addEventListener('change',e=>{left=e.target.value;render()});
 $('notebook-compare-b').addEventListener('change',e=>{right=e.target.value;render()});
 return {setActive,draw,render,capture,
  get snapshot(){return {records:records.map(x=>({...x})),count:records.length,
   selected,compare:{left,right},notice:message};}
 };
}
