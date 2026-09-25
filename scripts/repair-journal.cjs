const { isDeepStrictEqual } = require('node:util');
// Store only fields changed by evaluation. Never restore unrelated newer data.
function changes(before, after) {
 const out=[];
 for(const table of Object.keys(before)) {
  const old=new Map(before[table].map(r=>[String(r.id),r]));
  const next=new Map(after[table].map(r=>[String(r.id),r]));
  for(const id of new Set([...old.keys(),...next.keys()])) {
   const a=old.get(id),b=next.get(id);
   if(!a || !b) {out.push({table,id,before:a||null,after:b||null,wholeRow:true});continue;}
   const fields=Object.keys(a).filter(k=>!isDeepStrictEqual(a[k],b[k]));
   if(fields.length) out.push({table,id,before:Object.fromEntries(fields.map(k=>[k,a[k]])),after:Object.fromEntries(fields.map(k=>[k,b[k]])),wholeRow:false});
  }
 }
 return out;
}
function checkRestore(change,current) {
 if(change.after===null) {if(current) throw Error(`Restore conflict: ${change.table}/${change.id} exists`);return;}
 if(!current) throw Error(`Restore conflict: ${change.table}/${change.id} missing`);
 for(const [k,v] of Object.entries(change.after)) if(!isDeepStrictEqual(current[k],v)) throw Error(`Restore conflict: ${change.table}/${change.id}/${k} changed since repair`);
}
module.exports={changes,checkRestore};
