"""
VPS 500-Account Stress Test — Live Progress
"""
import asyncio
import aiohttp
import time
import sys

VPS_URL = "http://108.181.184.223:8000"
API_KEY = "wp-k8x2m9f4v7j3n6q1w5t8r2y4u7i0p3"

ACCOUNTS = [
    {"account": "407434926", "server": "Exness-MT5Real10", "password": "Aa@11221234"},
    {"account": "133643354", "server": "Exness-MT5Real9", "password": "Ab@112233"},
]

TOTAL_REQUESTS = 500
NUM_TERMINALS = 10
DELAY_BETWEEN = 1.5

# Shared counter
completed = 0
successes = 0
failures = 0
lock = asyncio.Lock()
all_results = []


def log(msg):
    print(msg, flush=True)


async def pull_one(session, account_info, terminal_id, req_num):
    global completed, successes, failures
    payload = {
        "account": account_info["account"],
        "server": account_info["server"],
        "password": account_info["password"],
        "api_key": API_KEY,
        "terminal_id": terminal_id,
    }
    start = time.time()
    try:
        async with session.post(f"{VPS_URL}/pull", json=payload, timeout=aiohttp.ClientTimeout(total=60)) as resp:
            data = await resp.json()
            elapsed = time.time() - start
            ok = data.get("success", False)
            result = {"terminal": terminal_id, "account": account_info["account"], "success": ok, "elapsed": elapsed, "message": data.get("message", "")}
    except asyncio.TimeoutError:
        result = {"terminal": terminal_id, "account": account_info["account"], "success": False, "elapsed": time.time() - start, "message": "TIMEOUT"}
    except Exception as e:
        result = {"terminal": terminal_id, "account": account_info["account"], "success": False, "elapsed": time.time() - start, "message": str(e)[:60]}

    async with lock:
        completed += 1
        if result["success"]:
            successes += 1
        else:
            failures += 1
        all_results.append(result)

        # Print progress every 5 completions
        if completed % 5 == 0 or completed == TOTAL_REQUESTS:
            elapsed_total = time.time() - test_start
            rate = completed / elapsed_total if elapsed_total > 0 else 0
            eta = (TOTAL_REQUESTS - completed) / rate if rate > 0 else 0
            log(f"  [{completed:3d}/{TOTAL_REQUESTS}] ✅{successes} ❌{failures} | {elapsed_total:.0f}s elapsed | ~{eta:.0f}s remaining")

    return result


async def terminal_worker(session, terminal_id, batch):
    for i, (req_num, acct) in enumerate(batch):
        await pull_one(session, acct, terminal_id, req_num)
        if i < len(batch) - 1:
            await asyncio.sleep(DELAY_BETWEEN)


async def main():
    global test_start

    log("=" * 60)
    log("  VPS 500-Account Stress Test — LIVE")
    log("=" * 60)
    log(f"  500 pulls across 10 terminals (50 each)")
    log(f"  1.5s delay between pulls per terminal")
    log("=" * 60)

    # Health check
    async with aiohttp.ClientSession() as session:
        try:
            async with session.get(f"{VPS_URL}/health", timeout=aiohttp.ClientTimeout(total=10)) as resp:
                h = await resp.json()
                log(f"\n  Health: {h['alive_workers']}/10 workers alive ✅")
        except Exception as e:
            log(f"\n  ❌ Cannot reach VPS: {e}")
            return

    # Distribute
    batches = {i: [] for i in range(1, NUM_TERMINALS + 1)}
    for i in range(TOTAL_REQUESTS):
        tid = (i % NUM_TERMINALS) + 1
        acct = ACCOUNTS[i % 2]
        batches[tid].append((i + 1, acct))

    log(f"\n  Starting...\n")
    test_start = time.time()

    async with aiohttp.ClientSession() as session:
        tasks = [terminal_worker(session, tid, batch) for tid, batch in batches.items()]
        await asyncio.gather(*tasks)

    total_time = time.time() - test_start

    # Final report
    log("\n" + "=" * 60)
    log("  FINAL RESULTS")
    log("=" * 60)
    log(f"  Total: {len(all_results)}")
    log(f"  ✅ Success: {successes} ({successes/len(all_results)*100:.1f}%)")
    log(f"  ❌ Failed: {failures} ({failures/len(all_results)*100:.1f}%)")
    log(f"  ⏱️  Time: {total_time:.1f}s ({total_time/60:.1f} min)")

    if successes > 0:
        ok_times = [r["elapsed"] for r in all_results if r["success"]]
        log(f"\n  Avg pull: {sum(ok_times)/len(ok_times):.2f}s")
        log(f"  Min pull: {min(ok_times):.2f}s")
        log(f"  Max pull: {max(ok_times):.2f}s")

    # Per terminal
    log(f"\n  Per Terminal:")
    for tid in range(1, NUM_TERMINALS + 1):
        tr = [r for r in all_results if r["terminal"] == tid]
        ts = sum(1 for r in tr if r["success"])
        tf = sum(1 for r in tr if not r["success"])
        ta = sum(r["elapsed"] for r in tr) / len(tr) if tr else 0
        log(f"    T{tid:2d}: {ts:2d}✓ {tf:2d}✗ | avg {ta:.2f}s")

    if failures > 0:
        log(f"\n  Failure breakdown:")
        errs = {}
        for r in all_results:
            if not r["success"]:
                k = f"T{r['terminal']}: {r['message'][:50]}"
                errs[k] = errs.get(k, 0) + 1
        for k, v in sorted(errs.items(), key=lambda x: -x[1]):
            log(f"    [{v}x] {k}")

    # 3000 projection
    if successes > 0:
        avg = sum(r["elapsed"] for r in all_results if r["success"]) / successes
        proj = (3000 / NUM_TERMINALS) * (avg + DELAY_BETWEEN)
        log(f"\n  📊 3000-account projection: ~{proj/60:.1f} min")
        log(f"     Expected success rate: {successes/len(all_results)*100:.1f}%")

    log("\n" + "=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
