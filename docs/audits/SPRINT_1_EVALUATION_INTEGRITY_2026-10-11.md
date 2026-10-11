# Sprint 1 evaluation integrity — 2026-10-11

Authorized rules: percentage risk uses actual broker balance; one fully closed position counts once toward minimum qualified trades; all closing parts must qualify. Active days still include unqualified closes. No change to concurrent-risk allowance, daily realized-loss policy, or leverage. Sprint max-lot rule remains disabled. User confirmed only trades closed by the challenge deadline count.

Changes:
- Reconstruct each entry balance backwards from verified broker balance and raw deal cash movements (profit, commission, swap, fee, withdrawals and other balance operations). Credit is excluded. Same-time events use opening deal ticket order. Invalid history blocks evaluation rather than inventing a balance.
- Position-based total, qualified and flagged counts. An open remainder or missing entry evidence cannot earn minimum qualified-trade credit.
- Growth and target qualification deduct withdrawals, matching the displayed qualified ranking balance without double-deducting stored balances.
- End-time boundary is strict in evaluation and seven trade-history API reads. Later recovery pulls still fetch history, but later closes do not enter results.
- Final full-sync marker is written only after successful whole-scope publication in reviewing mode, never a failed-only retry. Lock requires two marked successful full batches and all remaining contenders to have published history through end with no unresolved in-window risk checks.
- Winner selection explicitly excludes blown and withdrawn accounts.

Read-only production shadow: 100 verified/published accounts checked; zero risk-ledger reconstruction errors. 42 extra partial-close rows; nine accounts have different qualified-position counts. No production rows changed by this comparison. All 3,257 current trades had position identifiers and opening-deal evidence. This validates data compatibility, not a complete replay of risk penalties or ranking outcomes.

Remaining policy characteristics (deliberately unchanged): active days count any closed trade; daily cap measures realized results, so overnight floating risk is not a daily equity cap; four correlated trades can together carry more exposure than a single-trade cap. Cent versus Standard position-sizing differences remain the participant's choice.

The finalizing-pull guard has been reviewed and regression checked, but Sprint's future end event cannot be observed before it occurs. Records with unresolved history/risk evidence intentionally prevent automatic final locking.
