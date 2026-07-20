import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
function runMainspring({energy=2,charge=2,torque=2.5,omega=0,radius=30,frames=240}){for(let frame=0;frame<frames;frame+=1){if(energy<=0)break;const ratio=clamp(energy/Math.max(.01,charge),0,1);const delivered=clamp(torque,.4,3.5)*(.35+ratio*.65);const moment=Math.max(40,radius*radius*.8);omega+=delivered*.045*clamp(2400/moment,.12,1);omega*=.982;energy=Math.max(0,energy-Math.abs(delivered)*.0016);}return{energy,omega};}
function sequenceAt(angle,pattern='alternate'){const phase=((angle/(Math.PI*2))%1+1)%1;if(pattern==='pulseA')return{A:phase<.45,B:false};if(pattern==='both')return{A:true,B:true};if(pattern==='gallop'){const q=Math.floor(phase*4)%4;return{A:q===0||q===3,B:q===2||q===3};}return{A:phase<.5,B:phase>=.5};}
function canopyStep(vy,area=2,drag=1.2){const descending=Math.max(0,vy),upward=clamp(descending*Math.abs(descending)*area*.075,0,1.45);return vy-upward-vy*.025-vy*clamp(drag*.085,0,.3)*.5;}
function buoyancyStep({mass=1,volume=1.5,depth=70,vy=.5}){const submerged=clamp(depth/70,0,1),buoyancy=clamp((volume*.22-Math.max(.3,mass)*.018)*submerged,-.1,.85),dragY=clamp(-vy*.19*submerged-buoyancy,-1,1);return vy+dragY;}
function reflectProjectile({vx,vy,nx,ny,restitution=.32}){const dot=vx*nx+vy*ny;return{vx:vx-(1+restitution)*dot*nx,vy:vy-(1+restitution)*dot*ny};}

{const result=runMainspring({});assert.ok(result.omega>.1,'a charged mainspring must spin a free shaft');assert.ok(result.energy<2,'mainspring energy must be finite and decrease');}
{assert.deepEqual(sequenceAt(.1),{A:true,B:false});assert.deepEqual(sequenceAt(Math.PI*1.2),{A:false,B:true});assert.deepEqual(sequenceAt(Math.PI*.2,'both'),{A:true,B:true});}
{let speed=4;for(let i=0;i<20;i+=1)speed=canopyStep(speed);assert.ok(speed<.8,'a deployed canopy must strongly reduce descent speed');}
{assert.ok(buoyancyStep({mass:1,volume:2.1,vy:.6})<.6,'inflated air bags must apply upward acceleration in water');}
{const reflected=reflectProjectile({vx:8,vy:0,nx:-1,ny:0});assert.ok(reflected.vx<0,'armor must reflect a frontal projectile');assert.ok(Math.abs(reflected.vx)<8,'armor collision must dissipate energy');}

const folios=await readFile(new URL('../engine/part-19.txt',import.meta.url),'utf8');
const ids=[...folios.matchAll(/id:'([^']+)',folio:/g)].map(match=>match[1]);
assert.equal(ids.length,10,'Codex must expose exactly ten Leonardo acceptance folios');
assert.equal(new Set(ids).size,10,'folio identifiers must be unique');
for(const required of['leo-cart','leo-airscrew','leo-ornithopter','leo-parachute','leo-tank','leo-crossbow','leo-knight','leo-bridge','leo-diver','leo-organ'])assert.ok(ids.includes(required),`missing folio: ${required}`);
const primitives=await readFile(new URL('../engine/part-18a.txt',import.meta.url),'utf8');
for(const type of['wing','canopy','armor','bow','mainspring','airscrew','cam','drum','airbag','launcher'])assert.ok(primitives.includes(`'${type}'`),`missing primitive: ${type}`);
console.log('ARS MACHINA 2.0 Codex tests passed');