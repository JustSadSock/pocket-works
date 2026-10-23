// Visual-only effects for the shared Blockies well.
// No game-state writes, timers that delay locking, or extra layers over input.
export const FX_DURATION={landing:310,clear:520,celebration:640};
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const easeOut=t=>1-(1-t)**3;
const isFilled=(value)=>Number.isInteger(value)&&value>0;

export function getNewLockedCells(before,after){
  if(!Array.isArray(before)||!Array.isArray(after))return [];
  const cells=[];
  for(let y=0;y<after.length;y++){
    if(!Array.isArray(after[y]))continue;
    for(let x=0;x<after[y].length;x++){
      const owner=after[y][x];
      if(isFilled(owner)&&owner!==before[y]?.[x])cells.push({x,y,owner});
    }
  }
  return cells;
}

export class BoardEffects {
  constructor({reducedMotion=false,colors=()=>[]}={}){
    this.reducedMotion=!!reducedMotion;
    this.colors=colors;
    this.events=[];
    this.canvas=null;
    this.ctx=null;
    this.frame=0;
    this.running=false;
    this.drawFrame=this.drawFrame.bind(this);
  }
  attach(canvas){
    this.reset();
    this.canvas=canvas;
    this.ctx=canvas?.getContext?.('2d')||null;
  }
  reset(){
    if(this.frame)cancelAnimationFrame(this.frame);
    this.frame=0;
    this.running=false;
    this.events=[];
    this.ctx?.clearRect(0,0,this.canvas.width,this.canvas.height);
  }
  dispose(){
    this.reset();
    this.canvas=null;this.ctx=null;
  }
  queue(event){
    if(this.reducedMotion||!this.ctx||!this.canvas)return;
    this.events.push({...event,start:performance.now()});
    if(this.events.length>8)this.events.splice(0,this.events.length-8);
    if(!this.running){
      this.running=true;
      this.frame=requestAnimationFrame(this.drawFrame);
    }
  }
  landing(cells,color,{hard=false}={}){
    if(!Array.isArray(cells)||!cells.length)return;
    this.queue({type:'landing',duration:FX_DURATION.landing,cells:cells.slice(0,4),color,hard});
  }
  clearRows(rows,{linesCleared=1,comboChain=1,totalScore=0}={}){
    const safeRows=Array.isArray(rows)?rows
      .filter(row=>Number.isInteger(row.y)&&row.y>=0&&Array.isArray(row.cells))
      .slice(0,4):[];
    this.queue({
      type:'clear',duration:FX_DURATION.clear,rows:safeRows,
      lines:clamp(linesCleared,1,4),combo:Math.max(1,comboChain),score:Math.max(0,totalScore)
    });
  }
  color(owner){return this.colors()[owner-1]||'#a5dbcb';}
  drawFrame(now){
    this.frame=0;
    if(!this.ctx||!this.canvas){this.running=false;return;}
    const ctx=this.ctx;
    ctx.clearRect(0,0,this.canvas.width,this.canvas.height);
    const cell=this.canvas.width/Math.max(1,this.boardWidth||10);
    this.events=this.events.filter(event=>now-event.start<event.duration);
    for(const event of this.events){
      const t=clamp((now-event.start)/event.duration,0,1);
      if(event.type==='landing')this.drawLanding(ctx,event,t,cell);
      else this.drawClear(ctx,event,t,cell);
    }
    if(this.events.length){
      this.frame=requestAnimationFrame(this.drawFrame);
    }else this.running=false;
  }
  drawLanding(ctx,event,t,cell){
    const impact=1-easeOut(clamp(t/.72,0,1));
    const bounce=Math.sin(clamp(t/.8,0,1)*Math.PI)*.25;
    const displacement=event.hard?5:2.6;
    ctx.save();
    for(const block of event.cells){
      const x=block.x*cell,y=block.y*cell;
      ctx.fillStyle=event.color;
      ctx.globalAlpha=.45*impact;
      const inset=cell*(.07+bounce*.2);
      ctx.fillRect(x+inset,y+cell*.52+bounce*cell*.2,
        cell-inset*2,cell*.41*(1+bounce));
      ctx.strokeStyle=event.color;
      ctx.lineWidth=Math.max(.8,cell*.085);
      ctx.globalAlpha=.68*impact;
      ctx.strokeRect(x+1,y+1,cell-2,cell-2);
    }
    if(event.hard&&event.cells.length){
      const cx=event.cells.reduce((n,p)=>n+p.x+.5,0)/event.cells.length*cell;
      const cy=Math.max(...event.cells.map(p=>p.y+1))*cell;
      const spread=displacement*cell*.42*easeOut(t);
      ctx.beginPath();
      ctx.globalAlpha=.38*(1-t);
      ctx.strokeStyle=event.color;
      ctx.lineWidth=Math.max(1,cell*.07)*(1-t)+.5;
      ctx.ellipse(cx,cy,Math.max(cell*.3,spread),Math.max(1,cell*.09*(1-t)),0,Math.PI,2*Math.PI);
      ctx.stroke();
    }
    ctx.restore();
  }
  drawClear(ctx,event,t,cell){
    const width=this.canvas.width,height=this.canvas.height;
    const strength=Math.min(1,event.combo/5);
    const alpha=(1-easeOut(t));
    ctx.save();
    if(!event.rows.length){
      // PocketNet snapshots contain the post-clear board, not historic row cells.
      // Show an edge flash without guessing which rows were deleted.
      const gradient=ctx.createLinearGradient(0,0,width,0);
      gradient.addColorStop(0,'#83dfcb00');
      gradient.addColorStop(.5,'#bdece5');
      gradient.addColorStop(1,'#83dfcb00');
      ctx.strokeStyle=gradient;
      ctx.globalAlpha=alpha*(.3+strength*.2);
      ctx.lineWidth=Math.max(2,cell*.1);
      const y=height*(.44+.04*Math.sin(t*Math.PI));
      ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(width,y);ctx.stroke();
    }else{
      for(const row of event.rows){
        const y=row.y*cell;
        const sweep=clamp(t/.36,0,1);
        const wipeX=width*easeOut(sweep);
        ctx.fillStyle='#e5ffed';
        ctx.globalAlpha=.53*(1-sweep);
        ctx.fillRect(0,y,Math.max(0,wipeX),cell);
        ctx.globalAlpha=alpha*.75;
        for(let x=0;x<row.cells.length;x++){
          const owner=row.cells[x];
          if(!isFilled(owner))continue;
          const color=this.color(owner);
          const lateral=(x%2===0?-1:1)*cell*.3*easeOut(t);
          const drift=(.55+t*.8)*cell*t;
          ctx.fillStyle=color;
          const size=Math.max(1,cell*(.35-t*.2));
          const bx=(x+.5)*cell+lateral,by=y+cell*.5-drift;
          ctx.fillRect(bx-size/2,by-size/2,size,size);
        }
      }
    }
    // The reward stays linked to the board, but never obstructs moving pieces.
    const popup=clamp((t-.04)/.72,0,1);
    ctx.font=`800 ${Math.min(26,Math.max(13,cell*1.1))}px system-ui`;
    ctx.textAlign='center';
    ctx.textBaseline='middle';
    ctx.globalAlpha=Math.min(1,popup*5)*Math.max(0,1-popup*.93);
    ctx.fillStyle='#e6f9ee';
    const label=event.combo>1?`×${event.combo} · +${event.score}`:`+${event.score}`;
    ctx.fillText(label,width*.5,height*.34-popup*cell*.7,width*.7);
    ctx.restore();
  }
}
