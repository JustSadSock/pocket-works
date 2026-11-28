// 2D game acoustics. Coordinates and reference distances are in game-world units.
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function num(x,def,min,max,label){
  const value=x??def;
  if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw new Error('Invalid '+label);
  return value;
}
function point(p){
  if(!p||typeof p!=='object')throw new Error('Expected acoustic position');
  return {x:num(p.x,0,-1e9,1e9,'x'),y:num(p.y,0,-1e9,1e9,'y')};
}
export const acousticZones=Object.freeze({
  open:Object.freeze({absorption:.002,reflection:.015,delay:.045}),
  forest:Object.freeze({absorption:.012,reflection:.08,delay:.065}),
  stone:Object.freeze({absorption:.003,reflection:.24,delay:.075}),
  interior:Object.freeze({absorption:.008,reflection:.16,delay:.035})
});
export function spatialProfile({source,listener,heading=0,referenceDistance=5,maxDistance=120,rolloff=1,occlusion=0,zone='open'}={}){
  const a=point(source),b=point(listener);
  const ref=num(referenceDistance,5,.01,1e6,'reference distance');
  const max=num(maxDistance,120,ref,1e7,'max distance');
  const falloff=num(rolloff,1,0,4,'rolloff');
  const blocked=num(occlusion,0,0,1,'occlusion');
  const angle=num(heading,0,-1e9,1e9,'heading');
  if(!Object.hasOwn(acousticZones,zone))throw new Error('Unknown acoustic zone');
  const material=acousticZones[zone],dx=a.x-b.x,dy=a.y-b.y,distance=Math.hypot(dx,dy);
  // Heading is a forward vector (cos,sin); right is (-sin,cos).
  const pan=distance===0?0:clamp((-Math.sin(angle)*dx+Math.cos(angle)*dy)/distance,-1,1);
  const far=Math.max(0,distance-ref);
  const fade=max===ref?(distance<=ref?1:0):clamp((max-distance)/Math.min(max-ref,Math.max(ref,max*.15)),0,1);
  const attenuation=1/(1+falloff*far/ref)**2;
  const gain=clamp(attenuation*fade*Math.exp(-material.absorption*far)*(1-.82*blocked),0,1);
  const cutoff=clamp(18000*Math.exp(-material.absorption*far*.85-3*blocked),300,18000);
  return {distance,pan,gain,cutoff,reflection:material.reflection*(1-.4*blocked),delay:material.delay};
}
// An opt-in mixer owns buses only. The app retains ownership of the AudioContext.
export function createSpatialMixer({context,destination=context?.destination,volume=1}={}){
  if(!context||!destination)throw new Error('Audio context and output required');
  const master=context.createGain();
  const buses=new Map();
  const compressor=typeof context.createDynamicsCompressor==='function'?context.createDynamicsCompressor():null;
  if(compressor){
    compressor.threshold.value=-12;compressor.knee.value=18;compressor.ratio.value=4;
    compressor.attack.value=.005;compressor.release.value=.15;
    master.connect(compressor);compressor.connect(destination);
  }else master.connect(destination);
  master.gain.value=num(volume,1,0,1,'volume');
  let closed=false;
  const bus=(id)=>{
    if(closed)throw new Error('Mixer destroyed');
    if(typeof id!=='string'||!id.length||id.length>64)throw new Error('Invalid bus');
    if(!buses.has(id)){
      if(buses.size>=16)throw new Error('Mixer bus budget exceeded');
      const node=context.createGain();node.connect(master);buses.set(id,node);
    }
    return buses.get(id);
  };
  const set=(node,value)=>{value=num(value,1,0,1,'volume');if(typeof node.gain.setTargetAtTime==='function')node.gain.setTargetAtTime(value,context.currentTime,.02);else node.gain.value=value;};
  return {bus,setBusVolume(id,value){set(bus(id),value)},setVolume(value){if(closed)throw new Error('Mixer destroyed');set(master,value)},destroy(){
    if(closed)return;closed=true;for(const n of buses.values())n.disconnect();buses.clear();master.disconnect();compressor?.disconnect();
  }};
}
