import {clamp, formatYear} from './core.js';
import {keyframeValue,motionTrail,formatStoryTime} from './motion.js';
import {PALETTES, MAX_STORIES, createDraft,createPhaseDraft,cloneAsDraft,exportPackage,
  loadLibrary,parseImport,parseStory,persistLibrary,upsertLibrary,newId} from './studio-data.js';

import {COMMAND_ACTIONS,COMMAND_SIDES,validPolygon,polygonCenter} from './tactics.js';
import {borderAt,storyTracks,MAX_BORDER_FRAMES} from './frontiers.js';
const $=(id)=>document.getElementById(id);
const COLLECTIONS=['events','entities','features','paths','sources','commands'];
const LABELS={events:'События',entities:'Объекты',features:'Территории',paths:'Маршруты',sources:'Источники',commands:'Штабы'};
const CONFIDENCE=[
  ['hypothetical','Гипотеза автора'],
  ['estimated','Приблизительная реконструкция'],
  ['disputed','Спорная трактовка'],
  ['tradition','Предание'],
  ['confirmed','Подтверждено источником']
];
const TYPE_OPTIONS=[
 ['place','Место'],['city','Город'],['settlement','Поселение'],['battle','Поле битвы'],
 ['person','Человек'],['army','Воинское соединение'],['hill','Холм'],['river','Река'],['legend','Легенда'],['region','Область']
];
const FEATURE_OPTIONS=[['region','Регион'],['hill','Холм'],['zone','Выделенная зона'],['boundary','Полигон границы']];
const LANE_OPTIONS=[['politics','Политика'],['military','Война'],['culture','Общество']];
const deep=(x)=>JSON.parse(JSON.stringify(x));
const fmt=(t)=>Number.isFinite(t)?formatYear(t):'—';
const esc=(v)=>v==null?'':String(v);
const make=(tag,className='',label='')=>{
  const element=document.createElement(tag);
  if(className)element.className=className;
  if(label)element.textContent=label;
  return element;
};
function button(label,handler,className=''){
  const el=make('button',className,label);el.type='button';el.addEventListener('click',handler);return el;
}
function field(name,value,onChange,opts={}) {
  const wrapper=make('label','editor-field');
  wrapper.append(make('span','field-name',name));
  let input;
  if(opts.options){
    input=make('select');
    for(const [id,label] of opts.options){
      const option=make('option','',label);option.value=String(id);input.append(option);
    }
    input.value=esc(value);
  }else if(opts.long){
    input=make('textarea');input.rows=3;input.value=esc(value);
  }else{
    input=make('input');input.type=opts.number?'number':opts.url?'url':'text';
    input.value=esc(value);if(opts.number){input.step=opts.step||'any';}
    if(opts.placeholder)input.placeholder=opts.placeholder;
  }
  input.setAttribute('aria-label',name);
  input.addEventListener('change',()=>onChange(opts.number?(input.value===''?null:Number(input.value)):input.value));
  wrapper.append(input);
  return wrapper;
}
function status(message,kind='normal') {
  const node=$('studio-status');node.textContent=message;node.dataset.status=kind;
}
function customEntry(story,onOpen,onEdit){
  const row=make('div','personal-ticket');
  const text=make('div','personal-ticket-copy');
  text.append(make('strong','',story.title));
  text.append(make('small','',formatStoryTime(story.range[0],story)+' — '+formatStoryTime(story.range[1],story)+' · '+story.events.length+' событий'));
  row.append(text);
  row.append(button('Смотреть',()=>onOpen(story.id),'personal-view'));
  row.append(button('Править',()=>onEdit(story),'personal-edit'));
  return row;
}

export function initStudio({onOpen,onNotify,builtins}){
  const screen=$('studio');
  // Reading localStorage itself may throw in restricted WebKit contexts.
  const storage=(()=>{try{return window.localStorage;}catch{return {getItem:()=>null,setItem:()=>{throw new Error('Локальное хранилище недоступно');}};}})();
  let library=loadLibrary(storage);
  let draft=null, savedHash='',tab='events',selected=null,undo=[],redo=[],dirty=false,
    cursor=null,activeFrameTime=null,activeVertex=null,tracksVisible=false;
  const board=$('studio-map');
  const ctx=board.getContext('2d');
  const input=$('studio-import');
  const selections={
    events:'title',entities:'name',features:'label',paths:'id',sources:'title',commands:'name'
  };

  function notify(message){status(message);$('studio-library-status').textContent=message;onNotify?.(message);}
  function markDirty(){dirty=true;updateToolbar();}
  function updateToolbar(){
    $('studio-undo').disabled=undo.length===0;
    $('studio-redo').disabled=redo.length===0;
    $('studio-save').disabled=!draft;
    $('studio-preview').disabled=!draft;
    $('studio-dirty').textContent=dirty?'НЕ СОХРАНЕНО':'СОХРАНЕНО';
    $('studio-dirty').classList.toggle('is-dirty',dirty);
    const active=current();
    $('studio-map-hint').textContent=tab==='features'&&active?.kind==='boundary'?
      activeVertex!=null?'Коснись карты: изменить вершину №'+(activeVertex+1):'Коснись карты: добавить вершину '+(activeFrameTime!=null?'выбранной даты':'исходной формы')+'.':
      (tab==='entities'||tab==='features')&&activeFrameTime!=null&&active?.motion?.frames?.some(f=>f.time===activeFrameTime)?
      'Нажми на карте: изменится выбранный ключевой кадр на '+formatStoryTime(activeFrameTime,draft)+'.':tab==='paths'?
      'Нажми на карту, чтобы добавить точку маршрута. Последнюю точку можно удалить в форме.' :
      (tab==='sources'||tab==='commands')?'Параметры выбранной записи редактируются слева.':
      'Коснись карты, чтобы переместить выбранный объект или фокус события.';
  }
  function restore(snapshot,from){
    if(!snapshot)return;
    const current=deep(draft);
    if(from==='undo')redo.push(current);else undo.push(current);
    draft=deep(snapshot);
    dirty=JSON.stringify(draft)!==savedHash;
    renderEditor();
  }
  function mutate(work){
    const snapshot=deep(draft);
    try{work(draft);}catch(error){status(error.message,'error');return;}
    if(JSON.stringify(snapshot)===JSON.stringify(draft))return;
    undo.push(snapshot);if(undo.length>40)undo.shift();
    redo=[];markDirty();renderEditor();
  }
  function pickTab(next){
    tab=next;selected=draft[tab]?.[0]?.id||null;activeFrameTime=null;activeVertex=null;
    renderEditor();
  }
  function renderCollection(){
    const list=$('studio-items');
    list.replaceChildren();
    for(const item of draft[tab]||[]){
      const name=esc(item[selections[tab]]||item.id);
      const line=make('button','studio-record'+(item.id===selected?' active':''));
      line.type='button';
      const upper=make('strong','',name);
      const sub=make('small','',tab==='events'?formatStoryTime(item.time,draft):
        tab==='entities'?formatStoryTime(item.from,draft):tab==='features'?formatStoryTime(item.from,draft):
        tab==='paths'?item.points.length+' точек':tab==='commands'?item.commander||'Командование':'Ссылка на публикацию');
      line.append(upper,sub);
      line.addEventListener('click',()=>{selected=item.id;activeFrameTime=null;activeVertex=null;renderEditor();});
      list.append(line);
    }
    if(!list.childNodes.length)list.append(make('p','studio-empty','Здесь пока пусто. Добавь первый элемент.'));
    $('studio-list-caption').textContent=LABELS[tab]+' · '+draft[tab].length;
    $('studio-remove').disabled=draft[tab].length===0||(tab==='events'&&draft.events.length===1);
  }
  function current(){return draft?.[tab]?.find(item=>item.id===selected)||null;}
  function setValue(key,value) {
    mutate((story)=>{
      const item=story[tab].find(i=>i.id===selected);
      if(!item)throw new Error('Выбери элемент');
      if(tab==='features'&&key==='kind'&&value==='boundary'&&(!item.points||item.points.length<3)){
        const x=clamp(item.x,65,story.world.width-65),y=clamp(item.y,55,story.world.height-55);
        item.points=[[x-65,y-45],[x+65,y-45],[x+65,y+45],[x-65,y+45]];
      }
      if(tab==='entities'&&key==='commandId'&&value!==item.commandId)delete item.parentId;
      item[key]=value;
    });
  }
  function changeMeta(key,value) {
    mutate(story=>{
      if(key==='start'||key==='end'){
        if(!Number.isFinite(value)||value===0)throw new Error('Введите корректный год без нулевого года');
        const start=key==='start'?value:story.range[0];
        const end=key==='end'?value:story.range[1];
        if(!(start<end)||start< -10000||end>3000)throw new Error('Начало должно быть раньше конца. Диапазон: -10000..3000');
        if(story.events.some(e=>e.time<start||e.time>end)||
          story.entities.some(e=>e.from<start||e.from>end||e.until!=null&&(e.until<start||e.until>end))||
          story.features.some(f=>f.from<start||f.from>end||f.until!=null&&(f.until<start||f.until>end))||
          story.paths.some(p=>p.from<start||p.from>end)){
          throw new Error('Сперва перемести события и объекты внутрь нового периода');
        }
        story.range=[start,end];
      } else story[key]=value;
    });
  }
  function sourceSelect(element){
    const all=[['','Без привязки'],...draft.sources.map(s=>[s.id,s.title||s.id])];
    element.append(field('Источник',element.dataset.sources?.split(',').filter(Boolean)[0]||'',
      (id)=>setValue('sources',id?[id]:[]),{options:all}));
  }
  function renderFields(){
    const node=$('studio-fields');node.replaceChildren();
    const item=current();
    if(!item){
      node.append(make('p','studio-empty','Добавь элемент слева, чтобы редактировать его атрибуты.'));
      return;
    }
    const form=make('div','editor-form');
    const add=(label,key,opts={})=>form.append(field(label,item[key]??'',value=>setValue(key,value),opts));
    const coords=()=>{
      const row=make('div','field-pair');
      const frame=(tab==='entities'||tab==='features')&&activeFrameTime!=null?item.motion?.frames?.find(f=>f.time===activeFrameTime):null;
      const getXY=tab==='events'?item.focus:frame?[frame.x,frame.y]:[item.x,item.y];
      row.append(field('X',Math.round(getXY[0]),n=>changeCoords(0,n),{number:true}),
        field('Y',Math.round(getXY[1]),n=>changeCoords(1,n),{number:true}));
      form.append(row);
    };
    if(tab==='events'){
      add('Заголовок','title');add('Короткое пояснение','subtitle');
      add(draft.timeUnit==='phase'?'Номер фазы':'Год (отрицательный = до н. э.)','time',{number:true});
      add('Подробное описание','text',{long:true});
      add('Категория','category');
      add('Линия событий','lane',{options:LANE_OPTIONS});
      add('Достоверность','confidence',{options:CONFIDENCE});
      add('Значимость (1–5)','importance',{number:true});
      coords();
      sourceSelectItem(form,item);
    }else if(tab==='entities'){
      add('Название','name');add('Короткая метка на карте','mapLabel');add('Тип','type',{options:TYPE_OPTIONS});
      add('Командир / описание руководства','commander');
      const commandOptions=[['','Без штаба'],...draft.commands.map(c=>[c.id,c.name])];
      form.append(field('Подчиняется штабу',item.commandId||'',v=>setValue('commandId',v),{options:commandOptions}));
      const parents=draft.entities.filter(e=>e.id!==item.id&&e.commandId&&e.commandId===item.commandId
        &&e.type==='army'&&!(()=>{let cursor=e,ids=new Set([item.id]);while(cursor.parentId){
          if(ids.has(cursor.parentId))return true;
          ids.add(cursor.parentId);cursor=draft.entities.find(x=>x.id===cursor.parentId)||{};
        }return false;})()).map(e=>[e.id,e.name]);
      form.append(field('Родительское соединение',item.parentId||'',v=>setValue('parentId',v),
        {options:[['','Нет · напрямую штабу'],...parents]}));
      add(draft.timeUnit==='phase'?'Появление (фаза)':'Появление (год)','from',{number:true});
      add(draft.timeUnit==='phase'?'Исчезновение (фаза, пусто = конец)':'Исчезновение (пусто = до конца)','until',{number:true});
      add('Состояние в этот момент','current',{long:true});
      add('Общий контекст','description',{long:true});
      add('Достоверность','confidence',{options:CONFIDENCE});
      coords();sourceSelectItem(form,item);renderMotionControls(form,item);renderOrderControls(form,item);
    }else if(tab==='features'){
      add('Название на карте','label');add('Форма','kind',{options:FEATURE_OPTIONS});
      add('Появление (год)','from',{number:true});
      add('Исчезновение (пусто = до конца)','until',{number:true});
      if(item.kind==='boundary')renderBoundaryControls(form,item);
      else{add('Радиус по X','rx',{number:true});add('Радиус по Y','ry',{number:true});}
      add('Достоверность','confidence',{options:CONFIDENCE});
      if(item.kind==='boundary'){sourceSelectItem(form,item);coords();}
      else{coords();renderMotionControls(form,item);}
    }else if(tab==='paths'){
      add('Появление маршрута (год)','from',{number:true});
      add('Достоверность','confidence',{options:CONFIDENCE});
      form.append(make('p','studio-field-note',item.points.length+' точек. Новое касание карты добавляет следующую точку.'));
      form.append(button('Удалить последнюю точку',()=>{
        if(item.points.length<=2){status('Для маршрута необходимы минимум две точки','error');return;}
        mutate(story=>story.paths.find(p=>p.id===selected).points.pop());
      },'studio-secondary'));
    }else if(tab==='commands'){
      add('Название штаба','name');add('Командующий','commander');
      add('Сторона','side',{options:COMMAND_SIDES});
      sourceSelectItem(form,item);
      const units=draft.entities.filter(e=>e.commandId===item.id);
      form.append(make('p','studio-field-note','В подчинении: '+units.length+' соединений. Для нового штаба добавь объект во вкладке «Объекты» и назначь ему штаб.'));
    }else if(tab==='sources'){
      add('Название публикации','title');add('URL (https://...)','url',{url:true,placeholder:'https://...'});
      const cited=draft.events.filter(e=>(e.sources||[]).includes(item.id)).length+
        draft.entities.filter(e=>(e.sources||[]).includes(item.id)).length;
      form.append(make('p','studio-field-note','Связано с '+cited+' событиями или объектами.'));
    }
    node.append(form);
  }
  function sourceSelectItem(node,item){
    const opts=[['','Без источника'],...draft.sources.map(s=>[s.id,s.title||s.id])];
    node.append(field('Привязанный источник',(item.sources||[])[0]||'',id=>setValue('sources',id?[id]:[]),{options:opts}));
  }
  function renderOrderControls(form,item){
    if(!item.commandId&&!item.parentId)return;
    const node=make('section','orders-controls');
    node.append(make('div','studio-field-head','05 / ПРИКАЗЫ ПО ФАЗАМ'));
    const atTime=(item.orders||[]).find(o=>Math.abs(o.time-cursor)<.000001);
    if(!atTime){
      node.append(make('p','studio-field-note','На '+formatStoryTime(cursor,draft)+' нет приказа. Выбери момент на шкале, затем добавь решение командования.'));
      node.append(button('+ Добавить приказ в '+formatStoryTime(cursor,draft),()=>{
        mutate(story=>{
          const entity=story.entities.find(e=>e.id===selected);
          if(!entity.orders)entity.orders=[];
          if(entity.orders.length>=32)throw Error('Максимум 32 приказа для соединения');
          if(entity.orders.some(o=>Math.abs(o.time-cursor)<.000001))return;
          entity.orders.push({time:cursor,action:'hold',note:'',confidence:'hypothetical',sources:[]});
          entity.orders.sort((a,b)=>a.time-b.time);
        });
      },'studio-secondary'));
    }else{
      const edit=(key,value)=>mutate(story=>{
        const entity=story.entities.find(e=>e.id===selected);
        const target=entity.orders.find(o=>Math.abs(o.time-cursor)<.000001);
        if(target)target[key]=value;
      });
      node.append(field('Тактическое действие',atTime.action,v=>edit('action',v),{options:COMMAND_ACTIONS}));
      node.append(field('Пояснение / приказ',atTime.note||'',v=>edit('note',v),{long:true}));
      node.append(field('Достоверность',atTime.confidence,v=>edit('confidence',v),
        {options:CONFIDENCE.filter(([id])=>id!=='tradition')}));
      node.append(field('Источник',atTime.sources?.[0]||'',v=>edit('sources',v?[v]:[]),
        {options:[['','Без источника'],...draft.sources.map(x=>[x.id,x.title])]}));
      node.append(button('− Удалить приказ',()=>mutate(story=>{
        const entity=story.entities.find(e=>e.id===selected);
        entity.orders=(entity.orders||[]).filter(o=>Math.abs(o.time-cursor)>=.000001);
      }),'studio-secondary'));
    }
    form.append(node);
  }
  function renderBoundaryControls(form,item){
    const group=make('section','boundary-controls');
    group.append(make('div','studio-field-head','05 / ГРАНИЦЫ ВО ВРЕМЕНИ'));
    group.append(make('p','studio-field-note',
      'Каждая форма — зафиксированный снимок, а не выдуманная анимация между датами. Сначала выбери дату, затем запиши её границу.'));
    const frames=item.boundaryFrames||[];
    const active=frames.find(f=>f.time===activeFrameTime);
    const strip=make('div','border-keyframe-strip');
    strip.append(button('Изначально',()=>{
      activeFrameTime=null;activeVertex=null;cursor=item.from??draft.range[0];renderEditor();
    },'border-keyframe'+(!active?' selected':'')));
    for(const frame of frames){
      strip.append(button(formatStoryTime(frame.time,draft),()=>{
        activeFrameTime=frame.time;cursor=frame.time;activeVertex=null;renderEditor();
      },'border-keyframe'+(active?.time===frame.time?' selected':'')));
    }
    group.append(strip);
    group.append(make('p','studio-field-note',active?
      'Редактируется граница на '+formatStoryTime(active.time,draft)+'.':
      'Редактируется исходная граница. Для новой даты сначала запиши отдельную форму.'));
    if(active){
      group.append(field('Достоверность формы',active.confidence,value=>{
        const time=active.time;mutate(story=>{
          story.features.find(f=>f.id===selected).boundaryFrames.find(f=>f.time===time).confidence=value;
        });
      },{options:CONFIDENCE.filter(([id])=>id!=='tradition')}));
      group.append(field('Источник формы',(active.sources||[])[0]||'',value=>{
        const time=active.time;mutate(story=>{
          story.features.find(f=>f.id===selected).boundaryFrames.find(f=>f.time===time).sources=value?[value]:[];
        });
      },{options:[['','Без источника'],...draft.sources.map(s=>[s.id,s.title||s.id])]}));
    }
    const actions=make('div','border-keyframe-actions');
    actions.append(button('⊕ Записать форму в '+formatStoryTime(cursor,draft),()=>{
      if(cursor<(item.from??draft.range[0])||cursor>(item.until??draft.range[1])){
        status('Граница не существует в выбранную дату','error');return;
      }
      const existing=frames.find(f=>Math.abs(f.time-cursor)<.000001);
      if(existing){activeFrameTime=existing.time;activeVertex=null;renderEditor();return;}
      if(frames.length>=MAX_BORDER_FRAMES){status('Максимум '+MAX_BORDER_FRAMES+' карт для одной границы','error');return;}
      mutate(story=>{
        const feature=story.features.find(f=>f.id===selected);
        const inherited=borderAt(feature,cursor);
        if(!feature.boundaryFrames)feature.boundaryFrames=[];
        feature.boundaryFrames.push({
          time:cursor,points:deep(inherited.points),confidence:'hypothetical',sources:[]
        });
        feature.boundaryFrames.sort((a,b)=>a.time-b.time);
        activeFrameTime=cursor;activeVertex=null;
      });
      status('Карта границы сохранена. Теперь двигай её вершины независимо от других дат.');
    },'studio-secondary'));
    if(active)actions.append(button('− Удалить форму на дату',()=>{
      const time=active.time;mutate(story=>{
        const feature=story.features.find(f=>f.id===selected);
        feature.boundaryFrames=feature.boundaryFrames.filter(f=>f.time!==time);
        if(!feature.boundaryFrames.length)delete feature.boundaryFrames;
        activeFrameTime=null;activeVertex=null;
      });
    },'studio-secondary'));
    group.append(actions);
    group.append(make('div','studio-field-head','06 / ГЕОМЕТРИЯ'));
    group.append(make('p','studio-field-note','Вершины можно двигать касанием карты. Добавление и удаление не изменяют предыдущие даты.'));
    const pts=boundaryEditorPoints(item);
    const list=make('div','boundary-vertices');
    for(let i=0;i<pts.length;i++){
      const b=button('№'+(i+1),()=>{activeVertex=i;renderEditor();},
        'boundary-vertex'+(activeVertex===i?' selected':''));
      b.title='Переместить вершину №'+(i+1);
      list.append(b);
    }
    group.append(list);
    group.append(button('+ Добавить вершину касанием',()=>{
      activeVertex=null;updateToolbar();renderEditor();
    },'studio-secondary'));
    if(activeVertex!=null&&pts[activeVertex]){
      const coords=make('div','field-pair');
      for(const axis of [0,1])coords.append(field(axis===0?'X вершины':'Y вершины',
        pts[activeVertex][axis],value=>{
          if(!Number.isFinite(value)||value<0||value>(axis===0?draft.world.width:draft.world.height)){
            status('Точка находится вне карты','error');return;
          }
          const index=activeVertex;
          mutate(story=>boundaryEditorPoints(story.features.find(f=>f.id===selected))[index][axis]=value);
        },{number:true}));
      group.append(coords);
    }
    group.append(button('− Удалить последнюю вершину',()=>{
      if(pts.length<=3){status('Для границы необходимо минимум три вершины','error');return;}
      mutate(story=>{boundaryEditorPoints(story.features.find(f=>f.id===selected)).pop();activeVertex=null;});
    },'studio-secondary'));
    form.append(group);
  }
  function boundaryEditorPoints(item){
    if(activeFrameTime!=null){
      const target=item.boundaryFrames?.find(f=>f.time===activeFrameTime);
      if(target)return target.points;
    }
    return item.points;
  }
  function renderTracks(){
    if(!draft)return;
    const lanes=storyTracks(draft);
    const count=lanes.reduce((n,l)=>n+l.marks.length,0);
    $('studio-track-count').textContent=count+' '+(count===1?'отметка':'отметок');
    const panel=$('studio-track-panel');
    board.closest('.studio-canvas-shell').classList.toggle('tracks-open',tracksVisible);
    panel.hidden=!tracksVisible;
    $('studio-track-toggle').setAttribute('aria-expanded',String(tracksVisible));
    $('studio-track-toggle').firstChild.textContent=(tracksVisible?'▾':'▸')+' Дорожки истории ';
    if(!tracksVisible){panel.replaceChildren();return;}
    const range=draft.range,span=range[1]-range[0];
    panel.replaceChildren();
    for(const lane of lanes){
      const line=make('div','track-lane');
      line.append(make('span','track-lane-label',lane.name));
      const rail=make('div','track-rail');
      rail.title='Нажми рядом с отметкой, чтобы перейти к её дате';
      const max=150,visible=lane.marks.slice(0,max);
      const navigate=(mark)=>{
        tab=mark.tab;selected=mark.targetId;cursor=mark.time;
        activeFrameTime=mark.borderTime??(lane.id==='motion'?mark.time:null);
        activeVertex=null;renderEditor();
      };
      rail.addEventListener('click',event=>{
        if(event.target.closest('.track-mark')||!visible.length)return;
        const box=rail.getBoundingClientRect();
        if(box.width<1)return;
        const position=clamp((event.clientX-box.left)/box.width,0,1);
        const selectedMark=visible.reduce((best,m)=>{
          const dist=Math.abs((m.time-range[0])/span-position);
          return !best||dist<best.dist?{mark:m,dist}:best;
        },null);
        if(selectedMark)navigate(selectedMark.mark);
      });
      for(const mark of visible){
        const p=clamp(100*(mark.time-range[0])/span,1,99);
        const element=button('',()=>navigate(mark),'track-mark track-'+lane.id);
        element.style.left=p+'%';
        element.title=mark.title+' · '+formatStoryTime(mark.time,draft);
        element.setAttribute('aria-label',element.title);
        element.classList.toggle('active',mark.targetId===selected&&Math.abs(mark.time-cursor)<.000001);
        rail.append(element);
      }
      if(lane.marks.length>max)rail.append(make('small','track-overflow','+'+(lane.marks.length-max)+' событий'));
      line.append(rail);panel.append(line);
    }
  }
  function renderMotionControls(form,item){
    const group=make('section','motion-controls');
    group.append(make('div','studio-field-head','04 / ПОЛОЖЕНИЯ ВО ВРЕМЕНИ'));
    group.append(make('p','studio-field-note',
      'Запиши позиции в разные годы. Режим «без домыслов» переставляет объект только по кадрам; режим «условная траектория» показывает неточное движение пунктиром.'));
    const movement=item.motion;
    if(movement?.frames?.length){
      group.append(field('Как показывать переход',movement.mode,mode=>{
        mutate(story=>story[tab].find(i=>i.id===selected).motion.mode=mode);
      },{options:[['hold','Без домыслов: только кадры'],['illustrative','Условная траектория (пунктир)']]}));
      group.append(field('Точность траектории',movement.confidence,confidence=>{
        mutate(story=>story[tab].find(i=>i.id===selected).motion.confidence=confidence);
      },{options:[['hypothetical','Гипотеза автора'],['estimated','Приблизительная реконструкция'],['disputed','Спорная интерпретация']]}));
      const strip=make('div','motion-keyframes');
      for(const frame of movement.frames){
        const frameButton=button(formatStoryTime(frame.time,draft),()=>{
          cursor=frame.time;activeFrameTime=frame.time;renderEditor();
          $('studio-cursor').focus({preventScroll:true});
        },'motion-keyframe'+(frame.time===activeFrameTime?' selected':''));
        frameButton.title='Изменить положение объекта на '+formatStoryTime(frame.time,draft);
        strip.append(frameButton);
      }
      group.append(strip);
      if(activeFrameTime!=null){
        const currentFrame=movement.frames.find(f=>f.time===activeFrameTime);
        if(currentFrame){
          group.append(field(draft.timeUnit==='phase'?'Номер фазы кадра':'Год кадра',currentFrame.time,value=>{
            if(!Number.isFinite(value)||value===0||value<(item.from??draft.range[0])||value>draft.range[1]){status('Некорректная дата кадра','error');return;}
            if(movement.frames.some(f=>f.time===value&&f.time!==activeFrameTime)){status('На эту дату уже есть кадр','error');return;}
            const old=activeFrameTime;
            mutate(story=>{
              const f=story[tab].find(i=>i.id===selected).motion.frames.find(v=>v.time===old);
              f.time=value;story[tab].find(i=>i.id===selected).motion.frames.sort((a,b)=>a.time-b.time);
              activeFrameTime=value;cursor=value;
            });
          },{number:true}));
        }
      }
    }
    const row=make('div','motion-actions');
    row.append(button('⊕ Записать позицию в '+formatStoryTime(cursor,draft),()=>{
      if(cursor<(item.from??draft.range[0])||item.until!=null&&cursor>item.until){
        status('Объект не существует на выбранную дату','error');return;
      }
      const exists=item.motion?.frames?.some(frame=>Math.abs(frame.time-cursor)<.000001);
      if(exists){activeFrameTime=item.motion.frames.find(f=>Math.abs(f.time-cursor)<.000001).time;renderEditor();return;}
      mutate(story=>{
        const target=story[tab].find(i=>i.id===selected);
        if(!target.motion)target.motion={mode:'hold',confidence:'hypothetical',frames:[]};
        if(target.motion.frames.length>=64)throw new Error('Достигнут лимит 64 кадров');
        const pos=keyframeValue(target,cursor);
        target.motion.frames.push({time:cursor,x:Math.round(pos.x),y:Math.round(pos.y)});
        target.motion.frames.sort((a,b)=>a.time-b.time);
        activeFrameTime=cursor;
      });
      status('Кадр записан. Коснись карты или введи X/Y, чтобы изменить положение.');
    },'studio-secondary'));
    if(movement?.frames?.length){
      const removing=movement.frames.find(f=>f.time===activeFrameTime);
      row.append(button('− Удалить кадр',()=>{
        if(!removing){status('Выбери кадр сверху','error');return;}
        mutate(story=>{
          const target=story[tab].find(i=>i.id===selected);
          target.motion.frames=target.motion.frames.filter(f=>f.time!==removing.time);
          if(!target.motion.frames.length)delete target.motion;
          activeFrameTime=null;
        });
      },'studio-secondary'));
    }
    group.append(row);
    form.append(group);
  }
  function changeCoords(axis,value){
    if(!Number.isFinite(value)||value<0||value>(axis===0?draft.world.width:draft.world.height)){
      status('Координаты должны находиться внутри карты','error');return;
    }
    mutate(story=>{
      const item=story[tab].find(i=>i.id===selected);
      if(tab==='events')item.focus[axis]=value;
      else if(activeFrameTime!=null&&item.motion?.frames?.some(f=>f.time===activeFrameTime))
        item.motion.frames.find(f=>f.time===activeFrameTime)[axis===0?'x':'y']=value;
      else item[axis===0?'x':'y']=value;
    });
  }
  function renderEditor(){
    if(!draft)return;
    $('studio-name').textContent=draft.title;
    $('studio-title').value=draft.title;
    $('studio-subtitle').value=draft.subtitle||'';
    $('studio-intro').value=draft.intro||'';
    $('studio-start').value=draft.range[0];
    $('studio-end').value=draft.range[1];
    $('studio-start').closest('label').firstChild.textContent=draft.timeUnit==='phase'?'От фазы ':'От года ';
    $('studio-end').closest('label').firstChild.textContent=draft.timeUnit==='phase'?'До фазы ':'До года ';
    $('studio-eras-note').textContent=draft.timeUnit==='phase'?'Фазы — порядковые этапы боя, не часы и минуты.':'До н. э. — отрицательные годы. Координаты карты условные.';
    cursor=Number.isFinite(cursor)?clamp(cursor,draft.range[0],draft.range[1]):draft.range[0];
    $('studio-cursor').min=String(draft.range[0]);
    $('studio-cursor').max=String(draft.range[1]);
    $('studio-cursor').step=String(draft.timeUnit==='phase'?1:Math.min(1,Math.max(.01,(draft.range[1]-draft.range[0])/1000)));
    $('studio-cursor').value=String(cursor);
    $('studio-cursor-label').textContent=formatStoryTime(cursor,draft);
    $('studio-cursor-start').textContent=formatStoryTime(draft.range[0],draft);
    $('studio-cursor-end').textContent=formatStoryTime(draft.range[1],draft);
    for(const t of COLLECTIONS){
      const btn=document.querySelector('[data-studio-tab="'+t+'"]');
      if(btn){btn.classList.toggle('active',t===tab);btn.setAttribute('aria-pressed',String(t===tab));}
    }
    if(!draft[tab].some(e=>e.id===selected))selected=draft[tab][0]?.id||null;
    renderCollection();renderFields();renderTracks();updateToolbar();paint();
  }
  function dimensions(){
    const rect=board.getBoundingClientRect();
    const width=rect.width,height=rect.height;
    const ratio=Math.min(window.devicePixelRatio||1,2);
    if(width<1||height<1)return null;
    const newW=Math.round(width*ratio),newH=Math.round(height*ratio);
    if(board.width!==newW||board.height!==newH){board.width=newW;board.height=newH;}
    ctx.setTransform(ratio,0,0,ratio,0,0);
    const scale=Math.min((width-32)/draft.world.width,(height-32)/draft.world.height);
    const x=(width-draft.world.width*scale)/2,y=(height-draft.world.height*scale)/2;
    return {width,height,scale,x,y};
  }
  let geometry=null;
  function paint(){
    if(!draft||screen.hidden)return;
    const d=dimensions();if(!d)return;geometry=d;
    ctx.fillStyle='#e2d7c0';ctx.fillRect(0,0,d.width,d.height);
    const trans=(x,y)=>[d.x+x*d.scale,d.y+y*d.scale];
    ctx.strokeStyle='rgba(78,77,61,.15)';ctx.lineWidth=1;
    for(let i=0;i<=10;i++){
      const x=d.x+i*draft.world.width/10*d.scale;
      ctx.beginPath();ctx.moveTo(x,d.y);ctx.lineTo(x,d.y+draft.world.height*d.scale);ctx.stroke();
      const y=d.y+i*draft.world.height/10*d.scale;
      ctx.beginPath();ctx.moveTo(d.x,y);ctx.lineTo(d.x+draft.world.width*d.scale,y);ctx.stroke();
    }
    for(const river of draft.waterways||[]){
      ctx.beginPath();river.forEach(([x,y],i)=>{const [px,py]=trans(x,y);if(!i)ctx.moveTo(px,py);else ctx.lineTo(px,py);});
      ctx.strokeStyle='#79a0a1';ctx.lineWidth=Math.max(2,13*d.scale);ctx.stroke();
    }
    for(const item of draft.features){
      if(item.kind==='boundary'){
        const pts=(item.id===selected?boundaryEditorPoints(item):borderAt(item,cursor).points)||[];if(pts.length<3)continue;
        ctx.beginPath();pts.forEach(([x,y],i)=>{
          const [px,py]=trans(x,y);if(!i)ctx.moveTo(px,py);else ctx.lineTo(px,py);
        });ctx.closePath();
        ctx.fillStyle='rgba(134,124,88,.12)';ctx.fill();
        ctx.strokeStyle=item.id===selected?'#9e4b3d':'rgba(122,91,60,.78)';
        ctx.setLineDash(item.confidence==='confirmed'?[]:[7,5]);
        ctx.lineWidth=item.id===selected?2.5:1.6;ctx.stroke();ctx.setLineDash([]);
        const [cx,cy]=polygonCenter(pts),[tx,ty]=trans(cx,cy);
        ctx.fillStyle='#665846';ctx.font='11px Georgia';ctx.textAlign='center';
        ctx.fillText(item.label,tx,ty);
        if(item.id===selected)pts.forEach(([x,y],i)=>{
          const [px,py]=trans(x,y);
          ctx.fillStyle=activeVertex===i?'#a14f37':'#f5e9d0';
          ctx.strokeStyle='#8a5641';ctx.lineWidth=1.4;
          ctx.beginPath();ctx.arc(px,py,activeVertex===i?6:4,0,Math.PI*2);ctx.fill();ctx.stroke();
        });
        continue;
      }
      const position=keyframeValue(item,cursor);
      const [x,y]=trans(position.x,position.y);ctx.beginPath();
      ctx.ellipse(x,y,item.rx*d.scale,item.ry*d.scale,item.rotation||0,0,Math.PI*2);
      ctx.fillStyle=item.id===selected?'rgba(161,83,54,.35)':'rgba(171,146,100,.24)';
      ctx.fill();ctx.strokeStyle=item.id===selected?'#9b523f':'rgba(92,79,56,.45)';ctx.stroke();
      ctx.fillStyle='#575746';ctx.textAlign='center';ctx.font='11px Georgia';
      ctx.fillText(item.label,x,y-7);
    }
    for(const item of draft.paths){
      ctx.beginPath();item.points.forEach(([x,y],i)=>{const [px,py]=trans(x,y);if(!i)ctx.moveTo(px,py);else ctx.lineTo(px,py);});
      ctx.strokeStyle=item.id===selected?'#a1533f':'#8a7659';
      ctx.setLineDash([6,5]);ctx.lineWidth=item.id===selected?3:2;ctx.stroke();ctx.setLineDash([]);
      if(item.id===selected)for(const [x,y] of item.points){
        const [px,py]=trans(x,y);ctx.fillStyle='#a1533f';ctx.fillRect(px-4,py-4,8,8);
      }
    }
    for(const item of draft.entities){
      const position=keyframeValue(item,cursor);
      if(item.id===selected&&item.motion?.frames?.length){
        const trail=motionTrail(item,cursor);
        if(trail.length>1){
          ctx.beginPath();trail.forEach(([lx,ly],i)=>{const [px,py]=trans(lx,ly);if(!i)ctx.moveTo(px,py);else ctx.lineTo(px,py);});
          ctx.strokeStyle='#5b8d90';ctx.setLineDash([5,5]);ctx.lineWidth=2;ctx.stroke();ctx.setLineDash([]);
        }
      }
      const [x,y]=trans(position.x,position.y);
      ctx.beginPath();ctx.arc(x,y,item.id===selected?8:5,0,Math.PI*2);
      ctx.fillStyle=item.id===selected?'#ad543d':'#475e58';ctx.fill();
      ctx.fillStyle='#343e36';ctx.textAlign='center';ctx.font='12px Georgia';
      ctx.fillText(item.name,x,y+19);
    }
    for(const item of draft.events){
      const [x,y]=trans(item.focus[0],item.focus[1]);ctx.beginPath();
      ctx.arc(x,y,item.id===selected?11:5,0,Math.PI*2);
      ctx.strokeStyle=item.id===selected?'#aa4633':'rgba(162,85,58,.7)';
      ctx.lineWidth=item.id===selected?3:1.5;ctx.stroke();
    }
    ctx.strokeStyle='#9a8e72';ctx.lineWidth=1;ctx.strokeRect(d.x,d.y,draft.world.width*d.scale,draft.world.height*d.scale);
    ctx.fillStyle='#756e5c';ctx.font='bold 10px system-ui';ctx.textAlign='left';
    ctx.fillText('МАКЕТ · КООРДИНАТЫ УСЛОВНЫ',d.x+8,d.y+15);
  }
  function onMapPoint(event){
    if(!draft||!geometry||tab==='sources'||tab==='commands')return;
    const rect=board.getBoundingClientRect();
    const x=clamp(Math.round((event.clientX-rect.left-geometry.x)/geometry.scale),0,draft.world.width);
    const y=clamp(Math.round((event.clientY-rect.top-geometry.y)/geometry.scale),0,draft.world.height);
    if(!selected){status('Сначала выбери элемент','error');return;}
    mutate(story=>{
      const item=story[tab].find(v=>v.id===selected);
      if(tab==='events')item.focus=[x,y];
      else if(tab==='paths')item.points.push([x,y]);
      else if(tab==='features'&&item.kind==='boundary'){
        const pts=boundaryEditorPoints(item);
        if(activeVertex!=null&&pts[activeVertex])pts[activeVertex]=[x,y];
        else if(pts.length<40)pts.push([x,y]);
        else throw Error('Для границы максимум 40 вершин');
      }
      else if(activeFrameTime!=null&&item.motion?.frames?.some(f=>f.time===activeFrameTime)){
        const frame=item.motion.frames.find(f=>f.time===activeFrameTime);frame.x=x;frame.y=y;
      } else{item.x=x;item.y=y;}
    });
  }
  function addItem(){
    mutate(story=>{
      const midpoint=(story.range[0]+story.range[1])/2;
      let item;
      if(tab==='events')item={id:newId('event'),time:midpoint,title:'Новое событие',subtitle:'Что произошло?',
        text:'Добавьте проверяемое описание события.',category:'СОБЫТИЕ',lane:'culture',
        confidence:'hypothetical',importance:3,sources:[],focus:[500,350]};
      else if(tab==='entities')item={id:newId('entity'),name:'Новое место',type:'place',
        x:500,y:350,from:story.range[0],confidence:'hypothetical',current:'',description:'',sources:[]};
      else if(tab==='features')item={id:newId('region'),kind:'region',label:'Новая территория',
        x:500,y:350,rx:115,ry:75,rotation:0,from:story.range[0],confidence:'hypothetical'};
      else if(tab==='paths')item={id:newId('path'),kind:'track',points:[[350,340],[590,360]],
        from:story.range[0],confidence:'hypothetical'};
      else if(tab==='commands')item={id:newId('command'),name:'Новый штаб',commander:'',
        side:'neutral',sources:[]};
      else item={id:newId('src'),title:'Новый источник',url:'https://'};
      story[tab].push(item);selected=item.id;
    });
    status(tab==='sources'?'Укажи точную HTTPS-ссылку на публикацию.':
      tab==='commands'?'Задай название, сторону и командующего. Затем назначь штабу соединения.':
      'Элемент добавлен. Коснись карты, чтобы задать положение.');
  }
  function removeItem(){
    const item=current();if(!item)return;
    if(tab==='events'&&draft.events.length===1){status('У истории должно оставаться хотя бы одно событие','error');return;}
    if(!window.confirm('Удалить «'+esc(item[selections[tab]]||item.id)+'»? Это действие можно отменить.'))return;
    mutate(story=>{
      story[tab]=story[tab].filter(x=>x.id!==selected);
      if(tab==='commands')for(const el of story.entities){
        if(el.commandId===selected){delete el.commandId;delete el.parentId;}
      }
      if(tab==='sources')for(const el of [...story.events,...story.entities,...story.commands])
        el.sources=(el.sources||[]).filter(id=>id!==selected);
      if(tab==='entities'){
        for(const el of story.events)if(el.entity===selected)delete el.entity;
        for(const el of story.entities)if(el.parentId===selected)delete el.parentId;
      }
      selected=story[tab][0]?.id||null;
    });
  }
  function open(draftStory){
    draft=deep(draftStory);savedHash=library.some(s=>s.id===draft.id)?JSON.stringify(draft):'';
    dirty=!savedHash;undo=[];redo=[];tab='events';selected=draft.events[0]?.id||null;activeVertex=null;
    cursor=draft.range[0];activeFrameTime=null;
    $('library').hidden=true;$('viewer').hidden=true;screen.hidden=false;
    renderEditor();status(dirty?'Черновик ещё не сохранён.':'История открыта для редактирования.');
    requestAnimationFrame(paint);
  }
  function back(){
    if(dirty&&!window.confirm('Выйти без сохранения изменений?'))return;
    screen.hidden=true;$('viewer').hidden=true;$('library').hidden=false;
    draft=null;renderLibrary();
  }
  function saveDraft(){
    if(!draft)return false;
    try{
      const clean=parseStory(draft);
      library=persistLibrary(upsertLibrary(library,clean),storage);
      draft=deep(clean);dirty=false;savedHash=JSON.stringify(draft);
      renderLibrary();renderEditor();
      status('История сохранена на этом устройстве.','success');
      return true;
    }catch(error){status(error.message,'error');return false;}
  }
  function exportDraft(){
    if(!draft)return;
    try{
      const value=exportPackage(draft);
      const blob=new Blob([value],{type:'application/json;charset=utf-8'});
      const url=URL.createObjectURL(blob);
      const a=make('a');a.href=url;a.download='palimpsest-'+draft.id+'.json';
      document.body.append(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),1200);
      status('JSON-пакет подготовлен к скачиванию.','success');
    }catch(error){status(error.message,'error');}
  }
  async function importFile(file){
    if(!file)return;
    if(file.size>300_000){notify('Файл превышает лимит 300 КБ');return;}
    let parsed;
    try{parsed=parseImport(await file.text());}catch(error){notify(error.message);return;}
    if(library.some(s=>s.id===parsed.id)){
      parsed={...parsed,id:newId('user'),title:parsed.title+' — импорт'};
    }
    try{
      library=persistLibrary(upsertLibrary(library,parsed),storage);
      renderLibrary();open(parsed);
      status('История импортирована. Теперь её можно редактировать или смотреть.','success');
    }catch(error){notify(error.message);}
  }
  function renderLibrary(){
    const node=$('personal-stories');node.replaceChildren();
    if(library.length===0){
      node.append(make('p','personal-empty','Здесь появятся твои истории. Они хранятся только на этом устройстве.'));
    }else for(const story of library)node.append(customEntry(story,onOpen,(s)=>open(s)));
    $('personal-count').textContent=String(library.length).padStart(2,'0')+' / '+MAX_STORIES;
  }
  function deleteDraft(){
    if(!draft)return;
    const exists=library.some(s=>s.id===draft.id);
    if(!exists){back();return;}
    if(!window.confirm('Безвозвратно удалить «'+draft.title+'» из локальной библиотеки? Сначала экспортируйте JSON для резервной копии.'))return;
    try{
      library=persistLibrary(library.filter(s=>s.id!==draft.id),storage);
      dirty=false;back();notify('История удалена из локальной библиотеки.');
    }catch(error){status(error.message,'error');}
  }
  board.addEventListener('pointerup',onMapPoint);
  $('studio-track-toggle').addEventListener('click',()=>{tracksVisible=!tracksVisible;renderTracks();});
  $('studio-cursor').addEventListener('input',e=>{cursor=Number(e.target.value);activeFrameTime=null;
    $('studio-cursor-label').textContent=formatStoryTime(cursor,draft);paint();});
  $('studio-cursor').addEventListener('change',()=>{
    if(tab==='features'&&current()?.kind==='boundary'&&current()?.boundaryFrames?.some(f=>Math.abs(f.time-cursor)<.000001))activeFrameTime=cursor;
    if(tab==='entities'||tab==='features')renderEditor();else renderTracks();
  });
  $('studio-back').addEventListener('click',back);
  $('studio-new').addEventListener('click',()=>open(createDraft()));
  $('studio-new-battle').addEventListener('click',()=>open(createPhaseDraft()));
  $('studio-clone-rome').addEventListener('click',()=>open(cloneAsDraft(builtins[0])));
  $('studio-clone-war').addEventListener('click',()=>open(cloneAsDraft(builtins[1])));
  $('studio-clone-battle').addEventListener('click',()=>open(cloneAsDraft(builtins[2])));
  $('studio-import-button').addEventListener('click',()=>input.click());
  input.addEventListener('change',async()=>{
    const file=input.files?.[0];input.value='';
    await importFile(file);
  });
  $('studio-save').addEventListener('click',saveDraft);
  $('studio-preview').addEventListener('click',()=>{if(saveDraft()){screen.hidden=true;onOpen(draft.id);}});
  $('studio-export').addEventListener('click',exportDraft);
  $('studio-delete').addEventListener('click',deleteDraft);
  $('studio-add').addEventListener('click',addItem);
  $('studio-remove').addEventListener('click',removeItem);
  $('studio-undo').addEventListener('click',()=>restore(undo.pop(),'undo'));
  $('studio-redo').addEventListener('click',()=>restore(redo.pop(),'redo'));
  $('studio-title').addEventListener('change',e=>changeMeta('title',e.target.value));
  $('studio-subtitle').addEventListener('change',e=>changeMeta('subtitle',e.target.value));
  $('studio-intro').addEventListener('change',e=>changeMeta('intro',e.target.value));
  $('studio-start').addEventListener('change',e=>changeMeta('start',Number(e.target.value)));
  $('studio-end').addEventListener('change',e=>changeMeta('end',Number(e.target.value)));
  for(const button of document.querySelectorAll('[data-studio-tab]'))
    button.addEventListener('click',()=>pickTab(button.dataset.studioTab));
  if('ResizeObserver' in window)new ResizeObserver(()=>{if(!screen.hidden)paint();}).observe(board);
  window.addEventListener('resize',paint);
  window.addEventListener('pagehide',()=>{if(draft&&dirty){try{sessionStorage.setItem('atlas-studio-recovery',JSON.stringify(draft));}catch{}}});
  const recover=()=>{
    try{
      const s=sessionStorage.getItem('atlas-studio-recovery');
      if(!s)return;
      const recovered=JSON.parse(s);
      if(recovered?.type!=='custom'||typeof recovered.id!=='string')throw new Error('Некорректный черновик');
      open(recovered);dirty=true;updateToolbar();
      sessionStorage.removeItem('atlas-studio-recovery');
      status('Черновик восстановлен. Проверьте изменения и нажмите «Сохранить».','success');
    }catch(error){sessionStorage.removeItem('atlas-studio-recovery');notify('Не удалось восстановить черновик: '+error.message);}
  };
  $('studio-recover').addEventListener('click',recover);
  try{if(sessionStorage.getItem('atlas-studio-recovery'))$('studio-recover').hidden=false;}catch{}
  renderLibrary();
  // Recovery is opt-in: no surprise editor opening on standard app entry.
  return {
    getStory(id){return library.find(story=>story.id===id)||null;},
    edit(id){const story=library.find(x=>x.id===id);if(story)open(story);},
    renderLibrary,
    openNew(){open(createDraft());},
    isOpen(){return !screen.hidden;},
    recover
  };
}
