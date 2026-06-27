param(
  [string]$ModelPath = ""
)

$repoRoot = Split-Path -Parent $PSScriptRoot
$llamaCli = Join-Path $repoRoot "tools\llama.cpp\build\bin\Release\llama-cli.exe"
$modelDir = Join-Path $repoRoot "models\llama"

if (-not (Test-Path $llamaCli)) {
  Write-Error "llama-cli not found at $llamaCli"
  exit 1
}

if ([string]::IsNullOrWhiteSpace($ModelPath)) {
  $model = Get-ChildItem -Path $modelDir -Filter *.gguf -File -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($null -ne $model) {
    $ModelPath = $model.FullName
  }
}

if ([string]::IsNullOrWhiteSpace($ModelPath) -or -not (Test-Path $ModelPath)) {
  Write-Error "No model found. Put a .gguf file in $modelDir or pass -ModelPath <path>."
  exit 1
}

$env:JPLEARN_TUTOR_PROVIDER = "llama.cpp"
$env:JPLEARN_LLAMA_CPP_PATH = $llamaCli
$env:JPLEARN_LLAMA_MODEL_PATH = $ModelPath

setx JPLEARN_TUTOR_PROVIDER "llama.cpp" | Out-Null
setx JPLEARN_LLAMA_CPP_PATH $llamaCli | Out-Null
setx JPLEARN_LLAMA_MODEL_PATH $ModelPath | Out-Null

Write-Host "Configured current session + user env vars:"
Write-Host "  JPLEARN_TUTOR_PROVIDER=$env:JPLEARN_TUTOR_PROVIDER"
Write-Host "  JPLEARN_LLAMA_CPP_PATH=$env:JPLEARN_LLAMA_CPP_PATH"
Write-Host "  JPLEARN_LLAMA_MODEL_PATH=$env:JPLEARN_LLAMA_MODEL_PATH"
