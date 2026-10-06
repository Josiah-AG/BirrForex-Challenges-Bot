# WinnerPip EA SL/TP comparison — October 6, 2026

## Scope and controls

Assessment only for active challenge 38. No deployed source, feature flags, schedules, rankings, penalties or production trade records were changed. Production database access was in read-only transactions; shadow evaluation intercepted all writes and disabled notifications. Temporary VPS runner used the existing router and workers, with eight concurrent requests. No terminal restart was performed.

The initial database snapshot contained 94 registrations with successful pull status and two credential failures. Credential failures were excluded. Both measured passes used identical account sets, history ranges, concurrency and the existing priority request path, because native SL/TP recovery is currently gated behind that path. This is an EA-off versus EA-on controlled comparison, not a full production WinnerPip scheduling benchmark.

An initial Mac-to-VPS attempt suffered transport errors and was discarded for timing conclusions. The accepted comparison ran locally on the VPS against its existing router.

## Measured account-pull stage

| Measure | EA off | EA on |
| --- | ---: | ---: |
| Requested accounts | 94 | 94 |
| Successful account responses | 93 | 94 |
| Wall time | 176.156 s | 217.688 s |
| Difference | | +41.532 s (+23.58%) |

The EA-off pass had one history-incomplete response. That account succeeded in the later pass; this does not establish that EA SL/TP recovery fixed its history. Recovery happens after history collection.

The comparison excludes the application's subsequent settle, OHLC collection, evaluation and publishing stages. Do not present 41.532 seconds as the isolated EA cost or a guaranteed increase on a 250-second production pull. Broker/history/queue conditions vary between sequential passes.

## Recovery results

- 315 missing SL values and 261 missing TP values recovered.
- 360 unique closing-deal records enriched across 51 accounts (358 records opened during the challenge).
- 46 accounts gained SL data; 48 gained TP data; these groups overlap.
- Across 933 returned trade records: 29 accounts required no recovery; 64 had a successful reader response; one reader timed out, but its normal account response still succeeded.
- Successful reader responses: median 234 ms, maximum 328 ms.
- Combined recorded reader time across all accounts: 15.099 seconds. This is aggregate worker time, not added batch wall time; workers overlap.

## Evaluation method and limitation

Use each successful extended snapshot twice, once preserving entry-only SL/TP and once filling missing values from native closing-deal evidence. All other trade inputs and the candle database snapshot are held constant. This prevents newly closed trades between the timed passes from being misattributed to SL/TP recovery. The fallback scenario intentionally tests feeding closing levels into evaluation; display-only enrichment would leave evaluation inputs unchanged.

Initial full shadow evaluation encountered a separate funding prerequisite issue: recorded pre-start snapshots were later than the configured challenge start (for example 04:02 UTC versus a 03:00 UTC start on October 5). The comparison therefore holds the existing starting-balance basis fixed and excludes re-running that pre-start reconciliation gate in both variants. This is a trade-rule comparison, not proof that full production funding validation would succeed. Nothing was changed to bypass this gate in production.

Final evaluation results are appended after the full comparison completes. Any outstanding candle checks must remain unresolved, not counted as verified passes.

## Final shadow evaluation results

- 94 accounts completed both variants without evaluation exceptions under the fixed-starting-balance comparison.
- 921 in-challenge trade records evaluated.
- Zero changed account summaries (including adjusted balance, deductions, qualified counts and eligibility).
- Zero changed per-trade qualification decisions or violation lists.
- Thirty pending candle checks across 14 accounts remained pending in both variants. These are not verified passes and prevent an unconditional claim that every trade's risk check is complete.

Recommendation: recovered SL/TP has useful display coverage on this dataset. Preserve provenance and original entry values, keep recovery optional/nonfatal, and run a challenge-lane integration benchmark before promising a production duration. The separate pre-start snapshot timing discrepancy warrants its own diagnosis; this assessment did not modify it.
