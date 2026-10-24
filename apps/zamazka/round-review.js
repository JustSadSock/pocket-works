import {exhibitFacets,exhibitPlaque} from './exhibition-ui.js';
// The round review is intentionally a distinct, untimed stage.
// All artwork is available only after the server has finished revealing every vote.
let viewerCleanup=null;
const archiveViewState={scale:1,dx:0,dy:0,legacyFrame:false};
export function closeRoundViewer(){
 if(viewerCleanup){const stop=viewerCleanup;viewerCleanup=null;stop();}
}
export function rasterAuditCaption(audit){
 if(!audit)return '';
 const matches=Math.max(0,Number(audit.matches)||0),mismatches=Math.max(0,Number(audit.mismatches)||0);
 if(!matches&&!mismatches)return 'Пиксельная сверка пока не проведена';
 return 'Независимая сверка: '+matches+' совпадений, '+mismatches+' расхождений';
}
export function updateRasterAuditMarkers(root,view){
 if(!view?.rasterBallots)return;
 for(const node of root?.querySelectorAll?.('[data-raster-audit]')||[]){
  const g=view.gallery?.[Number(node.dataset.rasterAudit)];
  if(g)node.textContent=rasterAuditCaption(g.rasterAudit);
 }
}
export function roundReviewMarkup(v,hostId,arts,escapeText){
 const works=v.gallery||[],last=v.round>=v.rounds,host=v.host===hostId;
 const cards=works.map((g,i)=>{
  if(!g)return '';
  const votes=Object.values(g.votes||{}).filter(Array.isArray),answer=v.selected.indexOf(g.art);
  const correct=votes.reduce((total,row)=>total+(row[answer]||0),0);
  const missed=votes.reduce((total,row)=>total+row.reduce((a,b)=>a+b,0)-(row[answer]||0),0);
  return '<button class="round-art-card" type="button" data-review-open="'+i+'" aria-label="Открыть работу '+escapeText(g.name)+': '+escapeText(arts[g.art]?.title||'картина')+'"><div class="zam-exhibit-stage" data-exhibit-stage><div class="round-art-image zam-exhibit-rim">'+exhibitFacets()+'<canvas data-review-canvas="'+i+'" aria-hidden="true"></canvas></div>'+exhibitPlaque(arts[g.art]?.title||'Картина',g.name+' · '+correct+' верно · '+missed+' мимо')+(g.rasterAudit?'<small class="raster-audit-readout" data-raster-audit="'+i+'">'+escapeText(rasterAuditCaption(g.rasterAudit))+'</small>':'')+'</div></button>';
 }).join('');
 const countLabel=works.length+' '+(works.length===1?'работа':works.length<5?'работы':'работ');
 const columns=works.length<=4?Math.max(1,works.length):works.length<=6?3:4;
 const action=host?'<button type="button" class="btn primary round-review-next" data-action="continue">'+(last?'Посмотреть итоги':'Следующий раунд')+' →</button>':'<span class="round-review-pending">Ожидаем организатора</span>';
 return '<section class="phase-page round-review-phase"><div class="phase-head round-review-heading"><div><span class="eyebrow">РАУНД '+v.round+' / '+v.rounds+' · ВСЕ РАБОТЫ</span><h2>Выставка реставраций</h2></div><div class="round-review-head-actions"><span class="round-review-count">'+countLabel+'</span><button type="button" class="phase-menu" data-action="menu" aria-label="Вернуться в главное меню">← <span>Меню</span></button></div></div><div class="phase-body round-review-body"><div class="round-review-description"><span>Открой картину, увеличь и сравни с оригиналом.</span><strong>Все ответы раскрыты</strong></div><div class="round-review-grid" style="--review-columns:'+columns+';--review-columns-tablet:'+Math.min(3,Math.max(1,works.length))+'">'+cards+'</div></div><div class="round-review-bottom"><span>Без ограничения времени</span>'+action+'</div></section>';
}
export function renderRoundThumbnails(screen,v,renderArtwork){
 for(const node of screen.querySelectorAll('[data-review-canvas]')){
  const g=v.gallery?.[Number(node.dataset.reviewCanvas)];
  if(g)void renderArtwork(node,g.art,g.variation,g.strokes||[],true);
 }
}
export function openRoundViewer({index,view,dialog,renderArtwork,arts,esc,closeDialog,onNavigate}){
 if(!['round-review','results','archive'].includes(view?.phase))return;
 const works=view.gallery||[],work=works[index],archived=view.phase==='archive';
 if(!work||!arts[work.art])return;
 let legacyFrame=archived&&archiveViewState.legacyFrame;
 closeDialog();
 const voteList=Object.values(work.votes||{}).filter(Array.isArray),answer=view.selected.indexOf(work.art);
 const correct=voteList.reduce((n,bet)=>n+(bet[answer]||0),0);
 const wrong=voteList.reduce((n,bet)=>n+bet.reduce((a,b)=>a+b,0)-(bet[answer]||0),0);
 dialog.classList.remove('hidden');dialog.classList.add('round-view-dialog');
 dialog.innerHTML='<div class="dialog-box round-viewer" role="document"><header class="round-view-header"><div><span>'+(archived?'АРХИВ':'ЭКСПОНАТ')+' '+(index+1)+' / '+works.length+'</span><h2>'+esc(work.name)+'</h2><p>'+esc(arts[work.art].title)+'</p><p class="round-art-provenance">'+esc([arts[work.art].artist,arts[work.art].date,arts[work.art].schoolCountry?'Школа: '+arts[work.art].schoolCountry:null,arts[work.art].creationPlace?'Создано: '+arts[work.art].creationPlace.city+', '+arts[work.art].creationPlace.country:null].filter(Boolean).join(' · '))+'</p></div><button type="button" class="round-view-close" data-round-close aria-label="Закрыть картину">×</button></header><div class="round-view-window" id="roundViewWindow" aria-label="Масштабируемая картина"><div class="round-view-image" id="roundViewImage" style="--split:50%"><canvas id="roundRestoration" aria-label="Реставрация"></canvas><canvas class="round-view-original" id="roundOriginal" aria-label="Подлинник"></canvas><span class="round-view-split"></span></div></div><div class="round-view-legend"><span>Реставрация</span><span>Подлинник</span></div><input id="roundCompare" class="round-view-range" type="range" min="0" max="100" value="50" aria-label="Сравнить с подлинником"><div class="round-view-controls"><div>'+(archived&&works.length>1?'<button type="button" data-round-nav="prev" aria-label="Предыдущая работа">‹</button>':'')+'<button type="button" data-round-zoom="out" aria-label="Отдалить">−</button><output id="roundZoom">100%</output><button type="button" data-round-zoom="in" aria-label="Приблизить">+</button><button type="button" data-round-zoom="reset">Сброс</button>'+(archived?'<button type="button" data-archive-geometry aria-pressed="'+legacyFrame+'" aria-label="'+(legacyFrame?'Вернуть естественные пропорции':'Показать старый формат 4:3')+'" title="Переключить пропорции архивной картины">'+(legacyFrame?'Ориг.':'4:3')+'</button>':'')+(archived&&works.length>1?'<button type="button" data-round-nav="next" aria-label="Следующая работа">›</button>':'')+'</div>'+(archived?'':'<small>'+correct+' верно · '+wrong+' мимо</small>')+'</div></div>';
 const pane=dialog.querySelector('#roundViewWindow'),image=dialog.querySelector('#roundViewImage'),range=dialog.querySelector('#roundCompare'),meter=dialog.querySelector('#roundZoom');
 const pointers=new Map(),clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
 let scale=archived?archiveViewState.scale:1,dx=archived?archiveViewState.dx:0,dy=archived?archiveViewState.dy:0,pinch=null;
 function draw(){
  const boundX=(pane.clientWidth*(scale-1))/2,boundY=(pane.clientHeight*(scale-1))/2;
  dx=clamp(dx,-boundX,boundX);dy=clamp(dy,-boundY,boundY);
  image.style.transform='translate('+dx+'px,'+dy+'px) scale('+scale+')';
  meter.textContent=Math.round(scale*100)+'%';
  if(archived)Object.assign(archiveViewState,{scale,dx,dy});
 }
 function zoomTo(next,cx,cy){
  const newScale=clamp(next,1,5),ratio=newScale/scale,rect=pane.getBoundingClientRect();
  const x=cx-rect.left-rect.width/2,y=cy-rect.top-rect.height/2;
  dx=x-(x-dx)*ratio;dy=y-(y-dy)*ratio;scale=newScale;draw();
 }
 function pointDown(e){
  if(e.pointerType==='mouse'&&e.button!==0)return;
  e.preventDefault();pointers.set(e.pointerId,[e.clientX,e.clientY]);
  try{pane.setPointerCapture(e.pointerId)}catch{}
  if(pointers.size===2){const [a,b]=[...pointers.values()];pinch={distance:Math.max(1,Math.hypot(a[0]-b[0],a[1]-b[1])),cx:(a[0]+b[0])/2,cy:(a[1]+b[1])/2};}
 }
 function pointMove(e){
  if(!pointers.has(e.pointerId))return;
  e.preventDefault();const previous=pointers.get(e.pointerId);pointers.set(e.pointerId,[e.clientX,e.clientY]);
  if(pointers.size===2){
   const [a,b]=[...pointers.values()],distance=Math.max(1,Math.hypot(a[0]-b[0],a[1]-b[1])),cx=(a[0]+b[0])/2,cy=(a[1]+b[1])/2;
   if(pinch){dx+=cx-pinch.cx;dy+=cy-pinch.cy;zoomTo(scale*distance/pinch.distance,cx,cy);}
   pinch={distance,cx,cy};
  }else if(scale>1){dx+=e.clientX-previous[0];dy+=e.clientY-previous[1];draw();}
 }
 function pointUp(e){pointers.delete(e.pointerId);pinch=null}
 function wheel(e){e.preventDefault();zoomTo(scale*(e.deltaY<0?1.2:1/1.2),e.clientX,e.clientY)}
 function slide(){image.style.setProperty('--split',range.value+'%')}
 function click(e){
  if(e.target.closest('[data-round-close]')){closeDialog();return}
  const geometry=e.target.closest('[data-archive-geometry]');
  if(archived&&geometry){
   legacyFrame=!legacyFrame;archiveViewState.legacyFrame=legacyFrame;
   geometry.setAttribute('aria-pressed',String(legacyFrame));
   geometry.textContent=legacyFrame?'Ориг.':'4:3';
   geometry.setAttribute('aria-label',legacyFrame?'Вернуть естественные пропорции':'Показать старый формат 4:3');
   scale=1;dx=0;dy=0;
   void paintArchivePair().then(draw);
   return;
  }
  const nav=e.target.closest('[data-round-nav]')?.dataset.roundNav;
  if(nav&&onNavigate){onNavigate((index+(nav==='next'?1:-1)+works.length)%works.length);return}
  const command=e.target.closest('[data-round-zoom]')?.dataset.roundZoom;
  if(!command)return;
  if(command==='reset'){scale=1;dx=0;dy=0;draw()}
  else {const box=pane.getBoundingClientRect();zoomTo(scale*(command==='in'?1.35:1/1.35),box.left+box.width/2,box.top+box.height/2)}
 }
 function backdrop(e){if(e.target===dialog)closeDialog()}
 function escapeKey(e){if(e.key==='Escape'){e.preventDefault();closeDialog()}else if(archived&&onNavigate&&!['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();onNavigate((index+(e.key==='ArrowRight'?1:-1)+works.length)%works.length)}}
 pane.addEventListener('pointerdown',pointDown);pane.addEventListener('pointermove',pointMove);
 for(const name of ['pointerup','pointercancel','lostpointercapture'])pane.addEventListener(name,pointUp);
 pane.addEventListener('wheel',wheel,{passive:false});range.addEventListener('input',slide);
 dialog.addEventListener('click',click);dialog.addEventListener('click',backdrop);window.addEventListener('keydown',escapeKey);
 viewerCleanup=()=>{
  pane.removeEventListener('pointerdown',pointDown);pane.removeEventListener('pointermove',pointMove);
  for(const name of ['pointerup','pointercancel','lostpointercapture'])pane.removeEventListener(name,pointUp);
  pane.removeEventListener('wheel',wheel);range.removeEventListener('input',slide);
  dialog.removeEventListener('click',click);dialog.removeEventListener('click',backdrop);window.removeEventListener('keydown',escapeKey);
  dialog.classList.remove('round-view-dialog');
 };
 draw();
 dialog.querySelector('[data-round-close]')?.focus();
 function paintArchivePair(){
  return Promise.all([
   renderArtwork(dialog.querySelector('#roundRestoration'),work.art,work.variation,work.strokes||[],true,false,legacyFrame),
   renderArtwork(dialog.querySelector('#roundOriginal'),work.art,0,null,false,false,legacyFrame)
  ]);
 }
 void paintArchivePair();
}
