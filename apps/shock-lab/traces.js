// Two pressure transducers and a spatial lineout, independent of UI / Canvas.
// Samples use nondimensional solver time, not wall-clock animation frames.
const bound=(v,min,max)=>Math.max(min,Math.min(max,v));
export const DEFAULT_SENSORS=[{x:.59,y:.50},{x:.79,y:.50}];
export class TraceRecorder {
  constructor(sensors=DEFAULT_SENSORS) {
    this.sensors=[];
    this.setSensors(sensors);
  }
  setSensors(sensors) {
    if (!Array.isArray(sensors)||sensors.length!==2) throw new Error('Two sensors required');
    this.sensors=sensors.map(p=>({
      x:bound(Number.isFinite(p?.x)?p.x:.5,0,1),
      y:bound(Number.isFinite(p?.y)?p.y:.5,0,1)
    }));
    this.clear();
  }
  moveSensor(index,position) {
    if(!Number.isInteger(index)||index<0||index>1)throw new Error('Invalid transducer');
    const next=this.sensors.map(p=>({...p}));
    next[index]={x:bound(position.x,0,1),y:bound(position.y,0,1)};
    this.setSensors(next);
  }
  clear() {
    this.samples=[];
    this.arrival=[null,null];
    this.baseline=[null,null];
    this.lastSampleTime=-Infinity;
    this.previous=null;
  }
  read(field) {
    return this.sensors.map(p=>field.sample(p.x*(field.nx-1),p.y*(field.ny-1)));
  }
  record(field,force=false) {
    if(!field||!Number.isFinite(field.time))return false;
    if(!force&&field.time-this.lastSampleTime<.115)return false;
    const states=this.read(field);
    if(states.some(s=>s.solid))return false;
    const t=field.time, pressures=states.map(s=>s.pressure);
    if(pressures.some(p=>!Number.isFinite(p)))return false;
    if(this.baseline[0]===null)this.baseline=pressures.slice();
    const sample={t,a:pressures[0],b:pressures[1]};
    this.samples.push(sample);
    if(this.samples.length>480)this.samples.shift();
    for(let i=0;i<2;i++) {
      if(this.arrival[i]!==null)continue;
      const baseline=this.baseline[i],threshold=baseline+Math.max(.10,baseline*.12);
      const current=pressures[i],prev=this.previous?.[i];
      if(current>=threshold && prev!==undefined && prev<threshold) {
        const prevT=this.previous[2];
        const fraction=(threshold-prev)/Math.max(1e-9,current-prev);
        this.arrival[i]=prevT+bound(fraction,0,1)*(t-prevT);
      }
    }
    this.previous=[pressures[0],pressures[1],t];
    this.lastSampleTime=t;
    return true;
  }
  speed(field) {
    const [a,b]=this.arrival;
    if(a===null||b===null||Math.abs(a-b)<.001)return null;
    const distance=Math.hypot(
      (this.sensors[1].x-this.sensors[0].x)*(field.nx-1),
      (this.sensors[1].y-this.sensors[0].y)*(field.ny-1)
    );
    // Valid as a projected speed only when the wave reaches sensors sequentially
    // along their baseline without complicated reflection.
    return distance/Math.abs(b-a);
  }
  profile(field,y=.5) {
    const iy=bound(Math.round(y*(field.ny-1)),0,field.ny-1);
    const result=[];
    for(let x=0;x<field.nx;x++) {
      const s=field.sample(x,iy);
      result.push(s.solid?null:s.pressure);
    }
    return result;
  }
  csv() {
    return ['time,P_A_over_P0,P_B_over_P0',
      ...this.samples.map(s=>[s.t,s.a,s.b].map(n=>n.toFixed(6)).join(','))
    ].join('\n')+'\n';
  }
}
