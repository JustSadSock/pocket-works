const response=await fetch(new URL('./app-v2.txt',import.meta.url),{cache:'force-cache'});
if(!response.ok)throw new Error(`НОМОС: runtime unavailable (${response.status})`);
const encoded=await response.text();
const bytes=Uint8Array.from(atob(encoded.trim()),c=>c.charCodeAt(0));
const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
const source=await new Response(stream).text();
const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
try{await import(url)}finally{URL.revokeObjectURL(url)}
