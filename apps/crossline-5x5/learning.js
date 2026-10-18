// 5×5 Arena guided first match & local private board annotations.
// No secret opponent plans are exposed outside the completed tutorial encounter.
import {initialMatch,validatePlan} from './engine.js';
export const GUIDE_ACTIONS=Object.freeze([
 'right',
 {type:'attack',dirs:['down']},
 'shield','up','left'
]);
export const GUIDE_OPPONENT=Object.freeze([
 'up','down',{type:'attack',dirs:['left']},'right','shield'
]);
export const GUIDE_STEPS=Object.freeze([
 {title:'Сдвинь фишку',text:'Нажми стрелку вправо. Синяя фишка пройдёт на одну клетку.',key:'right',hint:'→'},
 {title:'Прикажи атаковать',text:'Нажми ⚔, выбери направление ↓ и подтверди удар кнопкой ✓.',key:'attack',hint:'⚔ ↓ ✓'},
 {title:'Подними щит',text:'Нажми ▣. Если соперник ударит одновременно, щит остановит атаку.',key:'shield',hint:'▣'},
 {title:'Шаг вверх',text:'Добавь движение вверх. В одном раунде пять последовательных команд.',key:'up',hint:'↑'},
 {title:'Заверши план',text:'Добавь движение влево — это пятая команда.',key:'left',hint:'←'},
 {title:'Запусти поединок',text:'Пять команд готовы. Подтверди план и посмотри, как оба бойца действуют одновременно.',key:'submit',hint:'Подтвердить →'}
]);
export function createGuideMatch(){
 const match=initialMatch();
 match.units.A={x:1,y:2,alive:true};
 match.units.B={x:3,y:2,alive:true};
 return match;
}
export function guideStep(count=0,attacking=false,dirs=[]){
 const at=Math.max(0,Math.min(5,Number(count)||0));
 const entry=GUIDE_STEPS[at];
 if(at===1&&attacking){
  return {...entry,text:dirs.includes('down')?'Теперь нажми ✓ на кнопке атаки.':'Выбери стрелку вниз: противник может оказаться перед тобой.',hint:dirs.includes('down')?'✓':'↓'};
 }
 return entry;
}
export function guideAccept(count,command){
 const step=GUIDE_ACTIONS[count];
 if(step===undefined)return false;
 if(typeof step==='string')return command===step;
 return Boolean(command&&typeof command==='object'&&command.type==='attack'&&Array.isArray(command.dirs)&&command.dirs.length===1&&command.dirs[0]==='down');
}
export function guideReady(actions){
 return Array.isArray(actions)&&actions.length===5&&actions.every((action,i)=>guideAccept(i,action))&&!validatePlan(actions);
}
export const CELL_MARKS=Object.freeze(['watch','danger']);
const cellKey=/^[0-4],[0-4]$/;
export function sanitizeMarks(input){
 if(!input||typeof input!=='object'||Array.isArray(input))return {};
 return Object.fromEntries(Object.entries(input).filter(([key,kind])=>cellKey.test(key)&&CELL_MARKS.includes(kind)).slice(0,25));
}
export function cycleCellMark(input,x,y){
 const source=sanitizeMarks(input),key=x+','+y;
 if(!cellKey.test(key))return source;
 const previous=source[key];
 if(previous==='watch')source[key]='danger';
 else if(previous==='danger')delete source[key];
 else source[key]='watch';
 return source;
}
export function paintCellMarks(host,rawMarks,enabled=true){
 if(!host)return;
 const marks=enabled?sanitizeMarks(rawMarks):{};
 for(const cell of host.querySelectorAll(':scope > .cell')){
  const key=cell.dataset.x+','+cell.dataset.y,kind=marks[key];
  let glyph=cell.querySelector('.arena-cell-mark');
  if(!kind){glyph?.remove();continue;}
  if(!glyph){
   glyph=document.createElement('span');glyph.className='arena-cell-mark';
   glyph.setAttribute('aria-hidden','true');cell.append(glyph);
  }
  glyph.className='arena-cell-mark is-'+kind;
  glyph.textContent=kind==='watch'?'•':'!';
 }
}
