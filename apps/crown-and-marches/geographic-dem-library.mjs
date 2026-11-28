// Research data only. All seven controls share the same metric sampling grid.
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
export const regions=[
 {id:'alpine',label:'Dolomites',lat:46.57,lon:11.57},
 {id:'carpathian',label:'Chornohora',lat:48.34,lon:24.48},
 {id:'gorge',label:'Tara canyon region',lat:43.30,lon:19.47},
 {id:'foothills',label:'Vercors',lat:44.55,lon:5.48},
 {id:'low-ridge',label:'Vosges',lat:48.45,lon:7.36},
 {id:'rolling',label:'Tuscan hills',lat:43.49,lon:11.49},
 {id:'coastal',label:'Maritime Alps / Riviera',lat:43.72,lon:7.46}
];
const root='https://elevation-tiles-prod.s3.amazonaws.com/skadi/';
const terms='https://github.com/tilezen/joerd/blob/master/docs/attribution.md';
const credits='Terrain Tiles (Mapzen/Tilezen), AWS Open Data. Europe terrain data produced using Copernicus data and information funded by the European Union - EU-DEM layers; SRTM and GMTED2010 terrain data courtesy of the U.S. Geological Survey; Austria terrain data © offene Daten Österreichs – Digitales Geländemodell (DGM) Österreich; global ETOPO1 terrain data U.S. National Oceanic and Atmospheric Administration.';
const sha=b=>createHash('sha256').update(b).digest('hex');
const tile=(lat,lon)=>{const y=(lat<0?'S':'N')+String(Math.abs(lat)).padStart(2,'0'),x=(lon<0?'W':'E')+String(Math.abs(lon)).padStart(3,'0');return y+'/'+y+x+'.hgt.gz';};
export async function loadLibrary(dir){
 await mkdir(dir,{recursive:true});const cache=new Map(),accessed=new Date().toISOString();
 async function get(lat,lon){const key=tile(lat,lon);if(cache.has(key))return cache.get(key);const path=join(dir,key.replace('/','-')),url=root+key;let gz;try{gz=await readFile(path);}catch{const r=await fetch(url,{signal:AbortSignal.timeout(90000)});if(!r.ok)throw Error('DEM '+key+' '+r.status);gz=Buffer.from(await r.arrayBuffer());await writeFile(path,gz);}
 const raw=gunzipSync(gz),side=Math.sqrt(raw.length/2);if(![1201,3601].includes(side))throw Error('Invalid HGT '+key);const data={raw,side,url,sha256:sha(raw),compressedSha256:sha(gz)};cache.set(key,data);return data;}
 const output=[];for(const r of regions){const spanKm=48,detail=8,size=spanKm*detail+1,metres=new Float32Array(size*size),cos=Math.cos(r.lat*Math.PI/180),sources=new Map();
 for(let y=0;y<size;y++){const lat=r.lat+(spanKm/2-y/detail)/111.195;for(let x=0;x<size;x++){const lon=r.lon+(x/detail-spanKm/2)/(111.195*cos),Y=Math.floor(lat),X=Math.floor(lon),key=tile(Y,X),data=cache.get(key)||await get(Y,X);sources.set(key,{url:data.url,sha256:data.sha256,compressedSha256:data.compressedSha256,side:data.side});const u=(lon-X)*(data.side-1),v=(Y+1-lat)*(data.side-1),i=Math.min(data.side-2,Math.floor(u)),j=Math.min(data.side-2,Math.floor(v)),a=u-i,b=v-j,at=(x,y)=>{const h=data.raw.readInt16BE((y*data.side+x)*2);if(h===-32768)throw Error('Void '+key);return h;};metres[y*size+x]=at(i,j)*(1-a)*(1-b)+at(i+1,j)*a*(1-b)+at(i,j+1)*(1-a)*b+at(i+1,j+1)*a*b;}}
 const metadata={id:r.id,label:r.label,centerLat:r.lat,centerLon:r.lon,spanKm,cellKm:1,detail,stepKm:1/detail,exaggeration:2.5,crs:'WGS84 local equirectangular',licence:terms,attribution:credits,accessed,citation:'Terrain Tiles was accessed on '+accessed.slice(0,10)+' from https://registry.opendata.aws/terrain-tiles.',sources:[...sources.values()],sampleSha256:sha(Buffer.from(metres.buffer))};output.push({id:r.id,size,detail,metres:Array.from(metres),metadata});}
 return output;
}
