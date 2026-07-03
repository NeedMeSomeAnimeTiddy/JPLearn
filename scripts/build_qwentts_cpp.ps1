<#
.SYNOPSIS
  Clones, patches, and builds a CPU-only qwentts.cpp for JPLearn.

.DESCRIPTION
  qwentts.cpp (https://github.com/ServeurpersoCom/qwentts.cpp) publishes no
  prebuilt releases, so JPLearn must build it itself. This script reproduces
  the exact steps validated manually during development:

    1. Clone the pinned upstream commit (with submodules) into tools/qwentts.cpp/
    2. Apply patches/qwentts-cpp/0001-speaker-bank.patch (adds --speaker-bank
       preset voice cloning support to tts-server.cpp; see that file for why)
    3. Configure a CPU-only Release build via the VS 2022 toolchain (no
       -DGGML_CUDA / -DGGML_VULKAN flags -- CPU backend is the default)
    4. Build qwen-tts.exe, qwen-codec.exe, tts-server.exe, quantize.exe +
       the ggml*.dll runtime dependencies

  Output lives at tools/qwentts.cpp/build/Release/ (git-ignored, same as
  tools/llama.cpp/). electron-frontend's forge.config.cjs bundles this
  directory into the installer via extraResource.

  Re-run anytime to rebuild after a patch change; the script skips the
  clone/checkout step if tools/qwentts.cpp/ already exists at the pinned
  commit.

.PARAMETER Rebuild
  Force a clean reconfigure + rebuild even if tools/qwentts.cpp/build/
  already exists.
#>
param(
  [switch]$Rebuild
)

$ErrorActionPreference = "Stop"

$repoRoot   = Split-Path -Parent $PSScriptRoot
$vendorDir  = Join-Path $repoRoot "tools\qwentts.cpp"
$patchFile  = Join-Path $repoRoot "patches\qwentts-cpp\0001-speaker-bank.patch"
$upstreamUrl = "https://github.com/ServeurpersoCom/qwentts.cpp.git"
# Pinned for reproducibility. Bump deliberately, then re-verify the patch
# still applies cleanly (upstream tts-server.cpp is small and moves slowly,
# but this is not guaranteed indefinitely).
$pinnedCommit = "9dbe7ea26a01b30fccb117ae5e86807c1dc23d42"

function Find-VsDevCmd {
  $vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
  if (-not (Test-Path $vswhere)) {
    throw "vswhere.exe not found; install Visual Studio 2022 with the C++ workload."
  }
  $installPath = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
  if ([string]::IsNullOrWhiteSpace($installPath)) {
    throw "No Visual Studio installation with the C++ (VC.Tools.x86.x64) workload was found."
  }
  $vcvars = Join-Path $installPath "VC\Auxiliary\Build\vcvars64.bat"
  if (-not (Test-Path $vcvars)) {
    throw "vcvars64.bat not found under $installPath"
  }
  return $vcvars
}

if (-not (Test-Path $patchFile)) {
  throw "Missing patch file: $patchFile"
}

if (-not (Test-Path (Join-Path $vendorDir ".git"))) {
  Write-Host "Cloning qwentts.cpp @ $pinnedCommit ..."
  git clone $upstreamUrl $vendorDir
  if ($LASTEXITCODE -ne 0) { throw "git clone failed with exit code $LASTEXITCODE" }
  Push-Location $vendorDir
  try {
    git checkout $pinnedCommit
    if ($LASTEXITCODE -ne 0) { throw "git checkout $pinnedCommit failed with exit code $LASTEXITCODE" }
    git submodule update --init --recursive
    if ($LASTEXITCODE -ne 0) { throw "git submodule update failed with exit code $LASTEXITCODE" }
    Write-Host "Applying speaker-bank patch ..."
    git apply --whitespace=nowarn $patchFile
    if ($LASTEXITCODE -ne 0) { throw "git apply failed with exit code $LASTEXITCODE -- patch did not apply cleanly against $pinnedCommit" }
  } finally {
    Pop-Location
  }
} else {
  Push-Location $vendorDir
  try {
    $currentCommit = (git rev-parse HEAD).Trim()
    if ($currentCommit -ne $pinnedCommit) {
      Write-Warning "tools/qwentts.cpp is at $currentCommit, expected pinned $pinnedCommit. Delete tools/qwentts.cpp and re-run to reset."
    }
    # Idempotency check: the patch's own --check tells us whether it is
    # already applied (fails cleanly either way it can't apply, whether
    # already-applied or genuinely conflicting) vs. still needs applying.
    # Native stderr is promoted to a terminating error under $ErrorActionPreference
    # = Stop in PowerShell 7+, so relax it for these expected-to-fail probes.
    $previousEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    git apply --check --reverse --whitespace=nowarn $patchFile *>$null
    $alreadyApplied = ($LASTEXITCODE -eq 0)
    $patchChecksOut = $true
    if (-not $alreadyApplied) {
      git apply --check --whitespace=nowarn $patchFile *>$null
      $patchChecksOut = ($LASTEXITCODE -eq 0)
    }
    $ErrorActionPreference = $previousEap
    if (-not $alreadyApplied) {
      if (-not $patchChecksOut) {
        throw "Speaker-bank patch is not applied and does not apply cleanly against the current tools/qwentts.cpp checkout. Delete tools/qwentts.cpp and re-run to reset from the pinned commit."
      }
      Write-Host "Applying speaker-bank patch ..."
      git apply --whitespace=nowarn $patchFile
      if ($LASTEXITCODE -ne 0) { throw "git apply failed with exit code $LASTEXITCODE" }
    } else {
      Write-Host "Speaker-bank patch already applied."
    }
  } finally {
    Pop-Location
  }
}

$vcvars = Find-VsDevCmd
$buildDir = Join-Path $vendorDir "build"

if ($Rebuild -and (Test-Path $buildDir)) {
  Write-Host "Removing existing build directory for a clean rebuild ..."
  Remove-Item -Recurse -Force $buildDir
}

New-Item -ItemType Directory -Force -Path $buildDir | Out-Null

Write-Host "Configuring CPU-only Release build ..."
$configureCmd = "call `"$vcvars`" && cd /d `"$buildDir`" && cmake .. -DCMAKE_BUILD_TYPE=Release"
cmd /c $configureCmd
if ($LASTEXITCODE -ne 0) {
  throw "cmake configure failed with exit code $LASTEXITCODE"
}

Write-Host "Building (Release) ..."
$buildCmd = "call `"$vcvars`" && cd /d `"$buildDir`" && cmake --build . --config Release -j $env:NUMBER_OF_PROCESSORS"
cmd /c $buildCmd
if ($LASTEXITCODE -ne 0) {
  throw "cmake build failed with exit code $LASTEXITCODE"
}

$releaseDir = Join-Path $buildDir "Release"
$artifacts = Get-ChildItem -Path $releaseDir -Include *.exe, *.dll -Recurse -Depth 0
$totalMb = [math]::Round(($artifacts | Measure-Object -Property Length -Sum).Sum / 1MB, 2)

Write-Host ""
Write-Host "Build complete: $releaseDir"
Write-Host "Redistributable size: $totalMb MB"
$artifacts | Sort-Object Length -Descending | Format-Table Name, @{N='SizeMB';E={[math]::Round($_.Length/1MB,2)}} -AutoSize

# Stage just the runtime files the packaged app needs (tts-server.exe + its
# ggml*.dll deps) into a top-level qwentts/ folder. electron-frontend's
# forge.config.cjs bundles this via extraResource, and its basename ("qwentts")
# must match exactly what qwentts_runtime.cjs's resolveQwenttsBinaryPath()
# looks for under process.resourcesPath at runtime. Dev-only CLI tools
# (qwen-tts.exe, qwen-codec.exe, quantize.exe) are deliberately NOT staged --
# they're used by scripts/build_qwentts_preset_bank.py at build time, not by
# the packaged app at runtime.
$stagingDir = Join-Path $repoRoot "qwentts"
New-Item -ItemType Directory -Force -Path $stagingDir | Out-Null
$runtimeFiles = @("tts-server.exe", "ggml.dll", "ggml-cpu.dll", "ggml-base.dll")
foreach ($fileName in $runtimeFiles) {
  $source = Join-Path $releaseDir $fileName
  if (-not (Test-Path $source)) {
    throw "Expected runtime file not found: $source"
  }
  Copy-Item -Path $source -Destination (Join-Path $stagingDir $fileName) -Force
}
Write-Host "Staged packaging runtime files to: $stagingDir"
