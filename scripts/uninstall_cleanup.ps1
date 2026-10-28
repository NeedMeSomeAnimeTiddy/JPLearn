param(
  # Learning progress: Documents\JPLearn Progress unless JPLEARN_DOCUMENTS_DIR moved it.
  [string]$JPLearnDir,
  # Downloads (models, voice, speech, OCR, tools, fonts): %LOCALAPPDATA%\JPLearn Assets unless
  # JPLEARN_ASSETS_DIR moved it. Before audit 6 the dialog never looked here, so every download
  # outlived the app (audit 6 F2).
  [string]$AssetsDir
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Resolve-JPLearnDir {
  param([string]$Candidate)

  if (-not [string]::IsNullOrWhiteSpace($Candidate)) {
    return $Candidate
  }

  $docs = [Environment]::GetFolderPath('MyDocuments')
  if ([string]::IsNullOrWhiteSpace($docs)) {
    $docs = Join-Path $HOME 'Documents'
  }
  return (Join-Path $docs 'JPLearn Progress')
}

function Resolve-AssetsDir {
  param([string]$Candidate)

  if (-not [string]::IsNullOrWhiteSpace($Candidate)) {
    return $Candidate
  }
  $localAppData = [Environment]::GetFolderPath('LocalApplicationData')
  if ([string]::IsNullOrWhiteSpace($localAppData)) {
    $localAppData = Join-Path $HOME 'AppData\Local'
  }
  return (Join-Path $localAppData 'JPLearn Assets')
}

function Write-CleanupLog {
  param(
    [string]$LogPath,
    [string]$Message
  )
  try {
    Add-Content -Path $LogPath -Value ("[{0}] {1}" -f (Get-Date).ToString('s'), $Message) -Encoding utf8
  } catch {
    # no-op
  }
}

function Get-FullPath {
  param([string]$Path)
  return [System.IO.Path]::GetFullPath($Path).TrimEnd('\')
}

function Format-Size {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) {
    return $null
  }
  try {
    $bytes = (Get-ChildItem -LiteralPath $Path -Recurse -File -Force -ErrorAction SilentlyContinue |
      Measure-Object -Property Length -Sum).Sum
  } catch {
    return $null
  }
  if (-not $bytes) {
    return $null
  }
  if ($bytes -ge 1GB) {
    return ('{0:N1} GB' -f ($bytes / 1GB))
  }
  return ('{0:N0} MB' -f ($bytes / 1MB))
}

$targetDir = Resolve-JPLearnDir -Candidate $JPLearnDir
$assetsDir = Resolve-AssetsDir -Candidate $AssetsDir
$haveProgress = Test-Path -LiteralPath $targetDir
$haveAssets = Test-Path -LiteralPath $assetsDir
if (-not $haveProgress -and -not $haveAssets) {
  exit 0
}

$logDir = if ($haveProgress) { $targetDir } else { $assetsDir }
$logPath = Join-Path $logDir 'uninstall-cleanup.log'
Write-CleanupLog -LogPath $logPath -Message "Cleanup helper started for $targetDir and $assetsDir"

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName Microsoft.VisualBasic

$progressPath = Join-Path $targetDir 'data'

# Each item lists every folder it covers, including the older places a download used to land
# (Documents\JPLearn Progress\tts and \models).
$downloadOptions = @(
  @{
    Label = 'Keep tutor models'
    Paths = @((Join-Path $assetsDir 'models'), (Join-Path $targetDir 'models'))
  },
  @{
    Label = 'Keep voice (VOICEVOX)'
    Paths = @((Join-Path $assetsDir 'tools\voicevox'), (Join-Path $assetsDir 'tts'), (Join-Path $targetDir 'tts'))
  },
  @{
    Label = 'Keep speech recognition models'
    Paths = @((Join-Path $assetsDir 'whisper'))
  },
  @{
    Label = 'Keep OCR and translation models, tools, fonts'
    Paths = @(
      (Join-Path $assetsDir 'ocr'),
      (Join-Path $assetsDir 'translation'),
      (Join-Path $assetsDir 'tools\llama.cpp'),
      (Join-Path $assetsDir 'fonts'),
      (Join-Path $assetsDir 'data\external_sources\offline_dictionary')
    )
  }
)
$learningOptions = @(
  @{
    Label = 'Keep learning progress'
    Paths = @($progressPath)
  }
)

# A download item never removes the learner's progress, even when both folders were pointed at
# the same place.
$progressFull = Get-FullPath $progressPath
foreach ($opt in $downloadOptions) {
  $opt.Paths = @($opt.Paths | Where-Object {
    $full = Get-FullPath $_
    -not ($progressFull -eq $full -or $progressFull.StartsWith("$full\", [System.StringComparison]::OrdinalIgnoreCase))
  })
}

$form = New-Object System.Windows.Forms.Form
$form.Text = 'JPLearn Uninstall Cleanup'
$form.StartPosition = 'CenterScreen'
$form.Size = New-Object System.Drawing.Size(560, 470)
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.TopMost = $true

$intro = New-Object System.Windows.Forms.Label
$intro.AutoSize = $false
$intro.Location = New-Object System.Drawing.Point(16, 12)
$intro.Size = New-Object System.Drawing.Size(520, 40)
$intro.Text = "The app itself has been removed. Choose what to keep.`r`nUnticked items are moved to the Recycle Bin now."
$form.Controls.Add($intro)

$assetsSize = Format-Size $assetsDir
$downloadsHeading = New-Object System.Windows.Forms.Label
$downloadsHeading.AutoSize = $false
$downloadsHeading.Location = New-Object System.Drawing.Point(16, 58)
$downloadsHeading.Size = New-Object System.Drawing.Size(520, 20)
$downloadsHeading.Text = if ($assetsSize) { "Downloads (JPLearn Assets, $assetsSize)" } else { 'Downloads (JPLearn Assets)' }
$form.Controls.Add($downloadsHeading)

$downloadsList = New-Object System.Windows.Forms.CheckedListBox
$downloadsList.Location = New-Object System.Drawing.Point(16, 80)
$downloadsList.Size = New-Object System.Drawing.Size(520, 80)
$downloadsList.CheckOnClick = $true
foreach ($opt in $downloadOptions) {
  [void]$downloadsList.Items.Add($opt.Label, $true)
}
$form.Controls.Add($downloadsList)

$learningHeading = New-Object System.Windows.Forms.Label
$learningHeading.AutoSize = $false
$learningHeading.Location = New-Object System.Drawing.Point(16, 172)
$learningHeading.Size = New-Object System.Drawing.Size(520, 20)
$learningHeading.Text = 'Your learning'
$form.Controls.Add($learningHeading)

$learningList = New-Object System.Windows.Forms.CheckedListBox
$learningList.Location = New-Object System.Drawing.Point(16, 194)
$learningList.Size = New-Object System.Drawing.Size(520, 24)
$learningList.CheckOnClick = $true
foreach ($opt in $learningOptions) {
  [void]$learningList.Items.Add($opt.Label, $true)
}
$form.Controls.Add($learningList)

$pathLabel = New-Object System.Windows.Forms.Label
$pathLabel.AutoSize = $false
$pathLabel.Location = New-Object System.Drawing.Point(16, 234)
$pathLabel.Size = New-Object System.Drawing.Size(520, 120)
$pathLabel.Text = "Downloads: $assetsDir`r`nProgress:  $targetDir"
$form.Controls.Add($pathLabel)

$cancelBtn = New-Object System.Windows.Forms.Button
$cancelBtn.Text = 'Keep Everything'
$cancelBtn.Location = New-Object System.Drawing.Point(266, 384)
$cancelBtn.Size = New-Object System.Drawing.Size(130, 30)
$cancelBtn.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
$form.Controls.Add($cancelBtn)

$okBtn = New-Object System.Windows.Forms.Button
$okBtn.Text = 'Apply Selection'
$okBtn.Location = New-Object System.Drawing.Point(406, 384)
$okBtn.Size = New-Object System.Drawing.Size(130, 30)
$okBtn.DialogResult = [System.Windows.Forms.DialogResult]::OK
$form.Controls.Add($okBtn)

# Keep Everything is the default: Enter or Escape never removes anything.
$form.AcceptButton = $cancelBtn
$form.CancelButton = $cancelBtn

$result = $form.ShowDialog()
if ($result -ne [System.Windows.Forms.DialogResult]::OK) {
  Write-CleanupLog -LogPath $logPath -Message 'User cancelled cleanup; keeping all files.'
  exit 0
}

$removed = @()
$failed = @()

$choices = @()
for ($i = 0; $i -lt $downloadOptions.Count; $i++) {
  $choices += @{ Option = $downloadOptions[$i]; Keep = $downloadsList.GetItemChecked($i) }
}
for ($i = 0; $i -lt $learningOptions.Count; $i++) {
  $choices += @{ Option = $learningOptions[$i]; Keep = $learningList.GetItemChecked($i) }
}

foreach ($choice in $choices) {
  $opt = $choice.Option

  if ($choice.Keep) {
    Write-CleanupLog -LogPath $logPath -Message "Keeping: $($opt.Paths -join '; ')"
    continue
  }

  $removedAny = $false
  foreach ($path in $opt.Paths) {
    if (-not (Test-Path -LiteralPath $path)) {
      Write-CleanupLog -LogPath $logPath -Message "Nothing to remove at: $path"
      continue
    }
    try {
      # The Recycle Bin rather than a permanent delete: a learner who unticks the wrong box can
      # still get their history back.
      [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory(
        $path,
        [Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs,
        [Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin
      )
      $removedAny = $true
      Write-CleanupLog -LogPath $logPath -Message "Moved to Recycle Bin: $path"
    } catch {
      $failed += "$($opt.Label): $($_.Exception.Message)"
      Write-CleanupLog -LogPath $logPath -Message "Failed to remove ${path}: $($_.Exception.Message)"
    }
  }
  if ($removedAny) {
    $removed += ($opt.Label -replace '^Keep ', '')
  }
}

if ($failed.Count -gt 0) {
  [System.Windows.Forms.MessageBox]::Show(
    "Cleanup finished with warnings.\r\n\r\n$($failed -join "`r`n")\r\n\r\nDetails were logged to:`r`n$logPath",
    'JPLearn Cleanup',
    [System.Windows.Forms.MessageBoxButtons]::OK,
    [System.Windows.Forms.MessageBoxIcon]::Warning
  ) | Out-Null
  exit 0
}

if ($removed.Count -eq 0) {
  [System.Windows.Forms.MessageBox]::Show(
    'No files were removed. Your selections were kept.',
    'JPLearn Cleanup',
    [System.Windows.Forms.MessageBoxButtons]::OK,
    [System.Windows.Forms.MessageBoxIcon]::Information
  ) | Out-Null
  exit 0
}

[System.Windows.Forms.MessageBox]::Show(
  "Removed:`r`n$($removed -join "`r`n")",
  'JPLearn Cleanup',
  [System.Windows.Forms.MessageBoxButtons]::OK,
  [System.Windows.Forms.MessageBoxIcon]::Information
) | Out-Null
