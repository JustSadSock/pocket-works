import {storyText} from './story-library.js';
import {chapterReader} from './reader-reveal.js';

/** The archive renderer is deliberately pure: app.js owns storage and actions. */
export function renderArchive({all,visible,edition,story,query='',readerMode='full',readerPage=0,escape}){
 const back='<button class="button outline small archive-back" type="button" data-act="archive-back">← До меню</button>';
 const header='<header class="archive-heading"><div><div class="eyebrow">ПРИВАТНА ПОЛИЦЯ</div><h2>Архів рукописів</h2><p class="mini">Лише на цьому пристрої · '+all.length+' видань</p></div>'+back+'</header>';
 const tools='<div class="archive-toolbar">'+
  '<label class="archive-search-label"><span>Знайти рукопис</span><input type="search" class="field" id="archiveSearch" autocomplete="off" maxlength="120" placeholder="Автор, сюжет або фраза…" value="'+escape(query)+'"></label>'+
  '<div class="archive-backups"><button type="button" class="button outline small" data-act="archive-export"'+(all.length?'':' disabled')+'>Зберегти копію ↓</button>'+
  '<button type="button" class="button outline small" data-act="archive-import">Відновити з файлу ↑</button><input type="file" id="archiveImportFile" accept=".json,application/json" class="archive-file-input" tabindex="-1" aria-label="Вибрати резервну копію архіву"></div></div>';
 if(!all.length){
  return '<div class="archive-page">'+header+tools+'<section class="paper archive-empty"><div class="eyebrow">ПОЛИЦЯ ПОКИ ПОРОЖНЯ</div><h3>Спочатку створіть історію</h3><p class="lead">Завершені партії з’являються тут автоматично. Можна також відновити попередню резервну копію.</p><button class="button" type="button" data-act="archive-back">Повернутися до гри →</button></section></div>';
 }
 if(!visible.length||!edition||!story){
  return '<div class="archive-page">'+header+tools+'<section class="paper archive-empty archive-no-match"><div class="eyebrow">ПОШУК</div><h3>Нічого не знайдено</h3><p class="lead">Перевір ім’я автора, назву або спробуй іншу фразу з тексту історії.</p><button class="button outline" type="button" data-act="archive-clear-search">Очистити пошук</button></section></div>';
 }
 const date=new Date(edition.savedAt).toLocaleDateString('uk-UA',{day:'2-digit',month:'short',year:'numeric'});
 const episodes=edition.stories.map((x,i)=>'<button type="button" class="archive-tab '+(x.id===story.id?'is-active':'')+'" data-act="archive-story" data-id="'+escape(x.id)+'" aria-current="'+(x.id===story.id?'true':'false')+'">'+String(i+1).padStart(2,'0')+' · '+escape(x.starter)+'</button>').join('');
 const pageActions={prev:'archive-prev-part',next:'archive-next-part',nextStory:'archive-next-story'};
 const manuscript=readerMode==='pages'?chapterReader(story,readerPage,escape,pageActions):
  '<div class="story-text archive-story-prose">'+escape(storyText(story))+'</div><details class="archive-credits"><summary>Автори фрагментів</summary>'+
  story.fragments.map((f,i)=>'<div class="archive-credit">№ '+(i+1)+' · '+escape(f.author)+' · '+escape(f.question)+'</div>').join('')+'</details>';
 const shelf=visible.map((item,i)=>'<div class="archive-shelf-item"><button type="button" class="chapter '+(item.id===edition.id?'active':'')+'" data-act="archive-edition" data-id="'+escape(item.id)+'" aria-current="'+(item.id===edition.id?'true':'false')+'"><small>№ '+String(visible.length-i).padStart(2,'0')+' · '+new Date(item.savedAt).toLocaleDateString('uk-UA')+'</small>'+item.stories.length+' історій · '+item.playerCount+' авторів</button>'+
  '<button type="button" class="archive-pin '+(item.favorite?'is-pinned':'')+'" data-act="archive-pin" data-id="'+escape(item.id)+'" aria-label="'+(item.favorite?'Відкріпити':'Закріпити')+' видання" aria-pressed="'+Boolean(item.favorite)+'" title="'+(item.favorite?'Відкріпити випуск':'Зберегти випуск у вибраному')+'">★</button></div>').join('');
 return '<div class="archive-page">'+header+tools+'<div class="results archive-layout"><nav class="chapters archive-editions" aria-label="Збережені видання"><h3>Видання</h3>'+shelf+'</nav>'+
  '<article class="paper story-paper archive-manuscript"><div class="progress"><span class="eyebrow">ЗБЕРЕЖЕНЕ ВИДАННЯ</span><span class="mini">'+date+'</span></div><h3>Історія '+escape(story.starter)+'</h3><p class="mini">'+escape(story.setLabel)+' · '+escape(story.genre)+'</p>'+
  '<div class="archive-tabs">'+episodes+'</div>'+
  '<div class="archive-mode" role="group" aria-label="Спосіб читання"><button type="button" data-act="archive-pages" aria-pressed="'+(readerMode==='pages')+'">Аркуші</button><button type="button" data-act="archive-full" aria-pressed="'+(readerMode==='full')+'">Увесь текст</button></div>'+
  '<div class="content archive-reader-scroll" tabindex="0" aria-label="Збережений рукопис">'+manuscript+'</div>'+
  '<div class="button-row archive-actions"><button type="button" class="button outline small" data-act="archive-copy">Копіювати текст</button><button type="button" class="button small" data-act="archive-comic">Комікс через ChatGPT ↗</button></div>'+
  '<button class="leave archive-delete" type="button" data-act="archive-ask-delete">Видалити це видання</button></article></div></div>';
}
