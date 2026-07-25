// @ts-nocheck
import { BASE_MATERIALS, MATERIAL_BY_ID, MATERIAL_BY_KEY, STATE } from './materials.ts';

export const FORMAT_VERSION = 2;
export const MAX_WORLD_CELLS = 36000;
export const MAX_CUSTOM_RULES_PER_MATERIAL = 12;

export function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function hashNoise(value) {
  let x = value | 0; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967295;
}
export function hexToRgb(hex) {
  const clean = String(hex || '#888888').replace('#','');
  const value = Number.parseInt(clean.length === 3 ? clean.split('').map(c=>c+c).join('') : clean,16);
  return [(value>>16)&255,(value>>8)&255,value&255];
}

export function validateCustomMaterial(input) {
  if (!input || typeof input !== 'object') return {ok:false,error:'Материал повреждён.'};
  const state = input.state;
  if (![STATE.POWDER,STATE.LIQUID,STATE.GAS,STATE.SOLID,STATE.BIO].includes(state)) return {ok:false,error:'Неизвестное агрегатное состояние.'};
  if (!String(input.name || '').trim()) return {ok:false,error:'Материалу нужно имя.'};
  const rules = Array.isArray(input.rules) ? input.rules.slice(0,MAX_CUSTOM_RULES_PER_MATERIAL) : [];
  for (const rule of rules) {
    const sameA = rule.productA && rule.productA === input.key;
    const sameB = rule.productB && rule.productB === rule.with;
    const createsSelf = rule.create === input.key;
    if ((sameA && sameB && createsSelf) || (sameA && Number(rule.probability ?? 1) >= .95 && Number(rule.pressure ?? 0) > 0)) {
      return {ok:false,error:'Правило почти наверняка запускает бесконечную самореакцию.'};
    }
  }
  return {ok:true,value:{...input,rules}};
}

function rleEncode(array, precision = 1) {
  const out=[]; if (!array.length) return out;
  let last = Math.round(array[0] * precision), count = 1;
  for (let i=1;i<array.length;i+=1) {
    const value = Math.round(array[i] * precision);
    if (value === last && count < 65535) count += 1;
    else { out.push(last,count); last=value; count=1; }
  }
  out.push(last,count); return out;
}
function rleDecode(data, Target, length, precision = 1) {
  const out = new Target(length); let cursor=0;
  for (let i=0;i<data.length;i+=2) {
    const value = Number(data[i]) / precision, count = Number(data[i+1]);
    out.fill(value,cursor,Math.min(length,cursor+count)); cursor += count;
    if (cursor >= length) break;
  }
  return out;
}

export class MatterEngine {
  constructor(width=120,height=180,customMaterials=[]) {
    if (width*height > MAX_WORLD_CELLS) throw new Error('Мир превышает безопасный лимит.');
    this.width=width; this.height=height; this.size=width*height;
    this.mat=new Uint16Array(this.size);
    this.temp=new Float32Array(this.size); this.temp.fill(20);
    this.pressure=new Float32Array(this.size);
    this.charge=new Float32Array(this.size);
    this.vx=new Int8Array(this.size); this.vy=new Int8Array(this.size);
    this.life=new Uint8Array(this.size);
    this.damage=new Uint8Array(this.size);
    this.anchor=new Uint8Array(this.size);
    this.source=new Uint16Array(this.size);
    this.sink=new Uint8Array(this.size);
    this.fanX=new Int8Array(this.size); this.fanY=new Int8Array(this.size);
    this.tick=0; this.gravityAngle=90; this.ambientTemperature=20; this.activeBudget=Math.min(this.size,28000);
    this.effectsQuality=1; this.customMaterials=[]; this.materials=new Map(MATERIAL_BY_ID);
    this.keyToMaterial=new Map(MATERIAL_BY_KEY);
    this.randomState=0x12345678;
    this.setCustomMaterials(customMaterials);
  }
  setCustomMaterials(list=[]) {
    this.customMaterials=[]; this.materials=new Map(MATERIAL_BY_ID); this.keyToMaterial=new Map(MATERIAL_BY_KEY);
    let nextId=1000;
    for (const raw of list.slice(0,64)) {
      const checked=validateCustomMaterial(raw); if(!checked.ok) continue;
      const item={...checked.value,id:raw.id>=1000?raw.id:nextId++,custom:true};
      item.density=Number(item.density ?? 1); item.viscosity=Number(item.viscosity ?? .2);
      item.conductivity=Number(item.conductivity ?? .15); item.electrical=Number(item.electrical ?? 0);
      item.strength=Number(item.strength ?? (item.state===STATE.SOLID?0.5:0)); item.brittleness=Number(item.brittleness ?? .2);
      item.flammability=Number(item.flammability ?? 0); item.burnRate=Number(item.burnRate ?? .2);
      item.heatCapacity=Number(item.heatCapacity ?? 1); item.growth=Number(item.growth ?? 0);
      item.acidity=Number(item.acidity ?? 0); item.toxicity=Number(item.toxicity ?? 0); item.glow=Number(item.glow ?? 0);
      item.color=item.color || '#8d8f86'; item.rules=Array.isArray(item.rules)?item.rules:[];
      this.customMaterials.push(item); this.materials.set(item.id,item); this.keyToMaterial.set(item.key,item);
    }
  }
  rand() { let x=this.randomState|0; x^=x<<13; x^=x>>>17; x^=x<<5; this.randomState=x|0; return (x>>>0)/4294967296; }
  idx(x,y){ return y*this.width+x; }
  xy(i){ return [i%this.width,Math.floor(i/this.width)]; }
  inside(x,y){ return x>=0&&y>=0&&x<this.width&&y<this.height; }
  materialAt(i){ return this.materials.get(this.mat[i]) || BASE_MATERIALS[0]; }
  materialByKey(key){ return this.keyToMaterial.get(key) || BASE_MATERIALS[0]; }
  gravityVector(){ const a=this.gravityAngle*Math.PI/180; return [Math.round(Math.cos(a)),Math.round(Math.sin(a))]; }
  clear(){ this.mat.fill(0); this.temp.fill(this.ambientTemperature); this.pressure.fill(0);this.charge.fill(0);this.vx.fill(0);this.vy.fill(0);this.life.fill(0);this.damage.fill(0);this.anchor.fill(0);this.source.fill(0);this.sink.fill(0);this.fanX.fill(0);this.fanY.fill(0);this.tick=0; }
  setCell(x,y,material,temp=null,options={}) {
    x=Math.round(x);y=Math.round(y);
    if(!this.inside(x,y)) return false; const i=this.idx(x,y);
    const item=typeof material==='string'?this.materialByKey(material):this.materials.get(Number(material)); if(!item) return false;
    this.mat[i]=item.id; this.temp[i]=temp ?? item.temperature ?? this.ambientTemperature; this.life[i]=item.state===STATE.ENERGY?40:0;
    if(options.anchor!==undefined) this.anchor[i]=options.anchor?1:0;
    if(options.source) this.source[i]=item.id; else if(options.source===false) this.source[i]=0;
    if(options.sink!==undefined) this.sink[i]=options.sink?1:0;
    return true;
  }
  stamp(cx,cy,radius,material,options={}) {
    const r=Math.max(1,Math.round(radius)), r2=r*r;
    for(let y=cy-r;y<=cy+r;y+=1) for(let x=cx-r;x<=cx+r;x+=1) if((x-cx)**2+(y-cy)**2<=r2) this.setCell(x,y,material,options.temp??null,options);
  }
  line(x0,y0,x1,y1,radius,material,options={}) {
    let dx=Math.abs(x1-x0),sx=x0<x1?1:-1,dy=-Math.abs(y1-y0),sy=y0<y1?1:-1,err=dx+dy;
    while(true){this.stamp(x0,y0,radius,material,options);if(x0===x1&&y0===y1)break;const e2=2*err;if(e2>=dy){err+=dy;x0+=sx;}if(e2<=dx){err+=dx;y0+=sy;}}
  }
  rectangle(x0,y0,x1,y1,radius,material,filled=false,options={}) {
    const minX=Math.min(x0,x1),maxX=Math.max(x0,x1),minY=Math.min(y0,y1),maxY=Math.max(y0,y1);
    if(filled){for(let y=minY;y<=maxY;y+=1)for(let x=minX;x<=maxX;x+=1)this.setCell(x,y,material,options.temp??null,options);return;}
    this.line(minX,minY,maxX,minY,radius,material,options);this.line(maxX,minY,maxX,maxY,radius,material,options);this.line(maxX,maxY,minX,maxY,radius,material,options);this.line(minX,maxY,minX,minY,radius,material,options);
  }
  circle(cx,cy,rx,ry,radius,material,filled=false,options={}) {
    rx=Math.max(1,Math.abs(rx));ry=Math.max(1,Math.abs(ry));
    const minX=Math.floor(cx-rx),maxX=Math.ceil(cx+rx),minY=Math.floor(cy-ry),maxY=Math.ceil(cy+ry);
    for(let y=minY;y<=maxY;y+=1)for(let x=minX;x<=maxX;x+=1){const d=((x-cx)/rx)**2+((y-cy)/ry)**2;if(filled?d<=1:Math.abs(d-1)<=Math.max(.03,radius/Math.max(rx,ry)))this.stamp(x,y,radius,material,options);}
  }
  fill(x,y,material,options={}) {
    if(!this.inside(x,y))return 0; const target=this.mat[this.idx(x,y)], replacement=typeof material==='string'?this.materialByKey(material).id:Number(material); if(target===replacement)return 0;
    const stack=[this.idx(x,y)], seen=new Uint8Array(this.size); let count=0;
    while(stack.length&&count<this.activeBudget){const i=stack.pop();if(seen[i]||this.mat[i]!==target)continue;seen[i]=1;const [cx,cy]=this.xy(i);this.setCell(cx,cy,replacement,options.temp??null,options);count+=1;if(cx>0)stack.push(i-1);if(cx<this.width-1)stack.push(i+1);if(cy>0)stack.push(i-this.width);if(cy<this.height-1)stack.push(i+this.width);}
    return count;
  }
  applyTemperature(cx,cy,radius,amount){const r2=radius*radius;for(let y=cy-radius;y<=cy+radius;y+=1)for(let x=cx-radius;x<=cx+radius;x+=1)if(this.inside(x,y)){const d2=(x-cx)**2+(y-cy)**2;if(d2<=r2)this.temp[this.idx(x,y)]+=amount*(1-Math.sqrt(d2)/Math.max(1,radius));}}
  applyPressure(cx,cy,radius,amount){const r2=radius*radius;for(let y=cy-radius;y<=cy+radius;y+=1)for(let x=cx-radius;x<=cx+radius;x+=1)if(this.inside(x,y)){const d2=(x-cx)**2+(y-cy)**2;if(d2<=r2)this.pressure[this.idx(x,y)]+=amount*(1-Math.sqrt(d2)/Math.max(1,radius));}}
  applyCharge(cx,cy,radius,amount=1){const r2=radius*radius;for(let y=cy-radius;y<=cy+radius;y+=1)for(let x=cx-radius;x<=cx+radius;x+=1)if(this.inside(x,y)&&((x-cx)**2+(y-cy)**2<=r2)){const i=this.idx(x,y);this.charge[i]=Math.max(this.charge[i],amount);if(this.mat[i]===0)this.setCell(x,y,'spark',900);}}
  setFan(cx,cy,radius,dx,dy){const r2=radius*radius;for(let y=cy-radius;y<=cy+radius;y+=1)for(let x=cx-radius;x<=cx+radius;x+=1)if(this.inside(x,y)&&((x-cx)**2+(y-cy)**2<=r2)){const i=this.idx(x,y);this.fanX[i]=clamp(Math.round(dx),-1,1);this.fanY[i]=clamp(Math.round(dy),-1,1);}}
  swap(a,b){
    for(const key of ['mat','temp','pressure','charge','life','damage','anchor']){const arr=this[key],v=arr[a];arr[a]=arr[b];arr[b]=v;}
    const [ax,ay]=this.xy(a),[bx,by]=this.xy(b);this.vx[b]=clamp(bx-ax,-1,1);this.vy[b]=clamp(by-ay,-1,1);this.vx[a]=0;this.vy[a]=0;
  }
  canDisplace(from,to){
    if(to<0||to>=this.size||this.anchor[to])return false; const a=this.materialAt(from),b=this.materialAt(to);
    if(b.state===STATE.EMPTY)return true;
    if(a.state===STATE.GAS&&(b.state===STATE.GAS||b.state===STATE.EMPTY))return a.density>b.density;
    if(a.state===STATE.LIQUID&&(b.state===STATE.GAS||b.state===STATE.LIQUID))return a.density>b.density+.02;
    if(a.state===STATE.POWDER&&(b.state===STATE.GAS||b.state===STATE.LIQUID||b.state===STATE.POWDER))return a.density>b.density+.05;
    return false;
  }
  tryMove(i,x,y){if(!this.inside(x,y))return false;const n=this.idx(x,y);if(this.canDisplace(i,n)){this.swap(i,n);return true;}return false;}
  phaseTransition(i,mat){
    const t=this.temp[i];
    if(mat.phaseLow && mat.meltingPoint!==null && t<mat.meltingPoint-.5){const next=this.materialByKey(mat.phaseLow);if(next.id!==0)this.mat[i]=next.id;}
    if(mat.phaseHigh){const threshold=mat.boilingPoint ?? mat.meltingPoint;if(threshold!==null&&t>threshold+.5){const next=this.materialByKey(mat.phaseHigh);if(next.id!==0)this.mat[i]=next.id;}}
    if(mat.key==='steam'&&t<96)this.mat[i]=this.materialByKey('water').id;
    if(mat.key==='cold-gas')this.temp[i]-=2.5;
    if(mat.key==='brine'&&t>106&&this.rand()<.045){this.mat[i]=this.materialByKey('salt').id;this.pressure[i]+=1.5;this.temp[i]-=18;}
    if(mat.key==='syrup'&&t>118&&this.rand()<.035){this.mat[i]=this.materialByKey('sugar').id;this.pressure[i]+=1;this.temp[i]-=12;}
    if(mat.key==='plasma'){this.temp[i]=Math.max(this.temp[i],1200);this.life[i]=Math.max(this.life[i],20);}
  }
  hasOxygen(i){const [x,y]=this.xy(i);for(let oy=-1;oy<=1;oy+=1)for(let ox=-1;ox<=1;ox+=1){if(!ox&&!oy)continue;const nx=x+ox,ny=y+oy;if(!this.inside(nx,ny))continue;const k=this.materialAt(this.idx(nx,ny)).key;if(k==='oxygen'||k==='air')return this.idx(nx,ny);}return -1;}
  ignite(i,mat){const oxygen=this.hasOxygen(i);if(oxygen<0&&mat.key!=='gunpowder'&&mat.key!=='explosive')return false;if(oxygen>=0&&this.materialAt(oxygen).key==='oxygen')this.mat[oxygen]=this.materialByKey('smoke').id;this.mat[i]=this.materialByKey('fire').id;this.life[i]=Math.round(28+mat.burnRate*40);this.temp[i]=Math.max(this.temp[i],620);if(mat.tags?.includes('explosive'))this.explode(i,mat.key==='explosive'?9:6,mat.key==='explosive'?14:9);return true;}
  explode(i,radius,power){const [cx,cy]=this.xy(i);const r2=radius*radius;for(let y=cy-radius;y<=cy+radius;y+=1)for(let x=cx-radius;x<=cx+radius;x+=1){if(!this.inside(x,y))continue;const d2=(x-cx)**2+(y-cy)**2;if(d2>r2)continue;const n=this.idx(x,y),falloff=1-Math.sqrt(d2)/radius;this.pressure[n]+=power*falloff;this.temp[n]+=700*falloff;if(this.rand()<falloff*.7&&!this.anchor[n]){this.mat[n]=this.rand()<.55?this.materialByKey('fire').id:this.materialByKey('smoke').id;this.life[n]=35;}}
  }
  builtInReaction(i,j,a,b){
    const ak=a.key,bk=b.key;
    if((ak==='water'&&bk==='lava')||(ak==='lava'&&bk==='water')){const lava=ak==='lava'?i:j,water=ak==='water'?i:j;this.mat[lava]=this.materialByKey('stone').id;this.mat[water]=this.materialByKey('steam').id;this.temp[lava]=320;this.temp[water]=180;this.pressure[lava]+=4;this.pressure[water]+=6;return true;}
    if((ak==='acid'&&bk==='alkali')||(ak==='alkali'&&bk==='acid')){this.mat[i]=this.materialByKey('neutral-solution').id;this.mat[j]=this.materialByKey('steam').id;this.temp[i]+=45;this.pressure[j]+=1;return true;}
    if(ak==='water'&&(bk==='salt'||bk==='sugar')){this.mat[i]=this.materialByKey(bk==='salt'?'brine':'syrup').id;this.mat[j]=0;return true;}
    if(bk==='water'&&(ak==='salt'||ak==='sugar')){this.mat[j]=this.materialByKey(ak==='salt'?'brine':'syrup').id;this.mat[i]=0;return true;}
    if((ak==='acid'&&(bk==='metal'||bk==='copper'||bk==='metal-powder'))||(bk==='acid'&&(ak==='metal'||ak==='copper'||ak==='metal-powder'))){const metal=ak==='acid'?j:i,acid=ak==='acid'?i:j;this.damage[metal]=clamp(this.damage[metal]+16,0,255);this.mat[acid]=this.materialByKey('flammable-gas').id;this.temp[metal]+=18;if(this.damage[metal]>140)this.mat[metal]=this.materialByKey('rust').id;return true;}
    if(ak==='acid'&&b.state===STATE.SOLID&&b.corrosionResistance<.8&&this.rand()>.55){this.damage[j]+=8;if(this.damage[j]>Math.round(b.strength*180)){this.mat[j]=0;this.mat[i]=this.materialByKey('smoke').id;}return true;}
    if(bk==='acid'&&a.state===STATE.SOLID&&a.corrosionResistance<.8&&this.rand()>.55){this.damage[i]+=8;if(this.damage[i]>Math.round(a.strength*180)){this.mat[i]=0;this.mat[j]=this.materialByKey('smoke').id;}return true;}
    if((ak==='water'&&bk==='seed')||(bk==='water'&&ak==='seed')){const seed=ak==='seed'?i:j;if(this.temp[seed]>4&&this.temp[seed]<45&&this.rand()<.06)this.mat[seed]=this.materialByKey('plant').id;return true;}
    if((ak==='biofilm'||ak==='fungus'||ak==='parasite')&&(bk==='organic'||bk==='plant'||bk==='wood')){if(this.rand()<(.015+a.growth*.02)){this.mat[j]=a.id;this.temp[j]=this.temp[i];}return true;}
    if((bk==='biofilm'||bk==='fungus'||bk==='parasite')&&(ak==='organic'||ak==='plant'||ak==='wood')){if(this.rand()<(.015+b.growth*.02)){this.mat[i]=b.id;this.temp[i]=this.temp[j];}return true;}
    return false;
  }
  customReaction(i,j,a,b){
    const all=[a,b];
    for(let side=0;side<2;side+=1){const self=all[side],other=all[1-side];if(!self.custom)continue;for(const rule of self.rules||[]){if(rule.with&&rule.with!==other.key)continue;const t=this.temp[side?j:i];if(rule.tempAbove!==undefined&&t<Number(rule.tempAbove))continue;if(rule.tempBelow!==undefined&&t>Number(rule.tempBelow))continue;if(rule.requiresOxygen&&this.hasOxygen(side?j:i)<0)continue;if(this.rand()>Number(rule.probability??1))continue;const si=side?j:i,oi=side?i:j;if(rule.productA){const p=this.materialByKey(rule.productA);if(p)this.mat[si]=p.id;}if(rule.productB){const p=this.materialByKey(rule.productB);if(p)this.mat[oi]=p.id;}if(rule.heat){this.temp[si]+=Number(rule.heat);this.temp[oi]+=Number(rule.heat)*.5;}if(rule.pressure){this.pressure[si]+=Number(rule.pressure);this.pressure[oi]+=Number(rule.pressure)*.5;}if(rule.create){const [x,y]=this.xy(si),spots=[[1,0],[-1,0],[0,1],[0,-1]];for(const [dx,dy] of spots){if(this.inside(x+dx,y+dy)){const n=this.idx(x+dx,y+dy);if(this.mat[n]===0){this.mat[n]=this.materialByKey(rule.create).id;break;}}}}return true;}
    }
    return false;
  }
  reactNeighbors(i,mat){const [x,y]=this.xy(i);const dirs=this.tick%2?[[1,0],[0,1],[-1,0],[0,-1]]:[[-1,0],[0,-1],[1,0],[0,1]];for(const [dx,dy] of dirs){const nx=x+dx,ny=y+dy;if(!this.inside(nx,ny))continue;const j=this.idx(nx,ny),b=this.materialAt(j);if(b.id===0)continue;if(this.builtInReaction(i,j,mat,b)||this.customReaction(i,j,mat,b))return true;}
    return false;
  }
  stepCell(i){
    if(this.mat[i]===0){this.temp[i]=lerp(this.temp[i],this.ambientTemperature,.015);this.pressure[i]*=.93;this.charge[i]*=.8;return;}
    if(this.sink[i]){this.mat[i]=0;this.temp[i]=this.ambientTemperature;this.pressure[i]=0;return;}
    if(this.source[i])this.mat[i]=this.source[i];
    let mat=this.materialAt(i); this.phaseTransition(i,mat); mat=this.materialAt(i);
    if(mat.flammability>0&&this.temp[i]>mat.ignitionPoint&&this.rand()<.025+mat.burnRate*.06){this.ignite(i,mat);return;}
    if(mat.state===STATE.ENERGY){
      if(mat.key==='fire'){this.life[i]=Math.max(0,this.life[i]-1);this.temp[i]=Math.max(500,this.temp[i]-5);if(this.life[i]===0){this.mat[i]=this.rand()<.65?this.materialByKey('smoke').id:0;return;}}
      if(mat.key==='spark'){this.life[i]=Math.max(0,this.life[i]-5);this.charge[i]=1;this.temp[i]=Math.max(this.temp[i],700);if(this.life[i]===0)this.mat[i]=0;}
    }
    if(this.reactNeighbors(i,mat))mat=this.materialAt(i);
    const [x,y]=this.xy(i),[gx,gy]=this.gravityVector();const fx=this.fanX[i],fy=this.fanY[i];
    if(mat.key==='brine'&&Math.abs(this.charge[i])>.55&&this.rand()<.05){const gas=this.charge[i]>0?'oxygen':'flammable-gas';for(const [ox,oy] of [[0,-1],[1,0],[-1,0]])if(this.inside(x+ox,y+oy)){const n=this.idx(x+ox,y+oy);if(this.mat[n]===0){this.mat[n]=this.materialByKey(gas).id;this.temp[n]=45;break;}}this.temp[i]+=6;}
    if(mat.key==='plant'&&this.temp[i]>4&&this.temp[i]<48&&this.rand()<.018){let wet=false;for(const [ox,oy] of [[1,0],[-1,0],[0,1],[0,-1]])if(this.inside(x+ox,y+oy)){const n=this.idx(x+ox,y+oy),k=this.materialAt(n).key;if(k==='water'||k==='soil')wet=true;}if(wet){const candidates=[[0,-1],[1,0],[-1,0]];for(const [ox,oy] of candidates){if(this.inside(x+ox,y+oy)){const n=this.idx(x+ox,y+oy);if(this.mat[n]===0){this.mat[n]=mat.id;this.temp[n]=this.temp[i];break;}}}}}
    if(this.anchor[i]||mat.state===STATE.SOLID||(mat.state===STATE.BIO&&!['biofilm','parasite'].includes(mat.key)))return;
    if(mat.state===STATE.POWDER||mat.key==='seed'){
      const main=[x+gx+fx,y+gy+fy];if(this.tryMove(i,main[0],main[1]))return;
      const px=-gy,py=gx,first=this.rand()<.5?1:-1;
      if(this.tryMove(i,x+gx+px*first,y+gy+py*first))return;
      this.tryMove(i,x+gx-px*first,y+gy-py*first);return;
    }
    if(mat.state===STATE.LIQUID||mat.state===STATE.BIO){
      if(this.tryMove(i,x+gx+fx,y+gy+fy))return;const px=-gy,py=gx,range=1+Math.floor((1-clamp(mat.viscosity,0,1))*3),first=this.rand()<.5?1:-1;
      for(let d=1;d<=range;d+=1){if(this.tryMove(i,x+px*d*first+fx,y+py*d*first+fy))return;if(this.tryMove(i,x-px*d*first+fx,y-py*d*first+fy))return;}return;
    }
    if(mat.state===STATE.GAS||mat.state===STATE.ENERGY){
      const ux=-gx+fx,uy=-gy+fy;if(this.tryMove(i,x+ux,y+uy))return;const px=-gy,py=gx,first=this.rand()<.5?1:-1;if(this.tryMove(i,x+px*first+fx,y+py*first+fy))return;this.tryMove(i,x-px*first+fx,y-py*first+fy);
    }
  }
  diffuseFields(){
    const w=this.width,h=this.height;for(let y=1;y<h-1;y+=1)for(let x=1;x<w-1;x+=1){const i=y*w+x;if(this.mat[i]===0&&this.pressure[i]<.02&&Math.abs(this.temp[i]-this.ambientTemperature)<.2)continue;const j=i+(this.rand()<.5?1:w);const a=this.materialAt(i),b=this.materialAt(j);const k=Math.min(.25,(a.conductivity+b.conductivity)*.06);const delta=(this.temp[j]-this.temp[i])*k;this.temp[i]+=delta/Math.max(.2,a.heatCapacity);this.temp[j]-=delta/Math.max(.2,b.heatCapacity);
      const pd=(this.pressure[j]-this.pressure[i])*.08;this.pressure[i]+=pd;this.pressure[j]-=pd;this.pressure[i]*=.985;
      if(a.electrical>.2&&b.electrical>.2){const cd=(this.charge[j]-this.charge[i])*.35*Math.min(a.electrical,b.electrical);this.charge[i]+=cd;this.charge[j]-=cd;this.temp[i]+=Math.abs(cd)*12;}else this.charge[i]*=.82;
      if((a.state===STATE.GAS||a.state===STATE.ENERGY)&&this.temp[i]>100)this.pressure[i]+=Math.min(1,(this.temp[i]-100)/1000);
      if(this.pressure[i]>4&&b.state===STATE.SOLID&&!this.anchor[j]){this.damage[j]=clamp(this.damage[j]+this.pressure[i]*.7,0,255);if(this.damage[j]>(b.strength*(1-b.brittleness*.45))*220){this.mat[j]=b.key==='glass'?0:this.materialByKey('ash').id;this.pressure[j]+=this.pressure[i]*.55;}}
    }
  }
  step(iterations=1){
    for(let s=0;s<iterations;s+=1){this.tick+=1;let processed=0;const reverse=this.tick%2===0;for(let y=reverse?this.height-1:0;reverse?y>=0:y<this.height;reverse?y-=1:y+=1){for(let x=reverse?this.width-1:0;reverse?x>=0:x<this.width;reverse?x-=1:x+=1){const i=this.idx(x,y);if(this.mat[i]!==0||this.pressure[i]>.01||this.source[i]||this.sink[i]){this.stepCell(i);processed+=1;if(processed>=this.activeBudget)break;}}if(processed>=this.activeBudget)break;}this.diffuseFields();}
  }
  countMaterial(key){const id=this.materialByKey(key).id;let count=0;for(const value of this.mat)if(value===id)count+=1;return count;}
  regionStats(x0,y0,x1,y1){const minX=clamp(Math.min(x0,x1),0,this.width-1),maxX=clamp(Math.max(x0,x1),0,this.width-1),minY=clamp(Math.min(y0,y1),0,this.height-1),maxY=clamp(Math.max(y0,y1),0,this.height-1);const counts=new Map();let temp=0,pressure=0,charge=0,total=0;for(let y=minY;y<=maxY;y+=1)for(let x=minX;x<=maxX;x+=1){const i=this.idx(x,y),m=this.materialAt(i);counts.set(m.key,(counts.get(m.key)||0)+1);temp+=this.temp[i];pressure+=this.pressure[i];charge+=this.charge[i];total+=1;}return{total,temperature:temp/Math.max(1,total),pressure:pressure/Math.max(1,total),charge:charge/Math.max(1,total),composition:[...counts].sort((a,b)=>b[1]-a[1]).slice(0,8)};}
  snapshot(){return{version:FORMAT_VERSION,width:this.width,height:this.height,tick:this.tick,gravityAngle:this.gravityAngle,ambientTemperature:this.ambientTemperature,customMaterials:this.customMaterials,arrays:{mat:rleEncode(this.mat),temp:rleEncode(this.temp,10),pressure:rleEncode(this.pressure,100),charge:rleEncode(this.charge,100),life:rleEncode(this.life),damage:rleEncode(this.damage),anchor:rleEncode(this.anchor),source:rleEncode(this.source),sink:rleEncode(this.sink),fanX:rleEncode(this.fanX),fanY:rleEncode(this.fanY)}};}
  restore(data){
    const migrated=migrateSnapshot(data);if(!migrated||migrated.width*migrated.height>MAX_WORLD_CELLS)throw new Error('Файл мира повреждён или слишком велик.');this.width=migrated.width;this.height=migrated.height;this.size=this.width*this.height;this.setCustomMaterials(migrated.customMaterials||[]);const a=migrated.arrays;
    this.mat=rleDecode(a.mat,Uint16Array,this.size);this.temp=rleDecode(a.temp,Float32Array,this.size,10);this.pressure=rleDecode(a.pressure,Float32Array,this.size,100);this.charge=rleDecode(a.charge,Float32Array,this.size,100);this.life=rleDecode(a.life,Uint8Array,this.size);this.damage=rleDecode(a.damage,Uint8Array,this.size);this.anchor=rleDecode(a.anchor,Uint8Array,this.size);this.source=rleDecode(a.source,Uint16Array,this.size);this.sink=rleDecode(a.sink,Uint8Array,this.size);this.fanX=rleDecode(a.fanX,Int8Array,this.size);this.fanY=rleDecode(a.fanY,Int8Array,this.size);this.vx=new Int8Array(this.size);this.vy=new Int8Array(this.size);this.tick=migrated.tick||0;this.gravityAngle=migrated.gravityAngle??90;this.ambientTemperature=migrated.ambientTemperature??20;
  }
}

export function migrateSnapshot(data){
  if(!data||typeof data!=='object')return null;let out=structuredClone(data);if(!out.version)out.version=1;if(out.version===1){out.arrays.charge=out.arrays.charge||[0,out.width*out.height];out.arrays.damage=out.arrays.damage||[0,out.width*out.height];out.arrays.anchor=out.arrays.anchor||[0,out.width*out.height];out.arrays.source=out.arrays.source||[0,out.width*out.height];out.arrays.sink=out.arrays.sink||[0,out.width*out.height];out.arrays.fanX=out.arrays.fanX||[0,out.width*out.height];out.arrays.fanY=out.arrays.fanY||[0,out.width*out.height];out.version=2;}if(out.version!==FORMAT_VERSION||!Number.isInteger(out.width)||!Number.isInteger(out.height)||!out.arrays?.mat)return null;return out;
}

export function cloneRegion(engine,x0,y0,x1,y1){const minX=clamp(Math.min(x0,x1),0,engine.width-1),maxX=clamp(Math.max(x0,x1),0,engine.width-1),minY=clamp(Math.min(y0,y1),0,engine.height-1),maxY=clamp(Math.max(y0,y1),0,engine.height-1),width=maxX-minX+1,height=maxY-minY+1;const cells=[];for(let y=0;y<height;y+=1)for(let x=0;x<width;x+=1){const i=engine.idx(minX+x,minY+y);cells.push([engine.mat[i],engine.temp[i],engine.pressure[i],engine.charge[i],engine.damage[i],engine.anchor[i],engine.source[i],engine.sink[i],engine.fanX[i],engine.fanY[i]]);}return{width,height,cells};}
export function pasteRegion(engine,region,x0,y0){if(!region?.cells)return;let c=0;for(let y=0;y<region.height;y+=1)for(let x=0;x<region.width;x+=1){const tx=x0+x,ty=y0+y,cell=region.cells[c++];if(!engine.inside(tx,ty))continue;const i=engine.idx(tx,ty);engine.mat[i]=cell[0];engine.temp[i]=cell[1];engine.pressure[i]=cell[2];engine.charge[i]=cell[3];engine.damage[i]=cell[4];engine.anchor[i]=cell[5];engine.source[i]=cell[6];engine.sink[i]=cell[7];engine.fanX[i]=cell[8];engine.fanY[i]=cell[9];}}
