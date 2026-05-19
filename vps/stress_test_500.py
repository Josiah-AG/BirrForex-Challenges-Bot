"""
500-Account Stress Test — Simulates real production pull cycle.
Sends 500 pull requests (batches of 10 parallel) across all terminals.
Uses 2 real accounts + 2 demo accounts to simulate variety.
"""

import asyncio
import aiohttp
import time
import random
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
BATCH_SIZE = 10  # 10 parallel (one per terminal)
NUM_TERMINALS = 10

# Results tracking
results = {"success": 0, "failed": 0, "errors": [], "times": []}


async def do_pull(session, request_num):
    """Single pull request."""
    acct = ACCOUNTS[request_num % len(ACCOUNTS)]
    terminal_id = (request_num % NUM_TERMINALS) + 1

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
            f"{VPS_URL}/pull", json=payload, timeout=aiohttp.ClientTimeout(total=90)
        ) as resp:
            data = await resp.json()
            elapsed = time.time() - start
            results["times"].append(elapsed)

            if data.get("success"):
                results["success"] += 1
            else:
                results["failed"] += 1
                results["errors"].append(
                    f"Req#{request_num} T{terminal_id} {acct['account']}: {data.get('message', 'unknown')}"
                )
    except Exception as e:
        elapsed = time.time() - start
        results["times"].append(elapsed)
        results["failed"] += 1
        results["errors"].append(f"Req#{request_num} T{terminal_id}: EXCEPTION {str(e)[:80]}")


async def run_stress_test():
    print("=" * 60)
    print("  500-ACCOUNT STRESS TEST")
    print(f"  {TOTAL_REQUESTS} pulls | Batches of {BATCH_SIZE} | {NUM_TERMINALS} terminals")
    print("=" * 60)

    # Check health first
    async with aiohttp.ClientSession() as session:
        async with session.get(f"{VPS_URL}/health", timeout=aiohttp.ClientTimeout(total=10)) as resp:
            health = await resp.json()
            print(f"\n  Pre-test health: {health['alive_workers']}/10 workers alive")

    print(f"\n  Starting {TOTAL_REQUESTS} requests in batches of {BATCH_SIZE}...")
    print("-" * 60)

    overall_start = time.time()

    async with aiohttp.ClientSession() as session:
        for batch_start in range(0, TOTAL_REQUESTS, BATCH_SIZE):
            batch_end = min(batch_start + BATCH_SIZE, TOTAL_REQUESTS)
            batch_num = (batch_start // BATCH_SIZE) + 1
            total_batches = (TOTAL_REQUESTS + BATCH_SIZE - 1) // BATCH_SIZE

            tasks = [do_pull(session, i) for i in range(batch_start, batch_end)]
            await asyncio.gather(*tasks)

            # Progress every 5 batches
            if batch_num % 5 == 0 or batch_num == total_batches:
                elapsed = time.time() - overall_start
                print(
                    f"  Batch {batch_num}/{total_batches} | "
                    f"Done: {batch_end}/{TOTAL_REQUESTS} | "
                    f"OK: {results['success']} | "
                    f"Fail: {results['failed']} | "
                    f"Time: {elapsed:.1f}s"
                )

    overall_time = time.time() - overall_start

    # Final health check
    async with aiohttp.ClientSession() as session:
        async with session.get(f"{VPS_URL}/health", timeout=aiohttp.ClientTimeout(total=10)) as resp:
            health_after = await resp.json()

    # Report
    print("\n" + "=" * 60)
    print("  STRESS TEST REPORT")
    print("=" * 60)
    print(f"  Total requests:    {TOTAL_REQUESTS}")
    print(f"  Successful:        {results['success']}")
    print(f"  Failed:            {results['failed']}")
    print(f"  Success rate:      {results['success']/TOTAL_REQUESTS*100:.1f}%")
    print(f"  Total time:        {overall_time:.1f}s")
    print(f"  Avg per request:   {sum(results['times'])/len(results['times']):.2f}s")
    print(f"  Min time:          {min(results['times']):.2f}s")
    print(f"  Max time:          {max(results['times']):.2f}s")
    print(f"  Throughput:        {TOTAL_REQUESTS/overall_time:.1f} req/min" if overall_time > 0 else "")
    print(f"\n  Post-test health:  {health_after['alive_workers']}/10 workers alive")
    print(f"  Healthy terminals: {health_after['healthy_terminals']}")

    if results["errors"]:
        print(f"\n  ERRORS ({len(results['errors'])}):")
        for err in results["errors"][:20]:  # Show first 20
            print(f"    - {err}")
        if len(results["errors"]) > 20:
            print(f"    ... and {len(results['errors']) - 20} more")

    print("=" * 60)

    # Return summary as JSON for parsing
    return {
        "total": TOTAL_REQUESTS,
        "success": results["success"],
        "failed": results["failed"],
        "success_rate": f"{results['success']/TOTAL_REQUESTS*100:.1f}%",
        "total_time_seconds": round(overall_time, 1),
        "avg_time_per_request": round(sum(results["times"]) / len(results["times"]), 2),
        "workers_alive_after": health_after["alive_workers"],
    }


if __name__ == "__main__":
    summary = asyncio.run(run_stress_test())
    print(f"\n  JSON Summary: {json.dumps(summary)}")
