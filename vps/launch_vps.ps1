# Interactive desktop launcher. Only WinnerPip Python services/consoles are replaced.
param([int]$WorkerCount=0,[switch]$Inspect,[switch]$ConsoleOnly)
$ErrorActionPreference='Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class WinnerPipConsole {
 [DllImport("kernel32.dll")] public static extern IntPtr GetStdHandle(int n);
 [DllImport("kernel32.dll")] public static extern bool GetConsoleMode(IntPtr h,out uint mode);
 [DllImport("kernel32.dll")] public static extern bool SetConsoleMode(IntPtr h,uint mode);
}
'@
$mode=[uint32]0;$handle=[WinnerPipConsole]::GetStdHandle(-10)
if([WinnerPipConsole]::GetConsoleMode($handle,[ref]$mode)){
 [void][WinnerPipConsole]::SetConsoleMode($handle,(($mode -bor 0x80) -band (-bnot 0x40)))
}
if($ConsoleOnly){return}
$repo=Split-Path $PSScriptRoot -Parent
if(!$WorkerCount){
 do {$answer=Read-Host 'How many terminals? (1-15, Enter for 10)';if(!$answer){$answer='10'};$parsed=0
 $valid=[int]::TryParse($answer,[ref]$parsed) -and $parsed -ge 1 -and $parsed -le 15
 if(!$valid){Write-Host 'Enter a whole number from 1 to 15.'}
 }until($valid)
 $WorkerCount=$parsed
}
if($WorkerCount -lt 1 -or $WorkerCount -gt 15){throw 'Terminal count must be 1-15'}
$session=(Get-Process -Id $PID).SessionId
if($session -eq 0){throw 'Open this launcher in the Administrator desktop session'}
$mutex=New-Object System.Threading.Mutex($false,'Local\WinnerPipDesktopLauncher')
if(!$mutex.WaitOne(0)){throw 'Another WinnerPip launcher is already running'}
try {
 $env:VPS_API_KEY=[Environment]::GetEnvironmentVariable('VPS_API_KEY','Machine')
 if(!$env:VPS_API_KEY){throw 'Machine VPS_API_KEY is missing'}
 & py -3.12 -c 'import MetaTrader5,fastapi,uvicorn'
 if($LASTEXITCODE -ne 0){throw 'Python 3.12 or worker dependencies unavailable'}
 for($i=1;$i -le $WorkerCount;$i++){
  if(!(Test-Path "C:\MetaTrader\Terminal $i\terminal64.exe")){throw "MT5 installation missing: Terminal $i. Nothing stopped."}
 }
 $processes=@(Get-CimInstance Win32_Process)
 $listeners=@(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue|Where-Object {$_.LocalPort -ge 8000 -and $_.LocalPort -le 8015})
 $owned=@($processes|Where-Object {$_.SessionId -eq $session -and $_.Name -match '^python' -and $_.CommandLine -match '(?i)(vps[\\/](worker|router)\.py|\s(worker|router)\.py)(\s|$)'})
 foreach($l in $listeners){if($l.OwningProcess -notin $owned.ProcessId){throw "Port $($l.LocalPort) belongs to an unexpected process; nothing stopped"}}
 if($Inspect){Write-Host "Preflight OK: $WorkerCount requested; $($owned.Count) existing Python processes";return}
 # Stop old BAT launchers too, so an old 60-second wait cannot start duplicates later.
 $parent=(Get-CimInstance Win32_Process -Filter "ProcessId=$PID").ParentProcessId
 $consoles=@(Get-Process cmd -ErrorAction SilentlyContinue|Where-Object {$_.SessionId -eq $session -and $_.Id -ne $parent -and $_.MainWindowTitle -match 'WinnerPip (Worker|Router)'})
 $oldBats=@($processes|Where-Object {$_.Name -eq 'cmd.exe' -and $_.SessionId -eq $session -and $_.ProcessId -ne $parent -and $_.CommandLine -match '(?i)(C:\\BirrForex\\vps\\start_vps\.bat|vps[\\/]start_vps\.bat)'})
 Write-Host '[1/3] Stopping previous WinnerPip router/workers...'
 foreach($p in $oldBats){Stop-Process -Id $p.ProcessId -ErrorAction SilentlyContinue}
 foreach($p in $owned){Stop-Process -Id $p.ProcessId -ErrorAction SilentlyContinue}
 foreach($p in $consoles){Stop-Process -Id $p.Id -ErrorAction SilentlyContinue}
 Start-Sleep -Seconds 2
 if(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue|Where-Object {$_.LocalPort -ge 8000 -and $_.LocalPort -le 8015}){throw 'Old listener still present; no duplicate workers started'}
 Write-Host '[2/3] Checking MT5 terminals (running terminals are reused)...'
 for($i=1;$i -le $WorkerCount;$i++){
  $exe="C:\MetaTrader\Terminal $i\terminal64.exe"
  if(!($processes|Where-Object {$_.ExecutablePath -eq $exe})){
   $ini="C:\MetaTrader\Terminal $i\base_login.ini"
   if(Test-Path $ini){Start-Process $exe -ArgumentList ('/config:"'+$ini+'"')}else{Start-Process $exe}
  }
 }
 $env:VPS_ATTACH_ONLY='1';$env:VPS_TERMINAL_COUNT=[string]$WorkerCount
 Write-Host '[3/3] Starting visible worker windows and checking readiness...'
 foreach($port in (8001..(8000+$WorkerCount))+@(8000)){
  $args=if($port -eq 8000){"--router $WorkerCount"}else{"--worker $($port-8000) $port"}
  Start-Process $env:ComSpec -ArgumentList ('/k call "'+(Join-Path $PSScriptRoot 'start_vps.bat')+'" '+$args) -WorkingDirectory $repo -WindowStyle Normal
  $ready=$false
  for($attempt=0;$attempt -lt 45;$attempt++){
   Start-Sleep -Seconds 2
   try {$h=Invoke-RestMethod "http://127.0.0.1:$port/health" -TimeoutSec 3
    if($h.status -eq 'ok' -and ($port -eq 8000 -or $h.ipc_connected)){$ready=$true;break}
   }catch{}
   if($attempt%5 -eq 0){Write-Host "Waiting for port $port..."}
  }
  if(!$ready){throw "Port $port did not become healthy. Inspect its visible CMD; startup stopped."}
  Write-Host "Port $port ready"
 }
 Write-Host "Ready: $WorkerCount workers and router. Keep their CMD windows open."
 Write-Host "The admin health check and pull scheduler discover this count from the router automatically."
} finally {$mutex.ReleaseMutex();$mutex.Dispose()}
