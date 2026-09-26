# File coverage — system audit, 25 September 2026

Baseline: 0329a78. 124 tracked source/configuration files inventoried. Lockfiles, binary assets, prose documentation and the nested historical Git checkout are not counted as production implementation files. The deployed backend is the root src tree; the deployed frontend is WinnerPip/winnerpip.

D = detailed review of the relevant functions/contracts (not a claim every line or branch was executed). S = source/config structural scan only, with no independent behavioral validation. T = test/repair artifact with execution noted. This distinction is intentional: a broad file inventory does not prove whole-system correctness. Primary admin/host creation and management paths received the detailed pass. Supporting quiz and Windows/VPS systems received narrower review.

The audit made no production changes. Source scans read files without importing application bootstrap or executing operational scripts. Production SQL checks used READ ONLY transactions.

| File | Depth | Checks and notes |
| --- | --- | --- |
| `Procfile` | S | text inventory; Structural/static inventory only; not independently behavior-verified |
| `WinnerPip/winnerpip/.eslintrc.json` | S | JSON parse OK; Structural/static inventory only; not independently behavior-verified |
| `WinnerPip/winnerpip/Dockerfile` | D | text inventory; A01; public build configuration and deployment structure |
| `WinnerPip/winnerpip/app/(admin)/layout.tsx` | S | syntax parse OK; Structural/static inventory only; not independently behavior-verified |
| `WinnerPip/winnerpip/app/(auth)/login/page.tsx` | S | syntax parse OK; Structural/static inventory only; not independently behavior-verified |
| `WinnerPip/winnerpip/app/(auth)/register/page.tsx` | S | syntax parse OK; Structural/static inventory only; not independently behavior-verified |
| `WinnerPip/winnerpip/app/(trader)/layout.tsx` | S | syntax parse OK; Structural/static inventory only; not independently behavior-verified |
| `WinnerPip/winnerpip/app/PCD/C/challenges/page.tsx` | S | syntax parse OK; Structural/static inventory only; not independently behavior-verified |
| `WinnerPip/winnerpip/app/PCD/C/dashboard/page.tsx` | S | syntax parse OK; Structural/static inventory only; not independently behavior-verified |
| `WinnerPip/winnerpip/app/PCD/C/login/page.tsx` | S | syntax parse OK; Structural/static inventory only; not independently behavior-verified |
| `WinnerPip/winnerpip/app/PCD/C/page.tsx` | S | syntax parse OK; Structural/static inventory only; not independently behavior-verified |
| `WinnerPip/winnerpip/app/StatsSection.tsx` | S | syntax parse OK; Structural/static inventory only; not independently behavior-verified |
| `WinnerPip/winnerpip/app/about/layout.tsx` | S | syntax parse OK; Structural/static inventory only; not independently behavior-verified |
| `WinnerPip/winnerpip/app/about/page.tsx` | S | syntax parse OK; Structural/static inventory only; not independently behavior-verified |
| `WinnerPip/winnerpip/app/admin/[id]/page.tsx` | D | syntax parse OK; A23; legacy admin interface |
| `WinnerPip/winnerpip/app/admin/panel/page.tsx` | D | syntax parse OK; A01/A02/A04/A06/A15; primary create/manage UI |
| `WinnerPip/winnerpip/app/challenge/[id]/page.tsx` | S | syntax parse OK; Structural/static inventory only; not independently behavior-verified |
| `WinnerPip/winnerpip/app/challenges/layout.tsx` | S | syntax parse OK; Structural/static inventory only; not independently behavior-verified |
| `WinnerPip/winnerpip/app/challenges/page.tsx` | S | syntax parse OK; Structural/static inventory only; not independently behavior-verified |
| `WinnerPip/winnerpip/app/host/dashboard/page.tsx` | D | syntax parse OK; A04/A05/A06/A09/A13; host create/manage UI |
| `WinnerPip/winnerpip/app/host/layout.tsx` | D | syntax parse OK; Host route layout; no server authorization barrier |
| `WinnerPip/winnerpip/app/host/login/page.tsx` | S | syntax parse OK; Structural/static inventory only; not independently behavior-verified |
| `WinnerPip/winnerpip/app/host/page.tsx` | S | syntax parse OK; Structural/static inventory only; not independently behavior-verified |
| `WinnerPip/winnerpip/app/host/register/page.tsx` | D | syntax parse OK; Contact-based account provisioning; no new finding |
| `WinnerPip/winnerpip/app/layout.tsx` | S | syntax parse OK; Structural/static inventory only; not independently behavior-verified |
| `WinnerPip/winnerpip/app/page.tsx` | S | syntax parse OK; Structural/static inventory only; not independently behavior-verified |
| `WinnerPip/winnerpip/app/privacy/page.tsx` | S | syntax parse OK; Structural/static inventory only; not independently behavior-verified |
| `WinnerPip/winnerpip/app/robots.ts` | S | syntax parse OK; Structural/static inventory only; not independently behavior-verified |
| `WinnerPip/winnerpip/app/settings/page.tsx` | S | syntax parse OK; Structural/static inventory only; not independently behavior-verified |
| `WinnerPip/winnerpip/app/sitemap.ts` | S | syntax parse OK; Structural/static inventory only; not independently behavior-verified |
| `WinnerPip/winnerpip/app/terms/page.tsx` | S | syntax parse OK; Structural/static inventory only; not independently behavior-verified |
| `WinnerPip/winnerpip/components/BalanceChart.tsx` | S | syntax parse OK; Structural/static inventory only; not independently behavior-verified |
| `WinnerPip/winnerpip/components/ui/button.tsx` | S | syntax parse OK; Structural/static inventory only; not independently behavior-verified |
| `WinnerPip/winnerpip/components/ui/card.tsx` | S | syntax parse OK; Structural/static inventory only; not independently behavior-verified |
| `WinnerPip/winnerpip/components/ui/input.tsx` | S | syntax parse OK; Structural/static inventory only; not independently behavior-verified |
| `WinnerPip/winnerpip/components/ui/tooltip.tsx` | S | syntax parse OK; Structural/static inventory only; not independently behavior-verified |
| `WinnerPip/winnerpip/lib/mockData.ts` | S | syntax parse OK; Structural/static inventory only; not independently behavior-verified |
| `WinnerPip/winnerpip/lib/utils.ts` | S | syntax parse OK; Structural/static inventory only; not independently behavior-verified |
| `WinnerPip/winnerpip/middleware.ts` | S | syntax parse OK; Structural/static inventory only; not independently behavior-verified |
| `WinnerPip/winnerpip/package.json` | S | JSON parse OK; Structural/static inventory only; not independently behavior-verified |
| `WinnerPip/winnerpip/railway.json` | S | JSON parse OK; Structural/static inventory only; not independently behavior-verified |
| `WinnerPip/winnerpip/tailwind.config.ts` | S | syntax parse OK; Structural/static inventory only; not independently behavior-verified |
| `WinnerPip/winnerpip/tsconfig.json` | S | JSON parse OK; Structural/static inventory only; not independently behavior-verified |
| `WinnerPip/winnerpip/types/index.ts` | S | syntax parse OK; Structural/static inventory only; not independently behavior-verified |
| `drawdown_check.ts` | S | syntax parse OK; Structural/static inventory only; not independently behavior-verified |
| `eval3.ts` | S | syntax parse OK; Structural/static inventory only; not independently behavior-verified |
| `evaluate.ts` | S | syntax parse OK; Structural/static inventory only; not independently behavior-verified |
| `package.json` | D | JSON parse OK; Build/test/start scripts inspected |
| `railway.json` | D | JSON parse OK; Deployment build/start configuration inspected |
| `scripts/repair-journal.cjs` | T | syntax parse OK; Existing repair tooling reviewed in prior implementation; journal tests rerun; no repair executed |
| `scripts/repair-rules.cjs` | T | syntax parse OK; Existing repair tooling reviewed in prior implementation; journal tests rerun; no repair executed |
| `src/api/discordRoutes.ts` | D | syntax parse OK; A03/A09; alternative create/registration adapter and API-key middleware |
| `src/api/hostRoutes.ts` | D | syntax parse OK; A06, A13, A17, A22; ownership and management actions |
| `src/api/server.ts` | D | syntax parse OK; A01–A10, A14–A17, A21; route contracts/auth/registration/results |
| `src/bot/adminHandler.ts` | S | syntax parse OK; Structural/static inventory only; not independently behavior-verified |
| `src/bot/bot.ts` | D | syntax parse OK; A07; approval callback execution and identity checks |
| `src/bot/evaluationHandler.ts` | D | syntax parse OK; Legacy evaluation adapter compared with canonical rules |
| `src/bot/quizHandler.ts` | S | syntax parse OK; Structural/static inventory only; not independently behavior-verified |
| `src/bot/tradingAdminHandler.ts` | D | syntax parse OK; A02/A03/A15; create adapter and winner preview/publication |
| `src/bot/tradingRegistrationHandler.ts` | D | syntax parse OK; A09; registration/category rules adapter traced |
| `src/config.ts` | S | syntax parse OK; Structural/static inventory only; not independently behavior-verified |
| `src/database/add_challenge_time.sql` | S | text inventory; Structural/static inventory only; not independently behavior-verified |
| `src/database/db.ts` | D | syntax parse OK; A17; pool query semantics and transaction capability |
| `src/database/discord_migration.sql` | S | text inventory; Structural/static inventory only; not independently behavior-verified |
| `src/database/host_schema.sql` | D | text inventory; Host/CSV schema and foreign keys |
| `src/database/migrate.ts` | D | syntax parse OK; A21; indexes, ownership deletion, migration failure handling |
| `src/database/migrate_challenge_time.ts` | S | syntax parse OK; Structural/static inventory only; not independently behavior-verified |
| `src/database/migrate_leaderboard_timing.sql` | S | text inventory; Structural/static inventory only; not independently behavior-verified |
| `src/database/migration_nickname_vps.sql` | S | text inventory; Structural/static inventory only; not independently behavior-verified |
| `src/database/schema.sql` | S | text inventory; Structural/static inventory only; not independently behavior-verified |
| `src/database/trading_schema.sql` | D | text inventory; Challenge/registration/winner schema contracts |
| `src/database/wp_schema.sql` | D | text inventory; Rules/trades/leaderboard schema contracts |
| `src/i18n/am.ts` | S | syntax parse OK; Structural/static inventory only; not independently behavior-verified |
| `src/i18n/en.ts` | S | syntax parse OK; Structural/static inventory only; not independently behavior-verified |
| `src/i18n/index.ts` | S | syntax parse OK; Structural/static inventory only; not independently behavior-verified |
| `src/index.ts` | D | syntax parse OK; Scheduler/bootstrap/deployment side effects |
| `src/scheduler/scheduler.ts` | D | syntax parse OK; Quiz eligibility/backup comparison and background ownership review |
| `src/scheduler/tradingScheduler.ts` | D | syntax parse OK; A06/A10/A11/A16/A18; lifecycle, screening, lock and calendar |
| `src/scheduler/vpsPullScheduler.ts` | D | syntax parse OK; A12–A14/A16–A18/A22; scheduling, overrides, DQ, publication |
| `src/services/challengeGatekeeper.ts` | D | syntax parse OK; A02/A03/A06/A07; approval and persistence |
| `src/services/challengeService.ts` | S | syntax parse OK; Structural/static inventory only; not independently behavior-verified |
| `src/services/emailService.ts` | D | syntax parse OK; Presentation escaping and notification contract review |
| `src/services/evaluationEngine.ts` | D | syntax parse OK; A18; legacy rule/calendar/percentage differences |
| `src/services/evaluationService.ts` | D | syntax parse OK; Legacy evaluation persistence/qualification queries inspected |
| `src/services/exnessService.ts` | D | syntax parse OK; A11; global partner context |
| `src/services/hostService.ts` | D | syntax parse OK; A04/A08/A20; host lifecycle, list DTO, encryption |
| `src/services/leaderboardService.ts` | D | syntax parse OK; A14/A17/A22; ranking, seeding, publication |
| `src/services/mt5Parser.ts` | S | syntax parse OK; Structural/static inventory only; not independently behavior-verified |
| `src/services/notificationService.ts` | D | syntax parse OK; Quiz notification routing inspected; not live-tested |
| `src/services/participantService.ts` | D | syntax parse OK; Quiz completion ordering and ranking follow-up |
| `src/services/postService.ts` | S | syntax parse OK; Structural/static inventory only; not independently behavior-verified |
| `src/services/sessionService.ts` | D | syntax parse OK; Quiz idempotent answer persistence inspected; no new finding asserted |
| `src/services/tradingChallengeService.ts` | D | syntax parse OK; A06/A11/A22; CRUD, registration selection, winner persistence |
| `src/services/userService.ts` | S | syntax parse OK; Structural/static inventory only; not independently behavior-verified |
| `src/services/vpsService.ts` | D | syntax parse OK; A09; verification result contract and unavailable-service behavior |
| `src/services/winnerService.ts` | D | syntax parse OK; Quiz backup promotion eligibility follow-up |
| `src/services/wpEvaluationEngine.ts` | D | syntax parse OK; A05/A10/A18/A19; canonical evaluation and rules, scoring-window review |
| `src/types/index.ts` | S | syntax parse OK; Structural/static inventory only; not independently behavior-verified |
| `src/utils/categorySettings.ts` | D | syntax parse OK; A05/A10; category resolution and monetary settings |
| `src/utils/debugLog.ts` | S | syntax parse OK; Structural/static inventory only; not independently behavior-verified |
| `src/utils/encryption.ts` | D | syntax parse OK; A20; credential envelope and nonce handling |
| `src/utils/helpers.ts` | D | syntax parse OK; Supporting parsing/admin helper inspection |
| `src/utils/messages.ts` | S | syntax parse OK; Structural/static inventory only; not independently behavior-verified |
| `src/utils/rulePolicy.ts` | D | syntax parse OK; Existing toggle contract and regression tests |
| `src/utils/timezone.ts` | D | syntax parse OK; A18; challenge timezone helpers |
| `test_mt5.py` | S | text inventory; Structural/static inventory only; not independently behavior-verified |
| `tests/browser-smoke.cjs` | T | syntax parse OK; Existing browser test inspected; not rerun in this audit |
| `tests/repair-journal.test.cjs` | T | syntax parse OK; Existing regression suite executed: 24 total tests pass |
| `tests/rules.test.cjs` | T | syntax parse OK; Existing regression suite executed: 24 total tests pass |
| `tsconfig.json` | S | JSON parse OK; Structural/static inventory only; not independently behavior-verified |
| `vps/fake_sl_analysis.py` | S | text inventory; Structural/static inventory only; not independently behavior-verified |
| `vps/fix_leaderboard.py` | S | text inventory; Structural/static inventory only; not independently behavior-verified |
| `vps/keepalive.py` | S | text inventory; Structural/static inventory only; not independently behavior-verified |
| `vps/router.py` | D | text inventory; Routing/auth/operation structure inspected; runtime not exercised |
| `vps/stress_test_500.py` | S | text inventory; Structural/static inventory only; not independently behavior-verified |
| `vps/test_500.py` | S | text inventory; Structural/static inventory only; not independently behavior-verified |
| `vps/test_fake_sl_3accts.py` | S | text inventory; Structural/static inventory only; not independently behavior-verified |
| `vps/test_full_eval.py` | S | text inventory; Structural/static inventory only; not independently behavior-verified |
| `vps/test_full_eval_v2.py` | S | text inventory; Structural/static inventory only; not independently behavior-verified |
| `vps/test_incremental_http.py` | S | text inventory; Structural/static inventory only; not independently behavior-verified |
| `vps/test_incremental_pull.py` | S | text inventory; Structural/static inventory only; not independently behavior-verified |
| `vps/verify_api.py` | D | text inventory; Legacy verification contract/auth structure inspected; runtime not exercised |
| `vps/worker.py` | D | text inventory; A09; MT5 verify payload examined, terminal/runtime not exercised |
| `vps_candle_endpoint.py` | S | text inventory; Structural/static inventory only; not independently behavior-verified |
