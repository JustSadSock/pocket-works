// Build outputs belong to independent apps; limit concurrent work to keep
// Cloudflare's memory use predictable and preserve fail-closed deployment.
export async function buildInBatches(items, concurrency, task) {
  if(!Number.isInteger(concurrency)||concurrency<1||concurrency>4)
    throw new Error('PW_ENHANCED_BUILD_CONCURRENCY must be an integer from 1 to 4');
  for(let start=0;start<items.length;start+=concurrency) {
    // Wait for the entire batch before checking failures; never leave a Vite
    // process running while the parent exits or a deploy proceeds.
    const batch=items.slice(start,start+concurrency);
    const settled=await Promise.allSettled(batch.map(item=>task(item)));
    const failure=settled.findIndex(result=>result.status==='rejected');
    if(failure>=0)throw new Error('Enhanced build failed for '+(batch[failure].slug||String(batch[failure]))+': '+settled[failure].reason);
  }
}
