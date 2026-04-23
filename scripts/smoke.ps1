. "$PSScriptRoot\common.ps1"

$electronExe = Join-Path $script:RepoRoot 'node_modules\electron\dist\electron.exe'
if (-not (Test-Path $electronExe)) {
  throw "Electron executable not found at $electronExe"
}

Invoke-External -FilePath 'npm.cmd' -ArgumentList @('test', '--', '--runInBand') -Description 'Run Jest regression suite'
Invoke-External -FilePath 'npm.cmd' -ArgumentList @('run', 'build-react') -Description 'Build renderer for smoke run'

Wait-ForNoTrackingHealth
$knownPorts = @(Get-HealthyTrackingPorts)
$smokeUserDataDir = Reset-SmokeUserDataDirectory
$previousSmokeUserDataDir = $env:BULKY_USER_DATA_DIR
$env:BULKY_USER_DATA_DIR = $smokeUserDataDir
Write-Step "Launching Electron app smoke check"
$process = Start-Process -FilePath $electronExe -ArgumentList @('.') -WorkingDirectory $script:RepoRoot -PassThru

try {
  $healthyPort = Wait-ForTrackingHealth -KnownPorts $knownPorts -Process $process
  Write-Host "Tracking health responded on port $healthyPort" -ForegroundColor Green
} finally {
  Stop-ManagedProcess -Process $process
  if ($null -eq $previousSmokeUserDataDir) {
    Remove-Item Env:BULKY_USER_DATA_DIR -ErrorAction SilentlyContinue
  } else {
    $env:BULKY_USER_DATA_DIR = $previousSmokeUserDataDir
  }
}

Write-Host "`nSmoke checks passed." -ForegroundColor Green
