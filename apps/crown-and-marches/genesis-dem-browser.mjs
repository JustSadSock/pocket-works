// Browser adapter for the same licensed DEM sources as geographic-dem-library.
import {packExemplars,validateExemplars} from './genesis-natural.mjs';
const regions=[['alpine','Dolomites',46.57,11.57],['carpathian','Chornohora',48.34,24.48],['gorge','Tara canyon region',43.30,19.47],['foothills','Vercors',44.55,5.48],['low-ridge','Vosges',48.45,7.36],['rolling','Tuscan hills',43.49,11.49],['coastal','Maritime Alps / Riviera',43.72,7.46]];
const root='https://elevation-tiles-prod.s3.amazonaws.com/skadi/',licence='https://github.com/tilezen/joerd/blob/master/docs/attribution.md',attribution='Terrain Tiles (Mapzen/Tilezen), AWS Open Data. Europe terrain data produced using Copernicus data and information funded by the European Union - EU-DEM layers; SRTM and GMTED2010 terrain data courtesy of the U.S. Geological Survey; Austria terrain data © offene Daten Österreichs – Digitales Geländemodell (DGM) Österreich; global ETOPO1 terrain data U.S. National Oceanic and Atmospheric Administration.';
const sha=async a=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',a)),x=>x.toString(16).padStart(2,'0')).join('');
const tile=(lat,lon)=>{const y=(lat<0?'S':'N')+String(Math.abs(lat)).padStart(2,'0'),x=(lon<0?'W':'E')+String(Math.abs(lon)).padStart(3,'0');return y+'/'+y+x+'.hgt.gz';};
const cacheKey='living-atlas-dem-v1';
async function demStore(mode,value){if(!globalThis.indexedDB)return null;const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('crown-and-marches-dem',1);r.onupgradeneeded=()=>r.result.createObjectStore('libraries');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});try{return await new Promise((resolve,reject)=>{const tx=db.transaction('libraries',mode==='get'?'readonly':'readwrite'),st=tx.objectStore('libraries'),r=mode==='get'?st.get(cacheKey):st.put(value,cacheKey);tx.oncomplete=()=>resolve(r.result);tx.onerror=tx.onabort=()=>reject(tx.error);});}finally{db.close();}}
export async function browserExemplars({file=null,signal,onProgress=()=>{},networkOnly=false}={}){
 const check=v=>validateExemplars(v,{requirePackedChecksum:true}),abort=()=>{if(signal?.aborted)throw new DOMException('Загрузка отменена','AbortError');};
 const remember=async v=>{abort();try{await demStore('put',v);}catch{}return v;};abort();
 if(file){onProgress('Импорт DEM');return remember(check(JSON.parse(await file.text())));}
 if(!networkOnly){try{const stored=await demStore('get');if(stored){const v=check(stored);abort();onProgress('Локальный кеш DEM');return v;}}catch{abort();}}
 // Optional distribution asset; absence must not prevent first online setup.
 if(!networkOnly){try{const r=await fetch(new URL('./dem/frozen-exemplars.json',import.meta.url),{signal});if(r.ok){const v=check(await r.json());onProgress('Комплект DEM');return remember(v);}}catch{abort();}}

 if(!globalThis.DecompressionStream||!crypto.subtle)throw Error('Импортируйте подготовленную библиотеку DEM (JSON).');
 const cache=new Map(),accessed=new Date().toISOString(),output=[];
 async function get(Y,X){const key=tile(Y,X);if(cache.has(key))return cache.get(key);const url=root+key,r=await fetch(url,{signal});if(!r.ok)throw Error('DEM '+key+' '+r.status);const gz=await r.arrayBuffer(),raw=await new Response(new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer(),side=Math.sqrt(raw.byteLength/2);if(![1201,3601].includes(side))throw Error('Invalid HGT '+key);const d={view:new DataView(raw),side,url,sha256:await sha(raw),compressedSha256:await sha(gz)};cache.set(key,d);return d;}
 for(const [id,label,lat0,lon0] of regions){onProgress(label);const size=385,detail=8,spanKm=48,metres=new Float32Array(size*size),cos=Math.cos(lat0*Math.PI/180),sources=new Map();
 for(let y=0;y<size;y++){if(signal?.aborted)throw Error('Загрузка отменена');const lat=lat0+(spanKm/2-y/detail)/111.195;for(let x=0;x<size;x++){const lon=lon0+(x/detail-spanKm/2)/(111.195*cos),Y=Math.floor(lat),X=Math.floor(lon),key=tile(Y,X),data=cache.get(key)||await get(Y,X);sources.set(key,{url:data.url,sha256:data.sha256,compressedSha256:data.compressedSha256,side:data.side});const u=(lon-X)*(data.side-1),v=(Y+1-lat)*(data.side-1),i=Math.min(data.side-2,Math.floor(u)),j=Math.min(data.side-2,Math.floor(v)),a=u-i,b=v-j,at=(x,y)=>{const z=data.view.getInt16((y*data.side+x)*2);if(z===-32768)throw Error('Void '+key);return z;};metres[y*size+x]=at(i,j)*(1-a)*(1-b)+at(i+1,j)*a*(1-b)+at(i,j+1)*(1-a)*b+at(i+1,j+1)*a*b;}if(y%32===0)await new Promise(r=>setTimeout(r,0));}
 output.push({id,size,metres,metadata:{id,label,centerLat:lat0,centerLon:lon0,spanKm,cellKm:1,detail,stepKm:1/detail,exaggeration:2.5,crs:'WGS84 local equirectangular',licence,attribution,accessed,citation:'Terrain Tiles, https://registry.opendata.aws/terrain-tiles/',sources:[...sources.values()],sampleSha256:await sha(metres.buffer)}});
 cache.clear();}
 return remember(check(packExemplars(output)));
}
