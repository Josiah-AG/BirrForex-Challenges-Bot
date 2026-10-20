import { validatedNativeLevels } from './nativeTradeLevels';
import { declaredStopRisk } from './tradeRiskUnits';

/** Only closing-deal evidence can establish the user-visible declared SL.
 * Missing evidence is not an old-order fallback; candle risk remains independent.
 */
export function finalDeclaredRisk(trade: any, positionVolume: number): number | null {
  const evidence = validatedNativeLevels(trade);
  if (!evidence) return null;
  const entry = Number(trade.open_price), sl = evidence.sl;
  const buy = String(trade.trade_type || trade.type).toLowerCase() === 'buy';
  if (!sl || (buy ? sl >= entry : sl <= entry)) return 0;
  return declaredStopRisk(trade.symbol, positionVolume, entry, sl,
    Number(trade.close_price), Number(trade.profit), Number(trade.volume));
}
