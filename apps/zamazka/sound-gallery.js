// Audition the complete original foley palette in the isolated QA iframe.
// Every button invokes the same MuseumAudio engine as the actual game.
export const SOUND_GALLERY=[
 {title:'Часы и окончание времени',items:[
  ['clock-tick','Одиночный механический тик'],
  ['watch-warning','Часовщик · осталось 10 секунд'],
  ['watch-five','Часовщик · осталось 5 секунд'],
  ['time-up','Часовщик · время вышло'],
  ['clock-demo','Полный отсчёт · 15 секунд']]},
 {title:'Работа реставратора',items:[
  ['brush','Кисть по холсту'],['fill','Заливка участка'],
  ['tool','Смена инструмента'],['undo','Отмена мазка']]},
 {title:'Картины и музей',items:[
  ['frame','Перемещение деревянной рамы'],['paper','Страница каталога'],
  ['door','Дверь музея'],['reveal','Разоблачение картины']]},
 {title:'Голосование и интерфейс',items:[
  ['token','Монета на деревянном столе'],
  ['press','Нажатие кнопки'],['confirm','Подтверждение действия'],
  ['warning','Предупреждение'],['final-warning','Дополнительный сигнал'],
  ['error','Ошибка']]}
];
const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
export function soundGalleryMarkup(){
 return '<section class="zam-sound-gallery" aria-label="Прослушивание звуковых эффектов">'+
  '<header><span class="section-label">МАСТЕРСКАЯ ЗВУКА / ТЕСТОВЫЙ РЕЖИМ</span><h2>Все звуки «Замазки»</h2>'+
  '<p>Нажмите на эффект, чтобы услышать именно тот звук, который используется в игре.</p></header>'+
  '<div class="zam-sound-gallery-grid">'+SOUND_GALLERY.map(section=>
   '<section class="zam-sound-category"><h3>'+escape(section.title)+'</h3>'+
    section.items.map(([id,name])=>'<button type="button" data-debug-sound="'+id+'">'+
    '<span aria-hidden="true">▶</span><strong>'+escape(name)+'</strong>'+
    (id==='clock-demo'?'<small>Тиканье плавно усиливается</small>':'')+'</button>').join('')+
   '</section>').join('')+'</div>'+
  '<footer><span id="debugSoundStatus" role="status" aria-live="polite">Готово к прослушиванию</span>'+
  '<button data-debug-sound-stop type="button">Остановить звук</button></footer></section>';
}
