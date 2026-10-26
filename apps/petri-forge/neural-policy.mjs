// Small, inspectable CPU actor-critic network for a browser worker.
// This is genuine gradient-based reinforcement learning, NOT PPO (planned next).
// The 7x7 local tile observation is one-hot encoded; there is no pixel recognition.
import {ACTIONS,seeded} from './lab-core.mjs';
export const NEURAL_KIND='neural-actor-critic';
export const NEURAL_SHAPE=Object.freeze([249,24,16,6]);
const GAMMA=.97, LR=.0008, VALUE_WEIGHT=.5, ENTROPY=.008, CLIP=3;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function encodeObservation(obs){
 if(!obs||!Array.isArray(obs.tiles)||obs.tiles.length!==7||
   obs.tiles.some(row=>!Array.isArray(row)||row.length!==7)||
   !Array.isArray(obs.pos)||obs.pos.length!==2||!Array.isArray(obs.goalVec)||obs.goalVec.length!==2)
   throw Error('Нейросеть ожидает наблюдение 7×7 с координатами и целью');
 const x=new Float64Array(249);
 for(let row=0;row<7;row++)for(let col=0;col<7;col++){
  const tile=obs.tiles[row][col];
  if(!Number.isInteger(tile)||tile<0||tile>4)throw Error('Повреждённые клетки наблюдения');
  x[(row*7+col)*5+tile]=1;
 }
 const values=[obs.pos[0]/30,obs.pos[1]/20,obs.goalVec[0]/30,obs.goalVec[1]/20];
 for(let i=0;i<4;i++){if(!Number.isFinite(values[i]))throw Error('Неверные координаты наблюдения');x[245+i]=clamp(values[i],-1,1);}
 return x;
}
const randomWeights=(rows,columns,rng)=>{
 const spread=Math.sqrt(2/(rows+columns));
 return Array.from({length:rows},()=>Float64Array.from({length:columns},()=>(rng()*2-1)*spread));
};
function validateSnapshot(s){
 if(!s||s.type!==NEURAL_KIND||s.version!==1||JSON.stringify(s.architecture)!==JSON.stringify(NEURAL_SHAPE)||
  !Array.isArray(s.weights)||!Array.isArray(s.biases)||s.weights.length!==3||s.biases.length!==3)
  throw Error('Несовместимый нейросетевой мозг');
 for(let layer=0;layer<3;layer++){
  const input=NEURAL_SHAPE[layer],output=NEURAL_SHAPE[layer+1],weights=s.weights[layer],biases=s.biases[layer];
  if(!Array.isArray(weights)||weights.length!==output||!Array.isArray(biases)||biases.length!==output||
   biases.some(v=>!Number.isFinite(v)||Math.abs(v)>1e5))throw Error('Повреждённые смещения нейросети');
  for(const row of weights)if(!Array.isArray(row)||row.length!==input||
    row.some(v=>!Number.isFinite(v)||Math.abs(v)>1e5))throw Error('Повреждённые веса нейросети');
 }
 if(s.updates!==undefined&&(!Number.isSafeInteger(s.updates)||s.updates<0||s.updates>1e10))
  throw Error('Повреждённый счётчик обучения');
 return true;
}
export function validateNeuralPolicy(snapshot){
 try{return validateSnapshot(snapshot);}catch{return false;}
}
export class NeuralActorCritic {
 constructor(seed=17){
  this.rng=seeded(seed);
  this.weights=NEURAL_SHAPE.slice(1).map((rows,layer)=>randomWeights(rows,NEURAL_SHAPE[layer],this.rng));
  this.biases=NEURAL_SHAPE.slice(1).map(size=>new Float64Array(size));
  this.updates=0;
 }
 forward(obs){
  const activations=[encodeObservation(obs)];
  for(let layer=0;layer<3;layer++){
   const previous=activations[layer],out=new Float64Array(NEURAL_SHAPE[layer+1]);
   for(let i=0;i<out.length;i++){
    let sum=this.biases[layer][i],w=this.weights[layer][i];
    for(let j=0;j<previous.length;j++)sum+=w[j]*previous[j];
    out[i]=layer===2?sum:Math.tanh(sum);
   }
   activations.push(out);
  }
  const logits=activations[3],highest=Math.max(...logits.slice(0,5));
  const exps=new Float64Array(5);let total=0;
  for(let i=0;i<5;i++){exps[i]=Math.exp(clamp(logits[i]-highest,-60,0));total+=exps[i];}
  const probabilities=Array.from(exps,v=>v/total);
  return {activations,probabilities,value:clamp(logits[5],-100,100)};
 }
 act(obs,explore=true){
  const p=this.forward(obs).probabilities;
  if(!explore){const max=Math.max(...p);return ACTIONS[p.indexOf(max)];}
  let sample=this.rng();
  for(let i=0;i<p.length;i++){sample-=p[i];if(sample<=0)return ACTIONS[i];}
  return ACTIONS[4];
 }
 learn(s,action,reward,s2,done){
  const index=ACTIONS.indexOf(action);
  if(index<0||!Number.isFinite(reward))throw Error('Некорректное действие нейросети');
  const current=this.forward(s),next=done?0:this.forward(s2).value;
  const target=clamp(reward+GAMMA*next,-100,100);
  const advantage=clamp(target-current.value,-5,5);
  const {activations,probabilities:p}=current;
  // Loss = -log(pi(action|state))*advantage + 0.5*(V - TDtarget)^2.
  // Backpropagation through both trainable tanh layers, with grad norm clipping.
  const d=new Float64Array(6);
  for(let i=0;i<5;i++)d[i]=clamp((p[i]-(i===index?1:0))*advantage+ENTROPY*(p[i]-.2),-5,5);
  d[5]=clamp(VALUE_WEIGHT*(current.value-target),-5,5);
  const gradientsW=this.weights.map(layer=>layer.map(row=>new Float64Array(row.length)));
  const gradientsB=this.biases.map(layer=>new Float64Array(layer.length));
  let delta=d;
  for(let layer=2;layer>=0;layer--){
   const prev=activations[layer],grad=gradientsW[layer],before=new Float64Array(prev.length);
   for(let i=0;i<delta.length;i++){
    gradientsB[layer][i]=delta[i];
    for(let j=0;j<prev.length;j++){
     grad[i][j]=delta[i]*prev[j];
     before[j]+=this.weights[layer][i][j]*delta[i];
    }
   }
   if(layer>0){
    for(let j=0;j<before.length;j++)before[j]*=1-prev[j]*prev[j];
    delta=before;
   }
  }
  let normSquared=0;
  for(let layer=0;layer<3;layer++){
   for(const v of gradientsB[layer])normSquared+=v*v;
   for(const row of gradientsW[layer])for(const v of row)normSquared+=v*v;
  }
  const scale=Math.min(1,CLIP/(Math.sqrt(normSquared)+1e-9))*LR;
  for(let layer=0;layer<3;layer++){
   for(let i=0;i<this.weights[layer].length;i++){
    this.biases[layer][i]-=scale*gradientsB[layer][i];
    for(let j=0;j<this.weights[layer][i].length;j++)this.weights[layer][i][j]-=scale*gradientsW[layer][i][j];
   }
  }
  this.updates++;
 }
 serialize(){
  return {type:NEURAL_KIND,version:1,architecture:[...NEURAL_SHAPE],
   weights:this.weights.map(layer=>layer.map(row=>Array.from(row))),
   biases:this.biases.map(layer=>Array.from(layer)),updates:this.updates,
   training:{algorithm:'online-actor-critic',gamma:GAMMA,learningRate:LR,entropy:ENTROPY}};
 }
 load(snapshot){
  validateSnapshot(snapshot);
  // Validate all layers BEFORE replacing any current model state.
  const weights=snapshot.weights.map(layer=>layer.map(row=>Float64Array.from(row)));
  const biases=snapshot.biases.map(layer=>Float64Array.from(layer));
  this.weights=weights;this.biases=biases;this.updates=snapshot.updates||0;
 }
}
