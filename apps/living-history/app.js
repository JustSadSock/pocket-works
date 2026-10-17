import {installMobileRuntime} from '../../shared/mobile-runtime.js';
import {createWorkshopMode} from '../../shared/workshop-mode.js';
import {createWorld, advanceDays, overview, audit, serialize, deserialize, getHousehold, SIZE} from './model.js';
import {diagnoseWorld} from './laboratory.js';
import {fieldAppearance,personPosition,cattlePosition} from './visual-land.js';
import {walkPath} from './navigation.js';
installMobileRuntime();
createWorkshopMode({appName:'Живая история',version:'0.4.0',cachePrefix:'living-history-',storageNamespace:'pocket-works:living-history'});
const $=s=>document.querySelector(s);
const worldNode=$('#world'),canvas=$('#map'),ctx=canvas.getContext('2d',{alpha:false});
const PX=8,W=SIZE*PX;
let sim=null,mode='overview',selected=null,selectedPerson=null,economyOpen=false,speed=0,cam={x:0,y:0,z:1},drag=null,dirty=true,last=performance.now(),acc=0,lastStats=0,lastSavedDay=0,savePending=false,active=true,pointers=new Map(),pinch=null;
const worldCanvas=document.createElement('canvas');worldCanvas.width=W;worldCanvas.height=W;const draw=worldCanvas.getContext('2d');
let toastTimer=0;let previousPeople=null;let movementFraction=1;
function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),2600);}
function rngTile(i){let n=Math.imul(i+31,2654435761);n^=n>>>13;return (n>>>0)%100;}
function tileColor(i,stage){if(sim.terrain[i]===1)return '#4c8990';if(sim.terrain[i]===2)return rngTile(i)>63?'#89947c':'#818e79';if(stage===2)return '#927653';if(stage===3)return '#84945c';if(stage===4)return '#aa906b';if(stage===1)return '#7c8b62';const s=sim.soil[i];return s>83?'#718a57':s>65?'#738357':'#8d9066';}
function makeWorldArt(){if(!sim)return;const stages=fieldAppearance(sim);draw.imageSmoothingEnabled=false;draw.clearRect(0,0,W,W);for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){const i=y*SIZE+x,X=x*PX,Y=y*PX,v=rngTile(i);const fieldStage=stages[i];draw.fillStyle=tileColor(i,fieldStage);draw.fillRect(X,Y,PX,PX);if(sim.terrain[i]===1){draw.fillStyle=v>63?'#83afb0':'#5a999f';draw.fillRect(X+(v%4),Y+((v/4)|0)%5,3,1);continue;}if(sim.terrain[i]===2){if(v>82){draw.fillStyle='#aba997';draw.fillRect(X+2,Y+2,3,2);draw.fillStyle='#727a6e';draw.fillRect(X+3,Y+4,2,1);}else if(v>60){draw.fillStyle='#99a388';draw.fillRect(X+3,Y+3,2,2);}continue;}if(fieldStage){
  if(fieldStage===1){if(v>45){draw.fillStyle='#a6aa70';draw.fillRect(X+v%5,Y+3,2,2);}} // resting fallow
  else {draw.fillStyle=fieldStage===3?'#a2ad71':fieldStage===4?'#c7a87a':'#baa07a';
   // Ridge-and-furrow strips, not concentric disks around homes.
   if((x+Math.floor(y/5))%2===0){draw.fillRect(X+1,Y+1,1,6);draw.fillRect(X+4,Y+1,1,6);}
   else{draw.fillRect(X+1,Y+2,6,1);draw.fillRect(X+1,Y+5,6,1);}
  }
  continue;
 }
 if(sim.usage[i]===3){
  // Tofts have distinct owned crofts, not decorative gardens generated
  // beside arbitrary roofs. Low hedges follow the ACTUAL cadastral cells.
  draw.fillStyle='#889a68';draw.fillRect(X,Y,PX,PX);
  draw.fillStyle='#a5a875';draw.fillRect(X+1,Y+1,6,5);
  draw.fillStyle='#697d48';draw.fillRect(X+2,Y+1,1,5);draw.fillRect(X+5,Y+1,1,5);
  draw.fillStyle='#c1ac78';
  for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]){
   const xx=x+dx,yy=y+dy,n=(xx<0||xx>=SIZE||yy<0||yy>=SIZE)?-1:yy*SIZE+xx;
   if(n>=0&&sim.usage[n]===3)continue;
   if(dx===-1)draw.fillRect(X,Y,1,PX);
   else if(dx===1)draw.fillRect(X+PX-1,Y,1,PX);
   else if(dy===-1)draw.fillRect(X,Y,PX,1);
   else draw.fillRect(X,Y+PX-1,PX,1);
  }
  continue;
 }
 if(v>68){draw.fillStyle='#9cac71';draw.fillRect(X+3,Y+3,2,2);}if(sim.forest[i]>60){draw.fillStyle='#355a41';draw.fillRect(X+1,Y+2,6,5);draw.fillStyle=v>40?'#3f6a4b':'#527453';draw.fillRect(X+1,Y,5,5);draw.fillStyle='#749063';draw.fillRect(X+2,Y+1,2,1);}if(sim.traffic[i]>11){
  // Actual worn segments form contiguous paths, not a dotted decoration.
  const busy=sim.traffic[i]>=55,thick=busy?3:2,m=4;
  draw.fillStyle=busy?'#917752':'#ae9875';
  draw.fillRect(X+m-1,Y+m-1,thick,thick);
  if(x>0&&sim.traffic[i-1]>11)draw.fillRect(X,Y+m-1,m,thick);
  if(x<SIZE-1&&sim.traffic[i+1]>11)draw.fillRect(X+m,Y+m-1,PX-m,thick);
  if(y>0&&sim.traffic[i-SIZE]>11)draw.fillRect(X+m-1,Y,thick,m);
  if(y<SIZE-1&&sim.traffic[i+SIZE]>11)draw.fillRect(X+m-1,Y+m,thick,PX-m);
 }}
 // Villages and roof silhouettes: every roof corresponds to an actual household.
 for(const h of sim.households){const X=h.x*PX,Y=h.y*PX;draw.fillStyle='#2e3c33';draw.fillRect(X-3,Y+2,13,9);draw.fillStyle='#ccae7f';draw.fillRect(X-2,Y+1,11,8);draw.fillStyle='#79553f';draw.fillRect(X-4,Y-3,15,7);draw.fillStyle='#a87752';draw.fillRect(X-1,Y-5,10,3);draw.fillStyle='#e0b77c';draw.fillRect(X+2,Y+5,2,2);draw.fillStyle='#513a2f';draw.fillRect(X+8,Y+4,2,5);}
 for(const c of sim.communities){const X=c.x*PX,Y=c.y*PX;draw.fillStyle='#ded4b2';draw.fillRect(X-4,Y-8,8,7);draw.fillStyle='#675f47';draw.fillRect(X-5,Y-11,10,4);draw.fillStyle='#e6bf6b';draw.fillRect(X,Y-17,2,9);}
 dirty=false;}
function fitView(){const box=worldNode.getBoundingClientRect();let z=Math.max(box.width/W,box.height/W)*1.09;cam.z=Math.max(.16,z);cam.x=(box.width-W*cam.z)/2;cam.y=(box.height-W*cam.z)/2;}
function resize(){const r=worldNode.getBoundingClientRect(),dpr=Math.min(2,window.devicePixelRatio||1);if(canvas.width!==Math.round(r.width*dpr)||canvas.height!==Math.round(r.height*dpr)){canvas.width=Math.round(r.width*dpr);canvas.height=Math.round(r.height*dpr);canvas.style.width=r.width+'px';canvas.style.height=r.height+'px';ctx.setTransform(dpr,0,0,dpr,0,0);ctx.imageSmoothingEnabled=false;}if(cam.z===1&&cam.x===0&&cam.y===0)fitView();}
function screenToMap(px,py){const rect=canvas.getBoundingClientRect();return{x:(px-rect.left-cam.x)/cam.z/PX,y:(py-rect.top-cam.y)/cam.z/PX};}
function zoom(f,cx,cy){const r=canvas.getBoundingClientRect(),x=cx-r.left,y=cy-r.top;const next=Math.max(.15,Math.min(4,cam.z*f));const factor=next/cam.z;cam.x=x-(x-cam.x)*factor;cam.y=y-(y-cam.y)*factor;cam.z=next;}
function drawFrame(){if(!sim)return;
 resize();const dpr=Math.min(2,devicePixelRatio||1),w=canvas.width/dpr,h=canvas.height/dpr;
 ctx.fillStyle='#2c4739';ctx.fillRect(0,0,w,h);if(dirty)makeWorldArt();
 ctx.imageSmoothingEnabled=false;ctx.drawImage(worldCanvas,Math.round(cam.x),Math.round(cam.y),Math.round(W*cam.z),Math.round(W*cam.z));
 const showFigures=cam.z>=.17;
 if(showFigures){
  const people=sim.people;
  for(const p of people){if(!p.alive)continue;
   const where=personPosition(p,sim,previousPeople,movementFraction,speed>0);
   const x=cam.x+(where.x*PX+3)*cam.z,y=cam.y+(where.y*PX+3)*cam.z;
   if(x<2||y<3||x>w-2||y>h-3)continue;
   const size=Math.max(2,Math.min(8,cam.z*5));
   // Every dot is an actual inhabitant. Clothing identifies their real daily job.
   const coat=p.job==='farm'?'#9b8860':p.job==='wood'?'#7b6948':p.job==='haul'?'#526f77':p.job==='herd'?'#928458':p.job==='build'?'#a47d59':'#6b7963';
   ctx.fillStyle='#25362d';ctx.fillRect(Math.round(x-.8),Math.round(y+size*.4),Math.ceil(size)+2,Math.ceil(size*.7)+1);
   ctx.fillStyle=coat;ctx.fillRect(Math.round(x),Math.round(y+size*.52),Math.ceil(size),Math.ceil(size*.8));
   ctx.fillStyle=p.sex==='f'?'#e5bd8f':'#d4c09f';ctx.fillRect(Math.round(x+size*.15),Math.round(y),Math.max(2,size*.7),Math.max(2,size*.7));
  }
  if(cam.z>.36){for(const hom of sim.households){
   for(let i=0;i<Math.min(5,hom.cattle||0);i++){
    const place=cattlePosition(hom,sim.day+movementFraction,i,sim),x=cam.x+place.x*PX*cam.z,y=cam.y+place.y*PX*cam.z;
    if(x<0||y<0||x>w||y>h)continue;
    const scale=Math.max(2,cam.z*4),ox=i<(hom.draftOxen||0);
    ctx.fillStyle=ox?'#40382e':'#6b523b';ctx.fillRect(Math.round(x),Math.round(y),scale*(ox?1.95:1.65),scale*(ox?1.15:1));
    ctx.fillStyle=ox?'#8a7558':'#b09a7b';
    const dip=(.5+.5*Math.sin((sim.day+movementFraction)*1.4+i+hom.id*.2))*scale*.28;
    ctx.fillRect(Math.round(x+scale*(ox?1.6:1.2)),Math.round(y-scale*.24+dip),scale*.68,scale*.7);
    if(ox){ctx.fillStyle='#c4ad87';ctx.fillRect(Math.round(x+scale*1.65),Math.round(y-scale*.36),Math.max(1,scale*.2),scale*.22);}
   }
   for(let i=0;i<Math.min(10,hom.sheep||0);i++){
    const place=cattlePosition(hom,sim.day+movementFraction,i+23,sim),x=cam.x+place.x*PX*cam.z,y=cam.y+place.y*PX*cam.z;
    if(x<0||y<0||x>w||y>h)continue;
    const u=Math.max(2,cam.z*2.6);
    ctx.fillStyle='#4f4b40';ctx.fillRect(Math.round(x),Math.round(y+u*.62),u*.23,u*.6);ctx.fillRect(Math.round(x+u*.9),Math.round(y+u*.62),u*.23,u*.6);
    ctx.fillStyle='#e7dcc1';ctx.fillRect(Math.round(x),Math.round(y),u*1.55,u*.91);
    ctx.fillStyle='#c7bba2';ctx.fillRect(Math.round(x+u*1.2),Math.round(y+u*.13),u*.55,u*.60);
    ctx.fillStyle='#4e463c';ctx.fillRect(Math.round(x+u*1.59),Math.round(y+u*.39),Math.max(1,cam.z),Math.max(1,cam.z));
   }
  }}
 }
 // Selecting a person explains their current destination and actual dry-land access.
 if(selectedPerson){const who=sim.people.find(p=>p.id===selectedPerson&&p.alive);const home=who&&sim.households.find(h=>h.id===who.houseId);
  if(home&&who&&who.job!=='home'){
   const route=walkPath(sim,home,who);
   if(route.length>1){ctx.save();ctx.strokeStyle='#e6cb8caa';ctx.lineWidth=1.4;ctx.setLineDash([3,4]);ctx.beginPath();
    for(let i=0;i<route.length;i++){const x=cam.x+(route[i].x*PX+4)*cam.z,y=cam.y+(route[i].y*PX+4)*cam.z;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.stroke();ctx.restore();}
  }
 }
 if(selected){const household=sim.households.find(k=>k.id===selected);if(household){const x=cam.x+(household.x*PX+4)*cam.z,y=cam.y+(household.y*PX+4)*cam.z;ctx.strokeStyle='#ffe3a4';ctx.lineWidth=2;ctx.strokeRect(x-8,y-8,16,16);}}
 if(cam.z>.5){ctx.font='700 12px Georgia';ctx.textAlign='center';for(const c of sim.communities){const x=cam.x+c.x*PX*cam.z,y=cam.y+c.y*PX*cam.z-14;if(x<15||x>w-15||y<60||y>h-10)continue;ctx.fillStyle='#16271dc9';const name=c.name,tw=ctx.measureText(name).width;ctx.fillRect(x-tw/2-8,y-13,tw+16,20);ctx.fillStyle='#f2e5c2';ctx.fillText(name,x,y+1);}}
}
function updateHUD(){if(!sim)return;const o=overview(sim),seasons=['Зима','Весна','Лето','Осень'];$('#date').textContent=`Год ${o.year} · ${seasons[Math.floor((o.day%365)/91.25)%4]}`;$('#population').textContent=`${o.population} жителей · ${o.households} хозяйств${sim.scenario==='drought'&&o.year>=6&&o.year<=8?' · ЗАСУХА':''}`;
$('#live-text').textContent=speed===0?'МИР ПРИОСТАНОВЛЕН':`ВРЕМЯ ИДЁТ · ${speed} ДН./С`;
$('.live-mark').classList.toggle('running',speed>0);document.querySelectorAll('[data-speed]').forEach(b=>b.classList.toggle('active',Number(b.dataset.speed)===speed));renderSheet();}
function escapeHTML(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function renderSheet(){if(!sim)return;const el=$('#sheet-content'),o=overview(sim);
if(mode==='overview'){
 const names={normal:'Умеренная долина',drought:'Трёхлетняя засуха',isolated:'Изолированные общины',uplands:'Бедная горная земля'};
 const regionRows=sim.communities.map(c=>{const homes=sim.households.filter(h=>h.communityId===c.id);
 const adults=sim.people.filter(p=>p.alive&&homes.some(h=>h.id===p.houseId));
 const farmers=homes.filter(h=>h.focus==='farm'&&h.members.some(id=>adults.some(p=>p.id===id))).length;
 const woods=homes.filter(h=>h.focus==='wood'&&h.members.some(id=>adults.some(p=>p.id===id))).length;
 return `<div class="community-row"><span><b>${escapeHTML(c.name)}</b><small>${farmers} полевых · ${woods} лесных · ${homes.filter(h=>h.tenure==='demesne').length} поместье</small></span><strong>${adults.length}</strong></div>`;}).join('');
 el.innerHTML=`<div class="stat-strip"><div class="stat"><label>Жители</label><strong>${o.population}</strong></div><div class="stat"><label>Зерно</label><strong>${Math.round(o.grain/1000)}</strong><small>тонн</small></div><div class="stat"><label>Сделки</label><strong>${o.trade}</strong></div></div><div class="region-tag">${sim.historicalProfile?'Мидлендс, около 1280 г. · ':''}${escapeHTML(names[o.scenario]||names.normal)}${o.hungry?` · Нехватка у ${o.hungry} хозяйств`:''}</div><div class="community-list">${regionRows}</div><p class="map-key">Карта: пашня — полосы · светло-зелёное — пар · охристое — стерня. Каждая фигурка — житель; животных видно у пастбищ.</p>`;return;
}
if(mode==='household'){
 const h=getHousehold(sim,selected);
 if(!h){el.innerHTML='<div class="house-name">Выберите дом на карте</div><p class="note">Приблизьте карту и коснитесь крыши.</p>';return;}
 const current=selectedPerson?sim.people.find(p=>p.id===selectedPerson):null;
 const originalPosition=el.scrollTop;
 const residents=h.people.map(p=>`<button class="member ${p.id===selectedPerson?'selected':''}" data-person="${p.id}"><b>${escapeHTML(p.name)}</b> ${Math.floor(p.age)} · ${p.job==='wood'?'лес':p.job==='farm'?'поля':p.job==='haul'?'в дороге':p.job==='build'?'стройка':p.job==='herd'?'пастбище':p.job==='hired'?'наём':'дом'}</button>`).join('')||'<span class="member">Дом пустует</span>';
 const deceased=h.members.map(id=>sim.people.find(p=>p.id===id)).filter(p=>p&&!p.alive).slice(-5);
 let personInfo='';
 if(current&&h.members.includes(current.id)){
  const byId=id=>sim.people.find(q=>q.id===id);
  const spouse=byId(current.spouse),parents=current.parents.map(byId).filter(Boolean);
  const log=(current.lifeLog||[]).slice(-10).reverse().map(e=>`<div class="life-record"><time>${Math.floor(e.day/365)+1} г.</time><span>${escapeHTML(e.text)}</span></div>`).join('');
  personInfo=`<div class="person-detail"><button data-person-back="1" class="back-to-house">← Хозяйство</button><div class="house-name">${escapeHTML(current.name)} <small>#${current.id}</small></div><div class="house-meta">${current.alive?`Возраст ${Math.floor(current.age)} · здоровье ${Math.round(current.health)}%`:`Умер в возрасте ${Math.floor(current.age)} лет`} · ${current.sex==='f'?'жен.':'муж.'}</div><div class="life-metrics"><span>Поля <b>${current.workDays?.farm||0} дн.</b></span><span>Лес <b>${current.workDays?.wood||0} дн.</b></span><span>Перевозки <b>${current.workDays?.haul||0} дн.</b></span><span>Выпас <b>${current.workDays?.herd||0} дн.</b></span></div><div class="house-meta">Навыки: земледелие ${current.skill.farm.toFixed(2)}, лес ${current.skill.wood.toFixed(2)} · Родители: ${parents.map(p=>escapeHTML(p.name)+' #'+p.id).join(', ')||'неизвестны'} · ${spouse?`Супруг: ${escapeHTML(spouse.name)} #${spouse.id}`:'Без супруга'}</div><div class="life-chron">${log||'Записей пока нет'}</div></div>`;
 }
 const last=sim.events.slice().reverse().find(e=>e.subjects.includes(h.id));
 const acc=h.accounts||h.lastAccounting||{};
 const decision=h.decision;
 const fiscal=[['Овёс, урожай',acc.oatsHarvestKg||0,'кг'],['Бобовые, урожай',acc.pulsesHarvestKg||0,'кг'],['Овёс, посев',acc.oatsSeedKg||0,'кг'],['Бобовые, посев',acc.pulsesSeedKg||0,'кг'],['Бобовые в питании',acc.pulsesFoodKg||0,'кг'],['Овёс в питании',acc.oatsFoodKg||0,'кг'],['Овёс на корм',acc.sheepFeedOatsKg||0,'кг'],['Настрижено шерсти',acc.woolShearedKg||0,'кг'],['Отработал повинностей',acc.manorServiceDays||0,'дн.'],['Рента уплачена',acc.manorRentPaidCoin||0,'мон.'],['Рента получена',acc.manorRentReceivedCoin||0,'мон.'],['Произвёл зерна',acc.harvestKg||0,'кг'],['Собрал древесины',acc.woodKg||0,'кг'],['Израсходовал семян',acc.seedKg||0,'кг'],['Съел зерна',acc.foodKg||0,'кг'],['Собрал огородных культур',acc.gardenHarvestKg||0,'кг экв.'],['Съел продукты огорода',acc.gardenFoodKg||0,'кг экв.'],['Съел молочные продукты',acc.dairyFoodKg||0,'кг экв.'],['Получил зерновых ссуд',acc.loansIssuedKg||0,'кг'],['Вернул зерновых ссуд',acc.loansRepaidKg||0,'кг'],['Испорчено в хранилище',acc.spoilKg||0,'кг'],['Купил товаров',acc.purchasesKg||0,'кг'],['Продал товаров',acc.salesKg||0,'кг'],['Выручка с продаж',acc.revenue||0,'мон.'],['Платил работникам',acc.wagesPaid||0,'мон.'],['Заработал работой',acc.wagesEarned||0,'мон.'],['Заработал зерна трудом',acc.grainWagesEarnedKg||0,'кг'],['Оплатил работу зерном',acc.grainWagesPaidKg||0,'кг'],['Перевозки принесли',acc.haulEarned||0,'мон.'],['Аренда полей, получено',acc.rentReceivedKg||0,'кг'],['Аренда полей, отдано',acc.rentPaidKg||0,'кг']];
 const access=h.foodAccess;
 const loans=(sim.loans||[]).filter(l=>['active','in-transit'].includes(l.status)&&[l.borrowerId,l.lenderId,l.guarantorId].includes(h.id));
 const debtLine=loans.length?`<div class="storage-line">Зерновые договоры: ${loans.map(l=>`${Math.round(l.owed)} кг ${l.borrowerId===h.id?'должна':l.lenderId===h.id?'причитается':'поручительство'}${l.guarantorId?` · поручитель #${l.guarantorId}`:''}`).join(' · ')}</div>`:'';
 const obstacle={supplied:'Текущего запаса достаточно', 'delivery-pending':'Ожидается физическая доставка', 'no-saleable-surplus':'Поблизости нет зерна, которое соседние семьи готовы продать', 'no-cash':'Нет монет для покупки', 'not-affordable':'Денег недостаточно для существенной закупки', 'market-or-carrier-delay':'Возможная сделка ещё требует продавца и перевозчика','credit-possible':'Есть потенциальный зерновой кредитор; договор и доставка не гарантированы','paid-work-possible':'Есть потенциальная работа за зерно, но найм не гарантирован'};
 const foodDetail=access?`<div class="economy-ledger"><div><span>Пищи в доме</span><strong>${Math.round(access.foodDays)} дн.</strong></div><div><span>Досягаемое зерно других семей</span><strong>${Math.round(access.reachableGrainKg)} кг</strong></div><div><span>Предлагаемый избыток</span><strong>${Math.round(access.offeredEmergencyKg)} кг</strong></div><div><span>Доступно на имеющиеся монеты (оценка)</span><strong>${Math.round(access.affordableKg)} кг</strong></div><div><span>Уже в дороге</span><strong>${Math.round(access.grainInTransitKg)} кг</strong></div><div><span>Возможный заём, не обещание</span><strong>${Math.round(access.potentialCreditKg||0)} кг</strong></div><div><span>Потенциальные дворы для найма</span><strong>${access.potentialGrainWorkplaces||0}</strong></div><div><span>Огород · пищевой эквивалент</span><strong>${Math.round(access.gardenEquivalentKg||0)} кг</strong></div><div><span>Молоко · пищевой эквивалент</span><strong>${Math.round(access.dairyEquivalentKg||0)} кг</strong></div><div><span>Зерновые обязательства семьи</span><strong>${Math.round(access.outstandingLoanKg||0)} кг</strong></div><div><span>Зерно, причитающееся семье</span><strong>${Math.round(access.creditsDueKg||0)} кг</strong></div></div><small>Причина: ${escapeHTML(obstacle[access.reason]||access.reason)}. Чужие запасы не принадлежат семье, возможная сделка не гарантирована.</small>`:'';
 const econDetail=economyOpen?`<div class="economy-details"><p><b>Почему эта работа:</b> ${escapeHTML(decision?.reason||'Решение будет принято в начале года')}.</p><div class="economy-values"><span>Земледелие ${Math.round(decision?.farmValue||0)}</span><span>Лес ${Math.round(decision?.woodValue||0)}</span><span>Перевозки ${Math.round(decision?.haulValue||0)}</span></div><small>Оценка в условных монетах за год — не гарантия прибыли.</small><div class="economy-ledger">${fiscal.map(([title,num,unit])=>`<div><span>${title}</span><strong>${Math.round(num)} ${unit}</strong></div>`).join('')}</div><small>Учёт с начала ${Math.floor((acc.year||0)+1)}-го года, без изменения истории сохранения.</small>${foodDetail}</div>`:'';
 const storageInfo=`${Math.round(h.grain)}/${h.storageKg} кг · ${Math.round(100*h.grain/Math.max(1,h.storageKg))}%`;
 el.innerHTML=`<div class="house-name">Дом ${escapeHTML(h.name)}</div><div class="house-meta">${escapeHTML(h.tenureTitle||'Хозяйство')} · ${escapeHTML(h.community)} · ${h.people.length} чел. · ${(h.fields.length*.0625).toFixed(2)} га (${h.fields.length} полос${h.leasedIn?`, в аренде +${h.leasedIn}/−${h.leasedOut}`:``}) · ${Math.round(h.grain)} кг хлебного зерна · ${Math.round(h.oats||0)} кг овса · ${Math.round(h.pulses||0)} кг бобовых · ${Math.round(h.wood)} кг дерева · ${Math.round(h.coin)} монет · ${h.draftOxen||0} тягловых · ${h.dairyCows??h.cattle??0} молочных · ${h.sheep||0} овец · ${Math.round(h.wool||0)} кг шерсти · ${Math.round(h.fodder||0)} кг сена</div><div class="economy-line"><b>${h.focus==='wood'?'Лесное хозяйство':h.focus==='trade'?'Перевозки':'Земледелие'}</b> · качество почвы ${h.soil}/100 · урожай ${Math.round(h.lastHarvest?.kg||0)} кг (зерно ${Math.round(h.lastHarvest?.breakdown?.grain??h.lastHarvest?.kg??0)} / овёс ${Math.round(h.lastHarvest?.breakdown?.oats||0)} / бобовые ${Math.round(h.lastHarvest?.breakdown?.pulses||0)}) · ${Math.round(h.annualFood)} кг/год на еду</div><div class="storage-line">${h.manor&&h.tenure!=='demesne'?`Повинности ${h.manor.served}/${h.manor.dueDays} дн. · рента ${h.manor.annualRentCoin} мон./год${h.manor.rentArrears?` · недоимка ${h.manor.rentArrears}`:''} · `:h.tenure==='demesne'?'Поместная пашня и амбар · ':'Наследуемые права · '}общинный выпас ${h.commonUse?'доступен':'не доступен'}${h.landProject?' · расчистка '+h.landProject.days+'/12 рабочих дней':''}${h.buildProject?' · строительство двора '+h.buildProject.days+'/50 дней':''}${h.migration?' · переселение в пути':''}</div><div class="storage-line">Амбар ${storageInfo} · уровень ${h.storeLevel||0}</div>${debtLine}<button data-action="econ-detail" class="econ-toggle" aria-expanded="${economyOpen}">${economyOpen?'Свернуть хозяйственный учёт':'Почему семья так работает?'} <span>${economyOpen?'−':'+'}</span></button>${econDetail}<div class="members">${residents}</div>${deceased.length?`<div class="family-archive">Память семьи: ${deceased.map(p=>`<button data-person="${p.id}">${escapeHTML(p.name)} (†${Math.floor(p.age)})</button>`).join(' ')}</div>`:''}${personInfo}${!current&&last?`<p class="note">${escapeHTML(last.message)} — ${escapeHTML(last.cause)}.</p>`:''}`;
 el.scrollTop=Math.min(originalPosition,el.scrollHeight);
 return;
}
if(mode==='laboratory'){
 const d=diagnoseWorld(sim),risk=d.homes?Math.round(100*d.familiesUnder30Days/d.homes):0;
 const communities=d.communities.map(c=>`<div class="lab-region"><b>${escapeHTML(c.name)}</b><span>${c.people} жителей · ${c.atRiskHomes}/${c.homes} семей с запасом менее 30 дней</span></div>`).join('');
 const labels={femaleFirstMarriage:'Брак женщин',maleFirstMarriage:'Брак мужчин',householdSize:'Размер семьи',customaryTenementsAbove10Acres:'Крупные зависимые держания'};
 const historic=d.historicalEvidence.map(x=>`${labels[x.metric]}: ${x.observed===null?'нет наблюдений':x.unit==='share'?Math.round(x.observed*100)+'%':x.observed} / ≈${x.unit==='share'?Math.round(x.reference*100)+'%':x.reference}${x.interpretation==='insufficient-sample'?' (малая выборка)':''}`).join(' · ');
 const settings=Object.entries(d.tuning).filter(([,v])=>v!==1).map(([k,v])=>`${{yield:'Урожайность',storage:'Амбары',planting:'Посев',transport:'Перевозки',weather:'Погода'}[k]} ×${v}`).join(' · ');
 el.innerHTML=`<div class="lab-head"><strong>Срез экономики · год ${d.year}</strong><button data-action="lab-back" aria-label="Вернуться к данным">← Данные</button></div>
 <div class="lab-grid"><div><small>Риск нехватки</small><strong>${risk}%</strong><span>${d.familiesUnder30Days} из ${d.homes} семей</span></div><div><small>Медианный запас</small><strong>${Math.round(d.foodDaysMedian)} дн.</strong><span>10-й процентиль: ${Math.round(d.foodDaysP10)} дн.</span></div><div><small>Неравенство зерна</small><strong>${d.grainGini.toFixed(2)}</strong><span>Коэффициент Джини, по семьям</span></div><div><small>Неравенство монет</small><strong>${d.coinGini.toFixed(2)}</strong><span>Коэффициент Джини, по семьям</span></div></div>
 <div class="lab-foot">Земля: ${d.landlessHomes} безземельных хозяйств · медиана ${d.medianLandHa} га · Джини ${d.landGini.toFixed(2)} · переселились ${d.migratedPersons} жителей, из них в услужение ${d.serviceMigrants||0}.</div><div class="lab-subtitle">Исторические ориентиры · около 1300 года</div><div class="lab-foot">${historic} · Это сравнение с литературой, не историческая гарантия. Источники — в JSON экспорте.</div><div class="lab-subtitle">Общины</div>${communities}<div class="lab-foot">${settings?`Опытные настройки: ${escapeHTML(settings)}`:'Исходные коэффициенты модели'} · Ссуд зерном: ${Math.round(d.loanIssuedKg||0)} кг, невозвратов: ${d.loanDefaults||0} · Овёс ${Math.round(d.oatsKg||0)} кг, бобовые ${Math.round(d.pulsesKg||0)} кг · Овец ${d.sheep||0}, шерсть ${Math.round(d.woolKg||0)} кг · Внешний рынок: ввезено ${Math.round(d.outsideGrainKg||0)} кг, вывезено шерсти ${Math.round(d.exportedWoolKg||0)} кг · Умерли от голода: ${d.hungerDeaths} · Погибшие и пустые дома не входят в доли семей.</div><button data-action="lab-export" class="lab-export">Экспорт измерений JSON</button>`;
 return;
}
if(mode==='chronicle'){el.innerHTML=sim.events.slice(-40).reverse().map(e=>`<button class="event" data-event="${e.id}"><time>${Math.floor(e.day/365)+1} г.</time><span class="body">${escapeHTML(e.message)}<small>${escapeHTML(e.cause)}</small></span></button>`).join('')||'<p class="note">Пока нет событий.</p>';return;}
const a=audit(sim);el.innerHTML=`<button data-action="lab-open" class="lab-entry">Экономический срез <span>→</span></button><div class="tool-actions"><button data-action="save">Сохранить</button><button data-action="export">Экспорт JSON</button><button data-action="import">Импорт JSON</button><button data-action="reset" class="danger">Новый мир</button></div><div class="tool-foot">Seed ${sim.seed} · ${a.ok?'Проверка ресурсов и денег пройдена':escapeHTML(a.issues[0])} · IndexedDB, офлайн</div>`;}
function setTab(m){mode=m;document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===(m==='laboratory'?'tools':m)));renderSheet();}
function findHouse(x,y){const xi=Math.floor(x),yi=Math.floor(y);if(xi>=0&&yi>=0&&xi<SIZE&&yi<SIZE){const plot=yi*SIZE+xi;if(sim.usage[plot]===2||sim.usage[plot]===3){
 const holder=sim.households.find(h=>h.fields.includes(plot)||(h.croft||[]).includes(plot));
 if(holder)return holder;
}}let best=null,d=Infinity;for(const h of sim.households){const dd=Math.hypot(h.x-x,h.y-y);if(dd<d){d=dd;best=h;}}return d<Math.max(2.2,14/cam.z/PX)?best:null;}
function selectAt(px,py){const p=screenToMap(px,py),h=findHouse(p.x,p.y);if(h){selected=h.id;selectedPerson=null;economyOpen=false;setTab('household');$('#world-label').textContent=`Дом ${getHousehold(sim,h.id).name}`;}else{selected=null;selectedPerson=null;const c=sim.communities.map(c=>({...c,d:Math.hypot(c.x-p.x,c.y-p.y)})).sort((a,b)=>a.d-b.d)[0];$('#world-label').textContent=c?.d<25?c.name:'Неосвоенная земля';setTab('overview');}renderSheet();}
function onPointerDown(e){if(e.target!==canvas&&e.target!==worldNode)return;e.preventDefault();worldNode.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===1){drag={x:e.clientX,y:e.clientY,startX:cam.x,startY:cam.y,moved:false};pinch=null;}else if(pointers.size===2){const p=[...pointers.values()];pinch={length:Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y),z:cam.z};drag=null;}}
function onPointerMove(e){if(!pointers.has(e.pointerId))return;e.preventDefault();pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===2){const p=[...pointers.values()],len=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);if(pinch&&pinch.length)zoom(len/pinch.length*pinch.z/cam.z,(p[0].x+p[1].x)/2,(p[0].y+p[1].y)/2);return;}if(drag){const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.hypot(dx,dy)>7)drag.moved=true;cam.x=drag.startX+dx;cam.y=drag.startY+dy;}}
function onPointerUp(e){if(!pointers.has(e.pointerId))return;const wasTap=drag&&!drag.moved&&pointers.size===1&&e.type==='pointerup';pointers.delete(e.pointerId);try{worldNode.releasePointerCapture(e.pointerId);}catch{}if(wasTap)selectAt(e.clientX,e.clientY);drag=null;if(pointers.size<2)pinch=null;}
worldNode.addEventListener('pointerdown',onPointerDown);worldNode.addEventListener('pointermove',onPointerMove);worldNode.addEventListener('pointerup',onPointerUp);worldNode.addEventListener('pointercancel',onPointerUp);
worldNode.addEventListener('wheel',e=>{e.preventDefault();zoom(e.deltaY>0?.83:1.2,e.clientX,e.clientY);},{passive:false});
$('#zoom-plus').addEventListener('click',()=>zoom(1.35,canvas.getBoundingClientRect().left+canvas.clientWidth/2,canvas.getBoundingClientRect().top+canvas.clientHeight/2));
$('#zoom-minus').addEventListener('click',()=>zoom(.74,canvas.getBoundingClientRect().left+canvas.clientWidth/2,canvas.getBoundingClientRect().top+canvas.clientHeight/2));$('#center').addEventListener('click',()=>fitView());$('#village-view').addEventListener('click',()=>{if(!sim)return;const c=sim.communities.reduce((a,b)=>!a||Math.hypot(b.x-(canvas.width/2-cam.x)/(PX*cam.z),b.y-(canvas.height/2-cam.y)/(PX*cam.z))<Math.hypot(a.x-(canvas.width/2-cam.x)/(PX*cam.z),a.y-(canvas.height/2-cam.y)/(PX*cam.z))?b:a,null);if(c)centerOn(c.x,c.y);});
document.querySelectorAll('[data-speed]').forEach(b=>b.addEventListener('click',()=>{speed=Number(b.dataset.speed);updateHUD();}));document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>setTab(b.dataset.tab)));
$('#sheet-content').addEventListener('click',e=>{const person=e.target.closest('[data-person]');if(person){selectedPerson=Number(person.dataset.person);renderSheet();return;}if(e.target.closest('[data-person-back]')){selectedPerson=null;renderSheet();return;}const eventButton=e.target.closest('[data-event]');if(eventButton){const item=sim.events.find(v=>v.id===Number(eventButton.dataset.event));const h=item?.subjects.map(id=>sim.households.find(x=>x.id===id)).find(Boolean);if(h){selected=h.id;selectedPerson=null;economyOpen=false;setTab('household');centerOn(h.x,h.y);}else if(item)toast(item.cause);return;}const b=e.target.closest('[data-action]');if(!b)return;switch(b.dataset.action){case'econ-detail':economyOpen=!economyOpen;renderSheet();break;case'lab-open':speed=0;setTab('laboratory');break;case'lab-back':setTab('tools');break;case'lab-export':exportLab();break;case'save':save().then(()=>toast('Мир записан в IndexedDB')).catch(err=>toast(err.message));break;case'export':exportSave();break;case'import':$('#import-file').click();break;case'reset':speed=0;$('#modal').hidden=false;break;}});
$('#cancel-reset').addEventListener('click',()=>$('#modal').hidden=true);$('#confirm-reset').addEventListener('click',()=>{const seedText=$('#world-seed').value.trim();const seedNumber=seedText===''?((Date.now()&0xffffffff)>>>0):Number(seedText);if(!Number.isInteger(seedNumber)||seedNumber<0||seedNumber>4294967295){toast('Seed должен быть целым числом от 0 до 4294967295');return;}sim=createWorld(seedNumber,{scenario:$('#world-scenario').value,tuning:experimentPreset($('#world-experiment').value)});selected=null;selectedPerson=null;economyOpen=false;speed=0;previousPeople=null;dirty=true;fitView();lastSavedDay=-1;$('#modal').hidden=true;setTab('overview');save().then(()=>toast('Создана новая долина с выбранными условиями')).catch(err=>toast(err.message));});
function centerOn(x,y){const r=worldNode.getBoundingClientRect();cam.z=Math.max(cam.z,1.28);cam.x=r.width/2-x*PX*cam.z;cam.y=r.height/2-y*PX*cam.z;}
$('#import-file').addEventListener('change',async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;try{const value=deserialize(await file.text());sim=value;speed=0;selected=null;selectedPerson=null;previousPeople=null;dirty=true;fitView();updateHUD();await save();toast('Мир успешно импортирован');}catch(err){toast(`Импорт не удался: ${err.message}`);}});
function experimentPreset(name){
 const items={normal:{},yieldLow:{yield:.85},storageLow:{storage:.75},plantingHigh:{planting:1.2},transportHigh:{transport:1.5},weatherHigh:{weather:1.5}};
 return items[name]||{};
}
function exportLab(){try{
 const data=diagnoseWorld(sim);const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob);
 const a=document.createElement('a');a.href=url;a.download=`living-history-lab-${sim.seed}-year${data.year}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),4000);
 toast('Измерения экспортированы в JSON');
}catch(err){toast(`Экспорт: ${err.message}`);}}
function exportSave(){try{const blob=new Blob([serialize(sim)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`living-history-${sim.seed}-day${sim.day}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),4000);toast('Создан файл сохранения');}catch(err){toast(err.message);}}
function db(){return new Promise((resolve,reject)=>{const req=indexedDB.open('pw-living-history-v1',1);req.onupgradeneeded=()=>req.result.createObjectStore('saves');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||Error('IndexedDB недоступна'));});}
async function save(){if(!sim||savePending)return;savePending=true;let base;const snapshotDay=sim.day;try{base=await db();const payload=serialize(sim);await new Promise((res,rej)=>{const t=base.transaction('saves','readwrite');t.objectStore('saves').put(payload,'latest');t.oncomplete=()=>res();t.onerror=()=>rej(t.error);});lastSavedDay=snapshotDay;}finally{savePending=false;base?.close();}}
async function load(){let base=await db();try{const raw=await new Promise((res,rej)=>{const req=base.transaction('saves','readonly').objectStore('saves').get('latest');req.onsuccess=()=>res(req.result);req.onerror=()=>rej(req.error);});return raw?deserialize(raw):null;}finally{base.close();}}
function animate(now){requestAnimationFrame(animate);if(!active||!sim){last=now;return;}const dt=Math.min(.08,(now-last)/1000);last=now;if(speed>0){acc+=speed*dt;const days=Math.min(Math.floor(acc),40);if(days){previousPeople=new Map(sim.people.filter(p=>p.alive).map(p=>[p.id,{x:p.x,y:p.y}]));advanceDays(sim,days);acc-=days;if(Math.floor(sim.day/5)!==Math.floor((sim.day-days)/5))dirty=true;if(sim.day-lastSavedDay>=100)save().catch(err=>toast(`Автосохранение: ${err.message}`));}}movementFraction=Math.max(0,Math.min(1,acc));if(now-lastStats>550){updateHUD();lastStats=now;}drawFrame();}
window.addEventListener('resize',()=>{resize();});document.addEventListener('visibilitychange',()=>{active=!document.hidden;if(!active)save().catch(()=>{});last=performance.now();});window.addEventListener('pagehide',()=>save().catch(()=>{}));
async function init(){try{sim=await load();if(sim)toast('Продолжена сохранённая история');}catch(err){toast(`Локальная база: ${err.message}`);}if(!sim)sim=createWorld(43821);fitView();const village=sim.communities[0];if(village)centerOn(village.x,village.y);dirty=true;updateHUD();requestAnimationFrame(animate);}
init();