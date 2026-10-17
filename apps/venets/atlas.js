import {makeAtlasGeometry,countyAtlasModel,heraldryFor,familyRelations} from './atlas-core.js';
const NS='http://www.w3.org/2000/svg';
const S=(tag,attrs={},children=[])=>{
  const n=document.createElementNS(NS,tag);
  for(const [key,value] of Object.entries(attrs))if(value!==null&&value!==undefined)n.setAttribute(key,String(value));
  for(const child of children)n.append(child);
  return n;
};
const T=(tag,text,attrs={})=>{const n=S(tag,attrs);n.textContent=text;return n};
const DOM=(tag,cls='',text='')=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text)e.textContent=text;return e};
const shortName=name=>String(name).replace(/^Графство /,'').replace(/^Герцогство /,'');
const charge=(kind,ink)=>{
  const g=S('g',{fill:'none',stroke:ink,'stroke-width':2.5,'stroke-linejoin':'round','stroke-linecap':'round'});
  switch(kind){
    case 'oak':g.append(S('path',{d:'M0 13V-3 M-6 -2Q-15 -7-8 -13 Q-7 -22 0 -18 Q8 -22 9 -13 Q16 -6 6 -2Z'}),S('path',{d:'M-5 3 L0 -1 L5 3'}));break;
    case 'chevron':g.append(S('path',{d:'M-12 1 L0 -12 L12 1 M-12 8 L0 -5 L12 8'}));break;
    case 'river':g.append(S('path',{d:'M-9 -16 C6 -12 -8 -4 6 0 S-2 10 10 14 M-12 -11 C1 -7 -13 1 1 5'}));break;
    case 'sun':g.append(S('circle',{cx:0,cy:0,r:7}),...Array.from({length:8},(_,i)=>{const a=i*Math.PI/4;return S('path',{d:'M'+Math.round(Math.sin(a)*10)+' '+Math.round(Math.cos(a)*10)+' L'+Math.round(Math.sin(a)*15)+' '+Math.round(Math.cos(a)*15)})}));break;
    case 'tower':g.append(S('path',{d:'M-10 14V-9H-7V-15H-3V-9H3V-15H7V-9H10V14Z M-3 14V5 Q0 0 3 5V14 M-5 -4H5'}));break;
    case 'wheat':g.append(S('path',{d:'M0 16V-16 M0 5 Q-11 1-10 -7Q-3 -6 0 0 M0 -2Q11 -8 10 -13 Q2 -12 0 -8 M0 11L-11 6 M0 6L10 1'}));break;
    case 'moon':g.append(S('path',{d:'M8 -16 Q-10 -11-9 2Q-7 14 8 14Q-4 6-3 -5Q-3 -12 8 -16Z'}));break;
    case 'sword':g.append(S('path',{d:'M0 -19L3 4L0 9L-3 4Z M-11 6H11 M0 9V18 M-4 18H4'}));break;
    case 'star':g.append(S('path',{d:'M0 -17L5 -5L16 -4L7 4L10 16L0 9L-10 16L-7 4L-16 -4L-5 -5Z'}));break;
    case 'mountain':g.append(S('path',{d:'M-16 13L-3 -13L5 -2L10 -10L17 13Z M-9 0L-3 -8L2 1'}));break;
    case 'bridge':g.append(S('path',{d:'M-17 13H17M-15 2H15M-13 2V13M13 2V13M-7 13V8Q0-4 7 8V13'}));break;
    case 'crown':g.append(S('path',{d:'M-14 -7L-10 11H10L14 -7L6 1L0 -13L-6 1Z M-11 16H11'}));break;
  }
  return g;
};
export function shieldSvg(dynastyId,{small=false}={}){
  const v=heraldryFor(dynastyId),width=small?30:40,height=small?35:47;
  const svg=S('svg',{viewBox:'-20 -22 40 48',width,height,'aria-hidden':'true',class:'heraldic-shield'});
  svg.append(S('path',{d:'M-17 -19L17 -19L17 6 Q15 17 0 22 Q-15 17 -17 6Z',fill:v.main,stroke:'#f2dfb7','stroke-width':2}),
    S('path',{d:'M-15 -16L15 -16L15 5 Q12 15 0 19 Q-12 15 -15 5Z',fill:'none',stroke:v.alt,'stroke-width':1.3}),
    S('g',{transform:'translate(0 -1)'},[charge(v.charge,v.alt)]));
  return svg;
}
function pathText(x,y,value,size=11){
  return T('text',value,{x,y,fill:'#3d433b','font-family':'Georgia,serif','font-size':size,'font-weight':600,
    'text-anchor':'middle','paint-order':'stroke',stroke:'#e9e2c8','stroke-width':3,'stroke-linejoin':'round'});
}
function atlasDefs(svg,model){
 const defs=S('defs');
 const paper=S('linearGradient',{id:'atlas-paper',x1:'0',y1:'0',x2:'1',y2:'1'},[
   S('stop',{offset:'0%', 'stop-color':'#d8d2ad'}),
   S('stop',{offset:'55%','stop-color':'#e9ddbd'}),
   S('stop',{offset:'100%','stop-color':'#b9bb99'})]);
 const light=S('radialGradient',{id:'atlas-light',cx:'44%',cy:'38%',r:'71%'},[
   S('stop',{offset:'0%','stop-color':'#ffffff','stop-opacity':.38}),
   S('stop',{offset:'100%','stop-color':'#535e4a','stop-opacity':.25})]);
 const noise=S('filter',{id:'atlas-grain',x:'0%',y:'0%',width:'100%',height:'100%'},[
   S('feTurbulence',{type:'fractalNoise',baseFrequency:'.32',numOctaves:3,seed:8,result:'n'}),
   S('feColorMatrix',{in:'n',type:'saturate',values:0,result:'mono'}),
   S('feComponentTransfer',{},[S('feFuncA',{type:'linear',slope:'.08'})])]);
 defs.append(paper,light,noise,S('clipPath',{id:'atlas-land'},[S('path',{d:model.perimeter})]));
 for(const item of model.polygons)
   defs.append(S('clipPath',{id:'county-clip-'+item.id},[S('path',{d:item.path})]));
 svg.append(defs);
}
function engraving(model,seed){
 const scene=S('g',{'clip-path':'url(#atlas-land)',class:'atlas-engraving','pointer-events':'none'});
 // Atlas shading changes only with the immutable province terrain.
 for(const item of model.polygons){
   const p=item.province,c=item.center;
   const ink=p.terrain==='hills'?'#4b5848':'#657059';
   const inkOpacity=p.terrain==='hills'?.23:.13;
   const clipped=S('g',{'clip-path':'url(#county-clip-'+item.id+')',stroke:ink,
      'stroke-opacity':inkOpacity,fill:'none','stroke-width':1.45,'stroke-linecap':'round'});
   const h=p.terrain==='hills';
   for(let i=0;i<(h?7:5);i++){
     const dx=(i-3)*17,dy=(i%2)*18-10;
     if(h){
       clipped.append(S('path',{d:'M'+(c.x-59+dx)+' '+(c.y+dy+15)+
       ' q17 -21 34 0 q18 -35 41 0 q18 -20 39 0'}));
     }else{
       clipped.append(S('path',{d:'M'+(c.x-45+dx)+' '+(c.y+dy)+
       ' q37 10 65 -3 t46 -2'}));
     }
   }
   scene.append(clipped);
 }
 // Roads are ink-thin and cross the real cardinal neighbor graph.
 for(const item of model.polygons)
   for(const neighborId of item.province.neighbors){
     if(item.id>neighborId)continue;
     const other=model.polygons.find(p=>p.id===neighborId);
     if(!other)continue;
     const a=item.center,b=other.center,mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
     scene.append(S('path',{d:'M'+a.x+','+a.y+' Q'+(mid.x+9)+','+(mid.y-7)+' '+b.x+','+b.y,
       stroke:'#806e50','stroke-width':2.2,'stroke-opacity':.28,'stroke-dasharray':'3 5',fill:'none'}));
   }
 // Rivers are static illustration, not fake political events, and do not affect economy.
 scene.append(S('path',{d:'M315 12 C340 72 285 122 346 170 S460 225 426 305 S485 392 535 425 S606 504 570 582',
   stroke:'#6c8b90','stroke-opacity':.54,'stroke-width':13,fill:'none'}),
   S('path',{d:'M315 12 C340 72 285 122 346 170 S460 225 426 305 S485 392 535 425 S606 504 570 582',
   stroke:'#d5e4d9','stroke-opacity':.9,'stroke-width':5.2,fill:'none'}));
 return scene;
}
function mapCounties(world,model,selectedId,changes,onSelect){
 const group=S('g',{class:'atlas-counties'});
 for(const item of model.polygons){
   const {province,title,holder,heraldry,corners,center}=item;
   const selected=province.id===selectedId;
   const changed=changes?.includes(province.id);
   const owner=holder.dynastyId;
   const region=S('g',{class:'atlas-county'+(selected?' is-selected':'')+(changed?' title-changed':''),
     role:'button',tabindex:0,'aria-label':title.name+', '+holder.name,
     'aria-pressed':selected?'true':'false','data-province':province.id});
   region.append(S('path',{d:item.path,fill:heraldry.main,'fill-opacity':selected?.36:.22,
     stroke:'#746e58','stroke-opacity':selected?1:.66,'stroke-width':selected?3.4:1.65,
     'vector-effect':'non-scaling-stroke'}));
   const pick=()=>onSelect(province.id);
   region.addEventListener('click',pick);
   region.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();pick()}});
   // Preserve family identity rather than swapping meaningless marker glyphs.
   const symbol=S('g',{transform:'translate('+center.x+' '+(center.y-11)+')'});
   symbol.append(S('path',{d:'M-15 -21H15V5 Q14 17 0 23 Q-14 17 -15 5Z',
     fill:heraldry.main,stroke:'#fbf0d1','stroke-width':2.5}),
     S('path',{d:'M-12 -17H12V5Q11 13 0 19Q-11 13 -12 5Z',
     fill:'none',stroke:heraldry.alt,'stroke-width':1}),
     S('g',{transform:'scale(.72)'},[charge(heraldry.charge,heraldry.alt)]));
   region.append(symbol,pathText(center.x,center.y+35,province.name,14));
   if(changed)region.append(S('circle',{cx:center.x,cy:center.y-11,r:27,class:'atlas-title-change',fill:'none',stroke:'#eed5a0','stroke-width':3}));
   group.append(region);
 }
 return group;
}
function warMarkers(svg,model,world){
 const active=world.conflicts?.wars||[];
 for(const war of active){
  const province=model.polygons.find(p=>p.id===war.locationId);
  if(!province)continue;
  const c=province.center;
  const pos={x:c.x+35,y:c.y-38};
  const badge=S('g',{transform:'translate('+pos.x+' '+pos.y+')',
    class:'atlas-army','pointer-events':'none','aria-label':'Дружина: '+war.attackerTroops});
  badge.append(S('circle',{r:20,fill:'#463d34',stroke:'#e1c999','stroke-width':2}),
    S('path',{d:'M-8 -11L8 12 M8 -11L-8 12',stroke:'#e8d2a3','stroke-width':2.5}),
    T('text',String(war.attackerTroops),{x:0,y:32,fill:'#332e29',
      'font-size':13,'font-family':'Georgia,serif','text-anchor':'middle',
      stroke:'#f4e7c9','stroke-width':2,'paint-order':'stroke'}));
  svg.append(badge);
 }
}
function compass(svg){
 const rose=S('g',{transform:'translate(778 81)','pointer-events':'none','aria-hidden':'true'});
 rose.append(S('circle',{r:30,fill:'none',stroke:'#787864','stroke-width':1,'stroke-opacity':.5}),
   S('path',{d:'M0 -34L8 0L0 34L-8 0Z',stroke:'#615f4b','stroke-width':1,fill:'#5a6052','fill-opacity':.6}),
   T('text','С',{x:0,y:-40,'font-size':13,'text-anchor':'middle','font-family':'Georgia,serif',fill:'#575344'}));
 svg.append(rose);
}
export function renderAtlas(world,{selectedId='pr-01',onSelect,changes=[],region=0}={}){
 const expanded=world.provinces.length===48;
 const model=countyAtlasModel(world,makeAtlasGeometry(world.seed,world.provinces.length));
 const ox=expanded?(region%2)*860:0,oy=expanded?Math.floor(region/2)*570:0;
 const svg=S('svg',{viewBox:ox+' '+oy+' 860 570',class:'living-atlas',role:'group',
   'aria-label':'Политическая карта Междуречья: 12 настоящих графств',preserveAspectRatio:'xMidYMid meet'});
 atlasDefs(svg,model);
 svg.append(S('rect',{x:0,y:0,width:model.width,height:model.height,fill:'#bdc5b5'}),
   S('rect',{x:0,y:0,width:model.width,height:model.height,fill:'#dae1d4','fill-opacity':.37}),
   S('path',{d:model.perimeter,transform:'translate(5 9)',fill:'#5b6658','fill-opacity':.22}),
   S('path',{d:model.perimeter,fill:'url(#atlas-paper)',stroke:'#726f5b','stroke-width':4.5}),
   S('path',{d:model.perimeter,fill:'url(#atlas-light)'}),
   S('g',{'clip-path':'url(#atlas-land)'},[
     S('rect',{width:model.width,height:model.height,fill:'#526040',filter:'url(#atlas-grain)'})]),
   engraving(model,world.seed),mapCounties(world,model,selectedId,changes,onSelect));
 warMarkers(svg,model,world);
 if(expanded){
   const point=S('g',{transform:'translate('+ox+' '+oy+')','pointer-events':'none'});
   point.append(T('text',['I','II','III','IV'][region]+' / IV',{
     x:767,y:512,'text-anchor':'middle',fill:'#53624d',
     'font-size':20,'font-family':'Georgia,serif'}));svg.append(point);
 }else compass(svg);
 const container=DOM('div','atlas-canvas');
 container.append(svg);
 const stamp=DOM('div','atlas-corner-mark','М Е Ж Д У Р Е Ч Ь Е');
 stamp.setAttribute('aria-hidden','true');container.append(stamp);
 return container;
}
function kinNode(person,kind,world,subjectId,onPerson){
 const e=DOM('button','kin-node'+(person.id===subjectId?' current':'')+
 (person.alive?'':' deceased'));
 e.type='button';e.dataset.person=person.id;
 const shield=shieldSvg(person.dynastyId,{small:true});
 const text=DOM('span','kin-label');text.append(DOM('strong','',person.name.split(' ')[0]),
   DOM('small','',(world.titles.find(t=>t.holderId===person.id)?.name||String(person.birthYear)).replace(/^Графство /,'')));
 e.append(shield,text);
 e.title=person.name+' · '+kind;
 e.setAttribute('aria-label',kind+': '+person.name);
 e.addEventListener('click',()=>onPerson(person.id));
 return e;
}
export function renderGenealogy(world,subjectId,{onPerson}={}){
 const rel=familyRelations(world,subjectId);
 const root=DOM('div','genealogy');
 const top=DOM('div','genealogy-crown');top.append(shieldSvg(rel.person.dynastyId),
   DOM('span','',rel.dynasty?.name||'Династия'));
 root.append(top);
 const rows=[
   {name:'Родители',people:rel.parents},
   {name:'Правитель',people:[rel.person,...(rel.spouse?[rel.spouse]:[])]},
   {name:'Дети',people:rel.children}
 ];
 for(const row of rows){
   const section=DOM('section','kin-generation');
   const heading=DOM('div','kin-generation-title',row.name);
   const nodes=DOM('div','kin-members');
   if(row.people.length)for(const person of row.people)
     nodes.append(kinNode(person,row.name,world,subjectId,onPerson));
   else nodes.append(DOM('span','kin-empty','—'));
   section.append(heading,nodes);root.append(section);
 }
 const existing=rel.held.filter(t=>t.rank==='county');
 const claim=world.titles.filter(t=>t.claims.some(c=>c.personId===rel.person.id)&&t.holderId!==rel.person.id);
 const bottom=DOM('div','kin-titles');
 bottom.append(DOM('span','',existing.length+' влад.'),
   DOM('span','',claim.length+' притяз.'));
 root.append(bottom);
 return root;
}
