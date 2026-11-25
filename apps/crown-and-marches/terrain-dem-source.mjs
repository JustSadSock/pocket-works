// Terrain Tiles / Mapzen Skadi HGT. External data is fetched only by research QA.
// No production dependencies or changes to campaign world generation.
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
export const url='https://elevation-tiles-prod.s3.amazonaws.com/skadi/N46/N46E011.hgt.gz';
export const attribution='Terrain Tiles (Mapzen/Tilezen), AWS Open Data; Europe terrain data produced using Copernicus data and information funded by the European Union - EU-DEM layers; SRTM and GMTED2010 terrain data courtesy of the U.S. Geological Survey.';
export async function fetchDolomites(){
 const response=await fetch(url,{signal:AbortSignal.timeout(90000)});if(!response.ok)throw Error('DEM download '+response.status);
 const compressed=Buffer.from(await response.arrayBuffer()),raw=gunzipSync(compressed),side=Math.sqrt(raw.length/2);if(![1201,3601].includes(side))throw Error('Unexpected HGT grid '+side);
 const centerLat=46.57,centerLon=11.57,cellKm=1,exaggeration=2.5,span=48,detail=8,size=span*detail+1,metres=new Array(size*size),cos=Math.cos(centerLat*Math.PI/180);
 const at=(x,y)=>{if(x<0||y<0||x>=side||y>=side)throw Error('Outside HGT tile');const h=raw.readInt16BE((y*side+x)*2);if(h===-32768)throw Error('Void in DEM');return h;};
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){const lat=centerLat+(span/2-y/detail)*cellKm/111.195,lon=centerLon+(x/detail-span/2)*cellKm/(111.195*cos),u=(lon-11)*(side-1),v=(47-lat)*(side-1),i=Math.floor(u),j=Math.floor(v),a=u-i,b=v-j;metres[y*size+x]=at(i,j)*(1-a)*(1-b)+at(i+1,j)*a*(1-b)+at(i,j+1)*(1-a)*b+at(i+1,j+1)*a*b;}
 return {size,detail,metres,metadata:{url,attribution,licence:'https://github.com/tilezen/joerd/blob/master/docs/attribution.md',sourceHeader:response.headers.get('x-imagery-sources'),sha256:createHash('sha256').update(raw).digest('hex'),side,centerLat,centerLon,spanKm:span,cellKm,exaggeration,resampling:'bilinear, local equirectangular, 125 m samples',accessed:new Date().toISOString()}};
}
