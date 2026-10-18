/* Topographic ink-and-relief pass over original FoC terrain sprites.
   Never samples undiscovered cells, enemy positions or hidden buildings. */
(function(w){
  'use strict';
  const hash=(r,c,s=0)=>{
    let x=Math.imul(r+81,374761393)^Math.imul(c+17,668265263)^Math.imul(s+71,2246822519);
    x=Math.imul(x^(x>>>13),1274126177);return ((x^(x>>>16))>>>0)/4294967295;
  };
  const smooth=(ctx)=>{ctx.lineJoin='round';ctx.lineCap='round';};
  function depth(ctx,terrain,r,c,x,y,cw,ch,classic=false){
    if(terrain===undefined||!ctx||cw<4||ch<4)return;
    const q=Math.max(.7,Math.min(1.6,cw/40)),seed=hash(r,c,1);
    ctx.save();ctx.lineWidth=classic?1:Math.max(.8,q*.9);
    if(terrain===3||terrain===4){
      const high=terrain===4;
      ctx.fillStyle=high?'rgba(18,26,27,.38)':'rgba(29,37,25,.18)';
      ctx.beginPath();ctx.moveTo(x+cw*.09,y+ch*.84);
      ctx.lineTo(x+cw*.38,y+ch*(high?.12:.27));
      ctx.lineTo(x+cw*.66,y+ch*(high?.25:.34));
      ctx.lineTo(x+cw*.97,y+ch*.9);
      ctx.closePath();ctx.fill();
      ctx.fillStyle='rgba(236,224,173,.16)';
      ctx.beginPath();ctx.moveTo(x+cw*.38,y+ch*(high?.12:.27));
      ctx.lineTo(x+cw*.66,y+ch*(high?.25:.34));
      ctx.lineTo(x+cw*.50,y+ch*.71);
      ctx.closePath();ctx.fill();
      ctx.strokeStyle='rgba(13,29,25,.36)';
      for(let k=0;k<(high?3:2);k++){
        const offset=k*.085;
        ctx.beginPath();ctx.moveTo(x+cw*(.19+offset),y+ch*(.74+offset));
        ctx.lineTo(x+cw*(.5+offset),y+ch*(.78+offset));
        ctx.lineTo(x+cw*(.83+offset),y+ch*(.83+offset));ctx.stroke();
      }
    }else if(terrain===2){
      ctx.fillStyle='rgba(9,26,18,.24)';
      ctx.beginPath();ctx.ellipse(x+cw*.52,y+ch*.83,cw*.39,ch*.12,0,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='rgba(215,223,161,.25)';
      for(let n=0;n<3;n++){
        const px=x+cw*(.28+n*.21+(seed-.5)*.05);
        ctx.beginPath();ctx.moveTo(px,y+ch*.76);
        ctx.lineTo(px+cw*.025,y+ch*.28+n*ch*.025);
        ctx.lineTo(px+cw*.12,y+ch*.70);ctx.stroke();
      }
    }else if(terrain===1){
      ctx.strokeStyle='rgba(196,222,210,.23)';
      for(let n=0;n<2;n++){
        const yy=y+ch*(.37+.28*n);
        ctx.beginPath();ctx.moveTo(x+cw*(.14+seed*.1),yy);
        ctx.quadraticCurveTo(x+cw*.46,yy-ch*.06,x+cw*.85,yy);ctx.stroke();
      }
    }else{
      // Sparse pasture hatching lends materiality without obscuring sprite work.
      if(seed>.6){
        ctx.strokeStyle='rgba(233,230,178,.15)';
        ctx.beginPath();ctx.moveTo(x+cw*.18,y+ch*.79);
        ctx.lineTo(x+cw*.22,y+ch*.69);
        ctx.moveTo(x+cw*.75,y+ch*.53);
        ctx.lineTo(x+cw*.78,y+ch*.41);ctx.stroke();
      }
    }
    ctx.restore();
  }
  let visualLayer=null;
  let soundsMuted=false;
  const accessible=()=>!w.matchMedia?.('(prefers-reduced-motion:reduce)').matches;
  function layer(){
    if(visualLayer?.isConnected)return visualLayer;
    visualLayer=document.createElement('div');
    visualLayer.id='fogLandscapeActions';visualLayer.setAttribute('aria-hidden','true');
    document.body.append(visualLayer);return visualLayer;
  }
  function action(kind,r,c,details={}){
    if(!Number.isInteger(r)||!Number.isInteger(c)||!w.ROWS||!w.COLS)return false;
    const canvas=document.getElementById('canvas'),viewport=document.getElementById('battleViewport');
    if(!canvas||!viewport)return false;
    const a=canvas.getBoundingClientRect(),b=viewport.getBoundingClientRect();
    const x=a.left+(c+.5)*a.width/w.COLS,y=a.top+(r+.5)*a.height/w.ROWS;
    if(x<b.left||x>b.right||y<b.top||y>b.bottom)return false;
    if(!accessible())return true;
    const marker=document.createElement('div');
    marker.className='fog-action-mark fog-action-'+kind;
    marker.style.left=x+'px';marker.style.top=y+'px';
    if(details.amount&&Number.isFinite(details.amount)&&Math.abs(details.amount)<100){
      const delta=document.createElement('span');
      delta.className='fog-action-amount';
      delta.textContent=(kind==='heal'?'+':'−')+Math.round(Math.abs(details.amount));
      marker.append(delta);
    }
    layer().append(marker);
    marker.addEventListener('animationend',()=>marker.remove(),{once:true});
    setTimeout(()=>marker.remove(),900);
    return true;
  }
  function flush(){if(visualLayer)visualLayer.replaceChildren();}
  w.FogVisual={depth,action,flush,hash};
})(window);
