// On-policy PPO-Clip on the existing 249 -> 24 -> 16 -> (5 actions + V) MLP.
// Implemented in plain JS for deterministic browser/Worker execution.
// No gradients are taken from evaluation or manual replay.
import {ACTIONS,GridEnvironment,seeded} from './lab-core.mjs';
import {NeuralActorCritic,validateNeuralPolicy} from './neural-policy.mjs';

export const PPO_KIND='neural-ppo';
export const PPO_DEFAULTS=Object.freeze({
 gamma:.97,gaeLambda:.95,clipEpsilon:.2,learningRate:.0007,
 valueCoef:.5,entropyCoef:.006,maxGradNorm:.7,
 rolloutSteps:512,epochs:3,minibatchSize:64,targetKL:.055
});
const clamp=(x,low,high)=>Math.max(low,Math.min(high,x));
const safeLog=x=>Math.log(Math.max(1e-10,x));
export function validatePpoPolicy(model){
 return !!model&&model.type===PPO_KIND&&model.training?.algorithm==='ppo-clip'&&
  validateNeuralPolicy({...model,type:'neural-actor-critic'});
}
function emptyGradient(network){
 return {
  w:network.weights.map(layer=>layer.map(row=>new Float64Array(row.length))),
  b:network.biases.map(layer=>new Float64Array(layer.length))
 };
}
export class PpoPolicy extends NeuralActorCritic {
 constructor(seed=17){super(seed);}
 serialize(){
  const s=super.serialize();
  s.type=PPO_KIND;
  s.training={...PPO_DEFAULTS,algorithm:'ppo-clip'};
  return s;
 }
 load(model){
  if(!validatePpoPolicy(model))throw Error('Неверный PPO checkpoint');
  super.load({...model,type:'neural-actor-critic'});
 }
 // PPO must only learn from intact, on-policy rollout batches.
 learn(){}
 sample(obs){
  const {probabilities,value}=this.forward(obs);
  let remaining=this.rng(),index=probabilities.length-1;
  for(let i=0;i<probabilities.length;i++){
   remaining-=probabilities[i];
   if(remaining<=0){index=i;break;}
  }
  return {action:ACTIONS[index],actionIndex:index,logProb:safeLog(probabilities[index]),value};
 }
 updateMinibatch(samples,params=PPO_DEFAULTS){
  if(!samples.length)throw Error('Пустой PPO minibatch');
  const gradient=emptyGradient(this);
  let policyLoss=0,valueLoss=0,entropy=0,approxKL=0,clipped=0;
  for(const item of samples){
   const current=this.forward(item.obs),p=current.probabilities;
   const logProb=safeLog(p[item.actionIndex]);
   const ratio=Math.exp(clamp(logProb-item.logProb,-20,20));
   const clippedRatio=clamp(ratio,1-params.clipEpsilon,1+params.clipEpsilon);
   const raw=ratio*item.advantage,limited=clippedRatio*item.advantage;
   const objective=Math.min(raw,limited);
   policyLoss-=objective;
   const stopGradient=(item.advantage>0&&ratio>1+params.clipEpsilon)||
    (item.advantage<0&&ratio<1-params.clipEpsilon);
   const coeff=stopGradient?0:-item.advantage*ratio;
   if(Math.abs(ratio-1)>params.clipEpsilon)clipped++;
   const sumPL=p.reduce((sum,v)=>sum+v*safeLog(v),0);
   entropy-=sumPL;
   const delta=new Float64Array(6);
   for(let i=0;i<5;i++){
    delta[i]=coeff*((i===item.actionIndex?1:0)-p[i])+
     params.entropyCoef*p[i]*(safeLog(p[i])-sumPL);
   }
   const valueDifference=clamp(current.value-item.returnValue,-20,20);
   valueLoss+=.5*valueDifference*valueDifference;
   delta[5]=params.valueCoef*valueDifference;
   approxKL+=item.logProb-logProb;
   // Chain rule through both tanh layers. We accumulate derivatives before
   // changing weights, i.e. one update per minibatch, not per sample.
   let d=delta;
   for(let layer=2;layer>=0;layer--){
    const previous=current.activations[layer],next=new Float64Array(previous.length);
    for(let i=0;i<d.length;i++){
     gradient.b[layer][i]+=d[i];
     for(let j=0;j<previous.length;j++){
      gradient.w[layer][i][j]+=d[i]*previous[j];
      next[j]+=this.weights[layer][i][j]*d[i];
     }
    }
    if(layer>0){
     for(let j=0;j<next.length;j++)next[j]*=(1-previous[j]*previous[j]);
     d=next;
    }
   }
  }
  const n=samples.length;let normSq=0;
  for(let layer=0;layer<3;layer++){
   for(const v of gradient.b[layer])normSq+=(v/n)**2;
   for(const row of gradient.w[layer])for(const v of row)normSq+=(v/n)**2;
  }
  const norm=Math.sqrt(normSq),scale=params.learningRate*Math.min(1,params.maxGradNorm/(norm+1e-9))/n;
  if(!Number.isFinite(scale))throw Error('PPO gradient overflow');
  for(let layer=0;layer<3;layer++){
   for(let i=0;i<this.weights[layer].length;i++){
    this.biases[layer][i]-=scale*gradient.b[layer][i];
    for(let j=0;j<this.weights[layer][i].length;j++)this.weights[layer][i][j]-=scale*gradient.w[layer][i][j];
   }
  }
  this.updates++;
  return {policyLoss:policyLoss/n,valueLoss:valueLoss/n,entropy:entropy/n,
   approxKL:approxKL/n,clipFraction:clipped/n,gradNorm:norm};
 }
}
export function computeGAE(steps,{gamma=PPO_DEFAULTS.gamma,gaeLambda=PPO_DEFAULTS.gaeLambda}={},bootstrap=0){
 if(!Array.isArray(steps)||!steps.length)return [];
 let advantage=0,nextValue=bootstrap;
 const out=Array(steps.length);
 for(let i=steps.length-1;i>=0;i--){
  const step=steps[i],continuation=step.done?0:1;
  const residual=step.reward+gamma*nextValue*continuation-step.value;
  advantage=residual+gamma*gaeLambda*continuation*advantage;
  out[i]={...step,advantage,returnValue:advantage+step.value};
  nextValue=step.value;
 }
 return out;
}
export class PpoTrainer {
 constructor(policy,options={}){
  if(!(policy instanceof PpoPolicy))throw Error('PPO requires PpoPolicy');
  this.policy=policy;
  this.settings={...PPO_DEFAULTS,...options};
  this.buffer=[];this.rng=seeded(Number(options.seed)||2026);
  this.lastMetrics=null;this.stepsSeen=0;this.optimizations=0;
 }
 add(obs,step,actionIndex,logProb,value){
  if(!Number.isFinite(step.reward)||!Number.isFinite(logProb)||!Number.isFinite(value))
   throw Error('PPO rollout is not finite');
  this.buffer.push({obs,actionIndex,logProb,value,reward:step.reward,done:step.done});
  this.stepsSeen++;
 }
 get ready(){return this.buffer.length>=this.settings.rolloutSteps;}
 optimize(bootstrap=0){
  if(!this.buffer.length)return this.lastMetrics;
  const training=computeGAE(this.buffer,this.settings,bootstrap);
  const mean=training.reduce((sum,s)=>sum+s.advantage,0)/training.length;
  const variance=training.reduce((sum,s)=>sum+(s.advantage-mean)**2,0)/training.length;
  const scale=Math.sqrt(variance+1e-8);
  for(const sample of training)sample.advantage=(sample.advantage-mean)/scale;
  const indices=training.map((_,i)=>i),measure=[];
  const {epochs,minibatchSize,targetKL}=this.settings;
  let earlyStopped=false;
  for(let epoch=0;epoch<epochs;epoch++){
   for(let i=indices.length-1;i>0;i--){
    const j=Math.floor(this.rng()*(i+1));[indices[i],indices[j]]=[indices[j],indices[i]];
   }
   const thisEpoch=[];
   for(let offset=0;offset<indices.length;offset+=minibatchSize){
    const subset=indices.slice(offset,offset+minibatchSize).map(i=>training[i]);
    const metrics=this.policy.updateMinibatch(subset,this.settings);
    thisEpoch.push(metrics);measure.push(metrics);
   }
   const kl=thisEpoch.reduce((sum,s)=>sum+s.approxKL,0)/thisEpoch.length;
   if(kl>targetKL){earlyStopped=true;break;}
  }
  const average=key=>measure.reduce((sum,m)=>sum+m[key],0)/measure.length;
  this.lastMetrics={
   steps:training.length,updates:measure.length,
   policyLoss:average('policyLoss'),valueLoss:average('valueLoss'),
   entropy:average('entropy'),approxKL:average('approxKL'),
   clipFraction:average('clipFraction'),gradNorm:average('gradNorm'),earlyStopped
  };
  this.optimizations++;this.buffer.length=0;
  return this.lastMetrics;
 }
}
export function ppoEpisode(trainer,scene,options={}){
 const env=new GridEnvironment(scene.grid[0].length,scene.grid.length,{maxSteps:options.maxSteps??320});
 env.setScene(scene);
 if(options.spawn)env.reset(options.spawn,scene.goal);
 let obs=env.observe();
 const trace=options.trace?[{x:env.ax,y:env.ay,reward:0,action:'START'}]:null;
 while(!env.done){
  const choice=trainer.policy.sample(obs);
  const [next,reward,done]=env.step(choice.action);
  trainer.add(obs,{reward,done},choice.actionIndex,choice.logProb,choice.value);
  if(trace)trace.push({x:env.ax,y:env.ay,reward,action:choice.action});
  obs=next;
 }
 return {success:env.success,reward:env.totalReward,steps:env.steps,trace};
}
