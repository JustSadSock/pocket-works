import {E} from './engine.js';
self.onmessage=({data})=>{const {id,before,orders,observer}=data;try{let t=performance.now(),profile={clock:()=>performance.now()},result=E.resolve(before,orders,observer,profile);delete profile.clock;self.postMessage({id,result,computeMs:performance.now()-t,profile})}catch(error){self.postMessage({id,error:String(error)})}};
