// Canonical walkable footprints shared by placement, presentation and tests.
// Old saved scenes without a layout remain classic.
// All wall-mounted catalog objects must share the same footprint rules.
const WALL_TYPES=new Set(['frame','window','mirror','clock','starwall','curtains']);
export const LAYOUTS=[
 {id:'classic',name:'Классическая',description:'Знакомая квадратная комнатка'},
 {id:'narrow',name:'Узкая',description:'Маленькая и уютная'},
 {id:'nook',name:'Уголок',description:'С забавным вырезом у входа'}
];
export function layoutId(id){return LAYOUTS.some(x=>x.id===id)?id:'classic';}
export function leftWallX(layout){return layoutId(layout)==='narrow'?-3.05:-3.91;}
export function containsPoint(id,x,z,margin=0){
 id=layoutId(id);
 if(Math.abs(x)+margin>3.77||Math.abs(z)+margin>3.77)return false;
 if(id==='narrow'&&Math.abs(x)+margin>2.89)return false;
 if(id==='nook'&&x+margin>1.36&&z+margin>1.25)return false;
 return true;
}
export function fitsLayout(id,item,width,depth){
 if(WALL_TYPES.has(item.type)){
  if(item.wall==='back')return id!=='narrow'||Math.abs(item.x)+width/2<2.88;
  if(item.wall==='left')return true;
 }
 // Each corner of the item's footprint must sit on a real piece of floor.
 const hw=width/2,hd=depth/2;
 return [[-hw,-hd],[hw,-hd],[-hw,hd],[hw,hd]].every(([dx,dz])=>containsPoint(id,item.x+dx,item.z+dz));
}
