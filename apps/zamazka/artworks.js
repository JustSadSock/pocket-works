export const W=600,H=450;
const names=['Средневековая хроника','Море тушью','Ботанический атлас','Композиция','Вышитый сад','Крепость','Натюрморт','Витраж','Ночной город','Летний пейзаж'];
const styles=['миниатюра','гравюра','ботаника','авангард','орнамент','офорт','живопись','мозаика','ноктюрн','импрессионизм'];
const P=[
 ['#eddbad','#a04b3a','#385249','#e4aa54','#342e2c'],
 ['#d9d2b8','#354c59','#8eada8','#f6e9c8','#1d3239'],
 ['#eee3c7','#586b3f','#a75b45','#d4aa67','#394d42'],
 ['#f3e7d6','#ba342f','#193f62','#e0b548','#27282a'],
 ['#e9d7b9','#884c61','#344b61','#b69b63','#342e36'],
 ['#e1d8c2','#303c37','#8b9382','#ab6749','#1f2827'],
 ['#d2b795','#704333','#ba8049','#ddc78a','#3a312b'],
 ['#293a48','#d6ae58','#9b3543','#456c70','#eee0b9'],
 ['#202b46','#dda567','#7b8c9d','#b95452','#14233c'],
 ['#c9d1c0','#7b886e','#e1ba7d','#a4818d','#4d6258']];
export const ARTS=Array.from({length:50},(_,id)=>({id,title:names[id%10]+' · '+(1+Math.floor(id/10)),style:styles[id%10]}));
function rand(n){return ()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296}}
const R=(x,y,w,h,f)=>'<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" fill="'+f+'"/>';
const C=(x,y,r,f)=>'<circle cx="'+x+'" cy="'+y+'" r="'+r+'" fill="'+f+'"/>';
const D=(d,f,extra='')=>'<path d="'+d+'" fill="'+f+'" '+extra+'/>';
const L=(x,y,X,Y,f,w=2)=>D('M'+x+' '+y+'L'+X+' '+Y,'none','stroke="'+f+'" stroke-width="'+w+'"');
export function zoneFor(id,variation=0){const t=rand((id+11)*16331+(variation+1)*113);return {x:Math.floor(60+t()*365),y:Math.floor(45+t()*220),w:118,h:111}}
export function svgFor(id){
 id=((Number(id)||0)%50+50)%50;const f=id%10,v=Math.floor(id/10),p=P[f],rnd=rand(87213+id*131);
 const n=(a,b)=>Math.round(a+(b-a)*rnd());let s=R(0,0,600,450,p[0]);
 if(f===0){s+=C(457-v*10,88,43,p[3])+D('M0 345 Q165 229 308 333 T610 300L610 450H0Z',p[2]);
 for(let i=0;i<4;i++){let x=62+i*125,h=115+(i%3)*39;s+=R(x,340-h,93,h,p[4])+D('M'+(x-9)+' '+(340-h)+'l55 -65l57 65Z',p[1])+R(x+31,340-h+27,28,43,p[0]);}
 for(let i=0;i<8;i++){let x=38+i*74;s+=C(x,385,10,p[3])+D('M'+(x-13)+' 410l13 -33l13 33Z',p[1]);}s+=R(14,14,572,7,p[1])+R(14,429,572,7,p[1]);}
 else if(f===1){s+=C(465-v*17,102,50,p[3]);for(let i=0;i<6;i++){let y=145+i*54;s+=D('M-20 '+y+'Q70 '+(y-65)+' 153 '+y+'T320 '+y+'T630 '+y+'V'+(y+65)+'H-20Z',i%2?p[1]:p[2]);}s+=D('M85 289Q226 180 397 288Q458 333 526 265L535 312Q387 365 244 317L85 340Z',p[4]);}
 else if(f===2){for(let k=0;k<4;k++){let x=85+k*142;s+=D('M'+x+' 430Q'+(x-65)+' 218 '+(x+v*5)+' 54','none','stroke="'+p[1]+'" stroke-width="6"');for(let j=0;j<5;j++){let y=85+j*60;s+=D('M'+x+' '+y+'Q'+(x-95)+' '+(y-73)+' '+(x-90)+' '+y+'Q'+(x-34)+' '+(y+36)+' '+x+' '+y+'Z',p[1]);s+=C(x+11,y,n(9,21),j%2?p[2]:p[3]);}}}
 else if(f===3){s+=R(90+v*9,35,135,349,p[2])+R(197,162,348,123,p[4])+D('M300 -40L640 247L502 367L230 81Z',p[1])+C(358,236,99,p[3])+D('M47 425L245 208L380 425Z',p[4])+L(0,433,590,85,p[2],13);}
 else if(f===4){for(let y=0;y<5;y++)for(let x=0;x<7;x++){let X=x*91+34,Y=y*93+28;s+=C(X,Y,n(28,43),p[(x+y+v)%5])+D('M'+X+' '+(Y-29)+'Q'+(X+41)+' '+Y+' '+X+' '+(Y+29)+'Q'+(X-41)+' '+Y+' '+X+' '+(Y-29),p[(x+y+2)%5])+C(X,Y,8,p[3]);}}
 else if(f===5){s+=R(0,322,600,128,p[2])+C(442-v*11,87,52,p[3]);for(let i=0;i<5;i++){let x=25+i*112,h=n(105,226);s+=R(x,330-h,87,h,p[1])+D('M'+(x-8)+' '+(330-h)+'l52 -68l51 68Z',p[4]);for(let j=0;j<2;j++)s+=R(x+15+j*39,330-h+24,13,31,p[0]);}}
 else if(f===6){s+=D('M0 300Q300 270 600 308V450H0Z',p[4])+D('M180 310L183 244Q285 209 357 255L357 321Z',p[1]);for(let i=0;i<5;i++){let x=100+i*92,y=n(210,283);s+=C(x,y,n(25,41),i%2?p[2]:p[3])+D('M'+(x-24)+' '+y+'Q'+x+' '+(y-52)+' '+(x+24)+' '+y,'none','stroke="'+p[0]+'" stroke-width="7"');}s+=R(365,114,21,179,p[1])+D('M332 130H414L374 61Z',p[3]);}
 else if(f===7){s=R(0,0,600,450,p[4]);for(let i=0;i<20;i++){let x=i%5*120,y=Math.floor(i/5)*113;s+=D('M'+x+' '+y+'h120l-'+n(25,96)+' 113Z',p[(i+v)%5])+C(x+60,y+56,n(19,51),p[(i+v+2)%5]);}for(let i=1;i<5;i++)s+=R(i*120-4,0,8,450,p[4]);for(let i=1;i<4;i++)s+=R(0,i*113-4,600,8,p[4]);}
 else if(f===8){s+=R(0,267,600,183,p[4])+C(464-v*12,101,50,p[1]);for(let i=0;i<10;i++){let x=i*63,h=n(72,208);s+=R(x,343-h,53,h,i%2?p[2]:p[3])+R(x+18,352-h,9,20,p[1]);}s+=D('M0 354Q230 329 600 362V450H0Z',p[1]);for(let i=0;i<60;i++)s+=C(n(0,600),n(5,230),n(1,3),p[3]);}
 else {s+=D('M0 262Q157 176 314 271T620 192V450H0Z',p[1])+D('M0 350Q192 261 366 346T610 264V450H0Z',p[2])+C(434-v*12,97,56,p[3]);s+=D('M80 385Q100 263 152 129','none','stroke="'+p[4]+'" stroke-width="12"');for(let i=0;i<9;i++)s+=C(119+n(-27,27),154-i*8,n(10,28),p[1]);}
 for(let i=0;i<120;i++){let x=n(0,600),y=n(0,450);s+=L(x,y,x+n(-12,13),y+n(-6,8),p[n(1,4)],n(1,3));}
 return '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="450" viewBox="0 0 600 450">'+s+'</svg>';
}
const cache=new Map(),loaded=new Map();
export function artworkURL(id){if(!cache.has(id))cache.set(id,'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svgFor(id)));return cache.get(id)}
export function loadArtwork(id){if(!loaded.has(id))loaded.set(id,new Promise((ok,bad)=>{const im=new Image();im.onload=()=>ok(im);im.onerror=()=>bad(Error('Изображение недоступно'));im.src=artworkURL(id)}));return loaded.get(id)}
