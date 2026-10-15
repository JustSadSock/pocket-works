// Motion is only a temporary visual layer; it never mutates saved room coordinates,
// materials, mesh geometry or collision data. Everything can be interrupted at once.
export const clamp01 = n => Math.max(0, Math.min(1, n));
export const easeOut = t => 1 - Math.pow(1-clamp01(t), 3);
export const smooth = t => { const n=clamp01(t); return n*n*(3-2*n); };
export const settleWave = t => Math.sin(clamp01(t)*Math.PI*3)*Math.exp(-clamp01(t)*6);
export const MOTION = Object.freeze({
  sofa:{lift:.105,settle:370,squash:.062,wobble:0},
  chair:{lift:.13,settle:330,squash:.056,wobble:0},
  bed:{lift:.09,settle:420,squash:.040,wobble:0},
  coffee:{lift:.13,settle:240,squash:.012,wobble:0},
  shelf:{lift:.075,settle:290,squash:.015,wobble:0},
  stool:{lift:.14,settle:220,squash:.020,wobble:0},
  floorlamp:{lift:.11,settle:300,squash:.005,wobble:.026},
  tablelamp:{lift:.13,settle:240,squash:.006,wobble:.030},
  plant:{lift:.12,settle:520,squash:0,wobble:.070},
  rug:{lift:.045,settle:385,squash:0,wobble:0},
  books:{lift:.13,settle:280,squash:.012,wobble:.055},
  mug:{lift:.14,settle:330,squash:.004,wobble:.11},
  frame:{lift:.045,settle:240,squash:0,wobble:.012},
  window:{lift:.045,settle:260,squash:0,wobble:0}
});
const defaults={lift:.12,settle:300,squash:0,wobble:0};
export function motionProfile(type){return MOTION[type]||defaults;}
const vector = v => ({x:v.x,y:v.y,z:v.z});
export function createMotionDirector({getRoot,getItem,getItems=()=>[],reducedMotion=()=>false}){
  const actions=new Map(), retired=[], linkedChildren=new Set();
  const baseline=new WeakMap();
  let now=0;
  function children(root){
    if(!baseline.has(root)){
      const list=root.getChildMeshes(false).map((mesh,i)=>({
        mesh,index:i,baseRotation:vector(mesh.rotation),
        baseScale:vector(mesh.scaling),
        basePosition:vector(mesh.position)
      }));
      baseline.set(root,list);
    }
    return baseline.get(root);
  }
  function clearChildren(root){
    if(!root||root.isDisposed())return;
    for(const part of children(root)){
      if(part.mesh.isDisposed())continue;
      part.mesh.rotation.set(part.baseRotation.x,part.baseRotation.y,part.baseRotation.z);
      part.mesh.scaling.set(part.baseScale.x,part.baseScale.y,part.baseScale.z);
      part.mesh.position.set(part.basePosition.x,part.basePosition.y,part.basePosition.z);
    }
  }
  function reset(id){
    actions.delete(id);
    const root=getRoot(id),item=getItem(id);
    if(!root||!item||root.isDisposed())return;
    root.position.set(item.x,item.y||0,item.z);
    root.rotation.set(0,(item.rot||0)*Math.PI/2,0);
    root.scaling.setAll(1);
    clearChildren(root);
  }
  function begin(id,kind,extras={}){
    const item=getItem(id);
    if(!item)return;
    if(reducedMotion()){reset(id);return;}
    actions.set(id,{kind,type:item.type,t:now,from:extras.from||null,angle:extras.angle,
      dx:extras.dx||0,dz:extras.dz||0,valid:true,initial:extras.initial||false});
  }
  function lift(id){begin(id,'held');}
  function drag(id,dx=0,dz=0,valid=true){
    let a=actions.get(id);
    if(!a||a.kind!=='held'){lift(id);a=actions.get(id);}
    if(a){a.dx=dx;a.dz=dz;a.valid=valid;}
  }
  function land(id){begin(id,'land');}
  function appear(id){begin(id,'appear',{initial:true});}
  function rotate(id,previousAngle,from=null){begin(id,'rotate',{angle:previousAngle,from});}
  function refuse(id){begin(id,'refuse');}
  function touch(id){begin(id,'touch');}
  function retire(id,root){
    actions.delete(id);
    if(!root||root.isDisposed())return;
    root.getChildMeshes(false).forEach(mesh=>mesh.isPickable=false);
    if(reducedMotion()){root.dispose(false,false);return;}
    retired.push({root,t:now});
  }
  function forget(id){actions.delete(id);}
  function tick(timestamp){
    now=timestamp;
    const reduced=reducedMotion();
    let active=false;
    for(const [id,a] of actions){
      const root=getRoot(id),item=getItem(id);
      if(!root||root.isDisposed()||!item){actions.delete(id);continue;}
      if(reduced){reset(id);continue;}
      const p=motionProfile(item.type),elapsed=Math.max(0,timestamp-a.t);
      const duration=a.kind==='rotate'?215:a.kind==='refuse'?170:a.kind==='touch'?160:p.settle;
      const t=clamp01(elapsed/duration),e=easeOut(t),wave=settleWave(t);
      root.position.set(item.x,item.y||0,item.z);
      root.rotation.set(0,(item.rot||0)*Math.PI/2,0);
      root.scaling.setAll(1);
      if(a.kind==='held'){
        // Picking stays immediate in X/Z; only vertical lift and a small lean are eased.
        const raise=easeOut(clamp01(elapsed/110));
        root.position.y+=p.lift*raise;
        root.scaling.setAll(1+.020*raise);
        root.rotation.z=clamp01(Math.abs(a.dx)/.5)*(a.dx>0?-.027:.027);
        root.rotation.x=clamp01(Math.abs(a.dz)/.5)*(a.dz>0?.025:-.025);
        if(!a.valid)root.scaling.setAll(1.005);
        active=true;continue;
      }
      if(a.kind==='appear'||a.kind==='land'){
        const drop=(a.kind==='appear'?.23:p.lift)*(1-e);
        root.position.y+=drop;
        const impact=Math.max(0,Math.sin(Math.PI*clamp01((t-.34)/.50))) * (1-t);
        root.scaling.x=1+p.squash*impact*.7;
        root.scaling.z=1+p.squash*impact*.7;
        root.scaling.y=1-p.squash*impact;
        if(item.type==='rug'&&a.kind==='appear')root.scaling.z=.16+.84*easeOut(t);
        if(item.type==='plant')root.rotation.z=p.wobble*wave;
        if(item.type==='mug')root.rotation.z=p.wobble*wave;
      }else if(a.kind==='rotate'){
        const target=(item.rot||0)*Math.PI/2;
        root.rotation.y=target+((a.angle===undefined?target:a.angle)-target)*(1-e);
        if(a.from){
          root.position.x=(a.from.x??item.x)*(1-e)+item.x*e;
          root.position.z=(a.from.z??item.z)*(1-e)+item.z*e;
        }
        root.scaling.setAll(1+.013*Math.sin(Math.PI*t));
      }else if(a.kind==='touch'){
        root.scaling.setAll(1+.028*Math.sin(Math.PI*t)*(1-t));
      }else if(a.kind==='refuse'){
        root.position.x+=.055*Math.sin(t*Math.PI*3)*(1-t);
        root.rotation.z=.017*Math.sin(t*Math.PI*3)*(1-t);
      }
      for(const part of children(root)){
        if(part.mesh.isDisposed())continue;
        if((item.type==='sofa'||item.type==='chair'||item.type==='bed')&&
            /cushion|pillow|duvet/.test(part.mesh.name)){
          const pulse=Math.max(0,Math.sin(Math.PI*clamp01((t-.28)/.55)))*(1-t);
          part.mesh.scaling.y=part.baseScale.y*(1-p.squash*.60*pulse);
        }
        if(item.type==='plant'&&part.mesh.name==='pointed-leaf'){
          part.mesh.rotation.z=part.baseRotation.z+
            Math.sin(part.index*1.9)*p.wobble*wave;
        }
        if(item.type==='books'&&part.mesh.name==='little-book')
          part.mesh.rotation.z=part.baseRotation.z+
            Math.sin(part.index*1.7)*p.wobble*wave;
      }
      if(t>=1){reset(id);}else active=true;
    }
    // A lamp, mug or stack of books is a separate root, not a child mesh of
    // the table. Transfer the table's *animated* lift to those roots too.
    // Positions in the saved game remain untouched.
    for(const child of getItems()){
      if(!child.support)continue;
      const parent=getItem(child.support),parentRoot=getRoot(child.support),childRoot=getRoot(child.id);
      if(!parent||!parentRoot||!childRoot||parentRoot.isDisposed()||childRoot.isDisposed())continue;
      const movingParent=actions.has(parent.id)&&!reduced;
      if(!movingParent&&!linkedChildren.has(child.id))continue;
      const base=child.y||0;
      const ownOffset=actions.has(child.id)?childRoot.position.y-base:0;
      const lift=movingParent?parentRoot.position.y-(parent.y||0):0;
      childRoot.position.y=base+ownOffset+lift;
      if(movingParent)linkedChildren.add(child.id);
      else linkedChildren.delete(child.id);
    }
    for(let i=retired.length-1;i>=0;i--){
      const r=retired[i],t=clamp01((timestamp-r.t)/170);
      if(r.root.isDisposed()){retired.splice(i,1);continue;}
      r.root.scaling.setAll(Math.max(.001,1-easeOut(t)));
      r.root.position.y+=.001; // avoid sudden visual cut
      if(t>=1){r.root.dispose(false,false);retired.splice(i,1);}
      else active=true;
    }
    return active || actions.size>0 || retired.length>0;
  }
  return {lift,drag,land,appear,rotate,refuse,touch,retire,forget,tick,reset,hasMotion:()=>actions.size>0||retired.length>0};
}
