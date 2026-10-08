import unittest
from test_history_snapshot import deal, MT
from history_snapshot import reconstruct_position, collect_snapshot

class BrokerCosts(unittest.TestCase):
    def test_partial_closes_allocate_entry_fees_once(self):
        rows=[deal(1,volume=2,commission=-4,fee=-2),deal(2,entry=1,type=1,volume=.5,profit=20,commission=-1,fee=-.5,t=200),deal(3,entry=1,type=1,volume=1.5,profit=-10,commission=-3,fee=-1.5,t=300)]
        rows[1].swap=-.5;rows[2].swap=1
        trades=reconstruct_position(rows)
        self.assertAlmostEqual(sum(t['commission'] for t in trades),-12)
        self.assertAlmostEqual(trades[0]['commission'],-3)
        self.assertAlmostEqual(trades[1]['commission'],-9)
        self.assertAlmostEqual(sum(t['profit']+t['commission']+t['swap'] for t in trades),-1.5)
    def test_separate_charges_and_trade_costs_reconcile_actual_balance(self):
        rows=[deal(1,type=2,profit=1000,position=0),deal(2,commission=-2,fee=-1),deal(3,entry=1,type=1,profit=100,commission=-2,fee=-1,t=200)]
        rows[2].swap=-2
        for i,typ in enumerate([4,7,8,9,10,11,12,15,16,17]):
            rows.append(deal(10+i,type=typ,profit=-1,position=0,t=300+i))
        r=collect_snapshot(MT(rows,1082),1,'Broker',sleep=lambda _:None)
        self.assertEqual(r['balance'],1082)
        self.assertEqual(len(r['trades']),1)
        self.assertEqual(len(r['balance_ops']),11)
        self.assertAlmostEqual(sum(t['profit']+t['commission']+t['swap'] for t in r['trades']),92)
    def test_zero_cost_trade_is_unchanged(self):
        t=reconstruct_position([deal(1),deal(2,entry=1,type=1,profit=10,t=200)])[0]
        self.assertEqual(t['commission'],0);self.assertEqual(t['swap'],0);self.assertEqual(t['profit'],10)
