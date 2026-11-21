export const slots=12;
export const levels=[
[{id:'A',earliest:0,latest:2,duration:3,weight:3},{id:'B',earliest:2,latest:5,duration:4,weight:2},{id:'C',earliest:5,latest:8,duration:3,weight:4}],
[{id:'A',earliest:0,latest:4,duration:4,weight:2},{id:'B',earliest:0,latest:2,duration:2,weight:5},{id:'C',earliest:4,latest:7,duration:3,weight:3},{id:'D',earliest:8,latest:10,duration:2,weight:4}],
[{id:'A',earliest:0,latest:5,duration:3,weight:2},{id:'B',earliest:1,latest:3,duration:2,weight:5},{id:'C',earliest:4,latest:7,duration:3,weight:4},{id:'D',earliest:7,latest:9,duration:3,weight:2},{id:'E',earliest:9,latest:11,duration:1,weight:6}]];
export function valid(trains,plan){return trains.every(t=>{const s=plan[t.id];return s==null||(Number.isInteger(s)&&s>=t.earliest&&s<=t.latest&&s+t.duration<=slots)})}
export function conflicts(trains,plan){const bad=new Set();for(let i=0;i<trains.length;i++)for(let j=i+1;j<trains.length;j++){const a=trains[i],b=trains[j],x=plan[a.id],y=plan[b.id];if(x!=null&&y!=null&&x<y+b.duration&&y<x+a.duration){bad.add(a.id);bad.add(b.id)}}return bad}
export function evaluate(trains,plan){const bad=conflicts(trains,plan);const complete=valid(trains,plan)&&trains.every(t=>plan[t.id]!=null)&&!bad.size;return {complete,score:complete?trains.reduce((s,t)=>s+(plan[t.id]-t.earliest)*t.weight,0):null}}
export function optimum(trains){let best=Infinity;function walk(i,p){if(i===trains.length){const r=evaluate(trains,p);if(r.complete)best=Math.min(best,r.score);return}const t=trains[i];for(let s=t.earliest;s<=t.latest&&s+t.duration<=slots;s++){p[t.id]=s;if(!conflicts(trains.slice(0,i+1),p).size)walk(i+1,p)}delete p[t.id]}walk(0,{});return best}
