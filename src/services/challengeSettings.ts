import crypto from 'crypto';
import { db } from '../database/db';
import { ConfigurationError, validateChallenge, normalizeChallengeInput } from '../utils/configValidation';
const editable = ['title','type','start_date','end_date','registration_deadline','starting_balance','target_balance','deposit_mode','target_percent','timezone','registration_mode','prize_pool_text','real_winners_count','demo_winners_count','real_prizes','demo_prizes','pdf_url','video_url','source','team_only','split_category_settings','demo_starting_balance','demo_target_balance','real_starting_balance','real_target_balance','demo_deposit_mode','real_deposit_mode','demo_target_percent','real_target_percent','target_enabled','allow_below_start','demo_target_enabled','real_target_enabled','demo_allow_below_start','real_allow_below_start'];
const presentation = new Set(['title','prize_pool_text','pdf_url','video_url']);
export const scheduleKeys = ['start_date','end_date','registration_deadline','timezone'];
export function sameSetting(key: string, a: any, b: any): boolean {
  if (scheduleKeys.includes(key) && key !== 'timezone' && a != null && b != null) return new Date(a).getTime() === new Date(b).getTime();
  return JSON.stringify(a) === JSON.stringify(b) || String(a) === String(b);
}
export async function updateChallengeSettings(id: number, fields: any, hostId?: number): Promise<any> {
  return db.transaction(async()=>{
    const result=await db.query('SELECT * FROM trading_challenges WHERE id=$1 FOR UPDATE',[id]);
    const current=result.rows[0];
    if(!current || (hostId!==undefined && current.host_id!==hostId))throw new ConfigurationError('Challenge not found');
    fields=normalizeChallengeInput(fields);
    const unknown=Object.keys(fields).filter(k=>!editable.includes(k));
    if(unknown.length)throw new ConfigurationError(`Unsupported settings: ${unknown.join(', ')}`);
    const frozen=current.configuration_frozen_at || !['draft','pending_approval','registration_open'].includes(current.status);
    if (fields.start_date && fields.registration_deadline === undefined && (!current.registration_deadline || sameSetting('start_date', current.registration_deadline, current.start_date))) fields.registration_deadline = fields.start_date;
    const changed=Object.keys(fields).filter(k=>!sameSetting(k,fields[k],current[k]));
    const scheduleChanged=changed.some(k=>scheduleKeys.includes(k));
    if (scheduleChanged && (current.configuration_frozen_at || new Date(current.start_date).getTime() <= Date.now())) throw new ConfigurationError('Schedule is locked once the challenge starts.');
    if (scheduleChanged && new Date(fields.start_date || current.start_date).getTime() <= Date.now()) throw new ConfigurationError('The new challenge start must be in the future.');
    if(frozen && changed.some(k=>!presentation.has(k)))throw new ConfigurationError('Competition settings are locked after start. Only title, description and links can change.');
    const merged={...current,...fields};
    validateChallenge(merged,false);
    if(merged.split_category_settings!==current.split_category_settings){
      const codes=merged.split_category_settings?['config_demo','config_real']:['config'];
      const rules=await db.query('SELECT rule_code FROM wp_challenge_rules WHERE challenge_id=$1',[id]);
      if(codes.some(code=>!rules.rows.some(r=>r.rule_code===code)))throw new ConfigurationError('Save complete independent rules for the selected mode before switching.');
    }
    if(!changed.length)return current;
    if(hostId !== undefined && current.status === 'registration_open' && scheduleChanged) {
      // Queue the entire settings submission atomically; no partial save before approval.
      const pending=await db.query("SELECT token FROM challenge_approvals WHERE kind='schedule_change' AND state='pending' AND payload->>'challengeId'=$1",[String(id)]);
      if(pending.rows.length)throw new ConfigurationError('A schedule change is already awaiting admin approval.');
      const token=crypto.randomBytes(16).toString('hex');
      const proposed=Object.fromEntries(changed.map(k=>[k,fields[k]]));
      const baseline=Object.fromEntries([...new Set([...changed,...scheduleKeys])].map(k=>[k,current[k]]));
      await db.query('INSERT INTO challenge_approvals (token,kind,payload) VALUES ($1,$2,$3)',[token,'schedule_change',JSON.stringify({challengeId:id,hostId,title:current.title,baseline,fields:proposed})]);
      return {...current,pendingApproval:true,approvalToken:token};
    }
    const values=changed.map(k=>['real_prizes','demo_prizes'].includes(k)?JSON.stringify(fields[k]):fields[k]);
    const saved=await db.query(`UPDATE trading_challenges SET ${changed.map((k,i)=>`${k}=$${i+1}`).join(',')},updated_at=NOW() WHERE id=$${values.length+1} RETURNING *`,[...values,id]);
    return saved.rows[0];
  });
}
