"""
500-Account Stress Test v3 — Shared Queue (Work Stealing)
All terminals pull from ONE shared queue.
When a terminal finishes one account, it grabs the next immediately.
Fast terminals naturally do more work — no one waits for anyone.
This is the same pattern the real VPS pull scheduler uses.
"""

import asyncio
import aiohttp
import time
import json

VPS_URL = "http://108.181.184.223:8000"
API_KEY = "wp-k8x2m9f4v7j3n6q1w5t8r2y4u7i0p3"

# Test accounts (alternating to simulate real load)
ACCOUNTS = [
    {"account": "133643354", "server": "Exness-MT5Real9", "password": "Aa@12345"},
    {"account": "407434926", "server": "Exness-MT5Real10", "password": "Aaa@112212"},
    {"account": "435923524", "server": "Exness-MT5Trial9", "password": "Aa@11221234"},
    {"account": "435924397", "server": "Exness-MT5Trial9", "password": "Abc@1234"},
]

TOTAL_REQUESTS = 500
NUM_TERMINALS = 10

# Results tracking
results = {"success": 0, "failed": 0, "errors": [], "times": [], "per_terminal": {}}
_lock = asyncio.Lock()
_completed = 0


async def do_pull(session, terminal_id, request_num, acct):
    """Single pull request to a specific terminal."""
    global _completed

    payload = {
        "account": acct["account"],
        "server": acct["server"],
        "password": acct["password"],
        "api_key": API_KEY,
        "terminal_id": terminal_id,
    }

    start = time.time()
    try:
        async with session.post(
            f"{VPS_URL}/pull", json=payload, timeout=aiohttp.ClientTimeout(total=120)
        ) as resp:
            data = await resp.json()
            elapsed = time.time() - start

            async with _lock:
                results["times"].append(elapsed)
                _completed += 1

                if data.get("success"):
                    results["success"] += 1
                else:
                    results["failed"] += 1
                    results["errors"].append(
                        f"Req#{request_num} T{terminal_id} {acct['account']}: {data.get('message', 'unknown')}"
                    )

                if terminal_id not in results["per_terminal"]:
                    results["per_terminal"][terminal_id] = {"ok": 0, "fail": 0, "times": []}
                results["per_terminal"][terminal_id]["times"].append(elapsed)
                if data.get("success"):
                    results["per_terminal"][terminal_id]["ok"] += 1
                else:
                    results["per_terminal"][terminal_id]["fail"] += 1

    except Exception as e:
        elapsed = time.time() - start
        async with _lock:
            results["times"].append(elapsed)
            results["failed"] += 1
            _completed += 1
            results["errors"].append(f"Req#{request_num} T{terminal_id}: EXCEPTION {str(e)[:80]}")

            if terminal_id not in results["per_terminal"]:
                results["per_terminal"][terminal_id] = {"ok": 0, "fail": 0, "times": []}
            results["per_terminal"][terminal_id]["fail"] += 1
            results["per_terminal"][terminal_id]["times"].append(elapsed)


async def terminal_worker(session, terminal_id, shared_queue):
    """
    Each terminal grabs work from the SHARED queue.
    When it finishes one, it immediately grabs the next.
    Fast terminals naturally process more accounts.
    """
    while True:
        try:
            request_num, acct = shared_queue.get_nowait()
        except asyncio.QueueEmpty:
            break
        await do_pull(session, terminal_id, request_num, acct)
        shared_queue.task_done()


async def progress_reporter(overall_start):
    """Report progress every 10 seconds."""
    global _completed
    while _completed < TOTAL_REQUESTS:
        await asyncio.sleep(10)
        elapsed = time.time() - overall_start
        rate = _completed / elapsed if elapsed > 0 else 0
        eta = (TOTAL_REQUESTS - _completed) / rate if rate > 0 else 0
        print(
            f"  Progress: {_completed}/{TOTAL_REQUESTS} | "
            f"OK: {results['success']} | Fail: {results['failed']} | "
            f"Time: {elapsed:.0f}s | ETA: {eta:.0f}s",
            flush=True
        )


async def run_stress_test():
    global _completed

    print("=" * 60)
    print("  500-ACCOUNT STRESS TEST v3 (Shared Queue — Work Stealing)")
    print(f"  {TOTAL_REQUESTS} pulls | {NUM_TERMINALS} terminals")
    print(f"  Fast terminals help slow ones — no waiting!")
    print("=" * 60)

    # Check health first
    async with aiohttp.ClientSession() as session:
        async with session.get(f"{VPS_URL}/health", timeout=aiohttp.ClientTimeout(total=10)) as resp:
            health = await resp.json()
            print(f"\n  Pre-test health: {health['alive_workers']}/10 workers alive")

    # Single shared queue — all terminals pull from this
    shared_queue = asyncio.Queue()
    for i in range(TOTAL_REQUESTS):
        acct = ACCOUNTS[i % len(ACCOUNTS)]
        shared_queue.put_nowait((i + 1, acct))

    print(f"  Queue: {TOTAL_REQUESTS} accounts ready")
    print(f"\n  Starting... (progress every 10s)\n")

    overall_start = time.time()

    async with aiohttp.ClientSession() as session:
        # All terminals compete for work from the shared queue
        tasks = [terminal_worker(session, tid, shared_queue) for tid in range(1, NUM_TERMINALS + 1)]
        tasks.append(progress_reporter(overall_start))
        await asyncio.gather(*tasks)

    overall_time = time.time() - overall_start

    # Final health check
    async with aiohttp.ClientSession() as session:
        async with session.get(f"{VPS_URL}/health", timeout=aiohttp.ClientTimeout(total=10)) as resp:
            health_after = await resp.json()

    # Report
    print("\n" + "=" * 60)
    print("  STRESS TEST REPORT (v3 — Shared Queue)")
    print("=" * 60)
    print(f"  Total requests:    {TOTAL_REQUESTS}")
    print(f"  Successful:        {results['success']}")
    print(f"  Failed:            {results['failed']}")
    print(f"  Success rate:      {results['success']/TOTAL_REQUESTS*100:.1f}%")
    print(f"  Total time:        {overall_time:.1f}s ({overall_time/60:.1f} min)")
    print(f"  Avg per request:   {sum(results['times'])/len(results['times']):.2f}s")
    print(f"  Min time:          {min(results['times']):.2f}s")
    print(f"  Max time:          {max(results['times']):.2f}s")
    print(f"  Effective rate:    {TOTAL_REQUESTS/overall_time*60:.1f} req/min")

    # Per terminal breakdown — shows work distribution
    print(f"\n  Per Terminal (work distribution):")
    for tid in sorted(results["per_terminal"].keys()):
        t = results["per_terminal"][tid]
        avg = sum(t["times"]) / len(t["times"]) if t["times"] else 0
        total_pulls = len(t["times"])
        print(f"    T{tid:2d}: {t['ok']:2d}✓ {t['fail']:2d}✗ | avg {avg:.1f}s | did {total_pulls} pulls")

    print(f"\n  Post-test health:  {health_after['alive_workers']}/10 workers alive")
    print(f"  Healthy terminals: {health_after.get('healthy_terminals', 'N/A')}")

    if results["errors"]:
        print(f"\n  ERRORS ({len(results['errors'])}):")
        for err in results["errors"][:20]:
            print(f"    - {err}")
        if len(results["errors"]) > 20:
            print(f"    ... and {len(results['errors']) - 20} more")

    # 3000 projection
    if results["success"] > 0:
        # With shared queue, projection = total_time * (3000/500)
        proj = overall_time * (3000 / TOTAL_REQUESTS)
        print(f"\n  📊 3000-account projection: ~{proj/60:.1f} min")

    print("=" * 60)

    return {
        "total": TOTAL_REQUESTS,
        "success": results["success"],
        "failed": results["failed"],
        "success_rate": f"{results['success']/TOTAL_REQUESTS*100:.1f}%",
        "total_time_seconds": round(overall_time, 1),
        "avg_time_per_request": round(sum(results["times"]) / len(results["times"]), 2),
        "effective_rate_per_min": round(TOTAL_REQUESTS / overall_time * 60, 1),
        "workers_alive_after": health_after["alive_workers"],
    }


if __name__ == "__main__":
    summary = asyncio.run(run_stress_test())
    print(f"\n  JSON: {json.dumps(summary)}")
