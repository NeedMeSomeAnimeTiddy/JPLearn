param(
  [switch]$SkipInstall,
  [switch]$RunChecks
)

$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

$nodeCandidates = @(
  $env:JPLEARN_NODE_DIR,
  'C:\Users\Robbie\AppData\Local\Microsoft\WinGet\Packages\OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe\node-v24.18.0-win-x64'
)

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  foreach ($candidate in $nodeCandidates) {
    if ([string]::IsNullOrWhiteSpace($candidate)) { continue }
    if (Test-Path (Join-Path $candidate 'node.exe')) {
      $env:PATH = "$candidate;$env:PATH"
      break
    }
  }
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw 'Node.js was not found. Install Node LTS or set JPLEARN_NODE_DIR to your Node folder.'
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw 'npm was not found after PATH setup. Verify your Node installation.'
}

Push-Location $projectRoot
try {
  if (-not $SkipInstall) {
    npm install --include=dev
  }

  $requiredBins = @(
    'node_modules/.bin/tsc.cmd',
    'node_modules/.bin/vite.cmd',
    'node_modules/.bin/oxlint.cmd'
  )

  $missing = @($requiredBins | Where-Object { -not (Test-Path $_) })
  if ($missing.Count -gt 0) {
    Write-Host 'Missing local tool binaries detected. Reinstalling dependencies...'
    npm install --include=dev
  }

  if ($RunChecks) {
    & .\node_modules\.bin\tsc.cmd -b
    & .\node_modules\.bin\oxlint.cmd
  }

  Write-Output 'session recover ok'
}
finally {
  Pop-Location
}
