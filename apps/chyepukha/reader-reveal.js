// ЧЕПУХА · a physical page-by-page reveal; no hidden network or timers.
export const REACTION_OPTIONS=Object.freeze([
 {id:'laugh',label:'Смішно',symbol:'✳'},
 {id:'surprised',label:'Ого!',symbol:'!'},
 {id:'heart',label:'Зворушило',symbol:'♥'}
]);
export const clampPage=(requested,length)=>Math.max(0,Math.min(Math.max(0,length-1),
 Number.isFinite(requested)?Math.trunc(requested):0));
export const nextPage=(current,length)=>clampPage(current+1,length);
export const previousPage=(current,length)=>clampPage(current-1,length);
export const supportsLiveReactions=version=>version==='v9';

export function chapterReader(story,page,escape){
 const chapters=Array.isArray(story?.fragments)?story.fragments:[];
 if(!chapters.length)return '<div class="reader-empty">Тут поки немає завершених фрагментів.</div>';
 const index=clampPage(page,chapters.length),fragment=chapters[index];
 return '<section class="page-reveal" aria-label="Аркуш '+(index+1)+' з '+chapters.length+'">'+
  '<div class="page-progress"><span>АРКУШ '+String(index+1).padStart(2,'0')+' / '+String(chapters.length).padStart(2,'0')+'</span><span>АВТОР · '+escape(fragment.author||'Автор')+'</span></div>'+
  '<h3>'+escape(fragment.question||'Наступна частина')+'</h3>'+
  '<p class="page-manuscript">'+escape(fragment.answer||'[Фрагмент не завершено]')+'</p>'+
  '<div class="page-turn-controls">'+
  '<button type="button" data-act="prev-part"'+(index===0?' disabled':'')+'>← Назад</button>'+
  (index===chapters.length-1?
   '<span class="page-ending">КІНЕЦЬ РУКОПИСУ</span><button type="button" data-act="next-story" class="page-next-story">Наступна історія →</button>':
   '<span class="page-dots" aria-label="Прогрес читання">'+chapters.map((_,i)=>'<i class="'+(i===index?'current':i<index?'seen':'')+'"></i>').join('')+'</span>'+
   '<button type="button" data-act="next-part" class="page-next">Далі →</button>')+
  '</div></section>';
}

export function reactionBar({storyId,view,version,escape,connected=true}){
 if(!supportsLiveReactions(version)||!storyId)return '';
 const totals=view?.reactionTotals?.[storyId]||{},mine=view?.myReactions?.[storyId]||'';
 return '<section class="reader-reactions" aria-label="Реакції на рукопис">'+
  '<div class="reaction-heading"><strong>ОЦІНКА ЧИТАЧІВ</strong><small>'+(connected?'Обери одну реакцію · повторне натискання скасує її':'Повертаємо зв’язок із кімнатою…')+'</small></div>'+
  '<div class="reaction-options">'+REACTION_OPTIONS.map(option=>{
    const n=Math.min(8,Math.max(0,Number(totals[option.id])||0));
    return '<button type="button" data-act="react-story" data-id="'+escape(storyId)+'" data-reaction="'+option.id+'"'+
     ' aria-pressed="'+(mine===option.id)+'" aria-label="'+option.label+': '+n+'"'+
     (connected?'':' disabled')+'>'+
      '<span class="reaction-mark" aria-hidden="true">'+option.symbol+'</span><span>'+option.label+'</span><b>'+n+'</b>'+
     '</button>';
  }).join('')+'</div></section>';
}
