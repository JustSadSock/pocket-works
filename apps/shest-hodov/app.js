import {installMobileRuntime} from '../../shared/mobile-runtime.js';
import {MODES,start,apply,legal,validateStored,POINTS,ownerOfRegion,scoreOfRegions} from './core.js';
import {chooseAIAction,isAITurn} from './ai.js';
installMobileRuntime();

const KEY='pocket-works:shest-hodov:v1';
const $=id=>document.getElementById(id);
const names=['Красные','Синие'];
let state=null,open=false,draft=[0,0,0,0,0],commands=[null,null],direction=1,notification='',restartArmed=false;
let chosenOpponent='ai',chosenDifficulty='normal',aiTimer=null,aiErrorLocked=false;
try{const stored=JSON.parse(localStorage.getItem(KEY)||'null');if(validateStored(stored))state=stored;}catch{}
const save=()=>{try{if(state)localStorage.setItem(KEY,JSON.stringify(state));else localStorage.removeItem(KEY)}catch{}};
function resetDraft(){draft=[0,0,0,0,0];commands=[null,null];}
function stopAI(){if(aiTimer!==null){clearTimeout(aiTimer);aiTimer=null}}
function queueAI(){
  if(!open||!isAITurn(state)||aiTimer!==null||aiErrorLocked)return;
  aiTimer=setTimeout(()=>{
    aiTimer=null;
    if(!open||!isAITurn(state))return;
    try{
      const action=chooseAIAction(state,state.difficulty);
      if(!action){aiErrorLocked=true;notification='ИИ не нашёл допустимый ход';render();return}
      const next=apply(state,action);
      if(!next.ok){aiErrorLocked=true;notification='Ошибка хода ИИ: '+next.reason;render();return}
      state=next.state;notification='';restartArmed=false;resetDraft();save();render();
    }catch(error){aiErrorLocked=true;notification='Ошибка вычисления ИИ. Начните новую партию.';console.error('Six Duels AI:',error);render()}
  },80);
}
function play(action){
  const result=apply(state,action);
  if(!result.ok){notification=result.reason;render();return false}
  state=result.state;notification='';restartArmed=false;
  if(state.kind==='influence'||state.kind==='protocol')resetDraft();
  save();render();return true;
}
const el=(name,props={},children='')=>{const x=document.createElement(name);Object.assign(x,props);if(children)x.innerHTML=children;return x;};
function choose(kind,opponent=chosenOpponent,difficulty=chosenDifficulty){
  stopAI();aiErrorLocked=false;state=start(kind);state.opponent=opponent==='ai'?'ai':'local';state.difficulty=['easy','normal','hard'].includes(difficulty)?difficulty:'normal';
  open=true;notification='';resetDraft();restartArmed=false;save();render();
}
function turnText(){
  if(state.finished)return state.winner===-1?'Ничья':state.opponent==='ai'&&state.winner===1?'Победа ИИ':`Победа: ${names[state.winner]}`;
  if(isAITurn(state))return 'ИИ обдумывает ход';
  if(['influence','protocol'].includes(state.kind)){
    if(state.phase==='pass')return 'Передайте устройство';
    if(state.phase==='reveal')return 'Раунд завершён';
    return `Планирует: ${names[state.planner]}`;
  }
  return `Ход: ${names[state.turn]}`;
}
function boardGrid(){
  const n=state.kind==='infection'?8:state.kind==='rotate'?6:7;
  const kind=state.kind,container=el('div',{className:`gridboard ${kind}`});
  container.style.setProperty('--n',n);
  const moves=new Set(legal(state));
  for(let i=0;i<n*n;i++){
    const v=state.cells[i],row=Math.floor(i/n),col=i%n;
    const selectable=!isAITurn(state)&&(kind==='rotate'&&state.stage==='rotate'||moves.has(i));
    const button=el('button',{type:'button',className:`cell ${v===-2?'gone':v===0?'red':v===1?'blue':'empty'} ${selectable?'legal':''}`,disabled:!selectable||state.finished});
    button.dataset.id=String(i);button.setAttribute('aria-label',`Строка ${row+1}, столбец ${col+1}`);
    if(kind==='bridge')button.style.setProperty('--row',row%2);
    if(kind==='rotate'&&state.stage==='rotate'){button.dataset.block=String(Math.floor(row/2)*3+Math.floor(col/2));button.classList.add('quarter');if(row%2===0)button.classList.add('qtop');if(col%2===0)button.classList.add('qleft');}
    if(selectable&&v===-1&&kind!=='bridge')button.classList.add('available');
    container.append(button);
  }
  $('board').append(container);
}
function boardProtocol(){
  const b=el('div',{className:'gridboard protocol'});b.style.setProperty('--n',5);
  for(let i=0;i<25;i++){
    const v=state.positions.indexOf(i),cell=el('div',{className:`cell ${POINTS.includes(i)?'point':''} ${v===0?'red':v===1?'blue':''}`});
    cell.textContent=POINTS.includes(i)&&v<0?'·':'';
    b.append(cell);
  }
  $('board').append(b);
}
function boardInfluence(){
  const b=el('div',{className:'regions'});
  const score=scoreOfRegions(state);
  for(let i=0;i<5;i++){
    const [a,c]=state.regions[i],owner=ownerOfRegion(state,i);
    const card=el('section',{className:`region ${owner===0?'red':owner===1?'blue':''}`},
      `<div class="region-top"><b>Регион ${i+1}</b><span>${owner<0?'Нейтральный':names[owner]}</span></div><div class="region-score"><strong>${a}</strong> : <strong>${c}</strong></div>`);
    if(state.phase==='plan'&&!state.finished)card.append(el('div',{className:'allocation'},
      `<button type="button" data-inc="${i}" aria-label="Добавить в регион ${i+1}">+</button><span>+${draft[i]}</span><button type="button" data-dec="${i}" aria-label="Убрать из региона ${i+1}">−</button>`));
    b.append(card);
  }
  $('board').append(b);
  $('score').textContent=`Регионы: ${score[0]} — ${score[1]}`;
}
function button(label,action,disabled=false,cls=''){
  const b=el('button',{type:'button',className:`action ${cls}`,textContent:label,disabled});
  b.addEventListener('click',action);return b;
}
function controls(){
  const box=$('actions');
  if(state.finished){
    if(state.kind==='protocol')$('score').textContent=`Очки: ${state.scores[0]} — ${state.scores[1]}`;
    if(state.kind==='influence'&&state.last)box.append(el('p',{className:'note',textContent:'Последний раунд: '+state.last.map(a=>a.join(' · ')).join(' / ')}));
    box.append(button('Сыграть ещё',()=>choose(state.kind,state.opponent,state.difficulty)));return;
  }
  if(isAITurn(state)){
    box.append(el('p',{className:'ai-status',textContent:'ИИ выбирает ход…'}));return;
  }
  if(state.kind==='rotate'){
    if(state.stage==='rotate'){
      box.append(el('p',{className:'instruction',textContent:'Выберите направление и коснитесь любого квадрата 2×2'}));
      const group=el('div',{className:'toggle'});
      group.append(button('↻ По часовой',()=>{direction=1;render()},false,direction===1?'selected':''),button('↺ Против',()=>{direction=-1;render()},false,direction===-1?'selected':''));
      box.append(group);
    }else box.append(el('p',{className:'instruction',textContent:'Теперь переместите свою фишку на соседнюю клетку'}));
    return;
  }
  if(state.kind==='bridge'||state.kind==='infection'||state.kind==='void')return;
  if(state.phase==='pass'){
    $('board').replaceChildren(el('div',{className:'handoff'},`<h2>Передайте устройство</h2><p>План первого игрока скрыт. Следующим ходит второй игрок.</p>`));
    box.append(button('Я второй игрок — начать',()=>play({type:'continue'})));return;
  }
  if(state.phase==='reveal'){
    if(state.kind==='influence')box.append(el('p',{className:'note',textContent:'Распределение: '+state.last.map(a=>a.join(' · ')).join(' / ')}));
    else box.append(el('p',{className:'note',textContent:'Команды: '+state.last.plans.map(a=>a.map(c=>commandLabels[c]).join(' → ')).join(' / ')}));
    box.append(button('Следующий раунд',()=>play({type:'continue'})));return;
  }
  if(state.kind==='influence'){
    const total=draft.reduce((a,b)=>a+b,0);
    box.append(el('p',{className:'note',textContent:`Выбрано ${total} из 3 жетонов. Красный и синий счётчики — накопленное влияние.`}));
    box.append(button('Зафиксировать распределение',()=>play({type:'submit',alloc:draft}),total!==3));return;
  }
  const grid=el('div',{className:'plan'});const dirs=['up','left','stay','right','down'];
  for(let step=0;step<2;step++){
    const row=el('div',{className:'command-row'});
    row.append(el('b',{textContent:`Шаг ${step+1}`}));
    for(const dir of dirs)row.append(button(commandLabels[dir],()=>{commands[step]=dir;render()},false,commands[step]===dir?'selected':''));
    grid.append(row);
  }
  box.append(grid);
  box.append(button('Зафиксировать команды',()=>play({type:'submit',commands}),commands.some(v=>!v)));
}
const commandLabels={up:'↑',down:'↓',left:'←',right:'→',stay:'•'};
function render(){
  $('resume').hidden=!state;
  $('menu').hidden=open;
  $('aiChoice').classList.toggle('active',chosenOpponent==='ai');
  $('duelChoice').classList.toggle('active',chosenOpponent==='local');
  $('difficultyWrap').hidden=chosenOpponent!=='ai';
  $('difficulty').value=chosenDifficulty;
  $('match').hidden=!open;
  $('back').hidden=!open;
  if(!open)return;
  $('title').textContent=MODES[state.kind].name;
  $('subtitle').textContent=MODES[state.kind].subtitle;
  $('turn').textContent=turnText();
  $('turn').className=`turn ${state.finished?'':names[(state.kind==='protocol'||state.kind==='influence')?state.planner:state.turn]==='Красные'?'red':'blue'}`;
  $('rules').textContent=MODES[state.kind].rule;
  $('board').replaceChildren();$('actions').replaceChildren();$('score').textContent='';
  $('round').textContent=(state.opponent==='ai'?'Против ИИ · '+({'easy':'Простой','normal':'Обычный','hard':'Сложный'}[state.difficulty]||'Обычный'):'На двоих')+(['influence','protocol'].includes(state.kind)?` · Раунд ${Math.min(8,state.round+1)} из 8`:'');
  if(state.kind==='influence')boardInfluence();
  else if(state.kind==='protocol'){if(state.phase!=='pass')boardProtocol();$('score').textContent=`Очки: ${state.scores[0]} — ${state.scores[1]}`;}
  else boardGrid();
  if(state.kind==='infection')$('score').textContent='Фишки: '+state.cells.filter(v=>v===0).length+' — '+state.cells.filter(v=>v===1).length;
  controls();
  $('message').textContent=notification;
  queueAI();
  $('reset').textContent=restartArmed?'Подтвердить новую партию':'Новая партия';
}
$('catalog').addEventListener('click',e=>{const button=e.target.closest('[data-game]');if(button)choose(button.dataset.game)});
$('back').addEventListener('click',()=>{stopAI();open=false;notification='';render()});
$('aiChoice').addEventListener('click',()=>{chosenOpponent='ai';render()});
$('duelChoice').addEventListener('click',()=>{chosenOpponent='local';render()});
$('difficulty').addEventListener('change',e=>{chosenDifficulty=e.target.value;render()});
$('resume').addEventListener('click',()=>{if(state){open=true;render()}});
$('reset').addEventListener('click',()=>{
  if(!restartArmed){restartArmed=true;render();return}
  choose(state.kind,state.opponent,state.difficulty);
});
$('board').addEventListener('click',e=>{
  const inc=e.target.closest('[data-inc]'),dec=e.target.closest('[data-dec]');
  if(inc||dec){
    if(state.kind!=='influence'||state.phase!=='plan'||state.finished)return;
    const i=Number((inc||dec).dataset[inc?'inc':'dec']),total=draft.reduce((a,b)=>a+b,0);
    if(inc&&total<3)draft[i]++;if(dec&&draft[i]>0)draft[i]--;
    render();return;
  }
  const tile=e.target.closest('[data-id]');
  if(!tile||tile.disabled||state.finished||isAITurn(state))return;
  if(state.kind==='rotate'&&state.stage==='rotate')play({type:'rotate',block:Number(tile.dataset.block),dir:direction});
  else play({type:'move',id:Number(tile.dataset.id)});
});
window.addEventListener('pagehide',save);
document.addEventListener('visibilitychange',()=>{if(document.hidden)save()});
$('resume').hidden=!state;
$('catalog').replaceChildren(...Object.entries(MODES).map(([key,game],i)=>el('button',{type:'button',className:'game-option'},`<span class="game-number">${i+1}</span><span class="game-copy"><b>${game.name}</b><small>${game.subtitle}</small></span><span class="arrow">→</span>`)));
[...$('catalog').children].forEach((item,i)=>item.dataset.game=Object.keys(MODES)[i]);
render();
