// Hand-authored SVG objects. Their drawing is selected by the PUBLIC LABEL ONLY.
// A relabelled object is rendered as an unknown parcel, even if its actual
// identity is known to the client, so other players cannot infer its origin.
const STROKE='#35241e';
const ed=(w=4)=>' stroke="'+STROKE+'" stroke-width="'+w+'" stroke-linejoin="round" stroke-linecap="round"';
const p=(d,c,w=4)=>'<path d="'+d+'" fill="'+c+'"'+ed(w)+'/>';
const s=(d,c='#f2c99a',w=3)=>'<path d="'+d+'" fill="none" stroke="'+c+'" stroke-width="'+w+'" stroke-linecap="round" stroke-linejoin="round"/>';
const e=(x,y,rx,ry,c,w=4)=>'<ellipse cx="'+x+'" cy="'+y+'" rx="'+rx+'" ry="'+ry+'" fill="'+c+'"'+ed(w)+'/>';
const c=(x,y,r,fill,w=4)=>'<circle cx="'+x+'" cy="'+y+'" r="'+r+'" fill="'+fill+'"'+(w?ed(w):'')+'/>';
const r=(x,y,w,h,rad,fill,sw=4)=>'<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="'+rad+'" fill="'+fill+'"'+ed(sw)+'/>';
const line=(d,color='#50362b',w=3)=>s(d,color,w);
const gold='#e0ad53',red='#c05d47',cream='#f3dcaf',dark='#302b2b',mint='#8eb3a1',seam='#e8bd85';
const motifs={
 frog:()=>{
  let z=p('M50 115q-29 12-32 27 12 17 34 7l30-10 39 7q16 12 30-5-3-20-37-29', '#8d793e');
  z+=e(90,100,61,49,'#c29b43')+e(89,113,51,31,'#e3be5c',2);
  z+=p('M38 66q-9-29 11-34l19 3 6 28M108 61q-4-28 19-30 24 2 12 37','#b39946');
  z+=c(61,55,17,'#d6bc64')+c(118,53,17,'#d6bc64')+c(65,55,8,dark,2)+c(117,53,8,dark,2);
  z+=c(62,51,3,'#fff1c7',0)+c(114,49,3,'#fff1c7',0);
  z+=e(89,97,16,10,'#d88951',2)+c(83,94,2,'#634529',0)+c(95,94,2,'#634529',0);
  z+=s('M65 112q27 23 50-1','#624625',4)+s('M47 87l11-7m67 0 12 9','#f5d682',4);
  z+=c(42,102,3,'#ffe09b',0)+c(136,101,3,'#ffe09b',0);
  return z;
 },
 pig:()=>{
  let z=p('M35 78q-24-30-16-43 26-5 42 21M109 58q13-25 28-17 10 11-5 37','#c37d6c');
  z+=e(84,109,64,41,'#b96b60')+e(86,109,56,34,'#de8b73',2);
  z+=p('M30 129q-11 24 2 29h17l7-18m67-3 4 21h20q9-6-3-27','#a95f57');
  z+=e(132,109,21,16,'#e5a386')+c(124,109,4,'#8d5445',0)+c(140,109,4,'#8d5445',0);
  z+=c(104,88,6,dark,2)+c(105,85,2,cream,0);
  z+=p('M42 77q-21-25-9-35 20 0 27 21','#efa48b',3);
  z+=s('M62 72l29-3','#6e463d',6)+r(81,60,19,4,2,'#3f3027',0);
  z+=p('M19 108q-15 13 1 23 13 5 16-8','none',3);
  return z;
 },
 spider:()=>{
  let z=s('M61 83 33 65 15 82M55 107 29 105 12 132M119 81l25-22 22 19M124 109l28-5 16 28','#5b4a39',8);
  z+=s('M58 95 28 82 10 96M122 92l27-13 20 18','#b78b53',4);
  z+=e(90,106,39,41,'#756c5c')+e(89,114,31,32,'#99917a',3);
  z+=e(90,60,28,26,'#897c65')+c(79,57,8,'#ebc16e',2)+c(101,57,8,'#ebc16e',2)+c(80,56,4,dark,0)+c(101,56,4,dark,0);
  z+=s('M77 86l25 0M72 111l36 0M77 132h24','#484439',4)+c(90,111,9,'#c79c5e',2)+c(90,111,3,dark,0);
  z+=p('M86 24h8l5 15-8 11-10-9Z','#d5a55d',2)+s('M90 20v-14','#5d4835',3);
  return z;
 },
 crown:()=>{
  let z=p('M27 70 23 28l35 27 33-43 32 43 36-27-7 42-9 77H37Z','#bc7a3c');
  z+=p('M31 63 58 75l34-43 32 43 31-14-9 78H38Z','#e8b760',2);
  z+=p('M39 107q55-12 104 0l-5 28H44Z','#d29a50',3);
  z+=s('M45 117q45-9 87 0','#fff2bf',3);
  z+=p('M88 79l13 16-12 13-13-13Z','#9f514d',2)+c(52,88,7,'#73a99e',2)+c(130,87,7,'#73a99e',2);
  z+=c(23,27,6,'#eed37c',2)+c(91,13,7,'#eed37c',2)+c(159,26,6,'#eed37c',2);
  z+=s('M48 146h86','#4b3027',7)+s('M49 147h83','#f1c984',2);
  return z;
 },
 mimic:()=>{
  let z=p('M23 80q3-41 67-41 66 0 70 41l-5 79H28Z','#75442e');
  z+=p('M32 68q18-28 58-28t58 28v24H32Z','#a46c3e');
  z+=r(27,85,127,68,10,'#855335');
  z+=p('M32 97q26 34 58 0 32 34 59 0v19l-117 0Z','#3b2020');
  for(let i=0;i<6;i++){let x=37+i*19;z+=p('M'+x+' 99l10 17 9-17Z',cream,2);}
  z+=c(69,70,10,'#ffdb91')+c(111,70,10,'#ffdb91')+c(69,70,5,dark,0)+c(111,70,5,dark,0);
  z+=s('M32 146h114','#dfaa65',7)+s('M43 87v59m96-59v59','#54311f',6)+r(80,115,21,29,4,'#d5a459',3)+c(90,128,4,dark,0);
  return z;
 },
 cat:()=>{
  let z=p('M29 66 25 24l42 25q23-9 47 0l41-25-5 41q21 25 12 58-10 37-73 40-62-2-75-39-5-31 15-58Z','#352e31');
  z+=p('M37 57 34 41 58 59Z','#b35c56',2)+p('M142 57l6-16-25 18Z','#b35c56',2);
  z+=e(63,94,17,23,'#e6ae63')+e(114,94,17,23,'#e6ae63')+c(64,96,9,'#985749',2)+c(113,96,9,'#985749',2)+c(64,96,5,dark,0)+c(113,96,5,dark,0);
  z+=c(88,68,15,'#d3a66a',2)+c(88,68,8,'#aa6456',2)+c(88,68,4,dark,0);
  z+=p('M52 125l12 13 12-13 12 13 12-13 12 13 12-13 12 10q-40 43-86-10Z',cream,2);
  z+=s('M21 102 8 96M29 115 8 118M151 103l18-8m-18 24 19 6','#79645a',3);
  return z;
 },
 mirror:()=>{
  let z=p('M74 124h31l4 29h20v13H49v-13h20Z','#8a5438');
  z+=p('M90 16q56 0 63 65 0 47-62 64-61-12-61-65Q35 19 90 16Z','#b47a45');
  z+=e(90,80,48,54,'#f3c46f')+e(90,80,41,47,'#73a39b',3);
  z+=p('M63 57q26-26 59-15L65 104q-17-23-2-47Z','#b6d6c9',0);
  z+=s('M80 42l20-5m-28 53 44-46','#eff2d4',5);
  z+=s('M57 126q35 20 65-1','#f9d995',4);
  for(let a of [[89,9],[22,78],[157,81],[90,150]])z+=c(a[0],a[1],5,'#c5584b',2);
  return z;
 },
 gear:()=>{
  let z=p('M77 13h26l7 21 17 8 21-7 14 21-14 18v24l14 17-14 21-21-7-17 8-7 21H77l-7-21-17-8-21 7-14-21 14-17V74L18 56l14-21 21 7 17-8Z','#a16d47');
  z+=e(90,87,49,49,'#d2a169')+e(90,87,32,32,'#775741')+e(90,87,18,18,'#43372e');
  for(const a of [0,60,120,180,240,300]){const th=a*Math.PI/180,x=90+40*Math.cos(th),y=87+40*Math.sin(th);z+=c(x.toFixed(2),y.toFixed(2),4,'#f6d495',0);}
  z+=s('M39 69l10-7M136 111l-9 8','#f0cc8d',4);
  return z;
 },
 lens:()=>{
  let z=p('M87 10 128 31l24 51-22 58-40 28-41-28-20-57 20-51Z','#a96d49');
  z+=p('M90 24 119 41l18 43-16 43-31 21-31-22-16-43 17-43Z','#d9a35f',3);
  z+=p('M36 84q50-66 107 0-56 66-107 0Z','#7ca89d');
  z+=e(89,85,25,26,'#e6c473')+e(89,85,15,18,'#88554f')+c(89,85,8,dark,2)+c(82,77,5,'#ffe4a6',0);
  z+=s('M56 85q34-42 66 0','#e6dbb2',3)+s('M78 151q18 9 25 0','#e9c884',4);
  return z;
 },
 mushroom:()=>{
  let z=p('M68 91q-7 25-16 56 38 25 79 0-18-33-16-56Z','#eed6b6');
  z+=p('M17 103q5-75 72-80 72 4 75 80-64 18-147 0Z','#a94737');
  z+=p('M23 95q9-53 62-64 56-3 70 65-53 11-132-1Z','#ca6149',2);
  z+=e(89,103,72,15,'#f4deb7',2)+e(89,104,61,9,'#dbc39f',2);
  z+=e(46,72,13,9,cream,0)+e(108,47,13,9,cream,0)+e(136,82,9,7,cream,0)+e(77,59,8,6,cream,0);
  z+=c(76,127,4,dark,0)+c(109,127,4,dark,0)+s('M78 142q12 9 23 0','#a36e58',3);
  z+=p('M59 139q-29 14-30 30l-8-7q9-28 38-30Z','#65815b',2);
  return z;
 },
 hourglass:()=>{
  let z=p('M46 21h88v14q-8 33-35 48 27 23 35 55v16H46v-16q8-33 35-55Q55 66 46 35Z','#916441');
  z+=p('M59 37h61q-6 26-30 39-25-17-31-39Z','#a6b9a6',2);
  z+=p('M59 137q5-27 31-42 26 18 31 42Z','#a6b9a6',2);
  z+=p('M65 47h50L90 66Z','#efd18f',0)+p('M60 132h60l-30-27Z','#e5b266',0);
  z+=s('M88 80v20','#d4a65b',4)+s('M49 28h82m-83 119h84','#dcb77b',7);
  z+=r(37,13,106,16,6,'#9c6847')+r(37,145,106,16,6,'#9c6847');
  z+=c(52,21,3,'#eed096',0)+c(126,152,3,'#eed096',0);
  return z;
 },
 amulet:()=>{
  let z=s('M66 40q-18-18-1-34 20-12 43 4','#94764a',8);
  z+=p('M89 27q17 16 42 13l15 39-15 50-42 41-42-41-15-50 15-39q28 0 42-13Z','#a76a4c');
  z+=p('M90 42 118 52l11 29-11 37-28 30-28-29-12-37 10-30Z','#cda16c',2);
  z+=p('M90 55 109 70l-3 36-16 26-16-26-3-36Z','#78a797');
  z+=s('M90 61v61M77 89h26','#f9ddb0',5);
  z+=c(90,89,8,'#d6b260',3)+c(46,81,4,'#f1d9a6',0)+c(130,82,4,'#f1d9a6',0);
  return z;
 },
 unknown:()=>{
  let z=p('M40 68q50-24 100 0l-9 91H50Z','#aa7a58');
  z+=p('M37 68l19-30h69l18 30Q89 85 37 68Z','#d2a16c');
  z+=p('M43 91q47 16 91 0l-4 39q-44 19-83 0Z','#ba8961',2);
  z+=s('M62 64l56 4','#7b5439',6);
  z+=p('M76 98q13-16 27 0t-9 26v13H83v-21q0-5 7-8t-14-10Z','#755039',2);
  z+=c(89,146,5,'#755039',0)+s('M58 45 50 20','#9e6d4a',3);
  return z;
 }
};
const patterns=[[/жаб/i,'frog'],[/копил/i,'pig'],[/паук/i,'spider'],[/корон/i,'crown'],[/сундук|мимик/i,'mimic'],
 [/кот/i,'cat'],[/зеркал/i,'mirror'],[/шестерн/i,'gear'],[/око/i,'lens'],[/гриб/i,'mushroom'],
 [/час/i,'hourglass'],[/амул/i,'amulet']];
export function artifactKind(visibleName){
 const found=patterns.find(([re])=>re.test(String(visibleName||'')));
 return found?found[1]:'unknown';
}
export function artifactSVG(visibleName,rarity='обычный'){
 const kind=artifactKind(visibleName);
 const rare=rarity==='редкий';
 const rim=rare?'<path d="M25 31l8-10 6 8 12-4M128 32l10-10 8 11M40 162l-8 9 13 0M138 159l8 8-12 1" fill="none" stroke="#f0c777" stroke-width="4" stroke-linecap="round"/>':'';
 // Transparent object, ink outline, small print-like imperfections and a
 // physical contact shadow. This can be reused on the tabletop and in detail.
 return '<svg class="item-svg item-svg-'+kind+'" viewBox="0 0 180 180" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">'+
  motifs[kind]()+rim+'</svg>';
}
