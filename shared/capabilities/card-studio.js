// Large, touch-first editable card painting surface. Kept separate from template background selection.
// Stores a safe raster, not arbitrary user-supplied SVG or HTML.
export function mountCardCanvas(root,{initial='',onChange=()=>{},onError=()=>{}}={}){
  const canvas=root.querySelector('.pws-studio-canvas'),ctx=canvas?.getContext('2d',{willReadFrequently:true});
  if(!ctx)return null;
  const widthPx=canvas.width,heightPx=canvas.height,undo=[],redo=[],maxHistory=16;
  let drawing=false,last=null,tool='brush',ink='#273d46',width=10,clearArmed=false,ready=false;
  const colorBtns=[...root.querySelectorAll('[data-paint-color]')];
  const toolBtns=[...root.querySelectorAll('[data-paint-tool]')];
  const steps=()=>{root.querySelector('[data-paint-undo]').disabled=undo.length<=1;
    root.querySelector('[data-paint-redo]').disabled=!redo.length;};
  const snapshot=()=>ctx.getImageData(0,0,widthPx,heightPx);
  const push=()=>{undo.push(snapshot());if(undo.length>maxHistory)undo.shift();redo.length=0;steps();};
  const resetClear=()=>{clearArmed=false;const btn=root.querySelector('[data-paint-clear]');if(btn)btn.textContent='Очистить';};
  const refresh=()=>{colorBtns.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.paintColor===ink)));
    toolBtns.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.paintTool===tool)));};
  const exportImage=()=>{
    const out=document.createElement('canvas');
    for(const pixels of [320,256,192,160,128]){
      out.width=pixels;out.height=Math.round(pixels*heightPx/widthPx);const painter=out.getContext('2d');
      painter.clearRect(0,0,out.width,out.height);painter.drawImage(canvas,0,0,out.width,out.height);
      for(const quality of [.82,.7,.56,.4]){
        const encoded=out.toDataURL('image/webp',quality);
        if(encoded.length<=23000)return encoded;
      }
    }
    return null;
  };
  const changed=()=>{const encoded=exportImage();if(!encoded){onError('Рисунок слишком сложный для карточки. Попробуй убрать мелкие детали.');return false}
    onError('');onChange(encoded);return true;};
  const restore=(image)=>{ctx.putImageData(image,0,0);steps();changed();};
  const point=e=>{const r=canvas.getBoundingClientRect();return {x:(e.clientX-r.left)*widthPx/r.width,y:(e.clientY-r.top)*heightPx/r.height}};
  const mark=(from,to)=>{
    ctx.save();ctx.lineCap='round';ctx.lineJoin='round';ctx.lineWidth=width;
    ctx.globalCompositeOperation=tool==='eraser'?'destination-out':'source-over';
    ctx.strokeStyle=ink;ctx.fillStyle=ink;
    ctx.beginPath();ctx.moveTo(from.x,from.y);ctx.lineTo(to.x,to.y);ctx.stroke();
    if(from.x===to.x&&from.y===to.y){ctx.beginPath();ctx.arc(from.x,from.y,width/2,0,Math.PI*2);ctx.fill();}
    ctx.restore();
  };
  canvas.addEventListener('pointerdown',e=>{
    if(!ready||!e.isPrimary||e.pointerType==='mouse'&&e.button!==0)return;
    e.preventDefault();drawing=true;last=point(e);canvas.setPointerCapture(e.pointerId);mark(last,last);
  });
  canvas.addEventListener('pointermove',e=>{if(!drawing)return;e.preventDefault();
    const now=point(e);mark(last,now);last=now;});
  const done=()=>{if(!drawing)return;drawing=false;last=null;push();changed();};
  canvas.addEventListener('pointerup',done);canvas.addEventListener('pointercancel',done);
  root.addEventListener('click',e=>{
    const color=e.target.closest('[data-paint-color]');
    if(color){ink=color.dataset.paintColor;tool='brush';resetClear();refresh();return}
    const t=e.target.closest('[data-paint-tool]');
    if(t){tool=t.dataset.paintTool;resetClear();refresh();return}
    if(e.target.closest('[data-paint-undo]')&&undo.length>1){
      redo.push(undo.pop());restore(undo.at(-1));resetClear();return;
    }
    if(e.target.closest('[data-paint-redo]')&&redo.length){
      const prev=redo.pop();undo.push(prev);restore(prev);resetClear();return;
    }
    if(e.target.closest('[data-paint-clear]')){
      if(!clearArmed){clearArmed=true;root.querySelector('[data-paint-clear]').textContent='Подтвердить очистку';return;}
      ctx.clearRect(0,0,widthPx,heightPx);push();changed();resetClear();
    }
  });
  const custom=root.querySelector('[data-paint-custom]');
  custom.addEventListener('input',()=>{ink=custom.value;tool='brush';resetClear();refresh()});
  const slider=root.querySelector('[data-paint-size]');
  slider.addEventListener('input',()=>{width=Number(slider.value);root.querySelector('[data-paint-size-label]').textContent=width;resetClear()});
  refresh();
  const finishLoad=()=>{ready=true;push();steps()};
  if(initial){
    const image=new Image();image.onload=()=>{ctx.clearRect(0,0,widthPx,heightPx);
      const ratio=Math.max(widthPx/image.naturalWidth,heightPx/image.naturalHeight);
      const w=image.naturalWidth*ratio,h=image.naturalHeight*ratio;
      ctx.drawImage(image,(widthPx-w)/2,(heightPx-h)/2,w,h);finishLoad()};
    image.onerror=()=>{onError('Не удалось открыть старый рисунок.');finishLoad()};image.src=initial;
  }else finishLoad();
  return {commit(){return ready?exportImage():null},hasChanges(){return undo.length>1},destroy(){drawing=false}};
}
