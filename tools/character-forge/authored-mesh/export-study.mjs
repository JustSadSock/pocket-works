import {readFileSync,writeFileSync} from 'node:fs';
import {importAuthoredStudy} from './import.mjs';
import {glb,inspectGLB} from '../glb.mjs';
import {validateGeometry} from '../authored-surface.mjs';
import {pose,deform} from '../core.mjs';
const [basePath,documentPath,outPath]=process.argv.slice(2);
const base=JSON.parse(readFileSync(basePath)),document=JSON.parse(readFileSync(documentPath)),model=validateGeometry(importAuthoredStudy(base,document));
for(const action of model.spec.actions)for(let k=0;k<=48;k++){const w=pose(model,action,k/48);for(const p of model.parts)if(deform(model,p,w).flat().some(x=>!Number.isFinite(x)))throw Error('Nonfinite authored playback');}
const bin=glb(model),doc=inspectGLB(bin);
if(doc.skins[0].joints.length!==base.joints.length||doc.animations.length!==base.spec.actions.length)throw Error('Authored export lost rig or animation');
if(doc.meshes[0].primitives.some(p=>!('JOINTS_1' in p.attributes)||!('WEIGHTS_1' in p.attributes)))throw Error('Eight-influence authored export required for this study');
writeFileSync(outPath,bin);console.log(JSON.stringify({status:'export study only, NOT accepted',triangles:model.statistics.triangleCount,joints:model.joints.length,bytes:bin.length}));
