import {ReplayArchive,parseReplay,unpackReplayFrame} from './replay-core-v1.js';

const byId=id=>document.getElementById(id);
export class ReplayViewer {
 constructor(archive=new ReplayArchive()){
  this.archive=archive;this.replay=null;this.index=0;this.timer=null;
 }
 attach(){
  this.root=byId('replay-viewer');this.canvas=byId('replay-canvas');
  this.slider=byId('replay-slider');this.caption=byId('replay-caption');
  this.score=byId('replay-score');
  byId('replay-open')?.addEventListener('click',()=>this.openCurrent());
  byId('replay-last')?.addEventListener('click',()=>this.openLast());
  byId('replay-save')?.addEventListener('click',()=>this.download());
  byId('replay-export')?.addEventListener('click',()=>this.download());
  byId('replay-import')?.addEventListener('click',()=>byId('replay-file')?.click());
  byId('replay-menu-import')?.addEventListener('click',()=>byId('replay-file')?.click());
  byId('replay-close')?.addEventListener('click',()=>this.close());
  byId('replay-prev')?.addEventListener('click',()=>this.seek(this.index-1));
  byId('replay-next')?.addEventListener('click',()=>this.seek(this.index+1));
  byId('replay-play')?.addEventListener('click',()=>this.togglePlay());
  this.slider?.addEventListener('input',()=>this.seek(Number(this.slider.value)));
  byId('replay-file')?.addEventListener('change',async event=>{
   const file=event.target.files?.[0];if(!file)return;
   try{
    if(file.size>2_000_000)throw Error('Файл слишком большой');
    this.open(parseReplay(await file.text()));
   }catch(error){
    this.setStatus('Не удалось открыть повтор: '+(error?.message||'Неверный формат'),true);
   }finally{event.target.value='';}
  });
  this.root?.addEventListener('keydown',event=>{
   if(event.key==='Escape'){this.close();event.stopPropagation();}
  });
  this.refreshButtons();
 }
 refreshButtons(){
  const hasSaved=!!this.archive.last();
  const last=byId('replay-last');
  if(last){last.disabled=!hasSaved;last.title=hasSaved?'':'Пока нет сохранённых партий';}
  const canShow=(this.archive.active?.frames?.length||0)>0||hasSaved;
  const show=byId('replay-open'),save=byId('replay-save');
  if(show)show.disabled=!canShow;
  if(save)save.disabled=!canShow;
 }
 setStatus(text,isError=false){
  const node=byId('replay-error');
  if(node){node.textContent=text;node.hidden=!text;node.dataset.error=isError?'true':'false';}
 }
 openCurrent(){
  const active=this.archive.active;
  if(active?.frames?.length)this.open(active);
  else this.openLast();
 }
 openLast(){
  const data=this.archive.last();
  if(data)this.open(data);
  else this.setStatus('Сохранённого повтора пока нет',true);
 }
 open(data){
  if(!data?.frames?.length)return;
  this.pause();this.replay=data;this.index=0;
  this.root.hidden=false;
  this.slider.max=String(data.frames.length-1);
  this.slider.value='0';
  this.setStatus(data.truncated?'Показана последняя часть длительной партии':'');
  this.render();
  byId('replay-close')?.focus();
 }
 close(){
  this.pause();if(this.root)this.root.hidden=true;
  this.replay=null;
  this.refreshButtons();
 }
 seek(index){
  if(!this.replay)return;
  this.index=Math.max(0,Math.min(this.replay.frames.length-1,index));
  this.render();
 }
 togglePlay(){
  if(this.timer){this.pause();return;}
  if(!this.replay)return;
  if(this.index>=this.replay.frames.length-1)this.index=0;
  const play=byId('replay-play');
  if(play)play.textContent='Пауза';
  this.timer=setInterval(()=>{
   this.seek(this.index+1);
   if(this.index>=this.replay.frames.length-1)this.pause();
  },220);
 }
 pause(){
  if(this.timer!=null)clearInterval(this.timer);
  this.timer=null;
  const play=byId('replay-play');
  if(play)play.textContent='Воспроизвести';
 }
 render(){
  if(!this.replay||!this.canvas)return;
  const frame=unpackReplayFrame(this.replay.frames[this.index]);
  const {board,players}=frame,width=board[0].length,height=board.length;
  this.canvas.width=width*24;this.canvas.height=height*24;
  this.canvas.style.setProperty('--replay-ratio',width+'/'+height);
  const ctx=this.canvas.getContext('2d');
  ctx.fillStyle='#14121f';ctx.fillRect(0,0,this.canvas.width,this.canvas.height);
  ctx.strokeStyle='rgba(255,255,255,.065)';ctx.lineWidth=1;
  for(let x=0;x<=width;x++){ctx.beginPath();ctx.moveTo(x*24,0);ctx.lineTo(x*24,height*24);ctx.stroke();}
  for(let y=0;y<=height;y++){ctx.beginPath();ctx.moveTo(0,y*24);ctx.lineTo(width*24,y*24);ctx.stroke();}
  const cell=(x,y,color,alpha=1)=>{
   if(x<0||y<0||x>=width||y>=height)return;
   ctx.globalAlpha=alpha;
   ctx.fillStyle=color;ctx.fillRect(x*24+1,y*24+1,22,22);
   ctx.fillStyle='rgba(255,255,255,.28)';ctx.fillRect(x*24+3,y*24+3,18,3);
   ctx.globalAlpha=1;
  };
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)
   if(board[y][x])cell(x,y,players[board[y][x]-1]?.color||'#888');
  for(const player of players){
   if(!player.currentPiece||player.gameOver)continue;
   player.currentPiece.forEach((row,dy)=>row.forEach((v,dx)=>{
    if(v)cell(player.position.x+dx,player.position.y+dy,player.color);
   }));
  }
  this.slider.value=String(this.index);
  const end=this.replay.frames.at(-1).t||0;
  this.caption.textContent=
    Math.floor(frame.t/1000)+'с / '+Math.floor(end/1000)+'с · кадр '+(this.index+1)+'/'+this.replay.frames.length;
  this.score.textContent='Счёт '+frame.score.score+' · линии '+frame.score.lines+' · уровень '+frame.score.level;
 }
 download(){
  const data=this.archive.active?.frames?.length?this.archive.active:this.archive.last();
  if(!data){this.setStatus('Нет записанного повтора',true);return;}
  const json=JSON.stringify(data);
  if(json.length>2_000_000){this.setStatus('Повтор превышает допустимый размер',true);return;}
  const blob=new Blob([json],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');link.href=url;
  link.download='blockies-replay-'+new Date().toISOString().slice(0,10)+'.json';
  document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  this.setStatus('Повтор сохранён в файл');
 }
}
