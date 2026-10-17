// The comic is deliberately optional, offline, deterministic and does not use an AI key.
// It illustrates every contribution as a newspaper panel, not a generic screenshot.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function hash(s){let h=2166136261;for(const ch of String(s))h=Math.imul(h^ch.charCodeAt(0),16777619);return h>>>0}
function rng(seed){let x=seed||1;return ()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296}}
const palettes=[
 {sky:'#e4c7a4',ground:'#829184',accent:'#a65039',dark:'#33463e',light:'#f3e9cb'},
 {sky:'#b8c5ad',ground:'#a77856',accent:'#7c4536',dark:'#354646',light:'#f2dfc2'},
 {sky:'#d9b18c',ground:'#71867c',accent:'#8a4135',dark:'#294044',light:'#f7e3b8'},
 {sky:'#a7c5c1',ground:'#ae8863',accent:'#bf563a',dark:'#344540',light:'#e8dfb9'}
];
const round=(c,x,y,w,h,r=12)=>{r=Math.max(0,Math.min(r,w/2,h/2));c.beginPath();c.moveTo(x+r,y);c.lineTo(x+w-r,y);c.quadraticCurveTo(x+w,y,x+w,y+r);c.lineTo(x+w,y+h-r);c.quadraticCurveTo(x+w,y+h,x+w-r,y+h);c.lineTo(x+r,y+h);c.quadraticCurveTo(x,y+h,x,y+h-r);c.lineTo(x,y+r);c.quadraticCurveTo(x,y,x+r,y);c.closePath()};
function polygon(c,points){c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath()}
function wrap(c,text,maxWidth,maxLines){const lines=[];let line='';for(const word of String(text).replace(/\s+/g,' ').trim().split(' ')){const candidate=line?line+' '+word:word;if(c.measureText(candidate).width>maxWidth&&line){lines.push(line);line=word;}else line=candidate;if(lines.length===maxLines)break}
 if(lines.length<maxLines&&line)lines.push(line);
 const original=String(text).replace(/\s+/g,' ').trim();if(lines.join(' ').length<original.length&&lines.length){let last=lines.length-1;while(lines[last].length&&c.measureText(lines[last]+'…').width>maxWidth)lines[last]=lines[last].slice(0,-1);lines[last]+='…'}return lines}
function backdrop(c,x,y,w,h,r,p){
 c.save();c.beginPath();c.rect(x,y,w,h);c.clip();
 const sky=c.createLinearGradient(x,y,x,y+h);sky.addColorStop(0,p.sky);sky.addColorStop(1,p.light);c.fillStyle=sky;c.fillRect(x,y,w,h);
 const sunX=x+w*(.19+.52*r()),sunY=y+h*(.16+.21*r());
 c.fillStyle='#f7e4b1';c.beginPath();c.arc(sunX,sunY,28+16*r(),0,Math.PI*2);c.fill();
 const vanishing=y+h*.62;
 c.fillStyle=p.ground;polygon(c,[[x,vanishing],[x+w*.3,vanishing-17],[x+w*.65,vanishing+14],[x+w,vanishing-10],[x+w,y+h],[x,y+h]]);c.fill();
 const count=4+Math.floor(r()*3);
 for(let i=0;i<count;i++){
  const width=35+r()*80, bx=x+(i-.3)*w/count,ht=38+r()*80;
  c.fillStyle=i%2?'#546459':'#8b7764';c.fillRect(bx,vanishing-ht,width,ht);
  c.strokeStyle=p.dark;c.lineWidth=2;c.strokeRect(bx,vanishing-ht,width,ht);
  c.fillStyle='#e9c994';for(let j=0;j<3;j++)for(let k=0;k<2;k++){c.fillRect(bx+10+k*22,vanishing-ht+12+j*22,7,11)}
 }
 c.lineWidth=2;c.strokeStyle='#3d443844';for(let i=0;i<7;i++){const xx=x+r()*w; c.beginPath();c.moveTo(xx,y+h);c.lineTo(xx+13,vanishing+12);c.stroke()}
 c.restore();
}
function person(c,cx,cy,scale,p,r){
 c.save();c.translate(cx,cy);c.scale(scale,scale);
 const skew=r()>.5?-1:1;
 c.lineWidth=7;c.lineCap='round';c.strokeStyle=p.dark;
 c.beginPath();c.moveTo(-9,51);c.lineTo(-16+skew*9,94);c.moveTo(7,51);c.lineTo(19-skew*9,94);c.stroke();
 c.fillStyle=p.accent;polygon(c,[[-24,13],[21,10],[24,56],[-27,53]]);c.fill();c.strokeStyle=p.dark;c.lineWidth=3;c.stroke();
 c.beginPath();c.moveTo(-24,26);c.lineTo(-49,44+skew*17);c.moveTo(21,26);c.lineTo(44,47-skew*11);c.lineWidth=7;c.stroke();
 c.fillStyle='#f0d1a4';c.beginPath();c.ellipse(0,-8,23,27,0,0,Math.PI*2);c.fill();c.strokeStyle=p.dark;c.lineWidth=2;c.stroke();
 c.fillStyle=p.dark;c.beginPath();c.arc(-8,-10,3,0,Math.PI*2);c.arc(9,-9,3,0,Math.PI*2);c.fill();
 c.beginPath();c.arc(0,2,7,0,Math.PI);c.stroke();
 c.fillStyle=p.dark;polygon(c,[[-24,-13],[-15,-35],[19,-32],[26,-12],[12,-21],[-15,-17]]);c.fill();c.restore()
}
function vignette(c,x,y,w,h){
 const g=c.createRadialGradient(x+w/2,y+h/2,w*.12,x+w/2,y+h/2,w*.75);
 g.addColorStop(0,'#32292000');g.addColorStop(1,'#342b2440');c.fillStyle=g;c.fillRect(x,y,w,h)
}
function panel(c,entry,i,x,y,w,h,seed){
 const r=rng(seed),p=palettes[seed%palettes.length];
 c.fillStyle='#1f332e';c.fillRect(x-4,y-4,w+8,h+8);
 const imageH=260,innerY=y+35;
 backdrop(c,x,innerY,w,imageH,r,p);
 const variant=Math.floor(r()*4);
 if(variant===0){person(c,x+w*.37,innerY+imageH*.45,1.25,p,r);person(c,x+w*.78,innerY+imageH*.53,.88,{...p,accent:'#bd8d5c'},r)}
 else if(variant===1){person(c,x+w*.65,innerY+imageH*.49,1.3,p,r);c.fillStyle=p.accent;c.beginPath();c.ellipse(x+w*.20,innerY+195,52,40,-.28,0,Math.PI*2);c.fill();c.strokeStyle=p.dark;c.lineWidth=5;c.stroke()}
 else if(variant===2){person(c,x+w*.35,innerY+imageH*.53,1.06,p,r);c.save();c.translate(x+w*.7,innerY+imageH*.58);c.rotate(-.22);c.fillStyle=p.light;c.fillRect(-49,-64,97,112);c.strokeStyle=p.dark;c.lineWidth=5;c.strokeRect(-49,-64,97,112);for(let n=0;n<4;n++){c.beginPath();c.moveTo(-30,-38+n*19);c.lineTo(27,-38+n*19);c.stroke()}c.restore()}
 else {person(c,x+w*.52,innerY+imageH*.43,1.42,p,r);c.strokeStyle=p.accent;c.lineWidth=6;for(let a=0;a<7;a++){const angle=(a/7)*Math.PI*2;const sx=x+w*.52+Math.cos(angle)*98,sy=innerY+100+Math.sin(angle)*79;c.beginPath();c.moveTo(sx,sy);c.lineTo(sx+Math.cos(angle)*24,sy+Math.sin(angle)*19);c.stroke()}}
 vignette(c,x,innerY,w,imageH);
 c.fillStyle=p.dark;c.fillRect(x,y,w,35);
 c.textBaseline='middle';c.fillStyle='#f8ebd1';c.font='700 16px system-ui';c.fillText('ЕПІЗОД '+String(i+1).padStart(2,'0'),x+14,y+18);
 c.textAlign='right';c.font='700 12px system-ui';c.fillText((entry.author||'АВТОР').toUpperCase().slice(0,22),x+w-14,y+18);c.textAlign='left';
 c.fillStyle='#f7edd7';c.fillRect(x,innerY+imageH,w,h-imageH-35);
 c.fillStyle=p.dark;c.font='bold 17px Georgia';const lines=wrap(c,entry.answer||'',w-32,5);
 lines.forEach((line,j)=>c.fillText(line,x+16,innerY+imageH+30+j*27));
 c.fillStyle=p.accent;c.fillRect(x+12,y+h-9,w-24,3);
}
export function makeComic(story){
 if(!story||!Array.isArray(story.fragments)||!story.fragments.length)throw Error('Історія порожня.');
 const entries=story.fragments.slice(0,20);
 const w=900,gap=16,panelW=425,panelH=464,rows=Math.ceil(entries.length/2),h=190+rows*(panelH+gap)+44;
 const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
 const c=canvas.getContext('2d');if(!c)throw Error('Canvas 2D недоступний.');
 c.fillStyle='#f3e4c6';c.fillRect(0,0,w,h);
 const random=rng(hash(story.text));
 for(let i=0;i<1700;i++){const x=random()*w,y=random()*h;c.fillStyle=i%2?'#574b3520':'#fffdf21c';c.fillRect(x,y,.5+random()*1.5,.5+random()*1.5)}
 c.fillStyle='#243831';c.fillRect(0,0,w,12);
 c.fillStyle='#a7533d';c.font='800 14px system-ui';c.fillText('КОЛЕКЦІЯ НЕЗАКІНЧЕНИХ ІСТОРІЙ',23,45);
 c.fillStyle='#263831';c.font='bold 65px Georgia';c.fillText('ЧЕПУХА',23,115);
 c.font='18px Georgia';c.fillText('Рукопис: '+String(story.starter||'Без підпису').slice(0,48),28,151);
 c.lineWidth=2;c.strokeStyle='#263831';c.beginPath();c.moveTo(22,167);c.lineTo(878,167);c.stroke();
 entries.forEach((entry,i)=>panel(c,entry,i,23+(i%2)*(panelW+gap),187+Math.floor(i/2)*(panelH+gap),panelW,panelH,hash((entry.answer||'')+i)));
 c.fillStyle='#243831';c.font='700 13px system-ui';c.fillText('Ілюстровано локально · без мережі · '+entries.length+' епізодів',24,h-22);
 c.textAlign='right';c.fillText('POCKET WORKS',w-23,h-22);
 return canvas;
}