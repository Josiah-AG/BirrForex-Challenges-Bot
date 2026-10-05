/** Keep clients polling across the gap between durable enqueue and batch creation. */
export function queuedPullProgress(job: { id: string | number; challenge_id: number; created_at?: string | Date; state?: string }, now = Date.now()) {
  const elapsed = job.created_at ? Math.max(0, Math.floor((now - new Date(job.created_at).getTime()) / 1000)) : 0;
  return {
    isRunning: true, isQueued: true, jobId: job.id, challengeId: job.challenge_id,
    phase: 'queued', currentStep: 1, totalSteps: 4,
    stepLabel: job.state === 'running' ? 'Starting update — preparing terminals' : 'Update queued — waiting for the current operation to finish',
    percent: 0, processed: 0, total: 0, totalAccounts: 0,
    elapsed, elapsedSeconds: elapsed, etaSeconds: null,
  };
}
