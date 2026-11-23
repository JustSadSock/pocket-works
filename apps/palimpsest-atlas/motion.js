/**
 * Temporal geometry / phase navigation.
 *
 * Stored locations are schematic scene coordinates, not geographic truth.
 * 'hold' uses only documented keyframes. 'illustrative' linearly connects
 * explicit keyframes but always carries uncertainty and a dashed trail.
 * No movement is inferred before the first frame or after the last one.
 */
const finite=Number.isFinite;
export function keyframeValue(item,time){
  const frames=item?.motion?.frames;
  if(!Array.isArray(frames)||!frames.length)return {x:item.x,y:item.y,
    interpolated:false,frame:null,confidence:item.confidence||'estimated'};
  const sorted=[...frames].sort((a,b)=>a.time-b.time);
  if(time<sorted[0].time)return {x:item.x,y:item.y,interpolated:false,frame:null,
    confidence:item.confidence||'estimated'};
  let previous=sorted[0];
  for(let i=1;i<sorted.length;i++){
    const next=sorted[i];
    if(time<next.time) {
      if(item.motion.mode==='illustrative') {
        const t=Math.max(0,Math.min(1,(time-previous.time)/(next.time-previous.time)));
        return {x:previous.x+(next.x-previous.x)*t,
          y:previous.y+(next.y-previous.y)*t,interpolated:t>0&&t<1,
          frame:previous,confidence:item.motion.confidence||'hypothetical'};
      }
      return {x:previous.x,y:previous.y,interpolated:false,frame:previous,
        confidence:item.motion.confidence||'hypothetical'};
    }
    previous=next;
  }
  return {x:previous.x,y:previous.y,interpolated:false,frame:previous,
    confidence:item.motion.confidence||'hypothetical'};
}
export function locateAt(item,time){
  const pos=keyframeValue(item,time);
  return {...item,x:pos.x,y:pos.y,motionInterpolated:pos.interpolated};
}
export function motionTrail(item,time){
  if(!item?.motion?.frames?.length)return [];
  const frames=item.motion.frames.filter(f=>f.time<=time);
  const current=keyframeValue(item,time);
  return [...frames.map(f=>[f.x,f.y]),[current.x,current.y]]
    .filter((p,i,items)=>i===0||p[0]!==items[i-1][0]||p[1]!==items[i-1][1]);
}
export function validateMotion(item,range,world){
  if(!item.motion)return [];
  const errors=[];
  const m=item.motion;
  if(!['hold','illustrative'].includes(m.mode))errors.push('неверный режим перемещения');
  if(!['estimated','hypothetical','disputed'].includes(m.confidence))errors.push('нужна маркировка неточности перемещения');
  if(!Array.isArray(m.frames)||!m.frames.length||m.frames.length>64){errors.push('число ключевых кадров должно быть от 1 до 64');return errors;}
  let last=-Infinity;
  for(const f of m.frames){
    if(!finite(f.time)||f.time===0||f.time<(item.from??range[0])||f.time>range[1]||f.time<=last)
      errors.push('кадры вне периода или не отсортированы по времени');
    if(!finite(f.x)||!finite(f.y)||f.x<0||f.y<0||f.x>world.width||f.y>world.height)
      errors.push('координаты кадра вне карты');
    last=f.time;
  }
  return [...new Set(errors)];
}
export function formatStoryTime(time,story){
  if(story?.timeUnit==='phase'){
    if(!finite(time))return 'ФАЗА';
    const num=Math.max(1,Math.round(time));
    const numerals=['','I','II','III','IV','V','VI','VII','VIII','IX','X'];
    return 'ФАЗА '+(numerals[num]||num);
  }
  const year=Math.trunc(time);
  return year<0?Math.abs(year)+' до н. э.':year>0?year+' г.':'граница эр';
}
export function displayStoryTime(time,story){
  if(story?.timeUnit==='phase')return String(Math.max(1,Math.round(time)));
  return String(Math.abs(Math.trunc(time)));
}
export function displayStoryEra(time,story){
  if(story?.timeUnit==='phase')return 'ЭТАП РЕКОНСТРУКЦИИ';
  return time<0?'ДО Н. Э.':'НАШЕЙ ЭРЫ';
}
export function scenePortalCandidate(story,time,position,zoom){
  const links=story?.sceneLinks||[];
  for(const link of links){
    if(time<link.from||time>link.until||zoom<(link.minZoom||3))continue;
    const dx=position.x-link.x,dy=position.y-link.y;
    if(Math.hypot(dx,dy)<(link.radius||160))return link;
  }
  return null;
}
