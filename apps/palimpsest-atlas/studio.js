import {clamp, formatYear} from './core.js';
import {keyframeValue,motionTrail,formatStoryTime} from './motion.js';
import {PALETTES, MAX_STORIES, createDraft,cloneAsDraft,exportPackage,
  loadLibrary,parseImport,parseStory,persistLibrary,upsertLibrary,newId} from './studio-data.js';

const $=(id)=>document.getElementById(id);
const COLLECTIONS=['events','entities','features','paths','sources'];
const LABELS={events:'События',entities:'Объекты',features:'Территории',paths:'Маршруты',sources:'Источники'};
const CONFIDENCE=[
  ['hypothetical','Гипотеза автора'],
  ['estimated','Приблизительная реконструкция'],
  ['disputed','Спорная трактовка'],
  ['tradition','Предание'],
  ['confirmed','Подтверждено источником']
];
const TYPE_OPTIONS=[
 ['place','Место'],['city','Город'],['settlement','Поселение'],['battle','Поле битвы'],
 ['person','Человек'],['army','Армия'],['hill','Холм'],['river','Река'],['legend','Легенда'],['region','Область']
];
const FEATURE_OPTIONS=[['region','Регион'],['hill','Холм'],['zone','Выделенная зона']];
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
  text.append(make('small','',fmt(story.range[0])+' — '+fmt(story.range[1])+' · '+story.events.length+' событий'));
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
    cursor=null,activeFrameTime=null;
  const board=$('studio-map');
  const ctx=board.getContext('2d');
  const input=$('studio-import');
  const selections={
    events:'title',entities:'name',features:'label',paths:'id',sources:'title'
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
    $('studio-map-hint').textContent=(tab==='entities'||tab==='features')&&activeFrameTime!=null&&active?.motion?.frames?.some(f=>f.time===activeFrameTime)?
      'Нажми на карте: изменится выбранный ключевой кадр на '+formatStoryTime(activeFrameTime,draft)+'.':tab==='paths'?
      'Нажми на карту, чтобы добавить точку маршрута. Последнюю точку можно удалить в форме.' :
      tab==='sources'?'Выберите источник слева и укажите его URL.':
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
    tab=next;selected=draft[tab]?.[0]?.id||null;activeFrameTime=null;
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
      const sub=make('small','',tab==='events'?fmt(item.time):
        tab==='entities'?fmt(item.from):tab==='features'?fmt(item.from):
        tab==='paths'?item.points.length+' точек':'Ссылка на публикацию');
      line.append(upper,sub);
      line.addEventListener('click',()=>{selected=item.id;activeFrameTime=null;renderEditor();});
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
      add('Год (отрицательный = до н. э.)','time',{number:true});
      add('Подробное описание','text',{long:true});
      add('Категория','category');
      add('Линия событий','lane',{options:LANE_OPTIONS});
      add('Достоверность','confidence',{options:CONFIDENCE});
      add('Значимость (1–5)','importance',{number:true});
      coords();
      sourceSelectItem(form,item);
    }else if(tab==='entities'){
      add('Название','name');add('Короткая метка на карте','mapLabel');add('Тип','type',{options:TYPE_OPTIONS});
      add('Появление (год)','from',{number:true});
      add('Исчезновение (пусто = до конца)','until',{number:true});
      add('Состояние в этот момент','current',{long:true});
      add('Общий контекст','description',{long:true});
      add('Достоверность','confidence',{options:CONFIDENCE});
      coords();sourceSelectItem(form,item);renderMotionControls(form,item);
    }else if(tab==='features'){
      add('Название на карте','label');add('Форма','kind',{options:FEATURE_OPTIONS});
      add('Появление (год)','from',{number:true});
      add('Исчезновение (пусто = до конца)','until',{number:true});
      add('Радиус по X','rx',{number:true});add('Радиус по Y','ry',{number:true});
      add('Достоверность','confidence',{options:CONFIDENCE});
      coords();renderMotionControls(form,item);
    }else if(tab==='paths'){
      add('Появление маршрута (год)','from',{number:true});
      add('Достоверность','confidence',{options:CONFIDENCE});
      form.append(make('p','studio-field-note',item.points.length+' точек. Новое касание карты добавляет следующую точку.'));
      form.append(button('Удалить последнюю точку',()=>{
        if(item.points.length<=2){status('Для маршрута необходимы минимум две точки','error');return;}
        mutate(story=>story.paths.find(p=>p.id===selected).points.pop());
      },'studio-secondary'));
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
          group.append(field('Год кадра',currentFrame.time,value=>{
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
    renderCollection();renderFields();updateToolbar();paint();
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
    if(!draft||!geometry||tab==='sources')return;
    const rect=board.getBoundingClientRect();
    const x=clamp(Math.round((event.clientX-rect.left-geometry.x)/geometry.scale),0,draft.world.width);
    const y=clamp(Math.round((event.clientY-rect.top-geometry.y)/geometry.scale),0,draft.world.height);
    if(!selected){status('Сначала выбери элемент','error');return;}
    mutate(story=>{
      const item=story[tab].find(v=>v.id===selected);
      if(tab==='events')item.focus=[x,y];
      else if(tab==='paths')item.points.push([x,y]);
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
      else item={id:newId('src'),title:'Новый источник',url:'https://'};
      story[tab].push(item);selected=item.id;
    });
    status(tab==='sources'?'Укажи точную HTTPS-ссылку на публикацию.':'Элемент добавлен. Коснись карты, чтобы задать положение.');
  }
  function removeItem(){
    const item=current();if(!item)return;
    if(tab==='events'&&draft.events.length===1){status('У истории должно оставаться хотя бы одно событие','error');return;}
    if(!window.confirm('Удалить «'+esc(item[selections[tab]]||item.id)+'»? Это действие можно отменить.'))return;
    mutate(story=>{
      story[tab]=story[tab].filter(x=>x.id!==selected);
      if(tab==='sources')for(const el of [...story.events,...story.entities])
        el.sources=(el.sources||[]).filter(id=>id!==selected);
      if(tab==='entities')for(const el of story.events)
        if(el.entity===selected)delete el.entity;
      selected=story[tab][0]?.id||null;
    });
  }
  function open(draftStory){
    draft=deep(draftStory);savedHash=library.some(s=>s.id===draft.id)?JSON.stringify(draft):'';
    dirty=!savedHash;undo=[];redo=[];tab='events';selected=draft.events[0]?.id||null;
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
  $('studio-cursor').addEventListener('input',e=>{cursor=Number(e.target.value);activeFrameTime=null;
    $('studio-cursor-label').textContent=formatStoryTime(cursor,draft);paint();});
  $('studio-cursor').addEventListener('change',()=>{if(tab==='entities'||tab==='features')renderEditor();});
  $('studio-back').addEventListener('click',back);
  $('studio-new').addEventListener('click',()=>open(createDraft()));
  $('studio-clone-rome').addEventListener('click',()=>open(cloneAsDraft(builtins[0])));
  $('studio-clone-war').addEventListener('click',()=>open(cloneAsDraft(builtins[1])));
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
