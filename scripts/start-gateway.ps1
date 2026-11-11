<#
.SYNOPSIS
    Starts the FreeLLMAPI gateway (port 3001) with no console window.

.DESCRIPTION
    The gateway is the local LLM router that Claude Code, Codex and Qwen all
    point at. This script is safe to run repeatedly: if port 3001 is already
    listening, it exits without starting a second instance.

    Runs from the Windows Startup folder automatically at login, and doubles as
    the manual "start the gateway" command.

.PARAMETER Status
    Only report whether the gateway is running. Does not start anything.

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-gateway.ps1
    powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-gateway.ps1 -Status
#>
[CmdletBinding()]
param(
    [switch]$Status
)

$ErrorActionPreference = 'Stop'

$GatewayRoot = 'D:\stitch_user_profile_screen\freellmapi_official'
$ServerDir   = Join-Path $GatewayRoot 'server'
$ServerEntry = Join-Path $ServerDir 'dist\index.js'
$Port        = 3001

function Test-GatewayListening {
    # TcpClient rather than Get-NetTCPConnection: the CIM cmdlet takes ~5s per
    # call on this machine, which made startup feel broken. A plain connect
    # attempt answers in ~100ms.
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $task = $client.ConnectAsync('127.0.0.1', $Port)
        if (-not $task.Wait(1500)) { return $false }
        return $client.Connected
    }
    catch {
        return $false
    }
    finally {
        $client.Close()
    }
}

if ($Status) {
    if (Test-GatewayListening) {
        Write-Output "FreeLLMAPI gateway: RUNNING on http://localhost:$Port"
        exit 0
    }
    Write-Output "FreeLLMAPI gateway: NOT running"
    exit 1
}

if (Test-GatewayListening) {
    Write-Output "FreeLLMAPI gateway is already running on port $Port."
    exit 0
}

if (-not (Test-Path $ServerEntry)) {
    Write-Output "ERROR: compiled server not found at $ServerEntry."
    Write-Output 'Build it first:  cd "$GatewayRoot"; npm run build -w server'
    exit 1
}

$node = (Get-Command node.exe -ErrorAction SilentlyContinue)
if (-not $node) {
    Write-Output 'ERROR: node.exe not found on PATH. Node.js 20.18+ is required.'
    exit 1
}

# Redirect to a fresh log pair per boot so a locked log file from a previous
# run can never block startup. The old pair is rotated to .prev.
$stamp    = Get-Date -Format 'yyyyMMdd-HHmmss'
$logDir   = Join-Path $ServerDir 'logs'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
$outLog   = Join-Path $logDir "gateway-$stamp.log"
$errLog   = Join-Path $logDir "gateway-$stamp.err.log"

$env:PORT = "$Port"

$proc = Start-Process -FilePath $node.Source `
    -ArgumentList $ServerEntry `
    -WorkingDirectory $ServerDir `
    -RedirectStandardOutput $outLog `
    -RedirectStandardError $errLog `
    -WindowStyle Hidden `
    -PassThru

# Wait for the port to accept connections (max 20s).
for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Seconds 1
    if (Test-GatewayListening) {
        Write-Output "FreeLLMAPI gateway is running on http://localhost:$Port (pid $($proc.Id))."
        Write-Output "Log: $outLog"
        exit 0
    }
    if ($proc.HasExited) {
        Write-Output "ERROR: gateway exited during startup (code $($proc.ExitCode))."
        Write-Output "See $errLog"
        exit 1
    }
}

Write-Output "WARNING: gateway did not open port $Port within 20 seconds."
Write-Output "See $outLog and $errLog"
exit 1
