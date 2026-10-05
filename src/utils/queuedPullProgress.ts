/** Keep clients polling across the gap between durable enqueue and batch creation. */
export function queuedPullProgress(job: { id: string | number; challenge_id: number }) {
  return {
    isRunning: true, isQueued: true, jobId: job.id, challengeId: job.challenge_id,
    phase: 'queued', currentStep: 1, totalSteps: 4,
    stepLabel: 'Queued — waiting for the next available pull slot',
    percent: 0, processed: 0, total: 0, totalAccounts: 0,
    elapsed: 0, elapsedSeconds: 0, etaSeconds: null,
  };
}
