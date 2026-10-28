// Compact procedural engraved map; all polygons share the same coordinate grid.
import {PROVINCES,FACTIONS,neighbors,armiesAt,income,upkeep,defensePower,supplyNetwork,siegeAt,siegeByArmy,isStronghold,provinceRevenue,IMPROVEMENTS} from './campaign.mjs';
import {agreement,league} from './diplomacy.mjs';
const safe=text=>String(text).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function point(c,r,portrait){
  const x=portrait?45+r*203:c*232+36;
  const y=portrait?40+c*201:r*193+38;
  const jig=(c===0||c===4||r===0||r===3)?0:Math.sin(c*14+r*17)*14;
  return {x:x+(portrait?jig:0),y:y+(portrait?0:jig)};
}
function polygon(id,portrait){
  const x=id%4,y=Math.floor(id/4);
  const p=[point(x,y,portrait),point(x+1,y,portrait),point(x+1,y+1,portrait),point(x,y+1,portrait)];
  // Fixed shared segment deviations, symmetric for adjoining provinces.
  let str='M'+p[0].x.toFixed(0)+','+p[0].y.toFixed(0);
  for(let i=0;i<4;i++){
    const a=p[i],b=p[(i+1)%4],key=[x+(i===1),y+(i===2),i%2].join(':');
    const offset=Math.sin((i%2?x:y)*19+(i%2?y:x)*11+17)*11;
    const mid={x:(a.x+b.x)/2+(i%2?offset:0),y:(a.y+b.y)/2+(i%2?0:offset)};
    // Both ends of a border use the same offset because it comes from boundary coordinates.
    const m1=pointOnBoundary(x,y,i,portrait,a,b);
    str+=' L'+m1.x.toFixed(0)+','+m1.y.toFixed(0)+' L'+b.x.toFixed(0)+','+b.y.toFixed(0);
  }
  return str+' Z';
}
function pointOnBoundary(x,y,i,portrait,a,b){
 const isVertical=i%2===1;
 const borderIndex=isVertical?(i===1?x+1:x):(i===2?y+1:y);
 const orthogonal=isVertical?y:x;
 const phase=Math.sin(borderIndex*91+orthogonal*41)*12;
 const shift=isVertical?{x:phase,y:0}:{x:0,y:phase};
 return {x:(a.x+b.x)/2+shift.x,y:(a.y+b.y)/2+shift.y};
}
function center(id,portrait){
  const x=id%4,y=Math.floor(id/4);
  const a=point(x,y,portrait),b=point(x+1,y+1,portrait);
  return {x:(a.x+b.x)/2,y:(a.y+b.y)/2};
}
const relief=(id,portrait)=>{
 const c=center(id,portrait);
 const p=PROVINCES[id];
 if(p.type==='forest')return '<g transform="translate('+c.x+' '+(c.y-61)+')" opacity=".32"><path d="M-38 15-21-24-4 15ZM0 18 21-35 43 18Z" fill="#1d4235" stroke="#d7ddbd" stroke-width="2"/></g>';
 if(p.type==='highland')return '<path d="M'+(c.x-59)+' '+(c.y-40)+' l29 -45 24 38 24 -27 34 44" fill="none" stroke="#ebdfc3" stroke-width="7" opacity=".25"/>';
 if(p.type==='river')return '<path d="M'+(c.x-60)+' '+(c.y-75)+'q40 30 8 65t80 80" fill="none" stroke="#a6ded8" stroke-width="8" opacity=".37"/>';
 if(p.type==='plain')return '<path d="M'+(c.x-47)+' '+(c.y-55)+'q30 16 60 0 M'+(c.x-50)+' '+(c.y-44)+'q30 16 60 0" fill="none" stroke="#d0cfad" stroke-width="4" opacity=".22"/>';
 return '<path d="M'+(c.x-23)+' '+(c.y-72)+'v-21h45v21M'+(c.x-35)+' '+(c.y-72)+'h70" stroke="#e1d4b8" stroke-width="5" opacity=".28" fill="none"/>';
};
export function campaignMapSvg(s,selection,selectedArmy,marchMode,portrait){
 const width=portrait?700:1000,height=portrait?880:650;
 const getColor=id=>FACTIONS[s.provinces[id].owner].dark;
 const routes=[];
 for(const p of PROVINCES)for(const adjacent of neighbors(p.id))if(adjacent>p.id){
  const a=center(p.id,portrait),b=center(adjacent,portrait);
  routes.push('<path d="M'+a.x+','+a.y+'L'+b.x+','+b.y+'" stroke="#ebdfc0" stroke-dasharray="4 7" stroke-width="5" opacity=".35"/>');
 }
 const army=s.armies.find(a=>a.id===selectedArmy);
 const tiles=PROVINCES.map((p)=>{
  const at=s.provinces[p.id],c=center(p.id,portrait),units=armiesAt(s,p.id);
  const active=p.id===selection,reachable=!!(marchMode&&army&&neighbors(army.province).includes(p.id));
  const main=units.find(a=>a.side===0)||units[0];
  const shield=main?'<g transform="translate('+(c.x+64)+' '+(c.y+47)+')"><path d="M-31-28h62v46l-31 18-31-18Z" fill="'+FACTIONS[main.side].dark+'" stroke="#e4d5b2" stroke-width="3"/><text x="0" y="9" font-size="25" fill="#f1e8d5" text-anchor="middle" font-weight="700">'+main.strength+'</text></g>':'';
  const siege=siegeAt(s,p.id),supplied=at.owner===3||supplyNetwork(s,at.owner).has(p.id);
  const encircled=siege?'<g class="campaign-siege" aria-hidden="true"><circle cx="'+c.x+'" cy="'+(c.y-8)+'" r="74" fill="none" stroke="#efbe89" stroke-width="5" stroke-dasharray="12 8"/><text x="'+c.x+'" y="'+(c.y-49)+'" text-anchor="middle" class="campaign-siege-caption">ОСАДА '+siege.progress+'</text></g>':'';
  const isolation=!supplied?'<text x="'+c.x+'" y="'+(c.y+62)+'" class="campaign-warning" text-anchor="middle">НЕТ ОБОЗА</text>':'';
  const raided=at.raidedUntil>s.season?'<text x="'+c.x+'" y="'+(c.y+72)+'" class="campaign-warning" text-anchor="middle">РАЗОРЕНО</text>':'';
  const pact=at.owner===1||at.owner===2?agreement(s,at.owner):null;
  const accord=pact?'<g aria-hidden="true"><rect x="'+(c.x-57)+'" y="'+(c.y-77)+'" width="114" height="21" rx="1" fill="'+(pact.kind==='vassal'?'#826d50':'#375c4d')+'" stroke="#e2d2a9" stroke-width="2"/>'+
    '<text x="'+c.x+'" y="'+(c.y-62)+'" text-anchor="middle" class="province-treaty">'+
    (pact.kind==='vassal'?'ВАССАЛ':pact.kind==='alliance'?'СОЮЗ':'ПЕРЕМИРИЕ')+'</text></g>':'';
  const crest=at.development?'<g aria-hidden="true"><rect x="'+(c.x-49)+'" y="'+(c.y+35)+'" width="98" height="20" fill="#c1a987" stroke="#453f32" stroke-width="2"/>'+
    '<text x="'+c.x+'" y="'+(c.y+49)+'" font-family="system-ui" font-weight="800" font-size="10" text-anchor="middle" fill="#293e32">'+
    (at.development==='market'?'ТОРГ':at.development==='barracks'?'РАТЬ':'ДОЗОР')+'</text></g>':'';
  const capital=p.capital!==undefined?'<path d="M'+(c.x-17)+','+(c.y-70)+'v-24l18 8 17-9v25Z" fill="#e9d8af" stroke="#4b5343" stroke-width="3"/>':'';
  return '<g class="map-region'+(active?' selected':'')+(reachable?' reachable':'')+'" data-province="'+p.id+'" role="button" tabindex="0" aria-label="'+safe(p.name)+', '+safe(FACTIONS[at.owner].name)+', гарнизон '+at.garrison+'">'+
   '<path d="'+polygon(p.id,portrait)+'" fill="'+getColor(p.id)+'" stroke="#a4a992" stroke-width="3"/>'+
   relief(p.id,portrait)+capital+encircled+isolation+raided+accord+crest+
   '<text x="'+c.x+'" y="'+(c.y-1)+'" class="province-label" text-anchor="middle">'+safe(p.name)+'</text>'+
   '<text x="'+c.x+'" y="'+(c.y+25)+'" class="province-hint" text-anchor="middle">ГАРНИЗОН '+at.garrison+'</text>'+shield+
   (active?'<circle cx="'+c.x+'" cy="'+(c.y-38)+'" r="6" fill="#f9e6c5"/>':'')+'</g>';
 }).join('');
 const cities=PROVINCES.map(p=>center(p.id,portrait));
 const river='<path d="M'+(portrait?'120,0 Q150,170 228,260 T350,450 T640,880':'0,285 Q270,240 450,345 T1000,375')+'" fill="none" stroke="#a8d4c5" stroke-width="13" opacity=".17"/>';
 return '<svg viewBox="0 0 '+width+' '+height+'" preserveAspectRatio="xMidYMid meet" class="campaign-atlas-svg" aria-label="Политическая карта двенадцати областей">'+
 '<defs><radialGradient id="atlaslight"><stop stop-color="#6f7966"/><stop offset="1" stop-color="#303f39"/></radialGradient><pattern id="atlaslines" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M0 24L24 0" stroke="#d3d2af" stroke-width="1" opacity=".07"/></pattern></defs>'+
 '<rect width="'+width+'" height="'+height+'" fill="url(#atlaslight)"/><rect width="'+width+'" height="'+height+'" fill="url(#atlaslines)"/>'+
 river+routes.join('')+tiles+'<path d="M20 20H'+(width-20)+'V'+(height-20)+'H20Z" fill="none" stroke="#d9c6a3" stroke-width="3" opacity=".45"/></svg>';
}
export function campaignInfo(s,selected,selectedArmy,marchMode,warMode='march'){
 const landNames={highland:'возвышенность',forest:'лес',river:'переправа',plain:'равнина',fort:'крепость'};
 const province=s.provinces[selected],world=PROVINCES[selected],owner=FACTIONS[province.owner],a=s.armies.find(x=>x.id===selectedArmy);
 const stationed=armiesAt(s,selected),own=province.owner===0,supply=province.owner===3||supplyNetwork(s,province.owner).has(selected);
 const siege=siegeAt(s,selected),ownSiege=a?siegeByArmy(s,a.id):null;
 const commands=stationed.filter(u=>u.side===0).map(u=>'<button type="button" class="field-army'+(u.id===selectedArmy?' chosen':'')+'" data-army="'+u.id+'" aria-pressed="'+(u.id===selectedArmy)+'"><span>⚑ Дружина '+u.id.split('-')[1]+'</span><b>'+u.strength+' воинов'+(u.used?' · ход сделан':'')+'</b></button>').join('');
 const status='<div class="campaign-statuses"><span class="'+(supply?'supply-connected':'supply-cut')+'">'+(province.owner===3?'Вольная дорога':supply?'Обозы из столицы':'Снабжение отрезано')+'</span>'+
 (siege?'<span class="campaign-warning-text">Блокада: '+siege.progress+' сез.</span>':'')+
 (province.raidedUntil>s.season?'<span class="campaign-warning-text">Разорено до сезона '+province.raidedUntil+'</span>':'')+'</div>';
 let primary='';
 if(marchMode){
  const verbs={march:'Марш',siege:'Начало блокады',raid:'Набег'};
  primary='<p class="map-instruction">'+verbs[warMode]+': выбери соседнее владение на карте, подсвеченное светлой границей.</p>'+
   '<button class="map-quiet" data-cmd="cancel-march">Отменить выбор цели</button>';
 }else if(own){
  if(a&&a.side===0&&a.province===selected){
    if(ownSiege){
      primary='<p class="map-instruction">Дружина блокирует '+safe(PROVINCES[ownSiege.to].name)+
        '. Крепость теряет гарнизон каждый сезон. Затем она капитулирует.</p>'+
       '<button class="map-main" data-cmd="storm"'+((a.used||s.actions<1)?' disabled':'')+'>Штурмовать сейчас</button>'+
       '<button data-cmd="lift-siege">Снять осаду</button>';
    }else{
      primary='<button class="map-main" data-cmd="march"'+((a.used||s.actions<1)?' disabled':'')+'>Марш / штурм</button>'+
       '<button data-cmd="siege"'+((a.used||s.actions<1||a.strength<4||!supply)?' disabled':'')+'>Начать осаду</button>'+
       '<button data-cmd="raid"'+((a.used||s.actions<1||a.strength<4||!supply)?' disabled':'')+'>Совершить набег</button>'+
       '<button data-cmd="recruit"'+((a.used||s.coins<6||s.actions<1||a.strength>=18||!supply||province.raidedUntil>s.season)?' disabled':'')+'>Пополнить дружину · 6</button>';
    }
  } else if(stationed.length===0){
    primary='<button class="map-main" data-cmd="raise"'+((s.coins<9||s.actions<1||!supply||province.raidedUntil>s.season)?' disabled':'')+'>Собрать новую дружину · 9</button>';
  }
  primary+='<button data-cmd="fortify"'+((s.coins<5||s.actions<1||province.garrison>=10||!supply)?' disabled':'')+'>Укрепить гарнизон · 5</button>';
  if(!province.development){
   primary+='<div class="map-build-heading">РАЗВИТИЕ ЗЕМЛИ · ОДНА ПОСТРОЙКА</div>'+
    Object.entries(IMPROVEMENTS).map(([key,info])=>
      '<button data-build="'+key+'"'+((s.coins<info.cost||s.actions<1||!supply||province.raidedUntil>s.season)?' disabled':'')+'>'+
      safe(info.name)+' · '+info.cost+'</button>').join('');
  }else{
   primary+='<div class="map-build-status"><strong>'+safe(IMPROVEMENTS[province.development].name)+'</strong><span>'+
    (province.development==='market'?'Торговля: +2 серебра за сезон':province.development==='barracks'?'Восстановление: +2 воина или +1 гарнизон':'Дозор: +2 к обороне')+
    '</span></div>';
  }
 }else{
  primary='<p class="map-instruction">Владение '+safe(owner.name)+
   '. Для войны выбери свою дружину в соседней земле. Крепость можно окружить блокадой.</p>';
 }
 return '<div class="map-local-name"><small>'+safe(owner.name)+' · '+safe(landNames[world.type]||world.type)+'</small>'+
 '<h2>'+safe(world.name)+'</h2><span>Гарнизон '+province.garrison+' · оборона '+defensePower(s,selected)+' · доход '+provinceRevenue(s,selected)+' серебра</span></div>'+
 status+'<div class="map-field-armies">'+(commands||'<p class="map-empty">Полевых армий Севера здесь нет.</p>')+'</div>'+
 '<div class="map-actions">'+primary+'</div>';
}
export function campaignHeader(s){
 const controlled=s.provinces.filter(p=>p.owner===0).length;
 return '<div class="campaign-stat"><small>СЕЗОН</small><strong>'+s.season+'</strong></div>'+
 '<div class="campaign-stat"><small>ЗЕМЛИ</small><strong>'+controlled+' / '+PROVINCES.length+'</strong></div>'+
 '<div class="campaign-stat"><small>КАЗНА</small><strong>'+s.coins+'</strong><em>+'+income(s)+' / −'+upkeep(s)+'</em></div>'+
 '<div class="campaign-stat"><small>ПРИКАЗЫ</small><strong>'+s.actions+' / 2</strong></div>';
}
