const RELEASE='5.7.0';
const SCHOOLS=new Set(['imperial','civic','knightly','northern']);

function schoolOf(node){
  const svg=node?.matches?.('svg[data-school]')?node:node?.querySelector?.('svg[data-school]');
  const school=svg?.dataset.school;
  return SCHOOLS.has(school)?school:null;
}

function decorateStandard(node){
  if(!node)return;
  const school=schoolOf(node);
  if(!school)return;
  node.dataset.standardSchool=school;
  node.classList.add('has-heraldic-standard');
}

function refreshStandards(root=document){
  const menu=document.querySelector('.menu-standard');
  const menuHeraldry=document.querySelector('#menuHeraldry');
  const menuSchool=schoolOf(menuHeraldry);
  if(menu&&menuSchool){menu.dataset.standardSchool=menuSchool;menu.querySelector('.standard-cloth')?.setAttribute('data-standard-school',menuSchool);}
  root.querySelectorAll?.('.full-achievement,.reward-card-preview,.ending-standard,.battle-hud>div').forEach(decorateStandard);
}

const observed=[document.querySelector('.app-shell'),...document.querySelectorAll('dialog')].filter(Boolean);
const observer=new MutationObserver(records=>{
  for(const record of records){
    if(record.type==='childList'||record.type==='attributes'){refreshStandards(record.target.closest?.('.app-shell,dialog')||document);break;}
  }
});
for(const root of observed)observer.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['class','data-school']});
refreshStandards();

function patchBattleBanner(){
  const canvas=document.querySelector('#battleCanvas');
  if(!canvas)return;
  const context=canvas.getContext('2d');
  if(!context||context.__blazonStandardPatched)return;
  context.__blazonStandardPatched=true;

  const original={};
  for(const name of['save','restore','beginPath','moveTo','lineTo','quadraticCurveTo','bezierCurveTo','closePath','fill','stroke','drawImage'])original[name]=context[name].bind(context);
  let internal=false,depth=0,ops=[],bannerDepth=0,suppressLegacyStroke=false;

  const call=(name,...args)=>{internal=true;try{return original[name](...args);}finally{internal=false;}};
  context.save=function(){if(internal)return original.save();depth++;return original.save();};
  context.restore=function(){if(internal)return original.restore();const closes=bannerDepth===depth;const result=original.restore();if(closes){bannerDepth=0;suppressLegacyStroke=false;}depth=Math.max(0,depth-1);return result;};
  context.beginPath=function(){if(!internal)ops=[];return original.beginPath();};
  context.moveTo=function(x,y){if(!internal)ops.push(['M',x,y]);return original.moveTo(x,y);};
  context.lineTo=function(x,y){if(!internal)ops.push(['L',x,y]);return original.lineTo(x,y);};
  context.quadraticCurveTo=function(a,b,c,d){if(!internal)ops.push(['Q',a,b,c,d]);return original.quadraticCurveTo(a,b,c,d);};
  context.bezierCurveTo=function(a,b,c,d,e,f){if(!internal)ops.push(['C',a,b,c,d,e,f]);return original.bezierCurveTo(a,b,c,d,e,f);};
  context.closePath=function(){if(!internal)ops.push(['Z']);return original.closePath();};

  const isLegacyCloth=()=>ops.length>=5&&ops[0][0]==='M'&&Math.abs(ops[0][1])<.01&&Math.abs(ops[0][2]+67)<1&&ops.some(item=>item[0]==='Q')&&ops.some(item=>item[0]==='L'&&Math.abs(item[2]+7)<3);

  context.fill=function(...args){
    if(!internal&&isLegacyCloth()){
      const livery=globalThis.__blazonActiveLivery;
      if(livery){
        const firstCurve=ops.find(item=>item[0]==='Q');
        const side=Math.sign(firstCurve?.[3]||1)||1;
        const wave=(firstCurve?.[2]||-72)+72;
        drawTextileStandard(context,livery,side,wave,call);
        bannerDepth=depth;
        suppressLegacyStroke=true;
        return;
      }
    }
    return original.fill(...args);
  };
  context.stroke=function(...args){if(!internal&&suppressLegacyStroke&&isLegacyCloth()){suppressLegacyStroke=false;return;}return original.stroke(...args);};
  context.drawImage=function(image,...args){
    if(!internal&&bannerDepth&&args.length===2&&image&&Number(image.width)>45&&Number(image.width)<130){
      const livery=globalThis.__blazonActiveLivery;
      if(livery?.main){
        const x=args[0]+Number(image.width)/2,y=args[1]+Number(image.height)/2;
        drawBattleGlyph(context,livery.main,x,y,24,livery.emblem,livery.ink,call);
        return;
      }
    }
    return original.drawImage(image,...args);
  };
}

function standardPath(ctx,school,side,wave,call){
  const x=value=>value*side;
  call('beginPath');call('moveTo',0,-67);
  if(school==='imperial'){
    call('bezierCurveTo',x(28),-72+wave*.45,x(62),-69-wave*.25,x(82),-59);
    call('lineTo',x(80),-10);call('lineTo',x(66),-25);call('lineTo',x(53),-7);call('lineTo',x(39),-24);call('lineTo',x(25),-7);call('lineTo',x(13),-24);call('lineTo',0,-18);
  }else if(school==='civic'){
    call('bezierCurveTo',x(28),-70+wave*.35,x(58),-67-wave*.2,x(82),-61);call('lineTo',x(82),-10);call('lineTo',x(65),-14);call('lineTo',x(48),-9);call('lineTo',x(31),-14);call('lineTo',x(15),-9);call('lineTo',0,-18);
  }else if(school==='knightly'){
    call('bezierCurveTo',x(30),-72+wave*.5,x(65),-67-wave*.3,x(88),-57);call('lineTo',x(87),-9);call('lineTo',x(63),-27);call('lineTo',x(42),-9);call('lineTo',0,-18);
  }else{
    call('bezierCurveTo',x(33),-72+wave*.5,x(72),-62-wave*.25,x(98),-44);call('lineTo',x(63),-24);call('lineTo',x(30),-13);call('lineTo',0,-18);
  }
  call('closePath');
}

function drawTextileStandard(ctx,livery,side,wave,call){
  const school=livery.school||'knightly';
  call('save');
  standardPath(ctx,school,side,wave,call);
  const gradient=ctx.createLinearGradient(0,-66,side*90,-16);
  gradient.addColorStop(0,livery.primary);gradient.addColorStop(.42,livery.primary);gradient.addColorStop(.68,mix(livery.primary,'#000000',.2));gradient.addColorStop(1,mix(livery.primary,'#000000',.38));
  ctx.fillStyle=gradient;call('fill');
  standardPath(ctx,school,side,wave,call);call('clip');
  const bands=school==='northern'?4:5;
  for(let index=0;index<bands;index++){
    const center=side*(13+index*15),fold=ctx.createLinearGradient(center-side*9,0,center+side*9,0);
    fold.addColorStop(0,'rgba(0,0,0,.18)');fold.addColorStop(.42,'rgba(255,240,190,.09)');fold.addColorStop(.62,'rgba(255,255,230,.18)');fold.addColorStop(1,'rgba(0,0,0,.2)');ctx.fillStyle=fold;ctx.fillRect(Math.min(center-side*10,center+side*10),-72,20,70);
  }
  ctx.globalAlpha=.26;ctx.strokeStyle='#f5e4b1';ctx.lineWidth=1;for(let y=-61;y<-10;y+=8){call('beginPath');call('moveTo',0,y);call('quadraticCurveTo',side*42,y-2+wave*.08,side*86,y+2);call('stroke');}ctx.globalAlpha=1;
  call('restore');
  standardPath(ctx,school,side,wave,call);ctx.strokeStyle=livery.metal;ctx.lineWidth=2.6;call('stroke');
  ctx.save();ctx.strokeStyle=mix(livery.metal,'#000000',.35);ctx.lineWidth=.9;ctx.setLineDash([2.2,2.8]);call('beginPath');call('moveTo',side*4,-63);call('quadraticCurveTo',side*41,-66+wave*.25,side*(school==='northern'?86:76),-57);call('stroke');ctx.setLineDash([]);ctx.restore();
}

function mix(a,b,t){
  const parse=value=>{const raw=String(value||'#000').replace('#','');const full=raw.length===3?raw.split('').map(x=>x+x).join(''):raw.padEnd(6,'0').slice(0,6);return[parseInt(full.slice(0,2),16),parseInt(full.slice(2,4),16),parseInt(full.slice(4,6),16)];};
  const A=parse(a),B=parse(b);return`rgb(${A.map((value,index)=>Math.round(value+(B[index]-value)*t)).join(',')})`;
}

function drawBattleGlyph(ctx,id,x,y,size,color,detail,call){
  call('save');ctx.translate(x,y);ctx.fillStyle=color;ctx.strokeStyle=detail;ctx.lineWidth=Math.max(1.2,size*.08);ctx.lineJoin='round';ctx.lineCap='round';
  if(id==='lion'){
    call('beginPath');call('moveTo',-size*.15,size*.36);call('lineTo',-size*.27,size*.05);call('lineTo',-size*.12,-size*.14);call('lineTo',size*.03,-size*.08);call('lineTo',size*.13,-size*.34);call('lineTo',size*.33,-size*.24);call('lineTo',size*.25,-size*.02);call('lineTo',size*.4,size*.13);call('lineTo',size*.18,size*.13);call('lineTo',size*.08,size*.4);call('closePath');call('fill');call('beginPath');call('moveTo',-size*.08,-size*.03);call('bezierCurveTo',-size*.45,-size*.18,-size*.43,-size*.48,-size*.18,-size*.41);call('stroke');
  }else if(id==='boar'){
    call('beginPath');ctx.ellipse(0,0,size*.39,size*.25,-.12,0,Math.PI*2);call('fill');call('beginPath');call('moveTo',size*.25,-size*.12);call('lineTo',size*.5,-size*.24);call('lineTo',size*.43,size*.08);call('closePath');call('fill');call('beginPath');call('moveTo',size*.37,size*.02);call('quadraticCurveTo',size*.49,size*.18,size*.56,size*.03);call('stroke');
  }else if(id==='tower'){
    ctx.fillRect(-size*.32,-size*.26,size*.64,size*.62);for(let i=-1;i<=1;i++)ctx.fillRect(i*size*.22-size*.08,-size*.42,size*.16,size*.19);ctx.fillStyle=detail;ctx.fillRect(-size*.08,size*.06,size*.16,size*.3);ctx.fillStyle=color;
  }else if(id==='stag'){
    call('beginPath');ctx.ellipse(-size*.05,size*.06,size*.29,size*.2,-.15,0,Math.PI*2);call('fill');ctx.fillRect(size*.13,-size*.16,size*.12,size*.31);call('beginPath');ctx.arc(size*.25,-size*.22,size*.13,0,Math.PI*2);call('fill');call('beginPath');call('moveTo',size*.19,-size*.3);call('lineTo',size*.02,-size*.53);call('moveTo',size*.25,-size*.32);call('lineTo',size*.32,-size*.57);call('moveTo',size*.04,-size*.48);call('lineTo',-size*.08,-size*.55);call('moveTo',size*.31,-size*.5);call('lineTo',size*.45,-size*.54);call('stroke');
  }else if(id==='eagle'){
    call('beginPath');call('moveTo',0,size*.35);call('lineTo',-size*.48,-size*.2);call('lineTo',-size*.18,-size*.12);call('lineTo',-size*.37,-size*.42);call('lineTo',-size*.05,-size*.22);call('lineTo',0,-size*.48);call('lineTo',size*.05,-size*.22);call('lineTo',size*.37,-size*.42);call('lineTo',size*.18,-size*.12);call('lineTo',size*.48,-size*.2);call('closePath');call('fill');
  }else if(id==='rose'){
    for(let i=0;i<5;i++){call('save');ctx.rotate(i*Math.PI*2/5);call('beginPath');ctx.ellipse(0,-size*.23,size*.14,size*.27,0,0,Math.PI*2);call('fill');call('restore');}ctx.fillStyle=detail;call('beginPath');ctx.arc(0,0,size*.12,0,Math.PI*2);call('fill');
  }else if(id==='key'){
    call('beginPath');ctx.arc(-size*.18,-size*.16,size*.16,0,Math.PI*2);call('stroke');call('beginPath');call('moveTo',-size*.06,-size*.04);call('lineTo',size*.38,size*.4);call('moveTo',size*.2,size*.22);call('lineTo',size*.36,size*.08);call('stroke');
  }else if(id==='sun'){
    call('beginPath');ctx.arc(0,0,size*.22,0,Math.PI*2);call('fill');for(let i=0;i<8;i++){call('save');ctx.rotate(i*Math.PI/4);call('beginPath');call('moveTo',0,-size*.31);call('lineTo',0,-size*.52);call('stroke');call('restore');}
  }
  call('restore');
}

patchBattleBanner();
const footer=document.querySelector('.menu-screen footer');if(footer)footer.textContent=`v${RELEASE} · living standards`;
