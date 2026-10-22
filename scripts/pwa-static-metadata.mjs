// Parse simple literal metadata declarations without executing code.
export function staticString(source,name) {
 if(!/^[A-Za-z_$][\w$]*$/.test(name))return null;
 const direct=source.match(new RegExp('(?:const|let)\\s+'+name+'\\s*=\\s*[\\x27\\x22]([^\\x27\\x22]+)[\\x27\\x22]'));
 if(direct)return direct[1];
 for(const declaration of source.matchAll(/^[ \t]*(?:export\s+)?(?:const|let)\s+([^\r\n;]+)/gm)) {
  const statement=declaration[1],pieces=[];
  let quote=null,escaped=false,at=0;
  for(let i=0;i<statement.length;i++){
   const ch=statement[i];
   if(quote){
    if(escaped)escaped=false;
    else if(ch==='\\')escaped=true;
    else if(ch===quote)quote=null;
   }else if(ch==="'"||ch==='"')quote=ch;
   else if(ch===','){pieces.push(statement.slice(at,i));at=i+1;}
  }
  pieces.push(statement.slice(at));
  for(const part of pieces){
   const match=part.match(/^\s*([A-Za-z_$][\w$]*)\s*=\s*(["'])([^"']+)\2\s*$/);
   if(match?.[1]===name)return match[3];
  }
 }
 return null;
}
