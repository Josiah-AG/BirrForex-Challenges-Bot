import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'vps'))
import unittest
from types import SimpleNamespace as N
from history_snapshot import collect_snapshot, reconstruct_position, IncompleteHistory

def deal(ticket,entry=0,volume=1,profit=0,t=100,type=0,commission=0,fee=0,position=77):
    return N(ticket=ticket,entry=entry,volume=volume,profit=profit,time=t,time_msc=t*1000,type=type,
             commission=commission,swap=0,fee=fee,position_id=position,symbol='EURUSD' if type in (0,1) else '',
             price=10 if entry==0 else 11,order=ticket,comment='')
class MT:
    def __init__(self,deals,balance):self.deals=deals;self.balance=balance
    def terminal_info(self):return N(connected=True)
    def account_info(self):return N(login=1,server='Broker',balance=self.balance,equity=self.balance,currency='USD',currency_digits=2,credit=0)
    def history_deals_get(self,*a,**kw):
        if self.deals is None:return None
        return [d for d in self.deals if not kw or d.position_id==kw['position']]
    def history_deals_total(self,*a):return len(self.deals) if self.deals is not None else -1
    def history_orders_get(self,**kw):return []

class SnapshotTests(unittest.TestCase):
    def collect(self,mt):return collect_snapshot(mt,1,'Broker',sleep=lambda _:None)
    def test_none_history_never_succeeds(self):
        with self.assertRaises(IncompleteHistory):self.collect(MT(None,1100))
    def test_empty_zero_account(self):self.assertTrue(self.collect(MT([],0))['complete'])
    def test_balance_without_history(self):
        with self.assertRaisesRegex(IncompleteHistory,'ledger'):self.collect(MT([],100))
    def test_signed_deposit_withdrawal(self):
        r=self.collect(MT([deal(1,type=2,profit=100,position=0),deal(2,type=2,profit=-20,position=0)],80))
        self.assertEqual(r['ledger_expected'],80)
    def test_close_by(self):
        rows=[deal(1,type=2,profit=100,position=0),deal(2),deal(3,entry=3,type=1,profit=10,t=200)]
        r=self.collect(MT(rows,110));self.assertEqual(len(r['trades']),1)
    def test_entry_fee_allocated_to_partials(self):
        ts=reconstruct_position([deal(1,volume=2,commission=-2,fee=-2),deal(2,entry=1,volume=1,type=1,t=200,commission=-1),deal(3,entry=1,volume=1,type=1,t=300,commission=-1)])
        self.assertEqual(sum(t['commission'] for t in ts),-6)
    def test_reversal_exposure(self):
        ts=reconstruct_position([deal(1),deal(2,entry=2,type=1,volume=2,t=200),deal(3,entry=1,type=0,t=300)])
        self.assertEqual([t['type'] for t in ts],['Buy','Sell']);self.assertEqual([t['volume'] for t in ts],[1,1])
    def test_no_order_timestamp_fallback(self):
        with self.assertRaisesRegex(IncompleteHistory,'Opening'):reconstruct_position([deal(1,entry=1,type=1)])
    def test_identity_rejected(self):
        with self.assertRaisesRegex(IncompleteHistory,'identity'):collect_snapshot(MT([],0),2,'Broker',sleep=lambda _:None)
    def test_ledger_loss_is_checked(self):
        with self.assertRaisesRegex(IncompleteHistory,'ledger'):self.collect(MT([deal(1,type=2,profit=100,position=0)],90))
    def test_balance_changes_during_read(self):
        mt=MT([],0);original=mt.account_info;n=[0]
        def info():
            r=original();n[0]+=1
            if n[0]>1:r.balance=1
            return r
        mt.account_info=info
        with self.assertRaisesRegex(IncompleteHistory,'changed'):self.collect(mt)
    def test_independent_position_omission(self):
        mt=MT([deal(1,type=2,profit=100,position=0),deal(2),deal(3,entry=1,type=1,t=200)],100)
        orig=mt.history_deals_get
        mt.history_deals_get=lambda *a,**kw: [] if kw else orig(*a,**kw)
        with self.assertRaisesRegex(IncompleteHistory,'disagree'):self.collect(mt)
if __name__=='__main__':unittest.main()

class CorrectionTests(unittest.TestCase):
    def test_backdated_zero_net_correction_expands_reconstruction(self):
        from history_snapshot import signature
        funding=deal(1,type=2,profit=100,position=0,t=50)
        rows=[funding,deal(2,t=100),deal(3,entry=1,type=1,t=200)]
        r=collect_snapshot(MT(rows,100),1,'Broker',from_date='1970-01-01T00:05:00Z',anchor={'cutoff':'1970-01-01T00:05:00Z','balance':100,'digest':signature([funding]),'repair_from':'1970-01-01T00:00:00Z'},sleep=lambda _:None)
        self.assertEqual([t['ticket'] for t in r['trades']],[3])
    def test_cold_cache_none_then_complete_recovers(self):
        mt=MT([],0);original=mt.history_deals_get;n=[0]
        def get(*a,**kw):
            n[0]+=1
            return None if n[0]<3 else original(*a,**kw)
        mt.history_deals_get=get
        self.assertTrue(collect_snapshot(mt,1,'Broker',sleep=lambda _:None)['complete'])
    def test_missing_zero_profit_partial_is_not_masked_by_balance(self):
        rows=[deal(1,type=2,profit=100,position=0),deal(2,volume=2),deal(3,entry=1,type=1,t=200),deal(4,entry=1,type=1,t=300)]
        mt=MT(rows,100);original=mt.history_deals_get
        mt.history_deals_get=lambda *a,**kw: original(*a,**kw) if kw else [d for d in rows if d.ticket!=4]
        mt.history_deals_total=lambda *a:3
        with self.assertRaisesRegex(IncompleteHistory,'disagree'):collect_snapshot(mt,1,'Broker',sleep=lambda _:None)
    def test_later_protection_is_not_borrowed_by_earlier_exit(self):
        mt=MT([deal(1,type=2,profit=100,position=0),deal(2),deal(3,entry=1,type=1,t=200)],100)
        mt.history_orders_get=lambda **kw:[N(ticket=2,time_done=100,sl=9,tp=12),N(ticket=4,time_done=300,sl=8,tp=13)]
        r=collect_snapshot(mt,1,'Broker',sleep=lambda _:None)
        self.assertEqual(r['trades'][0]['stop_loss'],9)

class ConnectionTests(unittest.TestCase):
    def test_cached_history_cannot_verify_an_offline_terminal(self):
        mt=MT([],0);mt.terminal_info=lambda:N(connected=False)
        with self.assertRaisesRegex(IncompleteHistory,'not live'):collect_snapshot(mt,1,'Broker',sleep=lambda _:None)
