import {analyze,spectrum} from './core.mjs';import {polyphonic} from './advanced.mjs';
import {neuralAnalyze} from './neural.mjs';
self.onmessage=async({data})=>{try{const progress=p=>self.postMessage({progress:p});self.postMessage({tracks:data.mode==='neural'?await neuralAnalyze(data.samples,progress):data.mode==='polyphonic'?polyphonic(data.samples,spectrum,progress):analyze(data.samples,data.mode,progress)})}catch(e){self.postMessage({error:e.message})}};
