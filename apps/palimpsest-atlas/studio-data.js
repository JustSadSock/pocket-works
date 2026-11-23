import {validateStory, clamp} from './core.js';

export const LIBRARY_KEY = 'pocket-works:palimpsest-atlas:stories:v1';
export const PACKAGE_FORMAT = 'palimpsest-atlas/story';
export const PACKAGE_VERSION = 1;
export const MAX_PACKAGE_BYTES = 300_000;
export const MAX_STORIES = 25;
export const PALETTES = Object.freeze({
  parchment:{paper:'#e5dac1',ink:'#373c33',water:'#70989a',accent:'#a34e39'},
  twilight:{paper:'#d7d4c6',ink:'#313d43',water:'#79969b',accent:'#95694a'},
  vellum:{paper:'#e5d9c5',ink:'#4a3e34',water:'#68929a',accent:'#8e6650'}
});
const ID = /^[a-z0-9][a-z0-9_-]{1,70}$/i;
const CONFIDENCE = new Set(['confirmed','estimated','disputed','tradition','hypothetical']);
const entityTypes = new Set(['city','settlement','hill','river','battle','legend','place','region','person','army']);
const featureKinds = new Set(['region','hill','zone']);
const finite = Number.isFinite;
const fail = (reason) => {throw new Error(reason);};
const text = (value,limit=700) => typeof value==='string' ? value.trim().slice(0,limit) : '';
const point = (value) => Array.isArray(value)&&value.length===2&&value.every(finite);
const assert = (condition,reason) => {if(!condition)fail(reason);};
const limitArray=(value,max,name)=>{
  assert(Array.isArray(value)&&value.length<=max,'Слишком много элементов в разделе '+name);
  return value;
};
const cleanId=(value,name)=>{
  assert(typeof value==='string'&&ID.test(value),'Неверный идентификатор '+name);
  return value;
};
export const newId=(prefix='item')=>prefix+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);
export function createDraft({title='Моя история',start=1200,end=1300}={}) {
  if(!finite(start)||!finite(end)||end<=start||start===0||end===0)throw new Error('Неверный период');
  const id=newId('user');
  return {
    schemaVersion:PACKAGE_VERSION,id,index:'МОЯ ИСТОРИЯ',type:'custom',
    title:text(title,90)||'Моя история',subtitle:'Личная историческая реконструкция',
    intro:'Черновик собственной истории. Неподтверждённые данные отмечены как гипотезы.',
    disclaimer:'Авторская схематическая карта, не точная географическая реконструкция.',
    range:[start,end],world:{width:1000,height:700},palette:{...PALETTES.parchment},
    waterways:[],features:[],paths:[],entities:[],sources:[],
    events:[{id:newId('event'),time:start,title:'Начало истории',
      subtitle:'Первая отметка на временной шкале',text:'Опишите, что произошло и почему это важно.',
      category:'ЗАМЕТКА',lane:'culture',importance:3,confidence:'hypothetical',
      sources:[],focus:[500,350]}]
  };
}
export function cloneAsDraft(source) {
  const candidate=JSON.parse(JSON.stringify(source));
  candidate.schemaVersion=PACKAGE_VERSION;
  candidate.id=newId('user');
  candidate.index='КОПИЯ';
  candidate.type='custom';
  candidate.title=text(source.title,75)+' — копия';
  candidate.intro=text(source.intro,1500);
  candidate.disclaimer=text(source.disclaimer,500)||'Авторская реконструкция.';
  return parseStory(candidate);
}
export function parseStory(packageOrStory) {
  assert(packageOrStory&&typeof packageOrStory==='object'&&!Array.isArray(packageOrStory),'Ожидается JSON-объект');
  const wrapped=packageOrStory.format!=null;
  if(wrapped){
    assert(packageOrStory.format===PACKAGE_FORMAT,'Неизвестный формат пакета');
    assert(packageOrStory.schemaVersion===PACKAGE_VERSION,'Неподдерживаемая версия пакета');
  }
  const raw=wrapped?packageOrStory.story:packageOrStory;
  assert(raw&&typeof raw==='object'&&!Array.isArray(raw),'Пустая история');
  assert(raw.schemaVersion===PACKAGE_VERSION,'Для истории требуется schemaVersion = 1');
  cleanId(raw.id,'истории');
  assert(raw.id.startsWith('user-'),'Допускаются только пользовательские истории');
  assert(raw.type==='custom','Неверный тип истории');
  const id=raw.id;
  const title=text(raw.title,90);
  assert(title.length>=2,'У истории должно быть название');
  assert(Array.isArray(raw.range)&&raw.range.length===2&&raw.range.every(finite),'Некорректный временной диапазон');
  const [start,end]=raw.range;
  assert(start!==0&&end!==0&&end>start&&start>=-10000&&end<=3000,'Диапазон должен лежать между 10000 до н.э. и 3000 н.э. без года 0');
  assert((start<0&&end<0)||(start>0&&end>0),'Переход через границу эр пока недоступен. Создайте отдельный сюжет для каждой эры.');
  const w=raw.world;
  assert(w&&finite(w.width)&&finite(w.height)&&w.width>=200&&w.width<=4000&&w.height>=200&&w.height<=4000,'Неверный размер карты');
  const inMap=(x,y)=>finite(x)&&finite(y)&&x>=0&&y>=0&&x<=w.width&&y<=w.height;
  const sources=limitArray(raw.sources,80,'источники').map((s,i)=>{
    const sourceId=cleanId(s?.id,'источника #'+i);
    assert(typeof s.title==='string'&&s.title.trim().length>=2,'Источник без названия');
    assert(typeof s.url==='string'&&/^https:\/\/[^\s<>]+$/i.test(s.url)&&s.url.length<=1000,'Ссылка источника должна начинаться с https://');
    let url;
    try{url=new URL(s.url);}catch{fail('Некорректная ссылка на источник');}
    assert(url.protocol==='https:'&&url.hostname&&!url.username&&!url.password,'Некорректная HTTPS-ссылка на источник');
    return {id:sourceId,title:text(s.title,150),url:url.href};
  });
  const sourceSet=new Set(sources.map(s=>s.id));
  assert(sourceSet.size===sources.length,'Повторяется ID источника');
  function sourceRefs(arr){
    assert(Array.isArray(arr)&&arr.length<=15,'Неверный список ссылок на источники');
    const ids=arr.map(id=>cleanId(id,'ссылки'));
    assert(ids.every(id=>sourceSet.has(id)),'Некоторые источники отсутствуют в библиографии');
    return [...new Set(ids)];
  }
  const entities=limitArray(raw.entities,250,'объекты').map((e,i)=>{
    const entityId=cleanId(e?.id,'объекта #'+i);
    assert(entityTypes.has(e.type),'Неизвестный тип объекта');
    assert(text(e.name,130).length>=2,'Объект без названия');
    assert(inMap(e.x,e.y),'Объект находится за пределами карты');
    assert(e.from==null||(finite(e.from)&&e.from>=start&&e.from<=end&&e.from!==0),'Неверная начальная дата объекта');
    assert(e.until==null||(finite(e.until)&&e.until>=start&&e.until<=end&&e.until!==0),'Неверная конечная дата объекта');
    assert(e.from==null||e.until==null||e.until>=e.from,'Объект исчезает раньше появления');
    assert(CONFIDENCE.has(e.confidence),'Необходимо указать достоверность объекта');
    if(e.confidence==='confirmed')assert(Array.isArray(e.sources)&&e.sources.length>0,'Для подтверждённого объекта нужен источник');
    return {id:entityId,type:e.type,name:text(e.name,130),x:e.x,y:e.y,
      from:e.from??start,until:e.until??undefined,
      description:text(e.description,1500),current:text(e.current,1000),
      confidence:e.confidence,sources:sourceRefs(e.sources||[])};
  });
  const featureList=limitArray(raw.features,150,'территории').map((f,i)=>{
    const featureId=cleanId(f?.id,'территории #'+i);
    assert(featureKinds.has(f.kind),'Неверный тип территории');
    assert(inMap(f.x,f.y),'Территория за картой');
    assert(finite(f.rx)&&finite(f.ry)&&f.rx>=3&&f.rx<=w.width&&f.ry>=3&&f.ry<=w.height,'Размер территории не задан');
    assert(f.from==null||(finite(f.from)&&f.from>=start&&f.from<=end&&f.from!==0),'Неверная дата территории');
    assert(f.until==null||(finite(f.until)&&f.until>=start&&f.until<=end&&f.until!==0),'Неверная дата исчезновения территории');
    assert(f.from==null||f.until==null||f.until>=f.from,'Неверный период существования территории');
    return {id:featureId,kind:f.kind,x:f.x,y:f.y,rx:f.rx,ry:f.ry,
      label:text(f.label,110)||'Территория',rotation:finite(f.rotation)?clamp(f.rotation,-Math.PI,Math.PI):0,
      from:f.from??start,until:f.until??undefined,confidence:CONFIDENCE.has(f.confidence)?f.confidence:'hypothetical'};
  });
  const paths=limitArray(raw.paths,100,'маршруты').map((p,i)=>{
    const pathId=cleanId(p?.id,'маршрута #'+i);
    assert(p.kind==='track','Неверный тип маршрута');
    assert(finite(p.from)&&p.from>=start&&p.from<=end&&p.from!==0,'Неверная дата маршрута');
    const points=limitArray(p.points,80,'точки маршрута').map(q=>{
      assert(point(q)&&inMap(q[0],q[1]),'Точка маршрута за пределами карты');
      return [...q];
    });
    assert(points.length>=2,'Маршрут требует минимум две точки');
    return {id:pathId,kind:'track',from:p.from,points,confidence:CONFIDENCE.has(p.confidence)?p.confidence:'hypothetical'};
  });
  const waterways=limitArray(raw.waterways,60,'реки').map((p,i)=>{
    return limitArray(p,80,'координаты реки').map(q=>{
      assert(point(q),'Некорректная точка реки');
      return [...q];
    });
  });
  const events=limitArray(raw.events,1000,'события').map((e,i)=>{
    const eventId=cleanId(e?.id,'события #'+i);
    assert(finite(e.time)&&e.time>=start&&e.time<=end&&e.time!==0,'Событие вне исторического периода');
    assert(text(e.title,120).length>=2,'Событие без названия');
    assert(point(e.focus)&&inMap(e.focus[0],e.focus[1]),'Точка события вне карты');
    assert(CONFIDENCE.has(e.confidence),'Не указана достоверность события');
    if(e.confidence==='confirmed')assert(Array.isArray(e.sources)&&e.sources.length>0,'Для подтверждённого события нужен источник');
    return {id:eventId,time:e.time,title:text(e.title,120),subtitle:text(e.subtitle,200),
      text:text(e.text,2200),category:text(e.category,32)||'СОБЫТИЕ',
      lane:['politics','military','culture'].includes(e.lane)?e.lane:'culture',
      importance:finite(e.importance)?clamp(Math.round(e.importance),1,5):3,
      confidence:e.confidence,sources:sourceRefs(e.sources||[]),
      focus:[...e.focus],...(typeof e.entity==='string'?{entity:e.entity}:{})};
  }).sort((a,b)=>a.time-b.time||a.id.localeCompare(b.id));
  assert(events.length>0,'Нужно хотя бы одно событие');
  const unique=(arr,name)=>assert(new Set(arr.map(v=>v.id)).size===arr.length,'Повторяются ID в разделе '+name);
  unique(entities,'объекты');unique(events,'события');unique(featureList,'территории');unique(paths,'маршруты');
  for(const event of events)if(event.entity)assert(entities.some(e=>e.id===event.entity),'Неизвестный объект у события');
  const paletteId=Object.entries(PALETTES).find(([,p])=>JSON.stringify(p)===JSON.stringify(raw.palette))?.[0]||'parchment';
  const story={schemaVersion:PACKAGE_VERSION,id,index:'МОЯ ИСТОРИЯ',type:'custom',
    title,subtitle:text(raw.subtitle,180),intro:text(raw.intro,1500),
    disclaimer:text(raw.disclaimer,500)||'Авторская схематическая карта; объекты могут быть гипотетическими.',
    range:[start,end],world:{width:w.width,height:w.height},palette:{...PALETTES[paletteId]},
    sources,entities,features:featureList,paths,waterways,events};
  const errors=validateStory(story);
  assert(!errors.length,errors[0]||'Проверка истории не пройдена');
  assert(new TextEncoder().encode(JSON.stringify(story)).length<=MAX_PACKAGE_BYTES,'История превышает ограничение 300 КБ');
  return story;
}
export function exportPackage(story){
  const clean=parseStory(story);
  return JSON.stringify({format:PACKAGE_FORMAT,schemaVersion:PACKAGE_VERSION,story:clean},null,2);
}
export function parseImport(contents){
  assert(typeof contents==='string'&&new TextEncoder().encode(contents).length<=MAX_PACKAGE_BYTES,'Файл слишком большой (максимум 300 КБ)');
  let input;
  try{input=JSON.parse(contents);}catch{fail('Файл не является корректным JSON');}
  return parseStory(input);
}
export function loadLibrary(storage){
  try{
    const data=JSON.parse(storage.getItem(LIBRARY_KEY)||'null');
    if(!data||data.schemaVersion!==PACKAGE_VERSION||!Array.isArray(data.stories))return [];
    return data.stories.slice(0,MAX_STORIES).flatMap(s=>{try{return [parseStory(s)];}catch{return [];}});
  }catch{return [];}
}
export function persistLibrary(stories,storage){
  assert(Array.isArray(stories)&&stories.length<=MAX_STORIES,'Библиотека содержит слишком много историй (максимум 25)');
  const parsed=stories.map(s=>parseStory(s));
  assert(new Set(parsed.map(s=>s.id)).size===parsed.length,'Повторяется идентификатор истории');
  try{storage.setItem(LIBRARY_KEY,JSON.stringify({schemaVersion:PACKAGE_VERSION,stories:parsed}));}
  catch{fail('Не удалось сохранить. Возможно, хранилище устройства переполнено или заблокировано. Экспортируйте историю в JSON.');}
  return parsed;
}
export function upsertLibrary(list,story){
  const clean=parseStory(story),exists=list.some(s=>s.id===clean.id);
  if(!exists&&list.length>=MAX_STORIES)fail('Библиотека заполнена (25 историй)');
  return [...list.filter(s=>s.id!==clean.id),clean];
}
