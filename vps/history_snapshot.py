"""Verified history protocol. No terminal/process setup; independently testable.
All monetary values remain in the broker account's currency (including cents).
"""
from datetime import datetime, timezone
from decimal import Decimal
import hashlib
import json
import time

PROTOCOL = 2

class IncompleteHistory(Exception):
    pass


def amount(value):
    value = Decimal(str(value or 0))
    if not value.is_finite():
        raise IncompleteHistory('Non-finite monetary value')
    return value


def millis(deal):
    return int(getattr(deal, 'time_msc', 0) or int(deal.time) * 1000)


def iso(ms):
    return datetime.fromtimestamp(ms / 1000, timezone.utc).isoformat()


def raw_deal(d):
    return {k: getattr(d, k, 0 if k not in ('symbol', 'comment') else '')
            for k in ('ticket', 'order', 'time', 'time_msc', 'type', 'entry', 'symbol',
                      'volume', 'price', 'profit', 'commission', 'swap', 'fee',
                      'comment', 'position_id')}


def signature(deals):
    return hashlib.sha256(json.dumps([raw_deal(d) for d in sorted(deals, key=lambda d: (millis(d), d.ticket))],
                                    sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def economic_change(d):
    # Broker credit is an account.credit movement, not an account.balance movement.
    if d.type == 3:
        return Decimal(0)
    if d.type in (13, 14):
        raise IncompleteHistory('Cancelled deal correction needs broker reconciliation')
    return sum((amount(getattr(d, k, 0)) for k in ('profit', 'commission', 'swap', 'fee')), Decimal(0))


def reconstruct_position(deals):
    """Reconstruct executed exposure, partial exits, close-by and netting reversals.
    Entry charges are allocated by closed volume. Order placement is never fill time.
    """
    trades = []
    volume = Decimal(0)
    cost = Decimal(0)
    price = Decimal(0)
    opened = None
    side = None
    for d in sorted(deals, key=lambda d: (millis(d), int(d.ticket))):
        if d.type not in (0, 1) or not d.symbol:
            continue
        qty = amount(d.volume)
        if qty <= 0:
            raise IncompleteHistory('Invalid execution volume')
        charges = amount(d.commission) + amount(getattr(d, 'fee', 0))
        if d.entry == 0:
            if volume and side != d.type:
                raise IncompleteHistory('Inconsistent opening direction')
            if not volume:
                opened, side = millis(d), d.type
            price = (price * volume + amount(d.price) * qty) / (volume + qty)
            volume += qty
            cost += charges
            continue
        if d.entry not in (1, 2, 3):
            raise IncompleteHistory('Unsupported deal entry')
        if volume <= 0 or opened is None:
            raise IncompleteHistory('Opening execution missing')
        closed = min(volume, qty) if d.entry == 2 else qty
        if closed > volume + Decimal('0.00000001'):
            raise IncompleteHistory('Closing volume exceeds verified opening volume')
        closed = min(volume, closed)
        allocated = cost * closed / volume
        exit_cost = charges * closed / qty
        trades.append(dict(ticket=int(d.ticket), position_id=int(d.position_id), symbol=d.symbol,
                           type='Buy' if side == 0 else 'Sell', volume=float(closed),
                           open_time=iso(opened), close_time=iso(millis(d)),
                           open_price=float(price), close_price=float(d.price),
                           stop_loss=0, take_profit=0, profit=float(d.profit),
                           commission=float(allocated + exit_cost), swap=float(d.swap),
                           comment=d.comment or '', open_source='execution'))
        volume -= closed
        cost -= allocated
        if d.entry == 2:
            remainder = qty - closed
            if remainder > 0:
                volume, cost, price = remainder, charges - exit_cost, amount(d.price)
                opened, side = millis(d), d.type
        if not volume:
            opened, side, price, cost = None, None, Decimal(0), Decimal(0)
    return trades


def collect_snapshot(mt5, account, server, from_date=None, anchor=None, sleep=time.sleep,
                     monotonic=time.monotonic, budget=70, known_tickets=None):
    """One account lock must cover this entire operation. No network or login retry here.
    A stable manifest, account identity and signed ledger must all agree.
    """
    deadline = monotonic() + budget
    connection=mt5.terminal_info()
    if connection is None or not connection.connected:
        raise IncompleteHistory('Broker connection is not live')
    before = mt5.account_info()
    if before is None or int(before.login) != int(account) or before.server.lower() != server.lower():
        raise IncompleteHistory('Account identity unavailable or mismatched')
    balance = amount(before.balance)
    initial_balance = balance
    digits = int(getattr(before, 'currency_digits', 2))
    tolerance = Decimal(10) ** -max(0, min(8, digits))
    cutoff = datetime.now(timezone.utc)
    # Avoid an epoch-zero request boundary; keep the full available trading history.
    start = datetime(1970, 1, 1, 0, 0, 1, tzinfo=timezone.utc)
    anchor_balance = Decimal(0)
    # Reconcile the full signed cash ledger on every read, including backdated corrections.
    # Only position reconstruction and returned rows are incremental.
    # Use one consistent, non-epoch range for both MT5 reads and counts.
    # This predates MT5 account history; the ledger must still reconcile in full.
    read_start = datetime(2000, 1, 1, tzinfo=timezone.utc)
    previous = None
    stable = 0
    accepted = None
    candidate_balance = None
    count = None
    history = None
    known_present = False
    # Deliberately re-read the broker range; None must never become an empty tuple.
    for _ in range(45):
        if monotonic() >= deadline:
            break
        # Balance/history synchronize independently after login. Bracket each
        # candidate read with live identity+balance checks, refreshing its cutoff.
        # Never compare newly loaded history with a permanently frozen balance.
        before = mt5.account_info()
        if before is None or int(before.login) != int(account) or before.server.lower() != server.lower():
            raise IncompleteHistory('Account identity changed while loading history')
        balance = amount(before.balance)
        cutoff = datetime.now(timezone.utc)
        history = mt5.history_deals_get(int(read_start.timestamp()), int(cutoff.timestamp()))
        count = mt5.history_deals_total(int(read_start.timestamp()), int(cutoff.timestamp()))
        if history is None or count is None or count < 0:
            previous, stable = None, 0
            sleep(1)
            continue
        history = list(history)
        if len({int(d.ticket) for d in history}) != len(history):
            raise IncompleteHistory('Duplicate deal tickets in source response')
        observed = mt5.account_info()
        if observed is None or int(observed.login) != int(account) or observed.server.lower() != server.lower():
            raise IncompleteHistory('Account identity changed while loading history')
        if amount(observed.balance) != balance or amount(getattr(observed, 'credit', 0)) != amount(getattr(before, 'credit', 0)):
            previous, stable = None, 0
            sleep(1)
            continue
        digest = (signature(history), balance, amount(getattr(before, 'credit', 0)))
        stable = stable + 1 if digest == previous and count == len(history) else 0
        previous = digest
        if stable >= 2 and count == len(history):
            # Account identity can switch before the terminal's history cache.
            # Stability alone does not prove that account loading has finished.
            cutoff_ms = int(cutoff.timestamp() * 1000)
            candidate = [d for d in history if int(start.timestamp()*1000) < millis(d) <= cutoff_ms]
            candidate_balance = anchor_balance + sum((economic_change(d) for d in candidate), Decimal(0))
            known_present = set(known_tickets or []).issubset({int(d.ticket) for d in history})
            if known_present and abs(candidate_balance - balance) <= tolerance:
                accepted = history
                break
        sleep(1)
    if accepted is None:
        current = mt5.account_info()
        raise IncompleteHistory(f'Broker history did not stabilize or ledger did not reconcile: stable={stable}, returned={len(history) if history is not None else None}, total={count}, ledger={candidate_balance}, initial_balance={initial_balance}, compared_balance={balance}, current_balance={getattr(current, "balance", None)}, known_present={known_present}, cutoff={cutoff.isoformat()}')
    cutoff_ms = int(cutoff.timestamp() * 1000)
    start_ms = int(start.timestamp() * 1000)
    ledger = [d for d in accepted if start_ms < millis(d) <= cutoff_ms]
    expected = anchor_balance + sum((economic_change(d) for d in ledger), Decimal(0))
    if abs(expected - balance) > tolerance:
        raise IncompleteHistory('Signed account ledger does not match observed balance')

    requested = datetime.fromisoformat(from_date.replace('Z', '+00:00')) if from_date else start
    if anchor and anchor.get('digest'):
        previous_cutoff = int(datetime.fromisoformat(anchor['cutoff'].replace('Z', '+00:00')).timestamp()*1000)
        prior = [d for d in accepted if millis(d) <= previous_cutoff]
        if signature(prior) != anchor['digest']:
            requested = datetime.fromisoformat(anchor['repair_from'].replace('Z', '+00:00'))
    requested_ms = int(requested.timestamp() * 1000)
    relevant = [d for d in accepted if millis(d) >= requested_ms]
    positions = sorted({int(d.position_id) for d in relevant if d.symbol and d.type in (0, 1) and d.position_id})
    trades, all_deals = [], {int(d.ticket): d for d in relevant}
    for position in positions:
        if monotonic() >= deadline:
            raise IncompleteHistory('Position reconstruction exceeded deadline')
        pos_deals = mt5.history_deals_get(position=position)
        if pos_deals is None:
            raise IncompleteHistory('Position history unavailable')
        pos_deals = [d for d in pos_deals if int(d.position_id) == position and millis(d) <= cutoff_ms]
        # Position query is independently compared with every window deal, including exits.
        window_tickets = {int(d.ticket) for d in accepted if int(d.position_id) == position}
        position_window_tickets = {int(d.ticket) for d in pos_deals if start_ms <= millis(d) <= cutoff_ms}
        if window_tickets != position_window_tickets:
            raise IncompleteHistory('Position and window history disagree')
        built = reconstruct_position(pos_deals)
        # Orders are optional SL/TP evidence, never an opening timestamp substitute.
        orders = mt5.history_orders_get(position=position)
        if orders is None:
            raise IncompleteHistory('Position order history unavailable')
        for t in built:
            closing = next((d for d in pos_deals if int(d.ticket) == t['ticket']), None)
            # Preserve recorded protection at/before the exit; never borrow a later order's SL.
            eligible = sorted([o for o in orders if getattr(o,'time_done',0) and o.time_done*1000 <= millis(closing)], key=lambda o:(o.time_done,o.ticket))
            for o in eligible:
                if getattr(o,'sl',0): t['stop_loss'] = o.sl
                if getattr(o,'tp',0): t['take_profit'] = o.tp

        trades.extend(t for t in built if datetime.fromisoformat(t['close_time']).timestamp() * 1000 >= requested_ms)
        all_deals.update({int(d.ticket): d for d in pos_deals})

    connection=mt5.terminal_info()
    if connection is None or not connection.connected:
        raise IncompleteHistory('Broker connection dropped during snapshot')
    after = mt5.account_info()
    if after is None or int(after.login) != int(account) or after.server.lower() != server.lower():
        raise IncompleteHistory('Account identity changed during snapshot')
    if amount(after.balance) != balance or amount(getattr(after, 'credit', 0)) != amount(getattr(before, 'credit', 0)):
        raise IncompleteHistory('Account ledger changed during snapshot; retry required')
    # Final independent range read detects late-arriving history during metadata work.
    final = mt5.history_deals_get(int(read_start.timestamp()), int(cutoff.timestamp()))
    if final is None or signature(final) != signature(accepted):
        raise IncompleteHistory('History changed during snapshot; retry required')
    if monotonic() >= deadline:
        raise IncompleteHistory('History verification exceeded deadline')
    operations = []
    for d in relevant:
        if d.type in (2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15, 16, 17):
            change = economic_change(d)
            kind = ('withdrawal' if change < 0 else 'deposit') if d.type == 2 else 'adjustment'
            operations.append(dict(ticket=int(d.ticket), time=iso(millis(d)), amount=float(change), op_type=kind, comment=d.comment or ''))
    raw = []
    for d in all_deals.values():
        r = raw_deal(d)
        r['time'] = iso(millis(d))
        raw.append(r)
    return dict(success=True, protocol_version=PROTOCOL, complete=True, account=str(account), server=server,
                source_cutoff=cutoff.isoformat(), observed_at=datetime.now(timezone.utc).isoformat(),
                balance=float(balance), equity=float(after.equity), currency=after.currency,
                ledger_expected=float(expected), ledger_tolerance=float(tolerance),
                history_digest=signature(accepted), history_count=len(accepted),
                trades=trades, deals=raw, balance_ops=operations,
                position_ids=positions, closing_tickets=sorted(t['ticket'] for t in trades))
