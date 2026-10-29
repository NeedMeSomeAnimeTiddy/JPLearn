# Builds python-bundle/ - the self-contained Python 3.11 that Electron Forge ships
# as an extraResource so the installer does not depend on a system Python.
#
# This is the single source of truth for the bundle: .github/workflows/release.yml
# calls this script, and so does `npm run make:release` in electron-frontend. Keep
# it that way - the previous version of this logic lived inline in the workflow,
# which meant no installer could be produced without GitHub Actions.
#
# Deliberately ASCII-only: `npm run bundle:python` invokes Windows PowerShell 5.1,
# which reads a BOM-less .ps1 as ANSI and would mangle multi-byte characters.

param(
  [string]$PythonVersion = "3.11",
  [string]$OutputDirectory = "",
  # Where the Visual C++ runtime DLLs are copied from; System32 by default (see below).
  [string]$VcRuntimeDirectory = "",
  [switch]$Force
)

$ErrorActionPreference = "Stop"

# Windows PowerShell 5.1 repaints a progress bar on every chunk of an
# Invoke-WebRequest download, which throttles a 24 MB transfer to minutes.
# `npm run bundle:python` runs under 5.1, so this is not optional there.
$ProgressPreference = "SilentlyContinue"

function Get-BsdTar {
  # Windows ships bsdtar, which understands drive-letter paths. A shell that puts
  # Git's or MSYS's bin directory first resolves `tar` to GNU tar instead, which
  # reads "C:\..." as a remote host and fails with "Cannot connect to C".
  $system32Tar = Join-Path $env:SystemRoot "System32\tar.exe"
  if (Test-Path $system32Tar) {
    return $system32Tar
  }
  $fallback = Get-Command tar -CommandType Application -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if ($fallback) {
    return $fallback.Source
  }
  throw "No tar executable found (looked for $system32Tar and tar on PATH)."
}

try {
  $repoRoot = Split-Path -Parent $PSScriptRoot

  if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
    $OutputDirectory = Join-Path $repoRoot "python-bundle"
  }

  $pythonExe = Join-Path $OutputDirectory "python\python.exe"

  if ((Test-Path $pythonExe) -and -not $Force) {
    Write-Host "Python bundle already present: $(& $pythonExe --version)"
    Write-Host "Pass -Force to rebuild it from scratch."
    exit 0
  }

  # Also clears a half-extracted bundle left behind by an earlier failed run.
  if (Test-Path $OutputDirectory) {
    Write-Host "Removing existing bundle at $OutputDirectory..."
    Remove-Item -Recurse -Force $OutputDirectory
  }

  # python-build-standalone publishes one release containing every platform and
  # version combination, so the newest release is asked for a matching asset.
  $headers = @{ "User-Agent" = "JPLearn-build" }
  if (-not [string]::IsNullOrWhiteSpace($env:GITHUB_TOKEN)) {
    # Unauthenticated GitHub API calls are rate-limited to 60/hour per IP, which a
    # self-hosted runner shares with everything else on that machine.
    $headers["Authorization"] = "Bearer $env:GITHUB_TOKEN"
  }

  Write-Host "Looking up the latest python-build-standalone release..."
  $release = Invoke-RestMethod `
    -Uri "https://api.github.com/repos/astral-sh/python-build-standalone/releases/latest" `
    -Headers $headers

  $versionPattern = "cpython-" + [regex]::Escape($PythonVersion) + "\."

  $asset = $release.assets | Where-Object {
      $_.name -match $versionPattern -and
      $_.name -match 'x86_64-pc-windows-msvc' -and
      $_.name -match 'install_only_stripped' -and
      $_.name.EndsWith('.tar.gz')
  } | Select-Object -First 1

  if (-not $asset) {
      throw "Could not find Python $PythonVersion Windows x64 install_only asset in $($release.tag_name)"
  }

  # Downloaded outside the repository so a failed run cannot leave a ~24 MB
  # untracked tarball sitting in `git status`.
  $archive = Join-Path ([System.IO.Path]::GetTempPath()) "jplearn-$($asset.name)"
  $tar = Get-BsdTar

  try {
    $sizeMb = [math]::Round($asset.size / 1MB, 1)
    Write-Host "Downloading $($asset.name) ($sizeMb MB) from $($release.tag_name)..."
    Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $archive

    New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
    Write-Host "Extracting with $tar..."
    & $tar -xzf $archive -C $OutputDirectory
    if ($LASTEXITCODE -ne 0) {
      throw "$tar failed to extract $archive (exit $LASTEXITCODE)"
    }
  }
  finally {
    if (Test-Path $archive) {
      Remove-Item -Force $archive
    }
  }

  if (-not (Test-Path $pythonExe)) {
      Get-ChildItem $OutputDirectory -Recurse | Select-Object -First 20
      throw "python.exe not found at $pythonExe after extraction"
  }

  # electron/main.cjs::resolvePythonCommand prefers this bundle over .venv and over
  # system Python whenever it exists, so it must be able to import the bridge on its
  # own. `import data` reaches `from fugashi import Tagger` in
  # data/text_normalization.py at module load, which makes fugashi and its dictionary
  # as required as psutil is - a psutil-only bundle makes every bridge call fail with
  # ModuleNotFoundError.
  #
  # Pinned to the versions the tests run with (requirements.txt): an unpinned fugashi
  # once shipped 1.5.2 against a tested 1.3.0 (audit 13, F3).
  #
  # The rest of requirements.txt is deliberately left out: pytest is test-only, and the
  # optional features' packages (faster-whisper for speech, onnxruntime and tokenizers for
  # the tutor's embedder, OCR's) are installed by the setup wizard on demand into
  # JPLearn Assets (electron/python_packages.cjs), outside the app's version folder.
  $runtimePackages = @("psutil==7.2.2", "fugashi==1.3.0", "unidic-lite==1.0.8")

  Write-Host "Installing runtime packages into bundle: $($runtimePackages -join ', ')"
  & $pythonExe -m pip install --disable-pip-version-check --quiet @runtimePackages
  if ($LASTEXITCODE -ne 0) {
    throw "pip install failed inside the bundle (exit $LASTEXITCODE)"
  }

  Write-Host "Trimming Python test suite to reduce installer size..."
  $toRemove = @(
    "python\Lib\test",
    "python\Lib\unittest\test",
    "python\Lib\email\test",
    "python\Lib\tkinter"
  )
  foreach ($relative in $toRemove) {
    $dir = Join-Path $OutputDirectory $relative
    if (Test-Path $dir) {
      Remove-Item -Recurse -Force $dir
      Write-Host "  removed: $relative"
    }
  }

  # The Visual C++ runtime, beside python.exe, where Windows looks first for an extension's DLLs.
  # python-build-standalone ships vcruntime140*.dll only; the native wheels the optional features
  # install (onnxruntime, av, cv2, paddle) also need msvcp140*.dll and concrt140.dll, which a clean
  # Windows does not have (audit 13: every import failed on a bare Windows Server). Copied from the
  # build machine, which must have the x64 Visual C++ Redistributable installed. App-local copies
  # are how Microsoft's redistribution terms allow shipping them.
  Write-Host "Adding the Visual C++ runtime to the bundle..."
  $vcRuntime = @("msvcp140.dll", "msvcp140_1.dll", "msvcp140_2.dll", "concrt140.dll", "vcruntime140.dll", "vcruntime140_1.dll")
  # Sysnative is the real System32 from a 32-bit PowerShell, which would otherwise be handed
  # SysWOW64's 32-bit DLLs.
  $systemDir = if ([Environment]::Is64BitProcess) { "System32" } else { "Sysnative" }
  $vcSource = if ($VcRuntimeDirectory) { $VcRuntimeDirectory } else { Join-Path $env:SystemRoot $systemDir }
  $pythonDir = Split-Path $pythonExe -Parent
  foreach ($dll in $vcRuntime) {
    $source = Join-Path $vcSource $dll
    if (-not (Test-Path -LiteralPath $source)) {
      throw "$dll is missing from $vcSource; install the x64 Visual C++ Redistributable on this build machine (https://aka.ms/vs/17/release/vc_redist.x64.exe)"
    }
    $target = Join-Path $pythonDir $dll
    if (-not (Test-Path -LiteralPath $target)) {
      Copy-Item -LiteralPath $source -Destination $target
      Write-Host "  added: $dll"
    }
  }
  # Newer parts of the runtime some native builds also link (OpenMP, the C++20 extras), copied
  # when the source has them.
  foreach ($dll in @("vcomp140.dll", "msvcp140_atomic_wait.dll", "msvcp140_codecvt_ids.dll")) {
    $source = Join-Path $vcSource $dll
    $target = Join-Path $pythonDir $dll
    if ((Test-Path -LiteralPath $source) -and -not (Test-Path -LiteralPath $target)) {
      Copy-Item -LiteralPath $source -Destination $target
      Write-Host "  added: $dll"
    }
  }

  # Proves the bundle can actually run the bridge before it is packaged. Without
  # this the failure only surfaces as an installed app whose every backend call
  # times out, which is a very expensive way to find a missing dependency.
  #
  # Tokenizing real text rather than just importing: data/text_normalization.py
  # builds its Tagger lazily, so a missing unidic-lite dictionary would survive an
  # import and only fail on the first normalized write. PowerShell does not treat
  # backslash as an escape, so these \u sequences reach Python verbatim.
  Write-Host "Verifying the bundle can import the bridge..."
  $probe = "import domain; from data.text_normalization import tokenize_japanese; " +
           "assert tokenize_japanese('\u65e5\u672c\u8a9e'); print('bridge imports OK')"

  Push-Location $repoRoot
  try {
    & $pythonExe -c $probe 2>&1 | ForEach-Object { Write-Host "  $_" }
    if ($LASTEXITCODE -ne 0) {
      throw "the bundled Python cannot import the bridge modules (exit $LASTEXITCODE)"
    }
  }
  finally {
    Pop-Location
  }

  Write-Host "Python bundle ready: $(& $pythonExe --version)"
}
catch {
  # Without this the script can report success to its caller: `exit 1` after a
  # Write-Error is unreachable once $ErrorActionPreference is Stop.
  Write-Host "BUNDLE FAILED: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}

exit 0
