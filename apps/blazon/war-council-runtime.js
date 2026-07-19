const RELEASE='5.8.0';
const root=document.documentElement;
root.dataset.blazonArt='war-council';
root.dataset.blazonCommand='campaign-book';

const $=(selector,scope=document)=>scope.querySelector(selector);
const $$=(selector,scope=document)=>[...scope.querySelectorAll(selector)];
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)');
const slotMeta={
  'Поле':{slot:'field',mark:'◌',caption:'темперамент'},
  'Строй':{slot:'ordinary',mark:'⌗',caption:'порядок'},
  'Ратники':{slot:'main',mark:'♜',caption:'главный удар'},
  'Лучники':{slot:'secondary',mark:'➶',caption:'поддержка'},
  'Командование':{slot:'command',mark:'✦',caption:'высший приказ'},
  'Девиз':{slot:'motto',mark:'§',caption:'право исключения'}
};
const ruleMeta={
  contact:{icon:'⚔',label:'Столкновение'},break:{icon:'◇',label:'Строй сломлен'},crisis:{icon:'!',label:'Кризис'},
  motto:{icon:'§',label:'Девиз'},volley:{icon:'➶',label:'Залп'},doctrine:{icon:'◆',label:'Доктрина'},
  main:{icon:'♜',label:'Ратники'},field:{icon:'◌',label:'Поле'},victory:{icon:'✦',label:'Исход'}
};
let lastState=null;
let lastEventKey='';
let lastFallbackText='';
let lastCommandText='Приказы ещё не вступили в силу';
let tickHandle=0;

function installPressStates(scope=document){
  for(const control of $$('button,.topbar a',scope)){
    if(control.dataset.pressReady)continue;
    control.dataset.pressReady='true';
    control.addEventListener('pointerdown',()=>control.classList.add('is-pressed'),{passive:true});
    const release=()=>control.classList.remove('is-pressed');
    control.addEventListener('pointerup',release,{passive:true});
    control.addEventListener('pointercancel',release,{passive:true});
    control.addEventListener('pointerleave',release,{passive:true});
  }
}

function decorateLedger(ledger,side){
  if(!ledger)return;
  ledger.dataset.documentSide=side;
  const rows=$$('.layer-row',ledger);
  rows.forEach((row,index)=>{
    const label=$(':scope>span',row)?.textContent.trim()||'';
    const meta=slotMeta[label]||{slot:`slot-${index}`,mark:'·',caption:'слой устава'};
    row.dataset.slot=meta.slot;
    row.dataset.layerState=row.classList.contains('is-empty')?'sealed':'inscribed';
    if(!$('.ledger-sigil',row))row.insertAdjacentHTML('afterbegin',`<i class="ledger-sigil" aria-hidden="true">${meta.mark}</i>`);
    const copy=$(':scope>div',row);
    if(copy&&!$('.ledger-caption',copy))copy.insertAdjacentHTML('afterbegin',`<em class="ledger-caption">${meta.caption}</em>`);
  });
}

function decorateDoctrineBook(){
  const screen=$('#doctrineScreen');
  if(!screen)return;
  screen.dataset.campaignBook='true';
  const player=$('.player-column',screen);
  const enemy=$('.enemy-column',screen);
  if(player&&!$('.document-tab',player))player.insertAdjacentHTML('afterbegin','<div class="document-tab"><b>I</b><span>Устав рода</span></div>');
  if(enemy&&!$('.document-tab',enemy))enemy.insertAdjacentHTML('afterbegin','<div class="document-tab"><b>II</b><span>Разведдонесение</span></div>');
  const order=$('.battle-order',screen);
  if(order&&!$('.order-kicker',order)){
    order.insertAdjacentHTML('afterbegin','<div class="order-kicker"><span>ПОЛЕВОЙ ПРИКАЗ</span><i></i></div>');
    const button=$('#startBattleButton',order);
    button?.insertAdjacentHTML('beforebegin','<div class="order-oath"><i>⚔</i><span>После поднятия знамён устав исполняется без вмешательства.</span></div>');
  }
  decorateLedger($('#playerLedger'),'player');
  decorateLedger($('#enemyLedger'),'enemy');
}

function layerNameFromCard(card){
  const raw=$('em',card)?.textContent.trim().toLowerCase()||'';
  if(raw.includes('поле'))return['field','Поле'];
  if(raw.includes('строй'))return['ordinary','Строй'];
  if(raw.includes('ратник')||raw.includes('главн'))return['main','Ратники'];
  if(raw.includes('лучник')||raw.includes('вторич'))return['secondary','Лучники'];
  if(raw.includes('команд'))return['command','Командование'];
  if(raw.includes('девиз'))return['motto','Девиз'];
  if(raw.includes('замен'))return['revision','Пересмотр'];
  return['unknown','Новый слой'];
}

function decorateRewards(){
  const dialog=$('#rewardDialog');
  const grid=$('#rewardGrid');
  if(!dialog||!grid)return;
  dialog.dataset.campaignReward='true';
  if(!$('.reward-ledger-intro',dialog)){
    dialog.querySelector('header')?.insertAdjacentHTML('afterend','<div class="reward-ledger-intro"><span>ВЫБЕРИ ОДНУ ЗАПИСЬ</span><p>Новый знак изменит и герб, и решения армии. Остальные предложения будут сожжены.</p></div>');
  }
  $$('.reward-card',grid).forEach((card,index)=>{
    const[layer,label]=layerNameFromCard(card);
    card.dataset.rewardLayer=layer;
    card.style.setProperty('--reward-index',index);
    if(!$('.reward-change',card))card.insertAdjacentHTML('afterbegin',`<div class="reward-change"><i>${String(index+1).padStart(2,'0')}</i><span>Вписать: ${label}</span></div>`);
  });
  installPressStates(dialog);
}

function formationData(node){
  if(!node)return{count:48,marks:'◆◆◆◆'};
  const count=Number($('span',node)?.textContent||String(node.textContent).match(/\d+/)?.[0]||48);
  const marks=$('small',node)?.textContent||'';
  return{count:Number.isFinite(count)?count:48,marks};
}

function conditionFor(army,formation){
  const broken=army?.brokenCount??(formation.marks.match(/◇/g)||[]).length;
  const shaken=(formation.marks.match(/◈/g)||[]).length;
  const capture=army?.banner?.capture||0;
  if(capture>.55||broken>=2||formation.count<=18)return{state:'danger',label:capture>.55?'Знамя под угрозой':'Фронт распадается'};
  if(capture>.18||broken>=1||shaken>=2||formation.count<=30)return{state:'warning',label:broken?'Строй проломлен':'Строй шатается'};
  if(formation.count<=40||shaken)return{state:'pressed',label:'Строй под давлением'};
  return{state:'steady',label:'Строй держится'};
}

function setupBattleCommand(){
  const screen=$('#battleScreen');
  const wrap=$('.battlefield-wrap',screen);
  const header=$('.battle-header',screen);
  const footer=$('.battle-footer',screen);
  if(!screen||!wrap||!header||!footer)return;
  screen.dataset.commandInterface='true';
  if(!$('.battle-command-ribbon',wrap)){
    const ribbon=document.createElement('section');
    ribbon.className='battle-command-ribbon';
    ribbon.setAttribute('aria-label','Состояние армий');
    const player=$('.player-hud',wrap);
    const enemy=$('.enemy-hud',wrap);
    const center=document.createElement('div');
    center.className='front-command';
    center.innerHTML='<span id="frontPhase">СБЛИЖЕНИЕ</span><div class="front-balance" aria-hidden="true"><i></i><b></b></div><small id="frontCaption">Равные силы</small>';
    if(player)ribbon.append(player);
    ribbon.append(center);
    if(enemy)ribbon.append(enemy);
    wrap.prepend(ribbon);
    for(const hud of [player,enemy])if(hud&&!$('.army-condition',hud)){
      hud.insertAdjacentHTML('beforeend','<div class="army-condition"><i></i><span>Строй держится</span></div><div class="army-strength" aria-hidden="true"><i></i></div>');
    }
  }
  if(!$('.battle-event-rail',wrap))wrap.insertAdjacentHTML('beforeend','<aside class="battle-event-rail" aria-label="Срабатывания доктрины"></aside><div class="battle-pings" aria-hidden="true"></div>');
  const footerText=$(':scope>span',footer);
  if(footerText){footerText.hidden=false;footerText.id='battleCommandText';footerText.innerHTML='<b id="battleFooterPhase">СБЛИЖЕНИЕ</b><span id="battleFooterEvent">Приказы ещё не вступили в силу</span>';}
  const centerHeader=$(':scope>div',header);
  if(centerHeader&&!$('.header-ornament',centerHeader))centerHeader.insertAdjacentHTML('afterbegin','<i class="header-ornament" aria-hidden="true"></i>');
}

function battlePhase(time,status){
  if(status==='finished')return['ИСХОД РЕШЁН','Поле замолчало'];
  if(time<8)return['СБЛИЖЕНИЕ','Ряды занимают дистанцию'];
  if(time<25)return['ПЕРВЫЙ НАТИСК','Передние ряды входят в бой'];
  if(time<55)return['ДАВЛЕНИЕ','Доктрины раскрывают замысел'];
  if(time<85)return['ПЕРЕЛОМ','Каждый разрыв становится решающим'];
  return['ПОСЛЕДНИЕ РЯДЫ','Знамёна требуют окончательного ответа'];
}

function formatTime(value){
  const sec=Math.max(0,Math.floor(value||0));
  return`${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;
}

function createPing(event){
  if(!Number.isFinite(event?.x)||!Number.isFinite(event?.y))return;
  const host=$('.battle-pings');
  if(!host)return;
  const ping=document.createElement('i');
  ping.className='battle-ping';
  ping.dataset.side=event.side||'both';
  ping.style.left=`${clamp(event.x/720*100,4,96)}%`;
  ping.style.top=`${clamp(event.y/1120*100,7,93)}%`;
  host.append(ping);
  setTimeout(()=>ping.remove(),reduceMotion.matches?900:1800);
}

function pushEvent(event){
  const rail=$('.battle-event-rail');
  if(!rail||!event?.text)return;
  const meta=ruleMeta[event.rule]||{icon:'·',label:'Поле'};
  const card=document.createElement('article');
  card.className='command-event';
  card.dataset.side=event.side||'both';
  card.dataset.rule=event.rule||'field';
  card.innerHTML=`<i>${meta.icon}</i><div><time>${formatTime(event.time)}</time><b>${meta.label}</b><span>${event.text}</span></div>`;
  rail.prepend(card);
  while(rail.children.length>3)rail.lastElementChild.remove();
  lastCommandText=event.text;
  createPing(event);
}

function consumeEvents(state){
  const events=state?.keyEvents?.length?state.keyEvents:state?.decisive;
  const event=events?.at?.(-1);
  if(!event)return;
  const key=`${event.time}|${event.side}|${event.rule}|${event.text}`;
  if(key===lastEventKey)return;
  lastEventKey=key;
  pushEvent(event);
}

function fallbackRuleFlash(){
  const node=$('#ruleFlash');
  const text=node?.textContent.trim()||'';
  if(!text||text===lastFallbackText)return;
  lastFallbackText=text;
  pushEvent({time:0,side:'both',rule:'doctrine',text});
}

function updateBattleCommand(){
  const screen=$('#battleScreen');
  if(!screen?.classList.contains('is-active'))return;
  const state=globalThis.__blazonBattleState||null;
  if(state!==lastState){lastState=state;lastEventKey='';const rail=$('.battle-event-rail');if(rail)rail.replaceChildren();}
  const playerFormation=formationData($('#playerFormation'));
  const enemyFormation=formationData($('#enemyFormation'));
  const player=conditionFor(state?.player,playerFormation);
  const enemy=conditionFor(state?.enemy,enemyFormation);
  const playerHud=$('.player-hud');
  const enemyHud=$('.enemy-hud');
  for(const [hud,condition,formation] of [[playerHud,player,playerFormation],[enemyHud,enemy,enemyFormation]])if(hud){
    hud.dataset.condition=condition.state;
    const label=$('.army-condition span',hud);if(label)label.textContent=condition.label;
    hud.style.setProperty('--army-strength',`${clamp(formation.count/48*100,0,100)}%`);
  }
  const time=state?.time??(()=>{const parts=($('#battleClock')?.textContent||'0:0').split(':').map(Number);return(parts[0]||0)*60+(parts[1]||0);})();
  const[phase,caption]=battlePhase(time,state?.status);
  const phaseNode=$('#frontPhase');if(phaseNode)phaseNode.textContent=phase;
  const captionNode=$('#frontCaption');if(captionNode)captionNode.textContent=caption;
  const footerPhase=$('#battleFooterPhase');if(footerPhase)footerPhase.textContent=phase;
  const footerEvent=$('#battleFooterEvent');if(footerEvent)footerEvent.textContent=lastCommandText;
  const playerCapture=state?.enemy?.banner?.capture||0;
  const enemyCapture=state?.player?.banner?.capture||0;
  const balance=clamp(50+(playerFormation.count-enemyFormation.count)/48*32+(playerCapture-enemyCapture)*10,8,92);
  const command=$('.front-command');if(command)command.style.setProperty('--front-balance',`${balance}%`);
  screen.dataset.battlePhase=phase.toLowerCase().replaceAll(' ','-');
  consumeEvents(state);
  if(!state)fallbackRuleFlash();
}

function decorateResult(){
  const dialog=$('#resultDialog');
  if(!dialog)return;
  const title=$('#resultTitle')?.textContent||'';
  const won=/вражес|побед|устояло/i.test(title)&&!/твой фронт/i.test(title);
  dialog.dataset.verdict=won?'victory':'defeat';
  if(!$('.battle-verdict',dialog))dialog.querySelector('header')?.insertAdjacentHTML('afterend','<div class="battle-verdict"><i></i><div><span>ПОЛЕВАЯ ВЕДОМОСТЬ</span><b id="battleVerdictCopy"></b></div><i></i></div>');
  const copy=$('#battleVerdictCopy');const verdict=won?'Устав выдержал проверку полем':'Устав потребует пересмотра';if(copy&&copy.textContent!==verdict)copy.textContent=verdict;
  $$('#resultMeasures>div').forEach((item,index)=>item.style.setProperty('--measure-index',index));
}

function syncVersion(){
  const footer=$('.menu-screen footer');if(footer)footer.textContent=`v${RELEASE} · campaign command`;
  const manager=$('[data-update-manager]');if(manager)manager.dataset.appVersion=RELEASE;
  const workshopTitle=$('.workshop-mode #workshop-title');if(workshopTitle)workshopTitle.textContent=workshopTitle.textContent.replace(/5\.[0-9]+\.[0-9]+\b/,RELEASE);
}

function refreshDynamicUI(){
  decorateDoctrineBook();
  decorateRewards();
  decorateResult();
  installPressStates();
}

const standard=$('.menu-standard');
if(standard&&!$('.standard-crossbar',standard))standard.insertAdjacentHTML('beforeend','<div class="standard-crossbar" aria-hidden="true"></div><div class="standard-cords" aria-hidden="true"></div>');
const menu=$('.menu-screen');
if(menu&&!reduceMotion.matches){
  const move=event=>{const rect=menu.getBoundingClientRect(),x=(event.clientX-rect.left)/Math.max(1,rect.width)-.5,y=(event.clientY-rect.top)/Math.max(1,rect.height)-.5;menu.style.setProperty('--tent-light-x',`${50+x*8}%`);menu.style.setProperty('--tent-light-y',`${28+y*5}%`);};
  menu.addEventListener('pointermove',move,{passive:true});
  menu.addEventListener('pointerleave',()=>{menu.style.removeProperty('--tent-light-x');menu.style.removeProperty('--tent-light-y');},{passive:true});
}
const continueButton=$('#continueButton');
const syncCampaignState=()=>menu?.classList.toggle('has-campaign',Boolean(continueButton&&!continueButton.hidden));
if(continueButton)new MutationObserver(syncCampaignState).observe(continueButton,{attributes:true,attributeFilter:['hidden']});

setupBattleCommand();
refreshDynamicUI();
syncVersion();
syncCampaignState();

const dynamicRoots=[$('.app-shell'),...$$('dialog')].filter(Boolean);
const observer=new MutationObserver(records=>{
  if(records.some(record=>record.type==='childList'||record.type==='attributes'))queueMicrotask(refreshDynamicUI);
});
for(const target of dynamicRoots)observer.observe(target,{subtree:true,childList:true,attributes:true,attributeFilter:['class','open']});

clearInterval(tickHandle);
tickHandle=setInterval(updateBattleCommand,125);
window.addEventListener('pagehide',()=>clearInterval(tickHandle),{once:true});
