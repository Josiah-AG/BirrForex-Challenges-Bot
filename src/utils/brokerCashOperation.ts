/** Brokers may encode index dividends as ordinary balance deals. Only recognize
 * the broker's explicit DIV-<instrument>-<reference> convention, never a loose
 * substring in a customer deposit description. Preserve the signed amount. */
export function brokerCashOperationType(type: string, comment?: string | null): string {
  if (type === 'dividend' || /^DIV-[A-Z0-9._]+-[A-Z0-9]+$/i.test((comment || '').trim())) return 'dividend';
  return type;
}
