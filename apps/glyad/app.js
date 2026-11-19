import {installMobileRuntime} from '../../shared/mobile-runtime.js';
import {DEPTH_W,DEPTH_H,clamp,brush,stamp,fresh,stereogram} from './core.mjs';
installMobileRuntime();
const $=id=>document.getElementById(id),shell=document.querySelector('.app-shell');
const editor=$('depthCanvas'),stereo=$('stereoCanvas'),ectx=editor.getContext('2d',{alpha:false}),sctx=stereo.getContext('2d',{alpha:false});
shell.dataset.view='edit';
const KEY='pocket-works:glyad:relief-v1';
let layer=stamp('heart'),mode='brush',size=14,height=85,seed=12742,palette='mono',stack=[],painting=false,pointerId=null,renderRequested=false;
let toastTimeout=null;
const mobile=()=>matchMedia('(max-width:800px)').matches;
function announce(message){$('status').textContent=message;if(toastTimeout)clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>{$('status').textContent='Сохраняется автоматически · без сети'},3300)}
function pushHistory(){stack.push(layer.slice());if(stack.length>24)stack.shift();$('undo').disabled=false}
function save(){try{const bytes=Array.from(layer);const chunks=[];for(let i=0;i<bytes.length;i+=5000)chunks.push(String.fromCharCode(...bytes.slice(i,i+5000)));localStorage.setItem(KEY,JSON.stringify({data:btoa(chunks.join('')),seed,palette,size,height}));}catch(e){announce('Локальное сохранение недоступно')}}
function restore(){try{const v=JSON.parse(localStorage.getItem(KEY)||'null');if(!v)return;const data=atob(v.data||'');if(data.length===layer.length){layer=Uint8Array.from(data,ch=>ch.charCodeAt(0));seed=Number.isFinite(v.seed)?v.seed:seed;palette=v.palette==='color'?'color':'mono';size=clamp(+v.size||size,4,36);height=clamp(+v.height||height,15,100)}}catch(e){announce('Сохранённый рисунок повреждён; открыт пример')}}
restore();$('undo').disabled=true;
$('size').value=size;$('height').value=height;$('sizeValue').textContent=size;$('heightValue').textContent=height+'%';
$('paletteLabel').textContent=palette==='mono'?'Графит':'Пигмент';
function fit(canvas){const box=canvas.getBoundingClientRect();if(box.width<1||box.height<1)return false;const dpr=Math.min(1.4,window.devicePixelRatio||1);const w=Math.max(1,Math.round(box.width*dpr)),h=Math.max(1,Math.round(box.height*dpr));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h}return true}
function paintEditor(){
 if(!fit(editor))return;
 const img=ectx.createImageData(DEPTH_W,DEPTH_H);const data=img.data;
 for(let y=0;y<DEPTH_H;y++)for(let x=0;x<DEPTH_W;x++){
  const d=layer[y*DEPTH_W+x]/255,k=(y*DEPTH_W+x)*4;
  const contour=d>0.08&&Math.floor(d*7)!==Math.floor((layer[y*DEPTH_W+Math.min(DEPTH_W-1,x+1)]/255)*7);
  if(d<.015){const grid=(x%18===0||y%20===0);data[k]=grid?192:211;data[k+1]=grid?212:229;data[k+2]=grid?201:217}
  else{data[k]=Math.round(206-d*29);data[k+1]=Math.round(222-d*138);data[k+2]=Math.round(211-d*126);if(contour){data[k]=119;data[k+1]=95;data[k+2]=74}}
  data[k+3]=255;
 }
 const buffer=document.createElement('canvas');buffer.width=DEPTH_W;buffer.height=DEPTH_H;buffer.getContext('2d').putImageData(img,0,0);
 ectx.imageSmoothingEnabled=true;ectx.clearRect(0,0,editor.width,editor.height);ectx.drawImage(buffer,0,0,editor.width,editor.height);
 const g=ectx;g.strokeStyle='rgba(30,67,60,.19)';g.lineWidth=1;
 const sc=editor.width/DEPTH_W;g.beginPath();g.moveTo(editor.width/2,0);g.lineTo(editor.width/2,editor.height);g.moveTo(0,editor.height/2);g.lineTo(editor.width,editor.height/2);g.stroke();
 if(cursor){g.strokeStyle=mode==='erase'?'rgba(17,53,49,.65)':'rgba(201,83,53,.9)';g.lineWidth=1.5;g.beginPath();g.arc(cursor.x*editor.width,cursor.y*editor.height,size*sc,0,2*Math.PI);g.stroke()}
}
function paintStereo(){
 if(!fit(stereo))return;
 $('stereoState').textContent='● ГОТОВО';
 try{const data=stereogram(layer,stereo.width,stereo.height,seed,palette);sctx.putImageData(new ImageData(data,stereo.width,stereo.height),0,0)}
 catch(e){$('stereoState').textContent='ОШИБКА';announce('Не удалось собрать изображение')}
 const dots=document.querySelector('.focus-dots');
 if(dots){const sep=Math.max(45,Math.round(stereo.getBoundingClientRect().width/Math.round(stereo.width/95)));dots.style.gap=(sep-10)+'px'}
}
function repaint(includeStereo=true){paintEditor();if(includeStereo)paintStereo()}
function queueStereo(){if(renderRequested)return;renderRequested=true;requestAnimationFrame(()=>{renderRequested=false;paintStereo()})}
let cursor=null;
function position(e){const r=editor.getBoundingClientRect();return{x:clamp((e.clientX-r.left)/r.width,0,1),y:clamp((e.clientY-r.top)/r.height,0,1)}}
function begin(e){if(mobile()&&shell.dataset.view!=='edit')return;if(e.button!==undefined&&e.button!==0)return;if(pointerId!==null)return;e.preventDefault();pointerId=e.pointerId;painting=true;pushHistory();editor.setPointerCapture(e.pointerId);stroke(e)}
function stroke(e){const p=position(e);cursor=p;if(painting){brush(layer,p.x,p.y,size,height*2.55,mode==='erase');paintEditor();$('stereoState').textContent='● ОБНОВЛЯЕТСЯ'}else paintEditor()}
function end(e){if(pointerId!==e.pointerId)return;painting=false;pointerId=null;cursor=null;try{if(editor.hasPointerCapture(e.pointerId))editor.releasePointerCapture(e.pointerId)}catch(_){};repaint();save();announce(mode==='erase'?'Фрагмент стёрт':'Рельеф изменён')}
editor.addEventListener('pointerdown',begin);editor.addEventListener('pointermove',e=>{if(painting&&e.pointerId===pointerId)stroke(e);else if(e.pointerType==='mouse'){cursor=position(e);paintEditor()}});editor.addEventListener('pointerup',end);editor.addEventListener('pointercancel',end);editor.addEventListener('lostpointercapture',e=>{if(pointerId===e.pointerId)end(e)});editor.addEventListener('pointerleave',()=>{if(!painting){cursor=null;paintEditor()}});
function tool(next){mode=next;for(const k of ['brush','eraser']){$(k).classList.toggle('active',k===next);$(k).setAttribute('aria-pressed',String(k===next))}$('brushCursorLabel').textContent=next==='erase'?'УБРАТЬ ВЫСОТУ':'ПОДНИМИ ПОВЕРХНОСТЬ';announce(next==='erase'?'Ластик выбран':'Кисть выбрана')}
$('brush').onclick=()=>tool('brush');$('eraser').onclick=()=>tool('erase');
$('size').oninput=e=>{size=+e.target.value;$('sizeValue').textContent=size;paintEditor();save()};
$('height').oninput=e=>{height=+e.target.value;$('heightValue').textContent=height+'%';save()};
document.querySelectorAll('[data-preset]').forEach(b=>b.addEventListener('click',()=>{pushHistory();layer=stamp(b.dataset.preset,height*2.55);repaint();save();announce('Фигура заменена · можно отменить');if(mobile()){switchView('stereo')}}));
function undo(){if(!stack.length)return;layer=stack.pop();$('undo').disabled=stack.length===0;repaint();save();announce('Отменено')}
$('undo').onclick=undo;window.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();undo()}});
$('clear').onclick=()=>$('clearDialog').showModal();
$('clearConfirm').onclick=()=>{pushHistory();layer=fresh();repaint();save();$('clearDialog').close();announce('Рельеф очищен · отмена доступна')};
$('reshuffle').onclick=()=>{seed=(Math.imul(seed+1013904223,1664525)>>>0)||1;queueStereo();save();announce('Узор пересобран')};
$('palette').onclick=()=>{palette=palette==='mono'?'color':'mono';$('paletteLabel').textContent=palette==='mono'?'Графит':'Пигмент';queueStereo();save();announce('Цвет узора изменён')};
$('help').onclick=()=>$('helpDialog').showModal();
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>$(b.dataset.close).close()));
for(const dlg of document.querySelectorAll('dialog'))dlg.addEventListener('click',e=>{if(e.target===dlg)dlg.close()});
function switchView(view){shell.dataset.view=view;document.body.dataset.view=view;$('showEdit').setAttribute('aria-pressed',String(view==='edit'));$('showStereo').setAttribute('aria-pressed',String(view==='stereo'));requestAnimationFrame(()=>repaint())}
$('showEdit').onclick=()=>switchView('edit');$('showStereo').onclick=()=>switchView('stereo');
$('export').onclick=async()=>{const b=$('export');b.disabled=true;b.textContent='СОЗДАЮ PNG…';try{const c=document.createElement('canvas');c.width=1200;c.height=800;const ctx=c.getContext('2d');ctx.putImageData(new ImageData(stereogram(layer,c.width,c.height,seed,palette),c.width,c.height),0,0);const blob=await new Promise((resolve,reject)=>c.toBlob(x=>x?resolve(x):reject(new Error('PNG export failed')),'image/png'));const a=document.createElement('a');const url=URL.createObjectURL(blob);a.href=url;a.download='GLYAD-stereogram.png';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);announce('PNG готов · сохранён в загрузки')}catch(e){announce('Не удалось экспортировать PNG: '+(e.message||'ошибка'))}finally{b.disabled=false;b.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M5 16v4h14v-4"/></svg> СОХРАНИТЬ PNG <span aria-hidden="true">↗</span>'}};
window.addEventListener('resize',()=>requestAnimationFrame(()=>repaint()));document.addEventListener('visibilitychange',()=>{if(document.hidden)save()});window.addEventListener('pagehide',save);
requestAnimationFrame(()=>repaint());announce('Рисуй по рельефу · затем открой «Секрет»');
