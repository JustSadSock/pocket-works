import {E} from './engine.js';
self.onmessage=({data})=>{const {id,before,orders,observer}=data;try{let t=performance.now(),result=E.resolve(before,orders,observer);self.postMessage({id,result,computeMs:performance.now()-t})}catch(error){self.postMessage({id,error:String(error)})}};
