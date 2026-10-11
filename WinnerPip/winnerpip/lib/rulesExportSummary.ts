/** Use the actual balance mode, never the unused absolute target in growth challenges. */
export function rulesExportSummary(c:any,isCent=false){
 const split=c.type==='hybrid' && c.split_category_settings;
 const categories=split?['demo','real']:[''];
 const rows=categories.map(category=>{
  const prefix=category?`${category}_`:'';
  const mode=c[prefix+'deposit_mode'] || 'fixed';
  const money=(value:any)=>isCent && c.type==='real'?`${Number(value).toLocaleString('en-US')}¢`:`$${Number(value).toLocaleString('en-US')}`;
  const balance=money(c[prefix+'starting_balance']);
  return {category:category==='demo'?'Demo':category==='real'?'Real':'',mode:mode==='min_limit'?'Minimum balance':mode==='max_limit'?'Maximum balance':'Fixed balance',
   start:balance+(mode==='min_limit'?' or above':mode==='max_limit'?' or below':''),
   target:c[prefix+'target_enabled']===false?'No target':mode==='fixed'?money(c[prefix+'target_balance']):`${Number(c[prefix+'target_percent'])}% growth`};
 });
 return {type:c.type==='hybrid'?'Hybrid Challenge':c.type==='real'?'Real Challenge':'Demo Challenge',rows};
}
