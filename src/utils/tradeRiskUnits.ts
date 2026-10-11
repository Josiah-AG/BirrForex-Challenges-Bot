/** Value of a one-price-unit move for the specified lot size, in the account's money units.
 * Broker gross P/L supplies conversion/contract information; fees must never distort the price ratio.
 * Scale a partial close's sample volume up to the exposure being checked.
 */
export function priceMoveValue(symbol:string,volume:number,entry:number,close?:number,grossProfit?:number,sampleVolume=volume):number|null{
 if(!Number.isFinite(volume)||volume<=0)return null;
 const distance=Math.abs(entry-Number(close)),profit=Math.abs(Number(grossProfit));
 if(distance>0 && profit>0 && Number.isFinite(distance) && Number.isFinite(profit) && sampleVolume>0){
   return profit/distance*(volume/sampleVolume);
 }
 // Exness standard lots/ USD and cent lots/ USC have the same numeric price value:
 // cent contracts are 1/100, while their account-money units are 100 times smaller.
 // 'm' is Standard, never evidence that an account is Cent.
 const base=symbol.replace(/_x\d+[a-z]?$/i,'').replace(/[mczr]$/,'').toUpperCase();
 const contracts:Record<string,number>={XAUUSD:100,XAGUSD:5000};
 const contract=contracts[base] ?? (/^[A-Z]{3}USD$/.test(base)&&!['BTCUSD','ETHUSD','XNGUSD'].includes(base)?100000:null);
 if(contract)return contract*volume;
 // Unavailable conversion must not silently become a wrong monetary risk.
 return null;
}
export function declaredStopRisk(symbol:string,volume:number,entry:number,sl:number,close?:number,profit?:number,sampleVolume=volume):number|null{
 if(!sl)return 0;
 const value=priceMoveValue(symbol,volume,entry,close,profit,sampleVolume);
 return value===null?null:Math.abs(entry-sl)*value;
}
export function allowedRiskPrice(symbol:string,volume:number,entry:number,risk:number,isBuy:boolean,close?:number,profit?:number,sampleVolume=volume):number|null{
 const value=priceMoveValue(symbol,volume,entry,close,profit,sampleVolume);
 if(value===null||value<=0||risk<=0)return null;
 return isBuy?entry-risk/value:entry+risk/value;
}
