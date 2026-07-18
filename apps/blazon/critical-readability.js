const PATCH_FLAG=Symbol.for('blazon.critical-readability.v1');
if(typeof window!=='undefined'&&!window[PATCH_FLAG]){
  window[PATCH_FLAG]=true;
  const WORLD_WIDTH=720,WORLD_HEIGHT=1120;
  const proto=CanvasRenderingContext2D.prototype;
  const nativeSetTransform=proto.setTransform;
  const nativeFillText=proto.fillText;
  const labelFrame={bucket:-1,values:new Set()};

  proto.setTransform=function(a,b,c,d,e,f){
    const canvas=this.canvas;
    if(canvas?.id==='battleCanvas'&&b===0&&c===0&&a>0&&d>0){
      const rect=canvas.getBoundingClientRect();
      const dpr=rect.width>0?canvas.width/rect.width:1;
      const reset=Math.abs(a-dpr)<.015&&Math.abs(d-dpr)<.015&&Math.abs(e)<.01&&Math.abs(f)<.01;
      if(!reset){
        const worldW=WORLD_WIDTH*a,worldH=WORLD_HEIGHT*d;
        e=worldW<=canvas.width?(canvas.width-worldW)/2:Math.max(canvas.width-worldW,Math.min(0,e));
        f=worldH<=canvas.height?(canvas.height-worldH)/2:Math.max(canvas.height-worldH,Math.min(0,f));
      }
    }
    return nativeSetTransform.call(this,a,b,c,d,e,f);
  };

  proto.fillText=function(text,x,y,maxWidth){
    if(this.canvas?.id==='battleCanvas'&&typeof text==='string'&&text.includes(' · ')){
      const bucket=Math.floor(performance.now()/24);
      if(labelFrame.bucket!==bucket){labelFrame.bucket=bucket;labelFrame.values.clear();}
      if(labelFrame.values.has(text)||labelFrame.values.size>=2)return;
      labelFrame.values.add(text);
    }
    return maxWidth===undefined?nativeFillText.call(this,text,x,y):nativeFillText.call(this,text,x,y,maxWidth);
  };

  const style=document.createElement('style');
  style.textContent=`
    #ruleFlash{max-width:min(310px,58vw);padding:7px 11px;font-size:9px;line-height:1.2;white-space:normal}
    .battle-hud{transform:scale(.91);transform-origin:top left}
    .enemy-hud{transform-origin:top right}
    @media(max-width:700px){#ruleFlash{top:58px;max-width:54vw;font-size:8px}.battle-hud{transform:scale(.84)}}
  `;
  document.head.append(style);

  queueMicrotask(()=>{
    const node=document.querySelector('#ruleFlash');
    if(!node)return;
    let lastText='',lastAt=-Infinity;
    const observer=new MutationObserver(()=>{
      const text=node.textContent.trim(),now=performance.now();
      if(text&&text===lastText&&now-lastAt<1800)node.classList.remove('is-visible');
      else if(text){lastText=text;lastAt=now;}
    });
    observer.observe(node,{childList:true,characterData:true,subtree:true,attributes:true,attributeFilter:['class']});
  });
}
