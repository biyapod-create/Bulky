param(
  [switch]$Build,
  [switch]$KeepBuild,
  [string]$ExecutablePath = '',
  [string]$OutputDirectory = ''
)

. "$PSScriptRoot\common.ps1"

if ($Build) {
  if (-not $OutputDirectory) {
    $OutputDirectory = Join-Path $env:TEMP ("bulky-smoke-packaged-" + [Guid]::NewGuid().ToString('N'))
  }

  if (Test-Path $OutputDirectory) {
    Remove-Item -LiteralPath $OutputDirectory -Recurse -Force
  }

  Invoke-External -FilePath 'npm.cmd' -ArgumentList @('run', 'build-react') -Description 'Build renderer before packaged smoke'
  Invoke-External -FilePath 'npx.cmd' -ArgumentList @('electron-builder', '--dir', "--config.directories.output=$OutputDirectory") -Description 'Build unpacked packaged app for smoke run'

  $ExecutablePath = Join-Path $OutputDirectory 'win-unpacked\Bulky Email Sender.exe'
}

if (-not $ExecutablePath) {
  $ExecutablePath = Join-Path $script:RepoRoot 'dist\win-unpacked\Bulky Email Sender.exe'
}

if (-not (Test-Path $ExecutablePath)) {
  throw "Packaged executable not found at $ExecutablePath"
}

Wait-ForNoTrackingHealth
$knownPorts = @(Get-HealthyTrackingPorts)
$smokeUserDataDir = Reset-SmokeUserDataDirectory
$previousSmokeUserDataDir = $env:BULKY_USER_DATA_DIR
$env:BULKY_USER_DATA_DIR = $smokeUserDataDir
Write-Step "Launching packaged app smoke check"
$process = Start-Process -FilePath $ExecutablePath -WorkingDirectory (Split-Path -Parent $ExecutablePath) -PassThru

try {
  $healthyPort = Wait-ForTrackingHealth -KnownPorts $knownPorts -Process $process
  Write-Host "Packaged app health responded on port $healthyPort" -ForegroundColor Green
} finally {
  Stop-ManagedProcess -Process $process
  if ($null -eq $previousSmokeUserDataDir) {
    Remove-Item Env:BULKY_USER_DATA_DIR -ErrorAction SilentlyContinue
  } else {
    $env:BULKY_USER_DATA_DIR = $previousSmokeUserDataDir
  }
  if ($Build -and -not $KeepBuild -and $OutputDirectory -and (Test-Path $OutputDirectory)) {
    try {
      Remove-Item -LiteralPath $OutputDirectory -Recurse -Force
    } catch {
      Write-Warning "Unable to remove temporary packaged smoke output at ${OutputDirectory}: $($_.Exception.Message)"
    }
  }
}

Write-Host "`nPackaged smoke checks passed." -ForegroundColor Green
