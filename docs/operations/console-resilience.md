# Worker console and stuck-operation resilience

Visible worker consoles remain supported. Windows QuickEdit is disabled in the Python worker itself, after the launcher's PowerShell process exits. stdout/stderr writes use bounded daemon queues so console selection cannot block account reads, MT5 recovery, or health handlers. At most 2048 writes per stream are buffered; excess diagnostic writes are dropped (reported in health), never account data.

The operation lock exposes its monotonic age. At 600 seconds health becomes `stalled`, which the existing router excludes and the 30-second Telegram monitor observes. At 690 seconds a separate watchdog exits Python with code 75. The existing visible BAT supervisor restarts it after 15 seconds. A very long account read can be interrupted; no trade execution is performed by these workers. This is a safety bound, not a guarantee against OS/native-code failures that prevent watchdog execution. Health still does not claim live broker login verification on every lightweight check.

Production rollout 2026-10-03: pilot T12, verify real base-account login plus EA probe, then drain/restart Python for T1–T11 serially without closing MT5. Shared files apply to inactive T13–T15 at next launch. Backup: `C:\ProgramData\WinnerPip\console-resilience-20261003\worker.py`. Rollout scripts and per-worker log are in the same directory.

Rollback: drain one worker, restore the backed-up worker.py to C:\BirrForex\vps\worker.py, restart only that worker's Python/visible supervisor and verify health, then repeat for the remaining workers. The extra worker_resilience.py file is inert with the old worker. Revert the corresponding Git change so later deployment does not reintroduce it. Do not restart all workers simultaneously.
