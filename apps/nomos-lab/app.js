async function unpack(path){
  const response=await fetch(new URL(path,import.meta.url),{cache:'force-cache'});
  if(!response.ok)throw new Error(`НОМОС: asset unavailable (${response.status})`);
  const encoded=await response.text();
  const bytes=Uint8Array.from(atob(encoded.trim()),c=>c.charCodeAt(0));
  const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}
const [css,source]=await Promise.all([unpack('./styles-v2.txt'),unpack('./app-v2.txt')]);
const legacy=document.querySelector('link[href*="styles.css"]');
if(legacy)legacy.disabled=true;
const style=document.createElement('style');
style.dataset.nomosVersion='2.1.0';
style.textContent=css;
document.head.append(style);
const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
try{await import(url)}finally{URL.revokeObjectURL(url)}