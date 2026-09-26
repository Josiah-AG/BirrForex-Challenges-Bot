# Hardening release and rollback

Baseline: `0329a78eef59228f0886fa0ed567d84a2cb6899f`.
Verified application release: `290c8f29e05b74b03a913313861e81a58b044c7f`. Broker field journal: `production-broker-cipher-v2.json` in the private directory below; three hosts/nine fields migrated and verified.
Private files: `../.repair-backups/2026-09-26-system-hardening/` relative to repository; directory 0700, sensitive files 0600. None are committed.

## Before release

- Full PostgreSQL custom-format backup completed and fully decoded with `pg_restore --file=/dev/null`; metadata and environment snapshot are private.
- Synthetic startup migration twice, rule-save rollback, encrypted-field apply/restore/conflict, scoped publication and failed-batch tests pass.
- Record historical-row fingerprints immediately before and after release, excluding only newly added columns from comparison.
- Set private frontend admin path and canonical origin from the backend configuration; set a matching random management-proxy signing secret in both services. Use Railway `--skip-deploys` so this preparation does not start mixed deployments. Never log secret values.
- Push reviewed commit to main only after builds and tests pass. Verify both Railway deployment commit IDs and public health/login boundaries. Do not trigger live MT5 pulls or user notifications for testing.
- Migrate the three integrated hosts' legacy ciphertext only after the new dual-reader backend is healthy. Write/fsync a private field journal before applying. Check plaintext equality in memory without logging it.

## Emergency code rollback

Do **not** redeploy the unmodified baseline: it has anonymous admin access and cannot read new ciphertext.

A private `safe-backend-rollback/` bundle contains the baseline with: management API prefixes returning 503, current dual-format cipher reader, paused trading/pull scheduler starts, and `npm start`/Railway start commands set to `node dist/index.js` (no old startup data rewrites). It compiles; its real Express management boundary is smoke-tested.

From the linked repository, deploy that prepared directory explicitly:

```sh
railway up '../.repair-backups/2026-09-26-system-hardening/safe-backend-rollback' --path-as-root --service web --detach
```

Verify deployment health and that `/api/admin/*` and `/api/host/*` return maintenance 503. Do not issue Telegram management commands while in emergency recovery. Public service remains available where compatible; automatic challenge processing and admin/host management intentionally pause until repair. Leave the authenticated frontend deployed; it will show backend maintenance errors. Preserve new schema and rows so later legitimate work is not deleted.

## Credential data restoration

`scripts/migrate-broker-ciphers.cjs restore PRIVATE_JOURNAL_PATH` requires DATABASE_URL and BROKER_ENCRYPTION_KEY supplied securely through environment. Never paste credentials into shell commands or logs. The tool locks affected hosts, checks every encrypted field against the journal's recorded after-state, and only then restores the old ciphertext fields in one transaction. Any later broker credential edit aborts restoration rather than overwriting it. The new reader handles old and new formats, so reverting ciphertext is optional for code recovery.

## Schema, approvals and configuration

Retain additive columns/tables and active-registration indexes during maintenance rollback. Recreating old uniqueness constraints after new removed/re-registered accounts exist can fail and must not be forced. Approval recovery creates pending rows only; remove a recovered row only if it is still pending, still bears this migration's `recovered_by` marker, and its challenge remains pending. Never undo a subsequent real admin decision.

The private environment snapshot permits restoring only the variables changed by this release. Compare current values to release after-values first; preserve later administrator changes. Prefer retaining the secure proxy configuration for forward recovery.

A full database restore is the last resort while all writers are stopped. It is not the ordinary rollback: it would lose subsequent activity unless reconciled. No full production database clone or restore was used in testing.
