// PEREKOS / six costumes, one inherited PocketWorks face.
// Every plate, sash and silhouette is a cosmetic drawing only.
// Deliberately leave the central chest/portrait visible for account artwork.
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const px=(c,x,y,w,h,fill)=>{c.fillStyle=fill;c.fillRect(Math.round(x),Math.round(y),Math.max(1,Math.round(w)),Math.max(1,Math.round(h)))};
const poly=(c,points,fill)=>{c.fillStyle=fill;c.beginPath();c.moveTo(...points[0]);for(let i=1;i<points.length;i++)c.lineTo(...points[i]);c.closePath();c.fill()};
const line=(c,p,color,width=2)=>{c.strokeStyle=color;c.lineWidth=width;c.lineJoin='bevel';c.beginPath();c.moveTo(...p[0]);for(let i=1;i<p.length;i++)c.lineTo(...p[i]);c.stroke()};
export const GARB={
 kindle:{material:'copper and flamewoven silk',silhouette:'split-collar',accent:'#f2b46c'},
 cinder:{material:'iron incense chains and ash linen',silhouette:'hanging-cowl',accent:'#c7a58c'},
 wire:{material:'silver conductor and flight cloth',silhouette:'swift-antenna',accent:'#b7e1d4'},
 coil:{material:'copper winding and soft lacquer',silhouette:'circular-yoke',accent:'#dbb188'},
 pebble:{material:'weathered granite armor',silhouette:'uneven-boulders',accent:'#bdc6a5'},
 slate:{material:'limestone plate and iron straps',silhouette:'monolith-mantle',accent:'#d1d3ae'}
};
export const garbSignature=id=>{const g=GARB[id]||GARB.kindle;return g.silhouette+'/'+g.material};
export function drawGarbBack(c,id,{cloth=0,move=0,dash=0,attack=0}={}){
 const t=clamp(cloth,-8,8),v=clamp(move,0,1),k=clamp(attack,0,1);
 c.save();
 switch(id){
  case 'kindle': // asymmetrical twin tongues above a raised copper shoulder
   poly(c,[[-17,-13],[-23,-18],[-26,-12],[-19,-4],[-14,-4]],'#663f34');
   poly(c,[[-21,-17],[-23,-24],[-18,-21],[-17,-13]],'#d48a50');
   poly(c,[[-14,10],[-18-t*.2,25],[-9-t*.3,22],[-6,11]],'#8b533d');
   poly(c,[[9,10],[13-t*.2,24],[18-t*.3,19],[13,7]],'#bc7651');
   break;
  case 'cinder': // broad outer hood and censer mantle
   poly(c,[[-15,-20],[-24,-17],[-27,-2],[-22,14],[-17,12],[-17,-5]],'#343d3b');
   poly(c,[[11,-19],[23,-15],[25,-5],[21,11],[14,12]],'#494a42');
   line(c,[[-23,3],[-25-t*.3,16],[-20-t*.4,21]],'#a98f70',2);
   break;
  case 'wire': // long scarf, sharply tapered wing panels
   poly(c,[[-12,-10],[-19,-13],[-24,-5],[-19,4],[-14,6]],'#396a6d');
   poly(c,[[11,-9],[22,-13],[25,-5],[17,5],[11,3]],'#447d80');
   poly(c,[[-9,-8],[-15,-11],[-31-t*.45,0-v*4],[-21-t*.65,4],[-9,0]],'#74aaa3');
   break;
  case 'coil': // circular winding visible behind the neck
   c.strokeStyle='#81573e';c.lineWidth=5;c.beginPath();c.arc(0,-9,20,Math.PI*1.12,Math.PI*1.88);c.stroke();
   c.strokeStyle='#d49a70';c.lineWidth=2;c.beginPath();c.arc(0,-9,21,Math.PI*1.1,Math.PI*1.9);c.stroke();
   poly(c,[[-13,-7],[-23,-7],[-25,13],[-16,11]],'#774c3d');
   poly(c,[[11,-7],[22,-8],[23,15],[15,13]],'#885f43');
   break;
  case 'pebble': // fractured heavy pauldrons and squared apron
   poly(c,[[-11,-13],[-24,-13],[-27,-7],[-26,3],[-15,5],[-11,-3]],'#455a4e');
   poly(c,[[10,-13],[24,-12],[27,-5],[24,5],[13,5]],'#546a57');
   poly(c,[[-10,10],[-13,24],[-4,23],[-1,13]],'#607665');
   poly(c,[[5,11],[10,23],[18,20],[12,8]],'#3f584d');
   break;
  case 'slate': // single slab on the left, counterweight right; imposing cape
   poly(c,[[-10,-16],[-27,-19],[-31,-8],[-30,10],[-18,16],[-11,-5]],'#364e43');
   poly(c,[[10,-15],[26,-13],[29,-4],[28,11],[17,15],[11,-5]],'#485f50');
   poly(c,[[-12,8],[-22-t*.1,25],[-8-t*.18,25],[-3,10]],'#6d8069');
   break;
 }
 c.restore();
}
export function drawGarbFront(c,id,{coat='#657c68',trim='#c7af85',shade='#354c40',
 cloth=0,move=0,guard=0,attack=0,phase=0}={}){
 const k=clamp(attack,0,1),g=clamp(guard,0,1),t=clamp(cloth,-8,8);
 c.save();
 switch(id){
  case 'kindle':
   // Offset metal collar, stitched flaming hems, visible diagonal strap.
   poly(c,[[-14,-7],[-3,-7],[-8,-2],[-17,0]],'#a15d3e');
   poly(c,[[7,-6],[16,-7],[16,-1],[8,2]],'#c2784c');
   line(c,[[-8,1],[-3,5]],'#eec693',2);line(c,[[5,1],[8,5]],'#965339',2);
   for(let i=0;i<3;i++){px(c,-11+i*3,11+i%2*2,2,3,'#daa56e');px(c,6+i*3,11+(i+1)%2*2,2,3,'#d18a5c')}
   poly(c,[[-18,-9],[-20,-17-k*3],[-15,-12],[-13,-7]],'#edaa60');
   break;
  case 'cinder':
   // Layered ash hood drapes but never over the inherited face.
   poly(c,[[-14,-7],[-19,-9],[-17,10],[-12,15],[-10,1]],'#5d5950');
   poly(c,[[12,-7],[20,-6],[18,9],[13,14],[9,2]],'#70675b');
   line(c,[[-12,-2],[-10,12]],'#b19b81',2);
   for(let i=0;i<3;i++){px(c,-13+i*6,10,3,2,'#bb9671')}
   px(c,-18,14+t*.3,5,5,'#55493f');px(c,-17,15+t*.3,3,2,'#d9a078');
   break;
  case 'wire':
   // Narrow flight coat and conductor ribs; purposeful negative space.
   poly(c,[[-13,-6],[-18,-3],[-16,12],[-12,16],[-10,-3]],'#477c78');
   poly(c,[[11,-6],[17,-4],[17,13],[12,16],[9,-3]],'#498985');
   line(c,[[-9,-4],[-3,1]],'#c9ddd1',2);line(c,[[9,-4],[4,1]],'#a4d7cf',2);
   px(c,-11,13,4,2,'#9fdbd1');px(c,7,13,4,2,'#9fdbd1');
   px(c,-19,-10-k*2,3,9,'#99ccc3');
   break;
  case 'coil':
   // Actual wound copper yoke / belted induction rings.
   poly(c,[[-14,-6],[-21,-3],[-20,6],[-14,9]],'#896046');
   poly(c,[[13,-6],[21,-4],[20,6],[13,8]],'#8d664d');
   for(let j=0;j<3;j++){
    px(c,-21,-4+j*5,7,2,'#dca67b');px(c,14,-4+j*5,7,2,'#dbaf86');
   }
   line(c,[[-12,10],[12,10]],'#b38c6a',3);
   px(c,-11,9,6,3,'#e6c49b');px(c,6,9,6,3,'#e6c49b');
   break;
  case 'pebble':
   poly(c,[[-17,-11],[-24,-10],[-23,-1],[-15,5],[-11,-3]],'#738976');
   poly(c,[[13,-12],[24,-10],[24,1],[16,6],[10,-3]],'#829783');
   poly(c,[[-22,-10],[-16,-14],[-11,-12],[-11,-7],[-22,-7]],'#b2c4a1');
   poly(c,[[13,-13],[21,-14],[25,-9],[13,-7]],'#bfc7a6');
   px(c,-20,0,6,3,'#30483e');px(c,15,2,7,3,'#4d6352');
   poly(c,[[-12,8],[-10,14],[-3,17],[0,12],[-5,9]],'#859881');
   break;
  case 'slate':
   // A large split cuirass; center remains open for Pocket ID artwork.
   poly(c,[[-18,-12],[-26,-10],[-26,8],[-18,13],[-12,-5]],'#627763');
   poly(c,[[13,-13],[24,-13],[26,7],[18,14],[11,-5]],'#6d826e');
   line(c,[[-26,-11],[-18,-15],[-12,-13]],'#c5cea8',3);
   line(c,[[13,-14],[24,-14],[28,-9]],'#b2c2a4',3);
   line(c,[[-23,-1],[-18,2],[-21,9]],'#29483c',2);
   line(c,[[24,-1],[17,2],[23,10]],'#344f42',2);
   px(c,-13,11,8,3,'#ced1ae');px(c,6,11,8,3,'#a4b593');
   break;
 }
 // Class-adaptive soft occlusion on the forearms, not an artificial outline.
 // Protect legibility of original avatar chest and MASKOT face.
 if(g>.25){
  px(c,-17,-11-g*4,3,5,GARB[id]?.accent||trim);
 }
 c.restore();
}


// Six head shapes tuned from actual Chromium/WebKit 48-view contact sheets.
// Only used if Pocket ID did NOT supply a custom head accessory.
// The base face remains unobscured; all shapes are 2D rigid pixel materials.
export function drawClassHeadgear(ctx,id,{trim='#d6bf91',coat='#63785f',shade='#384b3b'}={}){
 const c=ctx;
 switch(id){
  case 'kindle': // split copper diadem + swept flame-wrought crown
   poly(c,[[-16,-18],[-14,-24],[-6,-27],[4,-24],[15,-20],[15,-16]],'#965439');
   px(c,-17,-18,34,4,'#b67b4f');px(c,-13,-21,26,3,'#f4b777');
   poly(c,[[-6,-23],[-3,-33],[2,-36],[5,-28],[10,-24]],'#d98c52');
   poly(c,[[1,-27],[4,-34],[7,-27],[7,-23]],'#f3bd75');
   px(c,-1,-27,4,4,'#ffe0a2');
   break;
  case 'cinder': // hanging black cowl with an uneven heavy forehead
   poly(c,[[-17,-14],[-19,-23],[-12,-31],[2,-34],[13,-29],[18,-19],[14,-12]],'#273632');
   poly(c,[[-15,-22],[-9,-31],[2,-32],[10,-26],[12,-22]],'#55544a');
   poly(c,[[-20,-19],[-18,-5],[-13,2],[-11,-18]],'#343b38');
   poly(c,[[14,-22],[19,-13],[17,-3],[11,2],[11,-18]],'#3c443f');
   px(c,-14,-19,28,4,'#7d7760');px(c,-10,-24,15,2,'#9b9275');
   px(c,10,-11,3,8,'#ae8965');
   break;
  case 'wire': // twin upright conductor blades and a low airy visor
   poly(c,[[-15,-20],[-9,-24],[9,-24],[16,-17],[12,-15],[-14,-15]],'#467875');
   px(c,-14,-18,29,3,'#a0d9ce');
   poly(c,[[-11,-22],[-9,-36],[-5,-38],[-3,-21]],'#7bbab1');
   poly(c,[[5,-22],[7,-38],[10,-35],[11,-20]],'#599c9e');
   px(c,-10,-37,5,2,'#edfff1');px(c,8,-38,3,3,'#e4fff0');
   px(c,-7,-23,16,2,'#dae7c7');
   break;
  case 'coil': // open copper induction ring; no default stovepipe crown
   c.lineWidth=5;c.strokeStyle='#804936';c.beginPath();c.arc(0,-22,17,-Math.PI*.93,-Math.PI*.07);c.stroke();
   c.lineWidth=2;c.strokeStyle='#dfae82';c.beginPath();c.arc(0,-22,17,-Math.PI*.91,-Math.PI*.09);c.stroke();
   px(c,-17,-22,6,8,'#945c40');px(c,11,-22,6,8,'#945c40');
   px(c,-16,-20,4,3,'#e1b588');px(c,12,-20,4,3,'#e1b588');
   poly(c,[[-13,-19],[-9,-25],[9,-25],[13,-19],[12,-15],[-12,-15]],'#714b3b');
   px(c,-8,-23,16,2,'#e9ca9c');px(c,-1,-26,3,4,'#f3debc');
   break;
  case 'pebble': // short off-axis rock crest and chipped granite brow
   poly(c,[[-17,-17],[-19,-23],[-11,-27],[-5,-30],[4,-27],[13,-25],[17,-19],[15,-15]],'#506859');
   poly(c,[[-17,-21],[-8,-30],[1,-28],[-2,-20]],'#a8ba9d');
   poly(c,[[1,-25],[11,-28],[18,-21],[13,-16],[4,-18]],'#788b73');
   px(c,-17,-18,34,4,'#384d40');px(c,-13,-20,9,3,'#d2d8b3');
   px(c,5,-23,7,2,'#bcc9aa');
   break;
  default: // slate: tall squared monolith with inset limestone front
   poly(c,[[-13,-15],[-16,-23],[-12,-36],[9,-36],[15,-26],[14,-15]],'#405748');
   poly(c,[[-11,-33],[-7,-38],[7,-38],[10,-30],[9,-17],[-11,-17]],'#93a38a');
   px(c,-12,-18,25,5,'#566d59');
   px(c,-8,-37,15,3,'#d8dbb5');px(c,-5,-31,11,3,'#bfcaa6');
   px(c,4,-28,3,11,'#506c59');px(c,-14,-23,4,6,'#c0cfab');
 }
}
