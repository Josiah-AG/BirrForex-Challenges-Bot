const {test}=require('node:test');const assert=require('node:assert/strict');require('ts-node/register/transpile-only');
let sql;const id=require.resolve('../src/database/db');require.cache[id]={id,filename:id,loaded:true,exports:{db:{query:async q=>{sql=q;return {rows:[]};}}}};
const {reconcilePrestartBatches}=require('../src/services/prestartBatchRecovery');
test('recovery only interrupts obsolete prestart batches, not ordinary trade pulls',async()=>{await reconcilePrestartBatches();assert.match(sql,/b.error_log='pre_start_check'/);assert.match(sql,/b.status='running'/);assert.match(sql,/phase_started_at,b.started_at/);assert.match(sql,/15 minutes/);assert.match(sql,/status='interrupted'/);});
