// Keep the hidden launcher library out of the home-screen render path.
// The deck renders its own curated home tiles; rendering every app card behind
// that screen only blocks first paint and duplicates the same data work.
export function selectVisibleApps({view,registry,visibleList,queryMatches,filterMatches,compare}={}){
 if(!Array.isArray(registry)||typeof queryMatches!=='function'||typeof filterMatches!=='function'||typeof compare!=='function')throw new TypeError('Invalid launcher visibility inputs');
 if(view==='home')return [];
 const pool=Array.isArray(visibleList)?visibleList:registry;
 return pool.filter(queryMatches).filter(app=>view==='archive'||filterMatches(app)).sort(compare);
}
