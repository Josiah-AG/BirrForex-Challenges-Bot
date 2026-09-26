import { Pool } from 'pg';
import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';

// Payloads, URLs, credentials, account numbers and free-text errors are never stored.
// Dedicated, bounded pool: observability must not consume the application's DB pool.
let telemetryPool: Pool | undefined;
let writeFailures = 0;
let lastFailureAt: string | null = null;
const instanceId = randomUUID();
const context=new AsyncLocalStorage<string>();
export const withWorkloadContext=<T>(id:string,work:()=>Promise<T>)=>context.run(id,work);
const enabled = () => process.env.WORKLOAD_TELEMETRY_ENABLED !== 'false';
function pool() {
  if(telemetryPool)return telemetryPool;
  telemetryPool = new Pool({connectionString:process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV==='production'?{rejectUnauthorized:false}:false, max:2, connectionTimeoutMillis:1000, statement_timeout:1000,
    idleTimeoutMillis:10000, allowExitOnIdle:true});
  telemetryPool.on('error',()=>{writeFailures++;lastFailureAt=new Date().toISOString();console.error('[workload-telemetry] idle connection error');});
  return telemetryPool;
}
async function safeWrite(sql:string, args:any[]) {
  try { await pool().query(sql,args); } catch {
    writeFailures++; lastFailureAt=new Date().toISOString();
    if(writeFailures===1 || writeFailures%100===0)console.error('[workload-telemetry] write failed; account processing continues', {writeFailures});
  }
}
export const workloadTelemetryStatus=()=>({enabled:enabled(),instance_id:instanceId,write_failures:writeFailures,last_failure_at:lastFailureAt});
const paths=new Set(['/pull','/verify','/verify-connection','/resolve-opens','/resolve-trades','/ohlc','/ohlc-bulk','/candles','/health','/clear-credential-cache','/challenge-pull-state','/configure','/vps-report','/vps-report/snapshots','/vps-report/snapshot']);
export function workloadOperation(url:string):string {
  try {const path=new URL(url,'http://local').pathname;return paths.has(path)?path:'other';}catch{return 'other';}
}
function integer(value:any,max=1000000000){return Number.isInteger(value)&&value>=0&&value<=max?value:null;}
function code(value:any):string|null {
  return ['credential_failure','terminal','busy','history_incomplete','disabled','cancelled','timeout'].includes(value)?value:null;
}
export async function trackVpsRequest<T>(url:string, work:()=>Promise<T>, inspect:(value:T)=>{status?:number;data?:any}):Promise<T> {
  if(!enabled())return work();
  const id=randomUUID(),at=new Date(),start=performance.now();
  // Persist arrival before starting I/O. A crash leaves an explicitly unfinished row.
  await safeWrite(`INSERT INTO workload_requests(id,instance_id,operation,requested_at,outcome,parent_id) VALUES($1,$2,$3,$4,'unfinished',$5)`,[id,instanceId,workloadOperation(url),at,context.getStore()||null]);
  const ioStart=performance.now();
  try {
    const value=await work();const {status,data}=inspect(value);
    const outcome=(status!==undefined&&status>=400)||data?.success===false?'response_failure':'response_received';
    await safeWrite(`UPDATE workload_requests SET completed_at=NOW(),duration_ms=$2,io_duration_ms=$3,outcome=$4,http_status=$5,terminal_id=$6,trade_count=$7,error_code=$8 WHERE id=$1`,
      [id,performance.now()-start,performance.now()-ioStart,outcome,integer(status,599),integer(data?.terminal_used,15),Array.isArray(data?.trades)?data.trades.length:null,code(data?.error_type)]);
    return value;
  }catch(error:any){
    const status=error?.httpStatus||error?.response?.status;
    const outcome=status?'http_error':error?.name==='AbortError'||error?.code==='ERR_CANCELED'?'cancelled':error?.code==='ECONNABORTED'||error?.name==='TimeoutError'?'timeout':'transport_error';
    await safeWrite(`UPDATE workload_requests SET completed_at=NOW(),duration_ms=$2,io_duration_ms=$3,outcome=$4,http_status=$5 WHERE id=$1`,[id,performance.now()-start,performance.now()-ioStart,outcome,integer(status,599)]);
    throw error;
  }
}
export async function installWorkloadTelemetry(query:(sql:string,args?:any[])=>Promise<any>,myfxpath:boolean) {
  await query(`CREATE TABLE IF NOT EXISTS workload_requests(
    id UUID PRIMARY KEY,instance_id UUID NOT NULL,operation TEXT NOT NULL,requested_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,duration_ms DOUBLE PRECISION,io_duration_ms DOUBLE PRECISION,outcome TEXT NOT NULL,
    parent_id TEXT,http_status INTEGER,terminal_id INTEGER,trade_count INTEGER,error_code TEXT);
    ALTER TABLE workload_requests ADD COLUMN IF NOT EXISTS parent_id TEXT;
    CREATE INDEX IF NOT EXISTS workload_requests_time_idx ON workload_requests(requested_at);
    CREATE TABLE IF NOT EXISTS workload_job_events(
    id BIGSERIAL PRIMARY KEY,job_id TEXT NOT NULL,job_created_at TIMESTAMPTZ NOT NULL,event_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    state TEXT NOT NULL,attempt INTEGER NOT NULL,baseline BOOLEAN NOT NULL DEFAULT FALSE);
    CREATE INDEX IF NOT EXISTS workload_job_events_time_idx ON workload_job_events(event_at);
    CREATE INDEX IF NOT EXISTS workload_job_events_job_idx ON workload_job_events(job_id,id);`);
  const table=myfxpath?'broker_sync_jobs':'challenge_pull_jobs',state=myfxpath?'status':'state';
  if(!enabled()){await query(`DROP TRIGGER IF EXISTS workload_job_event ON ${table}`);return;}
  // No heartbeat/stage spam. Capture demand, attempts, retries and final outcomes.
  await query(`CREATE OR REPLACE FUNCTION record_workload_job_event() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF current_setting('app.workload_telemetry_disabled',true)='true' THEN RETURN NEW; END IF;
      IF TG_OP='INSERT' OR NEW.${state} IS DISTINCT FROM OLD.${state} OR NEW.attempts IS DISTINCT FROM OLD.attempts THEN
        INSERT INTO workload_job_events(job_id,job_created_at,state,attempt) VALUES(NEW.id::text,NEW.created_at,NEW.${state},NEW.attempts);
      END IF;
      RETURN NEW;
    EXCEPTION WHEN OTHERS THEN RAISE WARNING 'workload job telemetry unavailable'; RETURN NEW;
    END $$;
    DROP TRIGGER IF EXISTS workload_job_event ON ${table};
    CREATE TRIGGER workload_job_event AFTER INSERT OR UPDATE ON ${table} FOR EACH ROW EXECUTE FUNCTION record_workload_job_event();
    INSERT INTO workload_job_events(job_id,job_created_at,state,attempt,baseline)
    SELECT j.id::text,j.created_at,j.${state},j.attempts,TRUE FROM ${table} j
    WHERE NOT EXISTS(SELECT 1 FROM workload_job_events e WHERE e.job_id=j.id::text);`);
}
export async function workloadReport(query:(sql:string,args?:any[])=>Promise<any>,daysInput:any) {
  const days=Math.max(1,Math.min(90,Number(daysInput)||7));
  let timezone=process.env.TIMEZONE||'Africa/Addis_Ababa';try{new Intl.DateTimeFormat('en',{timeZone:timezone});}catch{timezone='Africa/Addis_Ababa';}
  const [requests,jobs,coverage,hourly,queue]=await Promise.all([
    query(`SELECT operation,outcome,COUNT(*)::int AS count,
      percentile_cont(.5) WITHIN GROUP(ORDER BY io_duration_ms) AS p50_ms,
      percentile_cont(.95) WITHIN GROUP(ORDER BY io_duration_ms) AS p95_ms,
      MAX(io_duration_ms) AS max_ms
      FROM workload_requests WHERE requested_at>=NOW()-$1*INTERVAL '1 day' GROUP BY operation,outcome ORDER BY operation,outcome`,[days]),
    query(`SELECT state,COUNT(*)::int AS transitions,COUNT(DISTINCT job_id)::int AS jobs
      FROM workload_job_events WHERE event_at>=NOW()-$1*INTERVAL '1 day' AND NOT baseline GROUP BY state`,[days]),
    query(`SELECT MIN(requested_at) AS first_request,MAX(requested_at) AS latest_request,COUNT(*)::int AS stored_requests FROM workload_requests`),
    query(`SELECT date_trunc('hour',requested_at AT TIME ZONE $2) AS hour,operation,COUNT(*)::int AS requests,SUM(io_duration_ms) AS total_io_ms FROM workload_requests WHERE requested_at>=NOW()-$1*INTERVAL '1 day' GROUP BY 1,2 ORDER BY 1`,[days,timezone]),
    query(`WITH transitions AS (
      SELECT state,event_at,lag(state) OVER(PARTITION BY job_id ORDER BY id) AS previous_state,
      lag(event_at) OVER(PARTITION BY job_id ORDER BY id) AS previous_at
      FROM workload_job_events WHERE NOT baseline AND event_at>=NOW()-$1*INTERVAL '1 day'
    ) SELECT COUNT(*)::int AS measured_attempts,
      percentile_cont(.5) WITHIN GROUP(ORDER BY EXTRACT(EPOCH FROM(event_at-previous_at))*1000) AS p50_ms,
      percentile_cont(.95) WITHIN GROUP(ORDER BY EXTRACT(EPOCH FROM(event_at-previous_at))*1000) AS p95_ms,
      MAX(EXTRACT(EPOCH FROM(event_at-previous_at))*1000) AS max_ms
      FROM transitions WHERE state='running' AND previous_state='queued'`,[days])
  ]);
  return {days,timezone,generated_at:new Date().toISOString(),capture:workloadTelemetryStatus(),coverage:coverage.rows[0],requests:requests.rows,job_transitions:jobs.rows,hourly:hourly.rows,app_queue_wait:queue.rows[0],
    notes:['Response received is not proof of validated history or publication; use job outcomes and existing batch records.','Unfinished requests may be active or interrupted; they are never counted as successful.','HTTP time includes router waiting and broker work; those components are not measured separately.','Baseline job events are pre-existing state, not reconstructed historical requests.']};
}
