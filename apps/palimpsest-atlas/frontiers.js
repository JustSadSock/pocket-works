/**
 * Dated frontiers are explicit *snapshots* (step functions), not tweened
 * polygons. Interpolating an unknown frontier would invent geography.
 * Map coordinates are schematic. Truth claims live in source/confidence data.
 */
import {validPolygon} from './tactics.js';

export const MAX_BORDER_FRAMES=30;
const confidenceSet=new Set(['confirmed','estimated','disputed','hypothetical']);
export function borderAt(feature,time){
  if(!feature||feature.kind!=='boundary')return feature;
  let active=null;
  for(const frame of feature.boundaryFrames||[]){
    if(frame.time<=time)active=frame;
    else break;
  }
  return {...feature,
    points:active?.points||feature.points,
    confidence:active?.confidence||feature.confidence,
    sources:active?.sources||feature.sources||[],
    activeBorderTime:active?.time??null,
    borderIsSnapshot:!!active};
}
export function boundaryChanged(before,after){
  if(before?.kind!=='boundary'||after?.kind!=='boundary')return false;
  const a=before.points,b=after.points;
  if(!Array.isArray(a)||!Array.isArray(b)||a.length!==b.length)return true;
  return a.some((p,i)=>!b[i]||Math.abs(p[0]-b[i][0])>0.001||Math.abs(p[1]-b[i][1])>0.001);
}
export function validateBoundaryFrames(feature,range,world,sourceIds=new Set()){
  if(feature?.kind!=='boundary'||feature.boundaryFrames==null)return [];
  const frames=feature.boundaryFrames,issues=[];
  if(!Array.isArray(frames)||frames.length>MAX_BORDER_FRAMES){
    return ['Для границы допустимо не более 30 ключевых карт'];
  }
  let last=-Infinity;
  for(const frame of frames){
    if(!frame||!Number.isFinite(frame.time)||frame.time===0||frame.time<=last||
      frame.time<(feature.from??range[0])||frame.time>(feature.until??range[1])||
      frame.time<range[0]||frame.time>range[1]){
      issues.push('Некорректная или повторяющаяся дата ключевой границы');
    }
    if(!validPolygon(frame?.points,world)){
      issues.push('Неверный полигон ключевой границы');
    }
    if(!confidenceSet.has(frame?.confidence)){
      issues.push('Укажите достоверность каждого изменения границы');
    }
    if(!Array.isArray(frame?.sources)||frame.sources.length>12){
      issues.push('Неверные источники ключевой границы');
    }else{
      if(frame.confidence==='confirmed'&&!frame.sources.length)
        issues.push('Подтверждённая ключевая граница требует источник');
      for(const id of frame.sources)if(!sourceIds.has(id))
        issues.push('Неизвестный источник ключевой границы: '+id);
    }
    last=frame?.time??last;
  }
  return [...new Set(issues)];
}

/** Return a navigable sparse author timeline rather than fake dense telemetry. */
export function storyTracks(story){
  const lanes=[
    {id:'events',name:'СОБЫТИЯ',marks:[]},
    {id:'motion',name:'ПЕРЕМЕЩЕНИЯ',marks:[]},
    {id:'frontiers',name:'ГРАНИЦЫ',marks:[]},
    {id:'orders',name:'ПРИКАЗЫ',marks:[]}
  ];
  for(const item of story.events||[])lanes[0].marks.push({
    id:item.id,time:item.time,title:item.title,tab:'events',targetId:item.id
  });
  for(const item of [...story.entities||[],...story.features||[]]){
    for(const f of item.motion?.frames||[])lanes[1].marks.push({
      id:item.id+'-'+f.time,time:f.time,title:(item.name||item.label)+' · положение',
      tab:story.entities.includes(item)?'entities':'features',targetId:item.id
    });
    if(item.kind==='boundary'){
      const at=item.from??story.range[0];
      lanes[2].marks.push({id:item.id+'-initial',time:at,title:item.label+' · исходная форма',tab:'features',targetId:item.id});
      for(const f of item.boundaryFrames||[])lanes[2].marks.push({
        id:item.id+'-'+f.time,time:f.time,title:item.label+' · изменение границы',
        tab:'features',targetId:item.id,borderTime:f.time
      });
    }
  }
  for(const e of story.entities||[])for(const order of e.orders||[])lanes[3].marks.push({
    id:e.id+'-'+order.time,time:order.time,title:e.name+' · приказ',
    tab:'entities',targetId:e.id
  });
  for(const lane of lanes)lane.marks.sort((a,b)=>a.time-b.time||a.id.localeCompare(b.id));
  return lanes;
}
