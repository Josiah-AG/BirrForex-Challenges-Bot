const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),ts=require('typescript');
// Explicit historical reads: rollback, denial messages, immutable winners, original
// registration period, and outboxes that must see removed rows to cancel notices.
const exceptions={
 'services/pullRollbackJournal.ts':[/SELECT jsonb_build_object/,/SELECT id FROM trading_registrations/],
 'services/participantNotices.ts':[/FROM participant_notice_outbox/],
 'services/partnerScreening.ts':[/FROM partner_notice_outbox/],
 'services/pullRecoveryReport.ts':[/FROM wp_pull_errors/],
 'services/newChallengeClients.ts':[/MIN\(registered_at\)/],
 'services/tradingChallengeService.ts':[/FROM trading_winners/],
 'api/discordRoutes.ts':[/FROM trading_winners/],
 'api/server.ts':[/SELECT r.status, r.disqualified, r.disqualified_reason, c.title as challenge_title/]
};
test('every operational registration read uses the current-registration view',()=>{
 const bad=[];function walk(dir){for(const x of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,x.name);if(x.isDirectory()){if(x.name!=='database')walk(file);continue}if(!file.endsWith('.ts'))continue;const rel=path.relative(path.join(__dirname,'../src'),file),s=fs.readFileSync(file,'utf8'),a=ts.createSourceFile(file,s,ts.ScriptTarget.Latest,true);function visit(n){if(ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n)||ts.isTemplateExpression(n)){const q=n.getText(a);if(/\b(?:FROM|JOIN)\s+trading_registrations\b/i.test(q)&&!exceptions[rel]?.some(re=>re.test(q)))bad.push(rel+':'+(a.getLineAndCharacterOfPosition(n.getStart()).line+1));return}ts.forEachChild(n,visit)}visit(a)}}walk(path.join(__dirname,'../src'));assert.deepEqual(bad,[]);
});
test('archived identity cannot leak into counts, nickname lookup, trades, ranking, or row locks',{skip:!process.env.ARCHIVE_AUDIT_DATABASE_URL},async()=>{
 const {Client}=require('pg'),c=new Client({connectionString:process.env.ARCHIVE_AUDIT_DATABASE_URL});await c.connect();try{await c.query('BEGIN');await c.query(`CREATE TEMP TABLE trading_registrations(id int,challenge_id int,nickname text,status text,disqualified boolean);CREATE TEMP TABLE wp_trades(id int,registration_id int,challenge_id int,profit numeric);CREATE TEMP TABLE wp_leaderboard(registration_id int,challenge_id int,rank int);`);
 const sql=fs.readFileSync(path.join(__dirname,'../src/database/current_registrations.sql'),'utf8').replaceAll('CREATE OR REPLACE VIEW','CREATE TEMP VIEW');await c.query(sql);
 await c.query(`INSERT INTO trading_registrations VALUES(1,39,'HGH','removed',true),(2,39,'HGH','registered',false),(3,39,'DQ','registered',true),(4,39,'Legacy',NULL,false);INSERT INTO wp_trades VALUES(1,1,39,999),(2,2,39,10),(3,3,39,-2);INSERT INTO wp_leaderboard VALUES(1,39,1),(2,39,2),(3,39,3)`);
 assert.deepEqual((await c.query("SELECT id FROM wp_current_registrations WHERE lower(nickname)='hgh'")).rows,[{id:2}]);
 assert.equal(Number((await c.query('SELECT COUNT(*) n FROM wp_current_registrations')).rows[0].n),3);
 assert.equal(Number((await c.query('SELECT SUM(profit) p FROM wp_current_trades')).rows[0].p),8);
 assert.deepEqual((await c.query('SELECT registration_id FROM wp_current_leaderboard ORDER BY registration_id')).rows,[{registration_id:2},{registration_id:3}]);
 assert.equal((await c.query('SELECT id FROM wp_current_registrations WHERE id=1 FOR UPDATE')).rowCount,0);
 assert.equal((await c.query('SELECT id FROM wp_current_registrations WHERE id=2 FOR UPDATE')).rowCount,1);
 assert.equal((await c.query('SELECT id FROM trading_registrations WHERE id=1')).rowCount,1);
 }finally{await c.query('ROLLBACK');await c.end()}
});
