export const HOUSES=[
 ['Корона Аурелии','Король Арнульф','Дом Аурельских','#a94c3b','корона',100,90],
 ['Вальдхейм','Граф Эберхард','Дом фон Вальд','#45677b','честолюбив',62,115],
 ['Линдбург','Графиня Матильда','Дом Линд','#94703a','расчётлива',73,80],
 ['Розенфельд','Барон Готфрид','Дом Розен','#668050','верен слову',79,65],
 ['Дорнмарк','Маркграф Оттон','Дом Дорн','#865a78','горделив',48,130],
 ['Штайнхоф','Граф Бруно','Дом Штайн','#9c6242','воинственен',58,100],
 ['Эльцдорф','Аббатиса Агнесса','Дом Эльц','#487a75','благочестива',83,50],
 ['Зонненбург','Графиня Аделаида','Дом Зоннен','#867243','осторожна',68,85],
 ['Северная марка','Князь Рудольф','Дом Норд','#747478','независим',16,155],
 ['Южная марка','Князь Казимир','Дом Казимир','#7a6552','независим',12,150]
].map(([name,lord,title,color,trait,loyalty,troops])=>({name,lord,title,color,trait,loyalty,troops}));
export const REGIONS=[
 ['Вальдский лес',1,1,55],['Линдский берег',2,1,47],['Нордхольм',8,2,88],
 ['Розенталь',3,1,42],['Кронштадт',0,3,70],['Дорнская марка',4,2,81],
 ['Штайнская долина',5,1,65],['Эльцское аббатство',6,2,51],['Южный перевал',9,2,84],
 ['Зонненфельд',7,1,58],['Королевские луга',0,1,38],['Нижний Линд',2,1,41]
].map(([name,owner,castle,fort])=>({name,owner,castle,fort}));
const P=[
 [[20,57],[146,37],[165,182],[14,195]],[[146,37],[291,46],[284,177],[165,182]],[[291,46],[417,66],[425,196],[284,177]],
 [[14,195],[165,182],[151,325],[22,342]],[[165,182],[284,177],[305,334],[151,325]],[[284,177],[425,196],[411,340],[305,334]],
 [[22,342],[151,325],[168,477],[21,482]],[[151,325],[305,334],[279,468],[168,477]],[[305,334],[411,340],[419,483],[279,468]],
 [[21,482],[168,477],[149,633],[29,619]],[[168,477],[279,468],[300,618],[149,633]],[[279,468],[419,483],[406,608],[300,618]]
];
const C=P.map(poly=>({x:poly.reduce((a,p)=>a+p[0],0)/4,y:poly.reduce((a,p)=>a+p[1],0)/4}));
const hash=n=>{const x=Math.sin(n*127.19+93.71)*43758.5453;return x-Math.floor(x)};
const path=poly=>poly.map((p,i)=>(i?'L':'M')+p[0]+','+p[1]).join(' ')+'Z';
function trees(i,x,y){let out='';for(let k=0;k<9;k++){let f=hash(i*21+k),xx=x+(hash(i*51+k*17)-.5)*92,yy=y+(hash(i*81+k*13)-.5)*84,size=7+f*6;out+=`<g class="tree" transform="translate(${xx.toFixed(1)} ${yy.toFixed(1)})"><ellipse cx="2" cy="5" rx="10" ry="4" fill="#453f2d" opacity=".2"/><path d="M0 -${size}l${size*.65} ${size*.95}h-${size*.4}l${size*.36} ${size*.5}h-${size*1.22}l${size*.36} -${size*.5}h-${size*.4}Z" fill="${f>.45?'#526b50':'#486c55'}" stroke="#364735" stroke-width="1"/><path d="M0 -${size*.83}v${size*1.2}" stroke="#bdbe9c" stroke-width=".8" opacity=".35"/></g>`}return out}
function castle(i,x,y,h){const big=REGIONS[i].castle,scale=big===3?1.35:big===2?1.12:1;return `<g class="castle-group" transform="translate(${x} ${y-12}) scale(${scale})"><ellipse cy="15" cx="2" rx="29" ry="10" fill="#483d29" opacity=".24"/><path d="M-24 9L-24 -9L-14 -9L-14 4L-7 3L-7 -16L5 -16L5 5L14 5L14 -10L25 -10L25 10L17 15L-12 15Z" fill="#b5a184" stroke="#675c50" stroke-width="1.8"/><path d="M-27 -10L-17 -24L-10 -10ZM-11 -17L-1 -35L10 -17ZM11 -11L20 -27L29 -11Z" fill="#66584f" stroke="#44392c" stroke-width="1.8"/><path d="M-3 14v-11q5 -8 9 0v11" fill="#4c3e34"/><path d="M-20 -1v5M19 -2v5M-1 -10v5" stroke="#51493c" stroke-width="2.8"/><path d="M-2 -36V-59" stroke="#4d4232" stroke-width="1.4"/><path d="M-1 -58L24 -52L15 -40L-1 -44Z" fill="${h.color}" stroke="#513d2b" stroke-width="1.5"/><path d="M5 -54L9 -44" stroke="#e5d8aa" stroke-width="1.8"/></g>`}
export function mapSvg(s){
 const fills=['#ad976a','#abb18c','#9da486','#a5a67c','#d5bb86','#aaa578','#97a07c','#aab18e','#a9a486','#c2ac7d','#b2b185','#b5a87c'];
 let html=`<defs><pattern id="grain" width="27" height="32" patternUnits="userSpaceOnUse"><circle cx="5" cy="6" r=".8" fill="#533b25" opacity=".24"/><path d="M13 21l4 -2M6 26l5 1" stroke="#fff1bc" stroke-width=".7" opacity=".37"/></pattern><pattern id="fields" width="23" height="21" patternUnits="userSpaceOnUse" patternTransform="rotate(-23)"><path d="M0 0V21M8 0V21M15 0V21" stroke="#685938" stroke-width="1" opacity=".09"/></pattern></defs><path d="M17 50Q218 9 423 61L429 604Q210 651 24 627Z" fill="#bea276" stroke="#5b4b34" stroke-width="7"/>`;
 for(let i=0;i<P.length;i++){
  const o=s.owners[i],h=s.houses[o],r=REGIONS[i],reb=s.rebels.includes(i),{x,y}=C[i];
  const fill=s.mode==='control'?(reb?'#98716a':h.color):s.mode==='oaths'?(o<8?'#b4aa82':'#8c857c'):fills[i];
  html+=`<g class="territory ${s.selected===i?'selected':''}" data-land="${i}" tabindex="0" role="button" aria-label="${r.name}"><path class="land-edge" d="${path(P[i])}" fill="${fill}" stroke="#66533a" stroke-width="2.3" stroke-linejoin="round"/><path d="${path(P[i])}" fill="url(#grain)" opacity=".8"/><path d="${path(P[i])}" fill="url(#fields)"/><path d="M${x-54} ${y+30}q35 -21 70 7t62 -10" fill="none" stroke="#ded3a6" stroke-width="9" opacity=".2"/>`;
  html+=trees(i,x-8,y+19)+castle(i,x,y,h);
  for(let k=0;k<5;k++){const xx=x+(hash(i*17+k*3)-.5)*96,yy=y+(hash(i*11+k*9)-.5)*98;html+=`<path d="M${xx.toFixed(1)} ${yy.toFixed(1)}l6 -2" stroke="#686b48" stroke-width="1.1" opacity=".43"/>`}
  html+=`<path d="M${x-18} ${y+31}q14 12 42 1" fill="none" stroke="#a79675" stroke-width="2"/><text class="province-name" x="${x}" y="${y+45}">${r.name}</text>`;
  if(reb)html+=`<g transform="translate(${x+29} ${y-20})"><circle r="14" fill="#923b35" stroke="#f2d6ac" stroke-width="2"/><text text-anchor="middle" y="5" fill="#fff0d5" font-size="16">⚔</text></g>`;
  else if(s.mode!=='legal')html+=`<circle cx="${x+31}" cy="${y-28}" r="9" fill="${h.color}" stroke="#e9d6a1" stroke-width="2"/>`;
  html+='</g>';
 }
 html+=`<path class="river" d="M319 24C299 95 338 144 294 213S255 339 310 405S290 525 251 648"/><path class="river-highlight" d="M318 25C298 94 337 145 293 213S254 339 309 405S289 525 250 645"/><path d="M280 170L316 185M284 341L322 349M286 463L319 479" stroke="#67503b" stroke-width="8" stroke-linecap="round"/><path d="M280 170L316 185M284 341L322 349M286 463L319 479" stroke="#dfc390" stroke-width="5" stroke-linecap="round"/>`;
 html+=`<g opacity=".45" fill="#513e2c" font-family="Georgia" text-anchor="middle"><text x="59" y="36" font-size="12">N</text><path d="M59 44v21m-6 -16 6 -9 6 9" stroke="#513e2c" stroke-width="1.5" fill="none"/></g>`;
 if(s.mode==='oaths'){const crown=C[4];for(let i=0;i<12;i++){const owner=s.owners[i];if(owner===0||owner>=8)continue;const c=C[i],h=s.houses[owner];html+=`<path class="oath-string" d="M${crown.x} ${crown.y-28}Q${(crown.x+c.x)/2+28} ${(crown.y+c.y)/2-31} ${c.x} ${c.y-25}" style="opacity:${.25+h.loyalty/135}"/>`}}
 return html;
}
export function portraitSvg(h){return `<svg viewBox="0 0 96 102" aria-hidden="true"><rect width="96" height="102" fill="#b9aa85"/><path d="M-6 114q8-56 55-53t58 53" fill="${h.color}" stroke="#6f593f" stroke-width="3"/><path d="M35 59h28v21H35Z" fill="#bb906c"/><ellipse cx="49" cy="44" rx="24" ry="31" fill="#d2a782" stroke="#8a6247" stroke-width="2"/><path d="M23 38Q19 6 49 8q26 -3 28 30l-7 -4q-22 -22 -42 0Z" fill="#493f31"/><circle cx="40" cy="46" r="2" fill="#382a26"/><circle cx="57" cy="46" r="2" fill="#382a26"/><path d="M43 58q7 5 13 0" stroke="#8e584a" fill="none" stroke-width="2"/><path d="M29 80l18 16 19 -16" fill="none" stroke="#e4d3a9" stroke-width="4"/></svg>`}