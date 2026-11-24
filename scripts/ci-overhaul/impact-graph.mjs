// Impact Engine v2. Static import evidence is advisory, never authority to skip.
import ts from 'typescript';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,lstatSync} from 'node:fs';
import {join,posix,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {appInventory,workspaceGraph,diffPaths,impact} from './impact.mjs';

const sourceExt=/\.(?:[cm]?[jt]sx?|html?|css)$/i;
const owner=(path,apps)=>{const m=/^apps\/([^/]+)\//.exec(path);return m&&apps.has(m[1])?m[1]:null;};
const literal=n=>n&&(ts.isStringLiteralLike(n)||ts.isNoSubstitutionTemplateLiteral(n))?n.text:null;
export function references(path,source){
 const refs=[],unknown=[];
 const add=(value,kind)=>{if(typeof value==='string'&&value.length)refs.push({value,kind});else unknown.push(kind);};
 if(/\.[cm]?[jt]sx?$/i.test(path)){
  const sf=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true);
  if(sf.parseDiagnostics.length)unknown.push('parse-error');
  const visit=n=>{
   if((ts.isImportDeclaration(n)||ts.isExportDeclaration(n))&&n.moduleSpecifier)add(literal(n.moduleSpecifier),'module');
   if(ts.isImportEqualsDeclaration(n)&&ts.isExternalModuleReference(n.moduleReference))add(literal(n.moduleReference.expression),'module');
   if(ts.isCallExpression(n)){
    const e=n.expression;
    if(e.kind===ts.SyntaxKind.ImportKeyword||(ts.isIdentifier(e)&&e.text==='require')||
      (ts.isPropertyAccessExpression(e)&&ts.isIdentifier(e.expression)&&e.expression.text==='require'&&e.name.text==='resolve'))add(literal(n.arguments[0]),'module');
    if(ts.isPropertyAccessExpression(e)&&e.expression.kind===ts.SyntaxKind.MetaProperty&&['glob','globEager'].includes(e.name.text))unknown.push('glob');
   }
   if(ts.isNewExpression(n)&&ts.isIdentifier(n.expression)&&['URL','Worker','SharedWorker'].includes(n.expression.text)){
    const v=literal(n.arguments?.[0]);if(v!==null)add(v,'asset');else if(!n.arguments?.[0]||!ts.isNewExpression(n.arguments[0]))unknown.push('computed-asset');
   }
   ts.forEachChild(n,visit);
  };visit(sf);
 }else if(/\.css$/i.test(path)){
  for(const m of source.matchAll(/@import\s+(?:url\(\s*)?["']([^"']+)["']|url\(\s*["']?([^"'\s)]+)["']?\s*\)/gi))add(m[1]??m[2],'asset');
 }else{
  for(const m of source.matchAll(/\b(?:src|href|poster|data-src)\s*=\s*["']([^"']+)["']/gi))add(m[1],'asset');
  // Inline module/script contents are parsed separately; HTML attributes
  // alone cannot establish that no dynamic dependencies exist.
  for(const m of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)){
   if(!m[1].trim())continue;
   const inner=references(path+'.js',m[1]);refs.push(...inner.refs);unknown.push(...inner.unknown);
  }
 }
 return {refs,unknown:[...new Set(unknown)]};
}
export function analyzeSources({apps,files,sources,workspaceEdges=[]}){
 const known=new Set(apps),tracked=new Set(files),edges=[...workspaceEdges],uncertainties=[],sharedConsumers=[];
 let scanned=0;
 const note=(path,reason)=>uncertainties.push({path,reason});
 for(const [path,source] of sources){
  if(!sourceExt.test(path))continue;
  scanned++;
  const from=owner(path,known),r=references(path,source);
  for(const reason of r.unknown)note(path,reason);
  for(const {value,kind} of r.refs){
   if(/^(?:https?:|data:|blob:|node:|mailto:|#)/i.test(value))continue;
   if(value.startsWith('//'))continue;
   let target;
   if(value.startsWith('/'))target=posix.normalize(value.slice(1));
   else if(value.startsWith('.'))target=posix.normalize(posix.join(posix.dirname(path),value));
   else if(kind==='asset')target=posix.normalize(posix.join(posix.dirname(path),value));
   else{
    if(value.startsWith('@/')||value.startsWith('~/')||value.startsWith('#')||value.startsWith('@pocket-works/'))note(path,'unresolved alias: '+value);
    continue;
   }
   target=target.split(/[?#]/,1)[0];
   if(target.startsWith('../')){note(path,'reference escapes tree: '+value);continue;}
   const to=owner(target,known);
   if(to&&from&&to!==from)edges.push({consumer:from,dependency:to,reason:'source:'+path+' -> '+value});
   if(to&&!from)sharedConsumers.push({dependency:to,path,value});
   if(target.startsWith('apps/')&&!to)note(path,'unknown app target: '+value);
   if(kind==='module'&&!tracked.has(target)&&!['.js','.mjs','.cjs','.ts','.tsx','.jsx','/index.js','/index.ts'].some(ext=>tracked.has(target+ext)))note(path,'unresolved local module: '+value);
  }
 }
 const uniqueEdges=[...new Map(edges.map(e=>[JSON.stringify(e),e])).values()];
 return {scanned,edges:uniqueEdges,uncertainties,sharedConsumers};
}
export function snapshot(root){
 const apps=appInventory(root),files=execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024}).split('\0').filter(Boolean);
 const sources=[];
 for(const path of files){
  if(!sourceExt.test(path))continue;
  const stat=lstatSync(join(root,path));
  if(!stat.isFile()||stat.size>2_000_000){sources.push([path,'']);continue;}
  sources.push([path,readFileSync(join(root,path),'utf8')]);
 }
 const graph=analyzeSources({apps,files,sources,workspaceEdges:workspaceGraph(root,apps)});
 const omitted=files.filter(p=>sourceExt.test(p)&&(!lstatSync(join(root,p)).isFile()||lstatSync(join(root,p)).size>2_000_000));
 graph.uncertainties.push(...omitted.map(path=>({path,reason:'unsupported or oversized tracked source'})));
 return {apps,...graph};
}
export function compareSnapshots(base,head,paths){
 const apps=[...new Set([...base.apps,...head.apps])].sort();
 const edges=[...base.edges,...head.edges];
 const advisory=impact({apps,paths,edges});
 const changed=new Set(advisory.direct);
 const globalDependency=[...base.sharedConsumers,...head.sharedConsumers].filter(e=>advisory.candidateApps.includes(e.dependency));
 const uncertainties=[...base.uncertainties,...head.uncertainties];
 const reasons=[...advisory.reasons];
 if(globalDependency.length)reasons.push('Shared code references impacted application');
 if(uncertainties.length)reasons.push('Unresolved or dynamic dependency evidence');
 if(base.apps.length!==head.apps.length||base.apps.some(a=>!head.apps.includes(a)))reasons.push('Application inventory changed');
 const fallback=advisory.globalFallback||reasons.length>0;
 return {...advisory,globalFallback:fallback,reasons:[...new Set(reasons)],
  staticCandidates:advisory.candidateApps,candidateApps:fallback?apps:advisory.candidateApps,
  requiredApps:apps,canSkip:false,scannedFiles:{base:base.scanned,head:head.scanned},
  crossAppEdges:edges.length,uncertainties:uncertainties.length,uncertaintyExamples:uncertainties.slice(0,40),
  sharedConsumers:globalDependency.slice(0,40),changedApps:changed.size};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const [baseRoot,headRoot,baseSha,headSha,out]=process.argv.slice(2);
  const verify=(root,sha)=>{if(execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim()!==sha)throw Error('Snapshot SHA mismatch');};
  verify(baseRoot,baseSha);verify(headRoot,headSha);
  const report=compareSnapshots(snapshot(baseRoot),snapshot(headRoot),diffPaths(headRoot,baseSha,headSha));
  writeFileSync(out,JSON.stringify(report,null,2));
  console.log(JSON.stringify({direct:report.direct.length,staticCandidates:report.staticCandidates.length,required:report.requiredApps.length,edges:report.crossAppEdges,uncertainties:report.uncertainties,globalFallback:report.globalFallback,canSkip:report.canSkip}));
 }catch(e){console.error(e);process.exitCode=1;}
}
