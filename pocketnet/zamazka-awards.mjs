// Pure, authoritative award assessment. Inputs are the server module's before/after states,
// never browser-reported progress. The coordinator persists this sidecar outside room state.
export const ZAMAZKA_ACHIEVEMENTS=[
  {id:'zamazka.first-stroke',name:'Первый мазок',tier:'Лёгкое',detail:'Заверши онлайн-реставрацию минимум с 4 мазками.',reward:'Титул «Подмастерье»'},
  {id:'zamazka.sharp-eye',name:'Верный глаз',tier:'Лёгкое',detail:'Поставь все 3 фишки на правильную картину.',reward:'Монокль'},
  {id:'zamazka.shared-canvas',name:'Общее дело',tier:'Среднее',detail:'Оставь 10 мазков на совместном холсте с другим игроком.',reward:'Кисть за ухом'},
  {id:'zamazka.three-rounds',name:'Трижды прозорливый',tier:'Среднее',detail:'Угадай хотя бы одну фишку в каждом из трёх раундов одного матча.',reward:'Титул «Знаток подделок»'},
  {id:'zamazka.five-works',name:'Большая выставка',tier:'Среднее',detail:'Заверши матч из 5 раундов с непустой реставрацией в каждом.',reward:'Фон «Галерея при свечах»'},
  {id:'zamazka.perfect-forgery',name:'Ни следа оригинала',tier:'Сложное',detail:'Трое соперников не угадают твою картину ни одной фишкой.',reward:'Рамка «Потёртая позолота»'},
  {id:'zamazka.maestro',name:'Маэстро Замазки',tier:'Легендарное',detail:'Единолично победи в матче из 5 раундов при минимум 4 игроках.',reward:'Мантия великого реставратора'}
];
const own=(x,k)=>Object.prototype.hasOwnProperty.call(x,k);
export function assessZamazkaAwards(previous,next,events,actor,original,matchId){
  const data=structuredClone(original||{board:{},rounds:{},matchId:null,done:false});
  const awards=[];
  const award=(pid,id)=>{if(typeof pid==='string')awards.push({playerId:pid,achievementId:'zamazka.'+id,matchId:data.matchId})};
  if(previous?.phase==='results'&&next?.phase==='lobby')
    return {data:{board:{},rounds:{},matchId:null,done:false},awards:[]};
  // Every board_delta is produced only on an accepted, validated server segment.
  if(previous?.phase==='lobby'&&next?.phase==='lobby')
    for(const e of events||[])if(e.type==='board_delta'&&e.payload?.u===actor)
      data.board[actor]=(data.board[actor]||0)+1;
  if(previous?.phase==='lobby'&&next?.phase!=='lobby'&&next?.round===1){
    data.rounds={};data.done=false;data.matchId=matchId;
  }
  if(!data.matchId||!Array.isArray(next?.participants)||!next?.scores)return {data,awards};
  if(previous?.phase!=='round-review'&&next.phase==='round-review'&&Number.isInteger(next.round)&&
     next.round>0&&next.round<=5&&!own(data.rounds,next.round)){
    const participants=next.participants,ids=participants.map(p=>p.id);
    const completed={},correct={},sharp={};
    for(const pid of ids){completed[pid]=Array.isArray(next.assignments?.[pid]?.strokes)&&next.assignments[pid].strokes.length>0;correct[pid]=false;sharp[pid]=false;}
    const pick=pid=>next.selected?.indexOf(next.assignments?.[pid]?.art)??-1;
    for(const target of ids){
      const votes=next.votes?.[target]||{},choice=pick(target);
      const ballots=Object.entries(votes).filter(([v,b])=>v!==target&&ids.includes(v)&&Array.isArray(b)&&b.length===5);
      const found=ballots.reduce((acc,[v,b])=>{const n=choice>=0?b[choice]:0;if(n>=1)correct[v]=true;if(n===3)sharp[v]=true;return acc+n;},0);
      if(choice>=0&&ballots.length>=3&&found===0)award(target,'perfect-forgery');
    }
    data.rounds[next.round]={completed,correct};
    for(const pid of ids){
      if(next.assignments[pid]?.strokes?.length>=4)award(pid,'first-stroke');
      if(sharp[pid])award(pid,'sharp-eye');
      const partners=ids.some(other=>other!==pid&&(data.board[other]||0)>0);
      if((data.board[pid]||0)>=10&&partners)award(pid,'shared-canvas');
      if(next.round>=3&&[1,2,3].every(i=>data.rounds[i]?.correct?.[pid]===true))award(pid,'three-rounds');
    }
  }
  if(previous?.phase!=='results'&&next.phase==='results'&&!data.done){
    data.done=true;
    const ids=next.participants.map(p=>p.id);
    if(next.rounds===5&&[1,2,3,4,5].every(i=>own(data.rounds,i))){
      for(const pid of ids)if([1,2,3,4,5].every(i=>data.rounds[i].completed?.[pid]))award(pid,'five-works');
      if(ids.length>=4){
        const scores=ids.map(pid=>({pid,n:(next.scores[pid]?.mask||0)+(next.scores[pid]?.eye||0)})).sort((a,b)=>b.n-a.n);
        if(scores[0].n>scores[1].n&&[1,2,3,4,5].every(i=>data.rounds[i].completed?.[scores[0].pid]))
          award(scores[0].pid,'maestro');
      }
    }
  }
  return {data,awards};
}
