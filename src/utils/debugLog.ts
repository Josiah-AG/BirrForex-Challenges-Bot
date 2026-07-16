/**
 * In-memory debug logger for pull/evaluation diagnostics.
 * Stores timestamped entries in a circular buffer (max 5000 entries).
 * NOT printed to console — only accessible via admin API download.
 */

const MAX_ENTRIES = 5000;

interface DebugEntry {
  ts: string;       // ISO timestamp
  phase: string;    // e.g. 'pull', 'resolve', 'evaluate', 'pair_check'
  account?: string; // account number
  message: string;
  data?: any;       // optional structured data
}

class DebugLogger {
  private entries: DebugEntry[] = [];
  private enabled = true;

  log(phase: string, message: string, account?: string, data?: any) {
    if (!this.enabled) return;
    const entry: DebugEntry = {
      ts: new Date().toISOString(),
      phase,
      message,
      ...(account ? { account } : {}),
      ...(data !== undefined ? { data } : {}),
    };
    this.entries.push(entry);
    if (this.entries.length > MAX_ENTRIES) {
      this.entries.shift(); // circular: drop oldest
    }
  }

  getEntries(): DebugEntry[] {
    return [...this.entries];
  }

  getEntriesAsText(): string {
    return this.entries.map(e => {
      const acct = e.account ? ` [${e.account}]` : '';
      const dataStr = e.data !== undefined ? ` | ${JSON.stringify(e.data)}` : '';
      return `[${e.ts}] [${e.phase}]${acct} ${e.message}${dataStr}`;
    }).join('\n');
  }

  clear() {
    this.entries = [];
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  getSize(): number {
    return this.entries.length;
  }
}

export const debugLog = new DebugLogger();
