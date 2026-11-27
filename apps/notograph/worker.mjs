import {analyze,spectrum} from './core.mjs';import {polyphonic} from './advanced.mjs';
self.onmessage=({data})=>{try{const progress=p=>self.postMessage({progress:p});self.postMessage({tracks:data.mode==='polyphonic'?polyphonic(data.samples,spectrum,progress):analyze(data.samples,data.mode,progress)})}catch(e){self.postMessage({error:e.message})}};
