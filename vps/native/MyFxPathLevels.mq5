#property strict
#property version "1.02"
#property description "Read-only closing SL/TP mailbox. No trading functions or DLLs."
string dir="MyFxPathLevels\\";
int OnInit() {
  // A local, non-tradable chart survives broker symbol suffix/account changes.
  string anchor="MyFxPath.Reader";
  if(_Symbol!=anchor) {
    bool custom=false;
    if(!SymbolExist(anchor,custom)) {if(!CustomSymbolCreate(anchor,"MyFxPath")) return INIT_FAILED;}
    else if(!custom) return INIT_FAILED;
    CustomSymbolSetInteger(anchor,SYMBOL_TRADE_MODE,SYMBOL_TRADE_MODE_DISABLED);
    CustomSymbolSetString(anchor,SYMBOL_DESCRIPTION,"Local recovery reader - not a trading instrument");
    SymbolSelect(anchor,true);
    MqlRates bars[];ArrayResize(bars,2);ZeroMemory(bars);
    for(int i=0;i<2;i++){bars[i].time=(datetime)(((long)TimeGMT()/60-1+i)*60);bars[i].open=1;bars[i].high=1;bars[i].low=1;bars[i].close=1;bars[i].tick_volume=1;}
    if(CustomRatesUpdate(anchor,bars)<0) return INIT_FAILED;
    if(!ChartSetSymbolPeriod(0,anchor,PERIOD_M1)) return INIT_FAILED;
    return INIT_SUCCEEDED;
  }
  FolderCreate("MyFxPathLevels");
  if(!EventSetMillisecondTimer(250)) return INIT_FAILED;
  return INIT_SUCCEEDED;
}
void OnDeinit(const int reason) { EventKillTimer(); }
bool Identity(long login,string server) {
  return AccountInfoInteger(ACCOUNT_LOGIN)==login && AccountInfoString(ACCOUNT_SERVER)==server && TerminalInfoInteger(TERMINAL_CONNECTED);
}
void OnTimer() {
  static ulong lastBeat=0;
  if(GetTickCount64()-lastBeat>=5000) {
    int beat=FileOpen(dir+"heartbeat.txt",FILE_WRITE|FILE_TXT|FILE_ANSI);
    if(beat!=INVALID_HANDLE){FileWrite(beat,"1",TimeGMT());FileClose(beat);}
    lastBeat=GetTickCount64();
  }
  if(!FileIsExist(dir+"request.csv")) return;
  // Exclusive handle also prevents duplicate chart attachments from competing.
  int guard=FileOpen(dir+"reader.lock",FILE_WRITE|FILE_BIN);
  if(guard==INVALID_HANDLE) return;
  ReadRequest();
  FileClose(guard);
}
void ReadRequest() {
  int f=FileOpen(dir+"request.csv",FILE_READ|FILE_CSV|FILE_ANSI,',',CP_UTF8);
  if(f==INVALID_HANDLE) return;
  string version=FileReadString(f), nonce=FileReadString(f);
  long login=(long)StringToInteger(FileReadString(f));
  string server=FileReadString(f);
  long expires=(long)StringToInteger(FileReadString(f));
  int count=(int)StringToInteger(FileReadString(f));
  ulong tickets[],positions[];
  bool valid=version=="1" && StringLen(nonce)==32 && count>=0 && count<=5000 && expires>=(long)TimeGMT();
  if(valid) {
    ArrayResize(tickets,count);ArrayResize(positions,count);
    for(int i=0;i<count;i++) {
      if(FileIsEnding(f)){valid=false;break;}
      tickets[i]=(ulong)StringToInteger(FileReadString(f));
      positions[i]=(ulong)StringToInteger(FileReadString(f));
      if(tickets[i]==0 || positions[i]==0){valid=false;break;}
    }
  }
  FileClose(f);FileDelete(dir+"request.csv");
  if(!valid || !Identity(login,server)) return;
  int out=FileOpen(dir+"response.tmp",FILE_WRITE|FILE_CSV|FILE_ANSI,',',CP_UTF8);
  if(out==INVALID_HANDLE) return;
  FileWrite(out,"1",nonce,login,server,count,"ok");
  ulong started=GetTickCount64();
  for(int i=0;i<count;i++) {
    if(GetTickCount64()-started>1200 || !Identity(login,server) || !HistoryDealSelect(tickets[i])) {valid=false;break;}
    ulong t=tickets[i];
    long pos=HistoryDealGetInteger(t,DEAL_POSITION_ID);
    long entry=HistoryDealGetInteger(t,DEAL_ENTRY);
    long typ=HistoryDealGetInteger(t,DEAL_TYPE);
    if((ulong)pos!=positions[i] || (typ!=DEAL_TYPE_BUY && typ!=DEAL_TYPE_SELL) || (entry!=DEAL_ENTRY_OUT && entry!=DEAL_ENTRY_INOUT && entry!=DEAL_ENTRY_OUT_BY)) {valid=false;break;}
    double sl=0,tp=0;
    bool sok=HistoryDealGetDouble(t,DEAL_SL,sl),tok=HistoryDealGetDouble(t,DEAL_TP,tp);
    FileWrite(out,t,pos,HistoryDealGetString(t,DEAL_SYMBOL),HistoryDealGetInteger(t,DEAL_TIME_MSC),entry,DoubleToString(sl,10),DoubleToString(tp,10),sok?1:0,tok?1:0);
  }
  FileClose(out);
  if(valid && Identity(login,server)) FileMove(dir+"response.tmp",0,dir+"response.csv",FILE_REWRITE);
  else FileDelete(dir+"response.tmp");
}
