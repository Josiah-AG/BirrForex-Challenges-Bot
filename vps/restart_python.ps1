# Run in the existing Administrator desktop session. Default is inspection only.
param(
    [Parameter(Mandatory=$true)][string]$ExpectedCommit,
    [int]$WorkerCount = 0,
    [switch]$Apply
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$head = (& git -C $repo rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $head -ne $ExpectedCommit) { throw 'Checkout does not match expected commit' }
if (& git -C $repo status --porcelain --untracked-files=no) { throw 'Tracked VPS files have local changes' }
$session = (Get-Process -Id $PID).SessionId
if ($session -eq 0) { throw 'Use an interactive scheduled task in the existing desktop session' }
$env:VPS_API_KEY = [Environment]::GetEnvironmentVariable('VPS_API_KEY','Machine')
if (!$env:VPS_API_KEY) { throw 'Machine API key unavailable; no service changed' }
if (!$WorkerCount) { $WorkerCount = (Invoke-RestMethod 'http://127.0.0.1:8000/health' -TimeoutSec 15).terminals }
if ($WorkerCount -lt 1 -or $WorkerCount -gt 15) { throw 'Router terminal count unavailable; specify WorkerCount 1-15' }
$owned = @()
foreach ($port in (8001..(8000 + $WorkerCount)) + @(8000)) {
    $listener = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
    if ($listener.Count -ne 1) { throw "Expected exactly one listener on port $port" }
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener[0])"
    $role = if ($port -eq 8000) { 'router.py' } else { 'worker.py' }
    if ($process.SessionId -ne $session -or $process.Name -notmatch '^python' -or $process.CommandLine -notmatch [regex]::Escape($role)) { throw "Unexpected process owner on port $port" }
    $owned += [pscustomobject]@{ Port=$port; Pid=$process.ProcessId; Python=$process.ExecutablePath; Role=$role }
}
if (!$Apply) { $owned | Select-Object Port,Pid,Role; return }
$logDir = Join-Path $env:ProgramData "WinnerPip\deployments\$head"
New-Item -ItemType Directory -Force $logDir | Out-Null
& icacls.exe $logDir /inheritance:r /grant:r '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-18:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Cannot restrict deployment logs' }
$env:VPS_ATTACH_ONLY = '1'
$env:VPS_TERMINAL_COUNT = [string]$WorkerCount
foreach ($ownedProcess in $owned) {
    $port = $ownedProcess.Port
    $health = Invoke-RestMethod "http://127.0.0.1:$port/health" -TimeoutSec 8
    if ($health.busy) { throw "Worker on port $port is busy; deployment stopped" }
    Stop-Process -Id $ownedProcess.Pid -ErrorAction Stop
    $roleArguments = if ($port -eq 8000) { "--router $WorkerCount" } else { "--worker $($port-8000) $port" }
    $arguments = '/k call "' + (Join-Path $PSScriptRoot 'start_vps.bat') + '" ' + $roleArguments
    $started = Start-Process -FilePath $env:ComSpec -ArgumentList $arguments -WorkingDirectory $repo -PassThru -WindowStyle Normal
    $ready=$false
    for ($attempt=0;$attempt -lt 30;$attempt++) {
        Start-Sleep -Seconds 2
        if ($started.HasExited) { throw "Console exited on port $port; inspect the visible worker window" }
        try {
            $check=Invoke-RestMethod "http://127.0.0.1:$port/health" -TimeoutSec 5
            if ($check.git_commit -and $check.git_commit -ne 'unknown' -and $head.StartsWith([string]$check.git_commit) -and $check.status -eq 'ok' -and ($port -eq 8000 -or $check.ipc_connected)) { $ready=$true;break }
        } catch {}
    }
    if (!$ready) { throw "Health verification failed on port $port; deployment stopped" }
    Write-Output "Verified port $port at $head"
}
Write-Output 'Python services updated; no MT5 process was stopped by this script.'
