import {wordParts,handoffCount,hasMinimumDraft} from './writer-flow.js';

// Only presentation: no server access and no hidden changes to story mechanics.
export function renderWriting({view,roomVersion,draft,meta,chosen,escape,rosterCompact,turnProgress,genres,genders}){
 const s=view.sheet;
 if(!s)return '<section class="paper waiting"><h2>Очікуємо аркуш…</h2></section>';
 const need=handoffCount({roomVersion,round:view.round,total:view.total,visibleTailWords:view.settings.visibleTailWords,answer:draft});
 const review=need>0&&meta.step==='select'&&hasMinimumDraft(draft);
 const final=roomVersion==='v4'&&view.round===view.total-1;
 const safe=escape;
 const title=safe(s.question?.prompt||'Продовж історію');
 const hero=s.gender?genders.find(([id])=>id===s.gender)?.[1]||'Неважливо':null;
 const incoming='<div class="incoming incoming-compact"><b>'+(s.tail?'ВІД ПОПЕРЕДНЬОГО АВТОРА':'ПОЧАТОК ІСТОРІЇ')+'</b><p>'+safe(s.tail||'Ти пишеш першим. Нехай буде дивно.')+'</p>'+(s.heroAnchor?'<span class="story-anchor">Герой: '+safe(s.heroAnchor)+'</span>':'')+(hero?'<span class="mini">Персонаж: '+safe(hero)+'</span>':'')+'</div>';
 const intro='<div class="editor-question"><div class="mini">'+safe(s.setLabel)+' · '+safe(s.genreLabel)+'</div><h2 class="question">'+title+'</h2>'+incoming+'</div>';
 const guidelines='<details class="editorial-brief"><summary>Підказки до етапу <span aria-hidden="true">⌄</span></summary><div class="editorial-brief-content"><p><b>НАПИШИ</b> '+safe(s.question?.guidance||'Додай одну подію.')+'</p><p><b>НЕ ЗАБІГАЙ УПЕРЕД</b> '+safe(s.question?.creativeFreedom||'Не описуй майбутніх сцен.')+'</p>'+(genres[s.genreLabel]?'<p><b>ТОН ЖАНРУ</b> '+safe(genres[s.genreLabel])+'</p>':'')+'</div></details>';
 const passport=!review&&roomVersion==='v4'&&view.round===0?'<details class="hero-passport"><summary>Головний герой <small>необов’язково</small></summary><div class="passport-fields"><label class="anchor-field"><span class="field-label">Ім’я або роль героя — видно наступним авторам</span><input class="field" id="heroAnchor" maxlength="72" autocomplete="off" placeholder="Наприклад: Василь, чарівник" value="'+safe(meta.anchor)+'"></label><div class="genders" role="group" aria-label="Стать героя">'+genders.map(([id,label])=>'<label><input name="gender" type="radio" value="'+id+'" '+((meta.gender||'unspecified')===id?'checked':'')+'>'+label+'</label>').join('')+'</div></div></details>':'';
 let position=0;
 const manuscript=wordParts(draft).map(token=>{
  if(/^\s+$/u.test(token))return safe(token);
  const i=position++;
  return '<button type="button" class="word" data-act="word" data-index="'+i+'" aria-pressed="'+chosen.includes(i)+'" aria-label="Обрати слово '+safe(token)+'">'+safe(token)+'</button>';
 }).join('');
 const next=review&&s.nextQuestion?'<aside class="next-question"><b>НАСТУПНИЙ АВТОР ОТРИМАЄ ПИТАННЯ</b><p>'+safe(s.nextQuestion)+'</p></aside>':'';
 const reviewBody='<div class="selection-stage">'+next+'<div class="word-head"><span>ТОРКНИСЯ СЛІВ У СВОЄМУ ТЕКСТІ</span><span id="wordCount">'+chosen.length+' / '+need+'</span></div><div id="wordTray" class="selection-paper" aria-label="Вибір слів для передачі">'+manuscript+'</div><div class="selected-words"><b>НАСТУПНИЙ АВТОР ПОБАЧИТЬ</b><div id="selectedStrip" aria-live="polite"></div></div></div>';
 const composeBody='<textarea id="answer" class="answer" name="answer" maxlength="800" spellcheck="true" placeholder="Тут починається твоя частина історії…" aria-label="Твій фрагмент">'+safe(draft)+'</textarea>';
 const footerControl=review?'<button type="button" class="editor-back" data-act="back-to-draft">← Редагувати</button>':(final?'<span class="final-stage-note">Це останній аркуш — слова не передаємо</span>':'');
 const buttonTitle=review||need===0?'Запечатати аркуш':'Обрати слова';
 const bottom='<div class="submit-row editor-submit">'+footerControl+'<button type="submit" class="button editor-primary">'+buttonTitle+' <span aria-hidden="true">'+(review||need===0?'✦':'→')+'</span></button><span id="chars" class="mini">'+draft.length+'/800</span></div>';
 const aside='<aside class="side editor-side"><div class="stamp">СЕКРЕТНО</div><h3>'+(review?'Що залишити наступному автору?':'Напиши тільки свій епізод')+'</h3><p class="mini">'+(review?'Познач рівно '+need+' слів; інша частина тексту залишиться прихованою.':'Усі чужі фрагменти відкриються лише наприкінці партії.')+'</p><div id="sideRoster">'+rosterCompact()+'</div><button class="leave" data-act="leave">Вийти з партії</button></aside>';
 return '<div class="play writer-shell" data-writer-stage="'+(review?'select':'draft')+'"><section class="paper writing editor-paper"><div class="progress editor-progress"><span class="eyebrow">'+(review?'02 / ПЕРЕДАТИ СЛОВА':'01 / НАПИСАТИ')+'</span><button type="button" class="leave mobile-leave" data-act="leave">Вийти</button><strong>'+String(view.round+1).padStart(2,'0')+' / '+view.total+'</strong></div><div class="editor-roster">'+turnProgress()+'</div>'+intro+'<form id="answerForm" class="writer '+(review?'writer-selection':'writer-compose')+'">'+(review?'':guidelines+passport)+(review?reviewBody:composeBody)+bottom+'</form></section>'+aside+'</div>';
}
