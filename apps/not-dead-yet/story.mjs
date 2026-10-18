// NOT DEAD YET: Chapter I narrative. Offline, authored and testable.
export const RADIO_STATIONS=Object.freeze(['Помехи','Старая музыка','Знакомая передача']);
export const FRAGMENTS=Object.freeze({
 album:{title:'На обороте альбома',body:'«Лена, май 1986». На краю обложки остался след от чашки. Каждое воскресенье вы доставали его из стенки.'},
 pills:{title:'Записка под крышкой',body:'Карандашом: «После завтрака. Не перепутать». Почерк твой, но ты не помнишь, когда начал оставлять себе записки.'},
 photo:{title:'Фотография у окна',body:'Она стоит на фоне той самой кухни. За фотографией написано: «Я всегда найду тебя дома» — и дата, почти стёртая пальцами.'},
 keys:{title:'Ключи на гвоздике',body:'У связки брелок с маленьким зелёным домом. Когда-то ты сделал его своими руками и обещал, что никто не останется за дверью.'}
});
export function radioBroadcast(channel,hasAlbum=false){
 const station=((Math.floor(Number(channel)||0)%3)+3)%3;
 if(station===0)return{station,label:RADIO_STATIONS[0],message:'Сквозь шорох слышно, как гудит старая электросеть.',heard:false,sound:'radio-static'};
 if(station===1)return{station,label:RADIO_STATIONS[1],message:'Играет знакомая мелодия. Ты не можешь вспомнить, кто её напевал.',heard:false,sound:'radio-melody'};
 if(!hasAlbum)return{station,label:RADIO_STATIONS[2],message:'Женский голос теряется в шуме. Чего-то не хватает, чтобы узнать его.',heard:false,sound:'radio-static'};
 return{station,label:RADIO_STATIONS[2],message:'Из приёмника: «Я всегда найду тебя дома». Она назвала себя Леной — это имя ты видел на семейном альбоме.',heard:true,sound:'radio-memory'}
}
export function chapterJournal(inventory=[],recognized=0,heard=false,landing=null){
 const known=new Set(Array.isArray(inventory)?inventory:[]);
 const entries=Object.entries(FRAGMENTS).filter(([id])=>known.has(id)).map(([id,data])=>({id,...data}));
 if(landing?.recognized)entries.push({id:'landing',title:'Авоська на площадке',body:'На лестнице осталась Ленина авоська. Ты вспомнил, как она просила соседку подержать дверь лифта. За стеной была обычная жизнь.'});
 const goal=known.size===4?'Вещи на месте. Осталось открыть входную дверь.':'Осталось найти '+(4-known.size)+' из четырёх вещей.';
 const radio=heard?'Голос из приёмника узнан.':known.has('album')?'Попробуй настроить старый приёмник в гостиной.':'В гостиной остался старый радиоприёмник.';
 const memory=(recognized>0?'Удалось узнать '+recognized+' '+(recognized===1?'комнату':recognized<5?'комнаты':'комнат')+'.':'Стены могут измениться, когда ты перестанешь смотреть.')+(landing?.knocked?(landing.recognized?' Ты вспомнил, кому принадлежала авоська в подъезде.':landing.seen?'В подъезде никого не было.':' Кто-то постучал в дверь.'):'');
 return{entries,goal,radio,memory}
}
export function chapterEnding({won=false,inventory=[],recognized=0,heard=false,landing=null,seconds=0}={}){
 const count=Array.isArray(inventory)?new Set(inventory).size:0;
 if(!won)return{tag:'ГЛАВА I / ПОТЕРЯННЫЙ ВЕЧЕР',title:'Вечер повторился.',text:'Ты сел у знакомой двери. За стеной продолжало тихо играть радио. Найдено вещей: '+count+' из 4.'};
 if(count===4&&heard&&recognized>=2)return{
  tag:'ГЛАВА I / ТЁПЛОЕ УТРО',title:'Ты вспомнил дорогу домой.',
  text:'Ты узнал голос из старого приёмника и '+recognized+' знакомые комнаты. Замок поддался. Квартира наконец перестала спорить с памятью. Утро за дверью не изменилось. Время: '+Math.round(seconds)+' сек.'
 };
 if(count===4&&landing?.recognized)return{
  tag:'ГЛАВА I / ЗНАКОМАЯ ЛЕСТНИЦА',title:'Там всё ещё живут люди.',
  text:'За дверным глазком ты увидел старую авоську Лены. Знакомые ступени, соседская дверь, гул лифта — мир снаружи не исчез. С четырьмя вещами в руках ты повернул ключ и вышел. Время: '+Math.round(seconds)+' сек.'
 };
 return{
  tag:'ГЛАВА I / УТРО',title:'Дверь вспомнила тебя.',
  text:'В кармане четыре знакомые вещи. Замок щёлкнул, а комнаты за спиной снова стали чужими. Ты всё равно сделал шаг к утру. Время: '+Math.round(seconds)+' сек.'
 }
}
