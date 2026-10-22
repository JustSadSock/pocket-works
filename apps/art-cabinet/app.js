import {installMobileRuntime} from '../../shared/mobile-runtime.js';
import {createWorkshopMode} from '../../shared/workshop-mode.js';
installMobileRuntime();
createWorkshopMode({
 appName:'КАРТОТЕКА', version:'1.2.1',
 cachePrefix: 'art-cabinet-', storageNamespace: 'pocket-works:art-cabinet'
});
import {REVIEW_WORKS} from './original-review.js';
import {APPROVED_WORKS as FIRST_EDITION} from './approved.js';
import {SECOND_APPROVED_WORKS} from './second-approved.js';
const NEW_WORKS=REVIEW_WORKS; // original Zamazka originals, in their real game order
const APPROVED_WORKS=[
 ...FIRST_EDITION.map((w,i)=>({...w,id:1000+i,displayId:w.id,approvedEdition:1})),
 ...SECOND_APPROVED_WORKS
];

const $=id=>document.getElementById(id);
const NEW_KEY='pocket-works:art-cabinet:original-removals-v3';
const IMAGE_KEY='pocket-works:art-cabinet:image-cache-v3';
const SOURCE_KEY='pocket-works:art-cabinet:custom-sources-v3';
const PAGE_SIZE=12;
const all=[...NEW_WORKS,...APPROVED_WORKS],byId=new Map(all.map(w=>[w.id,w]));
const accepted=new Set(APPROVED_WORKS.map(w=>w.id));
const selected=new Set(),pictures=new Map(),failed=new Set(),loading=new Set(),custom=new Map(),fallbackTried=new Set();
let filter='all',term='',page=0,modalId=null,previousFocus=null,noticeTimer=null;

const getStored=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};
const store=(key,data)=>{try{localStorage.setItem(key,JSON.stringify(data))}catch{notify('Изменения сохраняются только на время сеанса: нет доступа к памяти браузера.')}};
function restoreState(){
 for(const id of getStored(NEW_KEY,[]))if(NEW_WORKS.some(w=>w.id===id))selected.add(id);
 const saved=getStored(SOURCE_KEY,{});
 for(const [id,url] of Object.entries(saved))if(byId.has(Number(id))&&sanitizeImageURL(url))custom.set(Number(id),url);
 try{const cache=JSON.parse(sessionStorage.getItem(IMAGE_KEY)||'{}');if(cache.expiry>Date.now())for(const [id,url] of Object.entries(cache.images||{}))if(byId.has(Number(id))&&sanitizeImageURL(url))pictures.set(Number(id),url)}catch{}
 // Pin exactly the artwork files used in Zamazka before the curated expansions.
 // The 28 second-edition picks are archival preferences, not yet game IDs.
 for(const work of all)if(work.path&&work.file&&!custom.has(work.id)&&!pictures.has(work.id))pictures.set(work.id,pinnedUrl(work));
 for(const [id,url] of custom){const validated=sanitizeImageURL(url);if(validated)pictures.set(id,validated)}
}
function pinnedUrl(w){return 'https://thumb.wikimedia.org/wikipedia/commons/thumb/'+w.path+w.file+'/960px-'+w.file}
function sanitizeImageURL(value){
 try{
  const url=new URL(value);if(url.protocol!=='https:')return null;
  if(url.hostname==='commons.wikimedia.org'&&url.pathname.startsWith('/wiki/File:')){
   const filename=decodeURIComponent(url.pathname.slice('/wiki/File:'.length));
   return 'https://commons.wikimedia.org/wiki/Special:Redirect/file/'+encodeURIComponent(filename.replaceAll(' ','_'))+'?width=1200';
  }
  if(url.hostname==='en.wikipedia.org'&&url.pathname.startsWith('/wiki/File:')){
   const filename=decodeURIComponent(url.pathname.slice('/wiki/File:'.length));
   return 'https://commons.wikimedia.org/wiki/Special:Redirect/file/'+encodeURIComponent(filename.replaceAll(' ','_'))+'?width=1200';
  }
  if(url.hostname==='commons.wikimedia.org'&&url.pathname.startsWith('/wiki/Special:Redirect/file/'))return url.href;
  if(url.hostname==='upload.wikimedia.org'&&/\.(jpe?g|png|webp|gif)$/i.test(url.pathname))return url.href;
  if(url.hostname==='thumb.wikimedia.org'&&/\.(jpe?g|png|webp|gif)$/i.test(url.pathname))return url.href;
  return null;
 }catch{return null}
}
function saveImageCache(){
 try{sessionStorage.setItem(IMAGE_KEY,JSON.stringify({expiry:Date.now()+86400000,images:Object.fromEntries([...pictures].filter(([id])=>!accepted.has(id)))}))}catch{}
}
function notify(message){const n=$('notice');n.textContent=message;n.hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>n.hidden=true,3200)}
function isApproved(w){return accepted.has(w.id)}
function matchesSearch(w){
 const q=term.toLocaleLowerCase().trim().replace(/^№\s*/,'');
 return !q||String(w.displayId??w.id)===q||[w.title,w.artist,w.wiki].some(text=>String(text||'').toLocaleLowerCase().includes(q));
}
function activeList(){
 let source=filter==='approved1'?APPROVED_WORKS.filter(w=>w.approvedEdition===1):
  filter==='approved2'?APPROVED_WORKS.filter(w=>w.approvedEdition===2):
  filter==='picked'?NEW_WORKS.filter(w=>selected.has(w.id)):
  filter==='all'?NEW_WORKS:NEW_WORKS.filter(w=>w.group===filter);
 return source.filter(matchesSearch);
}
function sourceSearch(w){
 return 'https://commons.wikimedia.org/w/index.php?title=Special:MediaSearch&type=image&search='+encodeURIComponent((w.wiki||w.title)+' '+w.artist);
}
function sourceLink(w){return w.source||sourceSearch(w)}
function shownId(w){return w.displayId??w.id}
function imageWrapper(w){
 const node=document.createElement('div');node.className='work-art';node.dataset.painting=w.id;
 if(pictures.has(w.id)){const img=document.createElement('img');img.src=pictures.get(w.id);img.alt=w.title;img.loading='lazy';img.decoding='async';img.addEventListener('error',()=>imageFailure(w.id,img.src));node.append(img);}
 else{const status=document.createElement('span');status.className='work-placeholder';status.textContent=failed.has(w.id)?'Репродукция недоступна · открыть ↗':loading.has(w.id)?'Подбираем репродукцию…':String(w.id);node.append(status)}
 return node;
}
function paintImage(w){
 const selector='.work[data-id="'+w.id+'"] .work-art';
 const node=document.querySelector(selector);
 if(node){const replacement=imageWrapper(w);node.replaceWith(replacement);}
 if(modalId===w.id)paintModalImage(w);
 updateImageStatus();
}
function imageFailure(id,failedSrc){
 const w=byId.get(id);if(!w||pictures.get(id)!==failedSrc)return;
 pictures.delete(id);
 if(!fallbackTried.has(id)&&!custom.has(id)){
  fallbackTried.add(id);loading.add(id);paintImage(w);
  void resolveUnfound(w).finally(()=>{loading.delete(id);paintImage(w)});
 }else{failed.add(id);paintImage(w)}
}
function card(w){
 const article=document.createElement('article');article.className='work'+(selected.has(w.id)?' selected':'');article.dataset.id=w.id;
 const visual=document.createElement('button');visual.type='button';visual.className='work-visual';visual.setAttribute('aria-label','Рассмотреть картину №'+shownId(w)+' '+w.title);visual.append(imageWrapper(w));visual.addEventListener('click',()=>openModal(w.id));
 const meta=document.createElement('div');meta.className='work-meta';
 const number=document.createElement('span');number.className='work-index';number.textContent=String(shownId(w));
 const middle=document.createElement('div');middle.className='work-text';
 const name=document.createElement('span');name.className='work-name';name.textContent=w.title;
 const artist=document.createElement('span');artist.className='work-tag';artist.textContent=w.artist+' · '+(w.wasRetired?'Ранее исключена из раундов':w.isCover?'Обложка игры':w.group);
 middle.append(name,artist);
 const mark=document.createElement('button');mark.type='button';mark.className='work-pick';
 mark.textContent=isApproved(w)?'✓':selected.has(w.id)?'✕':'−';
 mark.disabled=isApproved(w);mark.setAttribute('aria-pressed',String(isApproved(w)||selected.has(w.id)));
 mark.setAttribute('aria-label',isApproved(w)?'Уже одобрено: '+w.title:selected.has(w.id)?'Убрать из списка на удаление '+w.title:'Пометить к удалению '+w.title);
 mark.addEventListener('click',()=>toggle(w.id));
 meta.append(number,middle,mark);article.append(visual,meta);
 return article;
}
function draw({scroll=false}={}){
 const list=activeList();const pages=Math.max(1,Math.ceil(list.length/PAGE_SIZE));page=Math.min(Math.max(page,0),pages-1);
 const visible=list.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE);
 $('grid').replaceChildren(...visible.map(card));$('empty').hidden=list.length!==0;
 $('visibleTotal').textContent=list.length;
 $('headingPrefix').textContent=filter==='approved1'?'Первый отбор ':filter==='approved2'?'Второй отбор ':filter==='picked'?'На удаление ':'Исходные картины ';
 $('pageStatus').textContent=(page+1)+' / '+pages;
 $('prevPage').disabled=page===0;$('nextPage').disabled=page>=pages-1;
 updateSelection();
 if(scroll)scrollToCatalogue();
 queueImages(visible);
}
function scrollToCatalogue(){
 if(window.matchMedia('(max-width:760px)').matches){document.querySelector('.collection').scrollIntoView({block:'start',behavior:'auto'})}
 else $('galleryScroll').scrollTop=0;
}
function updateSelection(){
 const nums=[...selected].sort((a,b)=>a-b);
 $('selectedCount').textContent=nums.length;$('pickedBadge').textContent=nums.length;
 $('shortCount').textContent=nums.length;$('shortNumbers').textContent=nums.length?nums.join(', '):'Пока пусто';
 $('copySelection').disabled=!nums.length;$('downloadSelection').disabled=!nums.length;
 if(modalId!==null){const w=byId.get(modalId),done=isApproved(w),yes=selected.has(w.id);const b=$('viewerPick');b.textContent=done?(w.approvedEdition===1?'✓ Первый выпуск':'✓ Второй выпуск'):yes?'✓ На удаление':'− Пометить к удалению';b.disabled=done;b.classList.toggle('picked',done||yes);b.setAttribute('aria-pressed',String(done||yes))}
}
function toggle(id){
 if(accepted.has(id))return;const w=byId.get(id);if(!w)return;
 if(selected.has(id))selected.delete(id);else selected.add(id);
 store(NEW_KEY,[...selected].sort((a,b)=>a-b));
 if(filter==='picked')draw();else{
  for(const article of document.querySelectorAll('.work[data-id="'+id+'"]')){
   article.classList.toggle('selected',selected.has(id));const mark=article.querySelector('.work-pick');mark.textContent=selected.has(id)?'✕':'−';mark.setAttribute('aria-pressed',String(selected.has(id)));mark.setAttribute('aria-label',selected.has(id)?'Снять отметку на удаление '+w.title:'Пометить к удалению '+w.title);
  }
  updateSelection();
 }
 notify(selected.has(id)?'№'+id+' отмечена к удалению':'№'+id+' возвращена в список сохранения');
}
function selectFilter(value){
 filter=value;page=0;term='';$('search').value='';
 document.querySelectorAll('button[data-filter]').forEach(btn=>{const yes=btn.dataset.filter===filter;btn.classList.toggle('active',yes);btn.setAttribute('aria-pressed',String(yes))});
 draw({scroll:true});
}
function getImageLink(w){return failed.has(w.id)?null:pictures.get(w.id)}
function paintModalImage(w){
 const frame=$('viewerImage');frame.replaceChildren();
 const url=getImageLink(w);
 if(url){
  const valid=sanitizeImageURL(url)||url;
  const image=document.createElement('img');image.src=valid;image.alt=w.title;image.decoding='async';
  image.addEventListener('error',()=>imageFailure(w.id,valid));
  frame.append(image);
 }else{
  const text=document.createElement('p');text.textContent=loading.has(w.id)?'Загружаем репродукцию…':'Репродукцию найти не удалось. Открой источник или подставь свой адрес.';
  frame.append(text);
  if(!loading.has(w.id)){
   const retry=document.createElement('button');retry.type='button';retry.className='viewer-retry';retry.textContent='Повторить загрузку ↻';retry.addEventListener('click',()=>retryImage(w));frame.append(retry);
  }
 }
}
function openModal(id){
 const w=byId.get(id);if(!w)return;
 previousFocus=document.activeElement;modalId=id;$('viewer').hidden=false;
 document.documentElement.classList.add('has-viewer');document.body.style.overflow='hidden';$('sourceEditor').open=false;
 paintModal();$('viewerClose').focus();
}
function paintModal(){
 if(modalId===null)return;const w=byId.get(modalId);
 $('viewerIndex').textContent='№ '+shownId(w)+(isApproved(w)?' · Одобрена ранее':' · Исходный фонд Замазки');
 $('viewerGroup').textContent=w.group;
 $('viewerTitle').textContent=w.title;$('viewerArtist').textContent=w.artist;
 $('viewerSource').href=sourceLink(w);$('viewerSource').textContent=w.source?'Оригинал в Wikimedia Commons ↗':'Поиск оригинала ↗';
 $('customSourceInput').value=custom.get(w.id)||'';
 updateSelection();paintModalImage(w);
 if(!pictures.has(w.id)&&!loading.has(w.id)&&!failed.has(w.id))queueImages([w]);
}
function closeModal(){
 if(modalId===null)return;modalId=null;$('viewer').hidden=true;
 document.documentElement.classList.remove('has-viewer');document.body.style.overflow='';
 if(previousFocus?.isConnected)previousFocus.focus();
}
function shiftModal(delta){
 const list=activeList();if(!list.length)return;
 let i=list.findIndex(w=>w.id===modalId);
 if(i<0)i=0;else i=(i+delta+list.length)%list.length;
 modalId=list[i].id;$('sourceEditor').open=false;paintModal();
}
function retryImage(w){
 if(!w)return;failed.delete(w.id);pictures.delete(w.id);
 fallbackTried.delete(w.id);
 if(custom.has(w.id)){pictures.set(w.id,sanitizeImageURL(custom.get(w.id)));paintImage(w);return}
 if(w.path&&w.file)pictures.set(w.id,pinnedUrl(w));
 paintImage(w);
 if(!pictures.has(w.id))queueImages([w]);
}
function saveSource(){
 if(modalId===null)return;
 const input=$('customSourceInput').value.trim(),url=sanitizeImageURL(input);
 if(!url){notify('Поддерживаются только прямые файлы Wikimedia или страницы Commons File.');return}
 custom.set(modalId,input);store(SOURCE_KEY,Object.fromEntries(custom));pictures.set(modalId,url);failed.delete(modalId);fallbackTried.delete(modalId);
 paintImage(byId.get(modalId));notify('Для картины №'+modalId+' установлен новый источник');
}
function resetSource(){
 if(modalId===null)return;const w=byId.get(modalId);custom.delete(modalId);store(SOURCE_KEY,Object.fromEntries(custom));pictures.delete(modalId);failed.delete(modalId);$('customSourceInput').value='';retryImage(w);notify('Восстановлен автоматический источник');
}
function selectionText(){return [...selected].sort((a,b)=>a-b).join(', ')}
async function copySelection(){
 const text=selectionText();if(!text)return;
 try{if(!navigator.clipboard?.writeText)throw Error('clipboard disabled');await navigator.clipboard.writeText(text);notify('Игровые ID на удаление скопированы: '+text)}
 catch{$('copyText').value=text;$('copyFallback').hidden=false;$('copyText').focus();$('copyText').select()}
}
function downloadSelection(){
 if(!selected.size)return;
 const lines=['КАРТОТЕКА · ревизия исходной ЗАМАЗКИ (фонд 0–71)','Предлагаю убрать игровые ID: '+selectionText(),'','Пока это только список на согласование, игровые картины не удалены.',''];
 for(const id of [...selected].sort((a,b)=>a-b)){const w=byId.get(id);lines.push('№ '+id+' — '+w.title+' · '+w.artist,custom.get(id)||sourceLink(w),'')}
 const url=URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/plain;charset=utf-8'}));
 const anchor=document.createElement('a');anchor.href=url;anchor.download='kartoteka-udalit-iz-zamazki.txt';document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1200);notify('Список кандидатов на удаление сохранён');
}
function imageStatusVisible(){
 const list=activeList().slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE),ready=list.filter(w=>pictures.has(w.id)).length;
 const waiting=list.filter(w=>loading.has(w.id)).length,issues=list.filter(w=>failed.has(w.id)).length;
 $('imageStatus').textContent=ready+' из '+list.length+' на странице'+(waiting?' · загружаем':'')+(issues?' · '+issues+' не найдено':'');
 $('retryAll').hidden=issues===0;
}
function updateImageStatus(){imageStatusVisible()}
async function fetchJSON(url,timeout=8200){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
 try{const response=await fetch(url,{signal:controller.signal,mode:'cors',credentials:'omit'});
  if(!response.ok)throw Error('status '+response.status);
  const result=await response.json();if(result.error)throw Error('api error');return result}
 finally{clearTimeout(timer)}
}
async function wikiImages(works){
 if(!works.length)return new Map();
 const p=new URLSearchParams({action:'query',format:'json',formatversion:'2',redirects:'1',prop:'pageimages',piprop:'thumbnail',pithumbsize:'1050',origin:'*',titles:works.map(w=>w.wiki).join('|')});
 const result=await fetchJSON('https://en.wikipedia.org/w/api.php?'+p);
 const normalize=t=>String(t||'').replaceAll('_',' ').toLocaleLowerCase();
 const index=new Map(works.map(w=>[normalize(w.wiki),w]));
 for(const item of [...(result.query?.normalized||[]),...(result.query?.redirects||[])]){
  const found=index.get(normalize(item.from));if(found)index.set(normalize(item.to),found);
 }
 const match=new Map();for(const article of result.query?.pages||[]){
  const w=index.get(normalize(article.title)),src=article.thumbnail?.source;
  if(w&&src&&src.startsWith('https://'))match.set(w.id,src);
 }
 return match;
}
const insignificant=new Set(['the','with','from','after','over','into','girl','young','painting','caravaggio','and','for','a','in','of','on']);
const LATIN_ARTISTS={'Жерико':'Théodore Géricault','Гойя':'Francisco Goya','Караваджо':'Caravaggio','Джентилески':'Artemisia Gentileschi','Давид':'Jacques-Louis David','Рембрандт':'Rembrandt','Бугро':'William Bouguereau','Жером':'Jean-Léon Gérôme','Милле':'John Everett Millais','Уотерхаус':'John William Waterhouse','Дега':'Edgar Degas','Кэссетт':'Mary Cassatt','Ренуар':'Renoir','Бастьен-Лепаж':'Bastien-Lepage','Хомер':'Winslow Homer','Икинс':'Thomas Eakins','Филдс':'Luke Fildes','Браун':'Ford Madox Brown','Бёклин':'Arnold Böcklin','Блейк':'William Blake','Фюзели':'Henry Fuseli','Сурбаран':'Francisco Zurbarán','Шарден':'Jean Siméon Chardin','Вермеер':'Johannes Vermeer'};
function tokens(text){return (String(text||'').toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').match(/[a-z]{4,}/g)||[]).filter(t=>!insignificant.has(t))}
async function commonsCandidate(w){
 const search=(w.wiki||w.title).replace(/\s*\([^)]*\)/g,'')+' '+(LATIN_ARTISTS[w.artist]||w.artist);
 const params=new URLSearchParams({action:'query',format:'json',formatversion:'2',generator:'search',gsrsearch:search,gsrnamespace:'6',gsrlimit:'10',prop:'imageinfo',iiprop:'url',iiurlwidth:'1024',origin:'*'});
 const result=await fetchJSON('https://commons.wikimedia.org/w/api.php?'+params,7500);
 const titles=tokens((w.wiki||w.title).replace(/\s*\([^)]*\)/g,'')),artist=tokens(LATIN_ARTISTS[w.artist]||w.artist);
 let best=null,score=0;
 for(const p of result.query?.pages||[]){
  const url=p.imageinfo?.[0]?.thumburl||p.imageinfo?.[0]?.url;
  if(!url||!url.startsWith('https://')||!/\.(jpe?g|png|webp)$/i.test(decodeURIComponent(p.title||'')))continue;
  const name=tokens(p.title),hit=titles.filter(t=>name.some(n=>n===t||n.startsWith(t)||t.startsWith(n))).length;
  const author=artist.some(t=>name.some(n=>n===t||n.startsWith(t)));
  const confidence=hit*2+(author?2:0);
  // Never show a random result with no distinctive match to the artwork.
  if((hit>=2||hit>=1&&author)&&confidence>score){best=url;score=confidence}
 }
 return best;
}
function placeImage(w,url){
 if(!w||!url||!url.startsWith('https://'))return;
 if(custom.has(w.id))return;
 pictures.set(w.id,url);failed.delete(w.id);paintImage(w);saveImageCache();
}
async function resolveUnfound(w){
 // Don't substitute a guessed painting when reviewing the actual old game originals.
 // Reuse the exact Commons file through its redirect if the CDN thumbnail fails.
 if(w.file&&w.path){
  try{
   const exact='https://commons.wikimedia.org/wiki/Special:Redirect/file/'+encodeURIComponent(decodeURIComponent(w.file))+'?width=960';
   placeImage(w,exact);return;
  }catch{}
 }
 try{const src=await commonsCandidate(w);if(src){placeImage(w,src);return}}catch{}
 if(!pictures.has(w.id))failed.add(w.id);
 paintImage(w);
}
function queueImages(items){
 const targets=items.filter(w=>!pictures.has(w.id)&&!failed.has(w.id)&&!loading.has(w.id));
 if(!targets.length){updateImageStatus();return}
 for(const w of targets)loading.add(w.id);updateImageStatus();
 void (async()=>{
  const needWiki=targets.filter(w=>w.wiki);
  const obtained=new Map();
  for(let i=0;i<needWiki.length;i+=12){try{for(const [id,src] of await wikiImages(needWiki.slice(i,i+12)))obtained.set(id,src)}catch{}}
  // Approved works use pinned files; Wikipedia lookup is for new candidates only.
  for(const w of targets){
   if(obtained.has(w.id))placeImage(w,obtained.get(w.id));
  }
  const remaining=targets.filter(w=>!pictures.has(w.id)&&w.wiki);
  for(let i=0;i<remaining.length;i+=3)await Promise.all(remaining.slice(i,i+3).map(w=>resolveUnfound(w)));
  for(const w of targets){loading.delete(w.id);if(!pictures.has(w.id)&&!failed.has(w.id))failed.add(w.id);paintImage(w)}
  updateImageStatus();
 })().catch(()=>{for(const w of targets){loading.delete(w.id);if(!pictures.has(w.id))failed.add(w.id);paintImage(w)}})
}
function wire(){
 restoreState();
 $('filters').addEventListener('click',event=>{const button=event.target.closest('[data-filter]');if(button)selectFilter(button.dataset.filter)});
 $('search').addEventListener('input',event=>{term=event.target.value;page=0;draw()});
 $('prevPage').addEventListener('click',()=>{page--;draw({scroll:true})});
 $('nextPage').addEventListener('click',()=>{page++;draw({scroll:true})});
 $('resetFilters').addEventListener('click',()=>selectFilter('all'));
 $('retryAll').addEventListener('click',()=>{for(const w of activeList().slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE))if(failed.has(w.id))retryImage(w);notify('Повторно проверяем источники')});
 $('viewerClose').addEventListener('click',closeModal);$('viewerBackdrop').addEventListener('click',closeModal);
 $('viewerPrev').addEventListener('click',()=>shiftModal(-1));$('viewerNext').addEventListener('click',()=>shiftModal(1));
 $('viewerPick').addEventListener('click',()=>toggle(modalId));
 $('saveSource').addEventListener('click',saveSource);$('resetSource').addEventListener('click',resetSource);
 $('copySelection').addEventListener('click',copySelection);$('downloadSelection').addEventListener('click',downloadSelection);
 $('copyClose').addEventListener('click',()=>{$('copyFallback').hidden=true});
 document.addEventListener('keydown',event=>{
  if(!$('copyFallback').hidden){if(event.key==='Escape')$('copyFallback').hidden=true;return}
  if(modalId!==null){if(event.key==='Escape')closeModal();if(event.key==='ArrowLeft')shiftModal(-1);if(event.key==='ArrowRight')shiftModal(1)}
 });
 // Native vertical document scrolling is preserved; only strong horizontal gestures switch pictures.
 let touch=null;
 $('viewerImage').addEventListener('touchstart',e=>{if(e.touches.length===1)touch={x:e.touches[0].clientX,y:e.touches[0].clientY}},{passive:true});
 $('viewerImage').addEventListener('touchend',e=>{if(!touch||modalId===null)return;const dx=e.changedTouches[0].clientX-touch.x,dy=e.changedTouches[0].clientY-touch.y;touch=null;if(Math.abs(dx)>75&&Math.abs(dx)>Math.abs(dy)*1.4)shiftModal(dx<0?1:-1)},{passive:true});
 draw();document.documentElement.dataset.artCabinetReady='3';
}
wire();
// Shared update manager owns service worker lifecycle and deferred activation.