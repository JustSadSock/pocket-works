// Room purpose is independent of geometry. All types use existing layout bounds.
export const ROOM_KINDS=[
 {id:'living',name:'Гостиная',hint:'Разговоры и отдых',accent:'#9db1a1',recommended:['sofa','coffee','floorlamp','rug','books','plant','loveseat','teatable']},
 {id:'bedroom',name:'Спальня',hint:'Тишина и мягкий свет',accent:'#cab4c5',recommended:['bed','nightstand','wardrobe','pillow','tablelamp','vanity','curtains','chest']},
 {id:'kitchen',name:'Кухня',hint:'Завтраки и встречи',accent:'#d6b18b',recommended:['diningtable','diningchair','kitchenunit','sink','stove','fridge','teapot','mug','cutlery','vase']},
 {id:'nursery',name:'Детская',hint:'Игры и истории',accent:'#dfb4a1',recommended:['crib','teddy','basket','bookcase','toybox','pouf','rug','starwall','pillow']},
 {id:'study',name:'Кабинет',hint:'Книги и идеи',accent:'#a5b4c7',recommended:['desk','officechair','bookcase','deskclock','deskorganizer','books','tablelamp','shelf','curtains']}
];
export const byRoomKind=Object.fromEntries(ROOM_KINDS.map(k=>[k.id,k]));
export const MATERIALS=[
 {id:'linen',name:'Лён'}, {id:'velvet',name:'Бархат'},
 {id:'oak',name:'Дуб'}, {id:'walnut',name:'Орех'},
 {id:'paint',name:'Крашеное дерево'}, {id:'ceramic',name:'Керамика'},
 {id:'metal',name:'Металл'}
];
export const byMaterial=Object.fromEntries(MATERIALS.map(m=>[m.id,m]));
export function roomKind(value){return byRoomKind[value]?value:'living';}
export function itemMaterial(value){return byMaterial[value]?value:'linen';}
export function recommendedFor(purpose,itemType){return Boolean(byRoomKind[roomKind(purpose)].recommended.includes(itemType));}
