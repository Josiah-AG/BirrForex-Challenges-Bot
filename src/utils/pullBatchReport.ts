/** Balance checks share the history table but are not trade pulls. */
export function pullBatchReport(batch: any) {
  const isBalanceCheck = ['balance_check', 'final_balance_warning'].includes(batch.error_log);
  const start = new Date(batch.started_at).getTime();
  const end = new Date(batch.completed_at).getTime();
  const elapsed = end - start;
  // Older balance checks inserted both timestamps only after finishing.
  const durationSec = batch.started_at && batch.completed_at && Number.isFinite(elapsed) && elapsed >= 0
    && !(isBalanceCheck && elapsed === 0) ? Math.round(elapsed / 1000) : null;
  return {
    isBalanceCheck,
    batchKind: isBalanceCheck ? 'balance_check' : batch.error_log === 'pre_start_check' ? 'pre_start_check' : 'pull',
    durationSec,
    warningCount: isBalanceCheck ? Number(batch.new_trades_found || 0) : 0,
  };
}
