// Five compact physically different Soviet apartment arrangements.
// 1 cell = 1.27m. Main rooms now max four cells per side (about 5.08m),
// and service spaces are two-cell recesses. Seam portals are defined elsewhere.
export const FLOORPLANS=[
 {name:'four-room',topAxis:9,topTurn:3,rooms:[
  {x0:3,x1:6,z0:3,z1:6,face:'left',entryZ:4},
  {x0:11,x1:14,z0:3,z1:6,face:'right',entryZ:4},
  {x0:3,x1:6,z0:12,z1:15,face:'left',entryZ:13},
  {x0:11,x1:14,z0:12,z1:15,face:'right',entryZ:13}]},
 {name:'staggered-wing',topAxis:8,topTurn:7,rooms:[
  {x0:4,x1:7,z0:4,z1:7,face:'left',entryZ:5},
  {x0:12,x1:15,z0:3,z1:6,face:'right',entryZ:4},
  {x0:2,x1:5,z0:12,z1:15,face:'left',entryZ:13},
  {x0:11,x1:14,z0:12,z1:15,face:'right',entryZ:13}]},
 {name:'walk-through',topAxis:10,topTurn:7,walkthrough:true,rooms:[
  {x0:3,x1:6,z0:4,z1:7,face:'left',entryZ:5},
  {x0:11,x1:14,z0:3,z1:6,face:'right',entryZ:4},
  {x0:4,x1:7,z0:10,z1:13,face:'left',entryZ:12,via:'walkthrough'},
  {x0:12,x1:15,z0:12,z1:15,face:'right',entryZ:13}]},
 {name:'service-nook',topAxis:9,topTurn:3,southAxis:10,serviceBranch:8,rooms:[
  {x0:2,x1:5,z0:2,z1:5,face:'left',entryZ:4},
  {x0:11,x1:14,z0:3,z1:6,face:'right',entryZ:4},
  {x0:3,x1:6,z0:12,z1:15,face:'left',entryZ:13},
  {x0:12,x1:15,z0:12,z1:15,face:'right',entryZ:13},
  {x0:6,x1:7,z0:7,z1:8,face:'left',entryZ:8,service:true}]},
 {name:'crooked-vestibule',topAxis:8,topTurn:10,serviceBranch:8,rooms:[
  {x0:3,x1:6,z0:3,z1:5,face:'left',entryZ:4},
  {x0:11,x1:14,z0:2,z1:5,face:'right',entryZ:4},
  {x0:4,x1:7,z0:12,z1:15,face:'left',entryZ:13},
  {x0:11,x1:14,z0:11,z1:14,face:'right',entryZ:12},
  {x0:6,x1:7,z0:7,z1:8,face:'left',entryZ:8,service:true}]}
];
export function floorplanName(id){return FLOORPLANS[id]?.name||'unknown'}
