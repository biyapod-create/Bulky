Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:RepoRoot = Split-Path -Parent $PSScriptRoot

function Write-Step {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Message
  )

  Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Invoke-External {
  param(
    [Parameter(Mandatory = $true)]
    [string]$FilePath,

    [Parameter()]
    [string[]]$ArgumentList = @(),

    [Parameter(Mandatory = $true)]
    [string]$Description,

    [Parameter()]
    [string]$WorkingDirectory = $script:RepoRoot
  )

  Write-Step $Description
  Push-Location $WorkingDirectory
  try {
    & $FilePath @ArgumentList
    if ($LASTEXITCODE -ne 0) {
      throw "$Description failed with exit code $LASTEXITCODE."
    }
  } finally {
    Pop-Location
  }
}

function Get-HealthyTrackingPorts {
  param(
    [int]$StartPort = 3847,
    [int]$EndPort = 3852
  )

  $healthyPorts = @()
  foreach ($port in $StartPort..$EndPort) {
    try {
      $response = Invoke-RestMethod -Uri "http://127.0.0.1:$port/health" -TimeoutSec 1
      if ($response.status -eq 'ok') {
        $healthyPorts += $port
      }
    } catch {
      # Ignore missing or unhealthy ports.
    }
  }

  return $healthyPorts
}

function Wait-ForTrackingHealth {
  param(
    [Parameter()]
    [int[]]$KnownPorts = @(),

    [Parameter()]
    [System.Diagnostics.Process]$Process = $null,

    [int]$StartPort = 3847,
    [int]$EndPort = 3852,
    [int]$TimeoutSeconds = 25
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    $healthyPorts = Get-HealthyTrackingPorts -StartPort $StartPort -EndPort $EndPort
    $newPorts = @($healthyPorts | Where-Object { $_ -notin $KnownPorts })

    if (@($newPorts).Count -gt 0) {
      return $newPorts[0]
    }

    if (@($KnownPorts).Count -eq 0 -and @($healthyPorts).Count -gt 0) {
      return $healthyPorts[0]
    }

    if ($Process -and $Process.HasExited) {
      throw "Application exited before the tracking server became healthy."
    }

    Start-Sleep -Milliseconds 750
  } while ((Get-Date) -lt $deadline)

  throw "Timed out waiting for tracking health on ports $StartPort-$EndPort."
}

function Wait-ForNoTrackingHealth {
  param(
    [int]$StartPort = 3847,
    [int]$EndPort = 3852,
    [int]$TimeoutSeconds = 10
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    $healthyPorts = @(Get-HealthyTrackingPorts -StartPort $StartPort -EndPort $EndPort)
    if ($healthyPorts.Count -eq 0) {
      return
    }

    Start-Sleep -Milliseconds 500
  } while ((Get-Date) -lt $deadline)

  throw "Tracking health was already active on ports $StartPort-$EndPort before smoke startup. Close any running Bulky instance and try again."
}

function Stop-ManagedProcess {
  param(
    [Parameter()]
    [System.Diagnostics.Process]$Process
  )

  if (-not $Process) {
    return
  }

  try {
    if (-not $Process.HasExited) {
      Stop-Process -Id $Process.Id -Force
      $Process.WaitForExit()
    }
  } catch {
    # Best-effort cleanup only.
  }
}

function Get-SmokeUserDataDirectory {
  return Join-Path $script:RepoRoot '.smoke-userdata'
}

function Reset-SmokeUserDataDirectory {
  $smokeUserDataDir = Get-SmokeUserDataDirectory

  if (Test-Path $smokeUserDataDir) {
    Remove-Item -LiteralPath $smokeUserDataDir -Recurse -Force
  }

  New-Item -ItemType Directory -Path $smokeUserDataDir -Force | Out-Null
  return $smokeUserDataDir
}
