import {createHash} from 'node:crypto';
export const profile=Object.freeze({id:'historical-miniature-civilian-p0',version:1,roles:['artisan','merchant'],morphotypes:['base','short-light','tall-heavy'],capabilities:['adult-humanoid','fitted-skinned-clothing','static-attachments','neutral-limited-hands','idle','walk','glb','character-studio','art-forge-staging'],actions:['idle','walk'],budgets:{triangles:35000,joints:192,glbBytes:16000000},excluded:['dynamic-cloth','remesh','weapon-grip','facial-expression','mounted','arbitrary-retarget','combat'],productionActivation:false});
export function stable(v){if(Array.isArray(v))return '['+v.map(stable).join(',')+']';if(v&&typeof v==='object')return '{'+Object.keys(v).filter(k=>v[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';return JSON.stringify(v)}
export const hash=v=>createHash('sha256').update(Buffer.isBuffer(v)?v:stable(v)).digest('hex');
export function canonical(m){return {geometry:hash(m.parts.map(p=>({name:p.name,positions:p.positions,indices:p.indices,normals:p.normals,joints:p.joints,weights:p.weights,joints8:p.joints8,weights8:p.weights8}))),rig:hash(m.joints),materials:hash(m.parts.map(p=>({name:p.name,color:p.color,material:p.material}))),animation:hash({actions:m.spec.actions,walk:m.sampledWalk}),spec:hash(m.spec)}}
export const phenotypes=Object.freeze({base:{female:0,old:0},'short-light':{female:0,old:0,short:.35,light:.5},'tall-heavy':{female:0,old:0,tall:.3,heavy:.55}});
export function requestCheck(manifest,request,bin,attestations={}){
 if(manifest.profileId!==profile.id||manifest.profileVersion!==profile.version||manifest.kind!=='production-candidate')throw Error('Wrong resource class');
 if(!profile.roles.includes(request.role)||!profile.morphotypes.includes(request.morphotype)||request.role!==manifest.role||request.morphotype!==manifest.morphotype)throw Error('Morphology or role outside approved discrete profile');
 if(stable(manifest.phenotype)!==stable(phenotypes[manifest.morphotype])||(request.phenotype!==undefined&&stable(request.phenotype)!==stable(manifest.phenotype)))throw Error('Morphology coefficients outside exact profile');
 if(!Array.isArray(request.capabilities)||request.capabilities.some(x=>!profile.capabilities.includes(x)||!manifest.capabilities.includes(x)))throw Error('Unknown capability');
 if(!Array.isArray(request.actions)||request.actions.some(x=>!profile.actions.includes(x)||!manifest.actions.includes(x)))throw Error('Unqualified animation');
 if(hash(bin)!==manifest.glbSha256)throw Error('GLB integrity mismatch');
 if(!manifest.budgets||Object.keys(profile.budgets).some(k=>!Number.isFinite(manifest.budgets[k])||manifest.budgets[k]>profile.budgets[k]))throw Error('Budget gate');
 if(!manifest.checks||['core','license','determinism','contact','idle','clothing','attachments','blenderPlayback','artForge','chromium','webkit'].some(k=>manifest.checks[k]!==true))throw Error('Missing technical gate');
 const digest=hash({...manifest,artisticAttestation:undefined});
 if(!manifest.artisticAttestation||manifest.artisticAttestation.manifestSha256!==digest||attestations[digest]?.accepted!==true||attestations[digest]?.manifestSha256!==digest)throw Error('Missing trusted artistic attestation');
 return {accepted:true,productionActivation:false};
}
// Intentionally empty repository-owned allowlist: only a separate owner decision may change it.
export const ownerAttestations=Object.freeze({});
export const admit=(m,r,b)=>requestCheck(m,r,b,ownerAttestations);
