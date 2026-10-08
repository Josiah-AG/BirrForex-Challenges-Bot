/** Brokers may encode index dividends as ordinary balance deals. Only recognize
 * the broker's explicit DIV-<instrument>-<reference> convention, never a loose
 * substring in a customer deposit description. Preserve the signed amount. */
export function brokerCashOperationType(type: string, comment?: string | null, dealType?: string | number | null): string {
  // MT5 deal types: separate charges, commissions, interest, dividends and taxes.
  const kinds: Record<string,string> = {'4':'fee','7':'commission','8':'commission','9':'commission','10':'commission','11':'commission','12':'interest','15':'dividend','16':'dividend','17':'tax'};
  if (dealType != null && kinds[String(dealType)]) return kinds[String(dealType)];
  if (type === 'dividend' || /^DIV-[A-Z0-9._]+-[A-Z0-9]+$/i.test((comment || '').trim())) return 'dividend';
  return type;
}
