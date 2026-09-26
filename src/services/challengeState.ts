import { db } from '../database/db';
import { ConfigurationError, validateChallenge } from '../utils/configValidation';

export async function transitionChallenge(id: number, destination: string, expected?: string): Promise<boolean> {
  return db.transaction(async () => {
    const result = await db.query('SELECT * FROM trading_challenges WHERE id=$1 FOR UPDATE',[id]);
    const challenge=result.rows[0];
    if(!challenge)throw new ConfigurationError('Challenge not found');
    if(challenge.status===destination)return false;
    if(expected && challenge.status!==expected)throw new ConfigurationError('Challenge changed since this request. Refresh and try again.');
    const allowed: Record<string,string[]>={draft:['registration_open','deleted'],pending_approval:['draft','rejected','deleted'],registration_open:['active','deleted'],active:['reviewing','submission_open'],reviewing:['completed','submission_open'],submission_open:['reviewing','completed'],rejected:['deleted']};
    if(!allowed[challenge.status]?.includes(destination))throw new ConfigurationError(`Cannot change ${challenge.status} to ${destination}`);
    if(['registration_open','active'].includes(destination)) {
      if(challenge.configuration_frozen_at)throw new ConfigurationError('Started challenge cannot be reopened');
      const rows=await db.query('SELECT rule_code,parameters FROM wp_challenge_rules WHERE challenge_id=$1',[id]);
      const rules=Object.fromEntries(rows.rows.map(r=>[r.rule_code,r.parameters]));
      validateChallenge({...challenge,rules:rules.config,rules_demo:rules.config_demo,rules_real:rules.config_real});
    }
    await db.query(`UPDATE trading_challenges SET status=$1::varchar, updated_at=NOW(), configuration_frozen_at=CASE WHEN $1::varchar IN ('active','reviewing','completed') THEN COALESCE(configuration_frozen_at,NOW()) ELSE configuration_frozen_at END WHERE id=$2`,[destination,id]);
    if(['active','reviewing'].includes(destination)){
      await db.query(`INSERT INTO challenge_lifecycle_events(challenge_id,destination,payload) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,[id,destination,JSON.stringify({...challenge,status:destination})]);
      await db.query(`INSERT INTO challenge_pull_jobs(challenge_id,slot) VALUES($1,$2) ON CONFLICT DO NOTHING`,[id,`lifecycle:${destination}`]);
    }
    return true;
  });
}
