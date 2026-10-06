export default function TradeProtectionLevel({ trade, kind }: { trade: any; kind: 'sl' | 'tp' }) {
  const original = Number(kind === 'sl' ? (trade.stopLoss ?? trade.stop_loss) : (trade.takeProfit ?? trade.take_profit));
  const evidence = trade.nativeSlTp ?? trade.native_sl_tp;
  const recovered = evidence?.source === 'native_closing_deal' ? Number(evidence[kind]) : 0;
  const value = original > 0 ? original : recovered > 0 ? recovered : 0;
  return <div className="bg-white/5 rounded-xl p-3">
    <p className="text-[10px] text-gray-500 mb-1">{kind === 'sl' ? 'Stop Loss' : 'Take Profit'}</p>
    <p className={value ? 'text-white' : 'text-gray-500'}>{value || '—'}</p>
    {!value && <p className="text-[9px] text-gray-500">Not recorded</p>}
  </div>;
}
