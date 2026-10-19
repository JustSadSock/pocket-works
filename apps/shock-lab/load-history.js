// Time-resolved pressure-load recording in solver time, not animation time.
// Samples are taken only from the real Euler pressure integrations.
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export class LoadHistory {
  constructor(maxSamples=420) {
    this.maxSamples=maxSamples;
    this.samples=[];
    this.last=-Infinity;
  }
  clear(){this.samples=[];this.last=-Infinity;}
  record(field, interval=.13,force=false){
    if(!field?.flowActive || !field?.bodyBounds)return false;
    const t=field.time;
    if(!Number.isFinite(t)||(!force&&t-this.last<interval))return false;
    const v=field.aeroForces();
    if(!v || ![v.cl,v.cd,v.cm].every(Number.isFinite))return false;
    const wake=field.wakeVorticity();
    const row={t,cl:v.cl,cd:v.cd,cm:v.cm,omega:wake.rms,gust:field.gustAngle};
    this.samples.push(row);
    if(this.samples.length>this.maxSamples)this.samples.shift();
    this.last=t;
    return true;
  }
  stats(windowTime=16){
    if(!this.samples.length)return null;
    const end=this.samples[this.samples.length-1].t;
    const points=this.samples.filter(s=>s.t>=end-clamp(windowTime,1,120));
    if(!points.length)return null;
    const mean=(key)=>points.reduce((a,x)=>a+x[key],0)/points.length;
    const clMean=mean('cl'),cdMean=mean('cd'),cmMean=mean('cm');
    const clRms=Math.sqrt(points.reduce((a,x)=>a+(x.cl-clMean)**2,0)/points.length);
    const omegaRms=Math.sqrt(points.reduce((a,x)=>a+x.omega*x.omega,0)/points.length);
    return {count:points.length,clMean,cdMean,cmMean,clRms,omegaRms,
      clMin:Math.min(...points.map(x=>x.cl)),clMax:Math.max(...points.map(x=>x.cl))};
  }
  csv(){
    return ['time,CL,CD_pressure,Cm_quarter_chord,wake_vorticity_rms,inlet_gust_degrees',
      ...this.samples.map(s=>[s.t,s.cl,s.cd,s.cm,s.omega,s.gust].map(v=>v.toFixed(6)).join(','))].join('\n')+'\n';
  }
}
