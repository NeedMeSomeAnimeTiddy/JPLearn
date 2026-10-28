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

function Test-IsInside {
  param([string]$Path, [string]$Folder)
  $p = Get-FullPath $Path
  $f = Get-FullPath $Folder
  return ($p -eq $f -or $p.StartsWith("$f\", [System.StringComparison]::OrdinalIgnoreCase))
}

# Moves $Path to the Recycle Bin, except anything a kept item owns inside it: the translation
# model lives in the tutor models folder, so unticking tutor models must not take it along.
function Remove-PathKeeping {
  param([string]$Path, [string[]]$Kept)

  # A junction or symbolic link is left alone, never followed or removed: through it a path that
  # looks like a download could reach the learner's progress, and the path checks below compare
  # names, not the folders they resolve to.
  $item = Get-Item -LiteralPath $Path -Force
  if ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
    return $false
  }

  foreach ($keptPath in $Kept) {
    if (Test-IsInside -Path $Path -Folder $keptPath) {
      return $false
    }
  }
  $holdsKept = $false
  foreach ($keptPath in $Kept) {
    if (Test-IsInside -Path $keptPath -Folder $Path) {
      $holdsKept = $true
    }
  }
  if ($holdsKept) {
    $any = $false
    foreach ($child in (Get-ChildItem -LiteralPath $Path -Force)) {
      if (Remove-PathKeeping -Path $child.FullName -Kept $Kept) {
        $any = $true
      }
    }
    return $any
  }
  # The Recycle Bin rather than a permanent delete: a learner who unticks the wrong box can
  # still get their history back.
  if (Test-Path -LiteralPath $Path -PathType Container) {
    [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory(
      $Path,
      [Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs,
      [Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin
    )
  } else {
    [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile(
      $Path,
      [Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs,
      [Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin
    )
  }
  return $true
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

# Carries out the choices: each is @{ Option = @{ Label; Paths }; Keep = $bool }. A function so the
# keep rules can be exercised on scratch folders without the dialog.
function Invoke-CleanupChoices {
  param([object[]]$Choices, [string]$ProgressPath, [string]$LogPath)

  $choices = $Choices
  $progressPath = $ProgressPath
  $logPath = $LogPath
  $removed = @()
  $failed = @()

  # Everything a kept item covers, and the learner's progress whatever was ticked, is left alone
  # even where it sits inside a folder another item removes.
  $keptPaths = @($progressPath)
  foreach ($choice in $choices) {
    if ($choice.Keep) {
      $keptPaths += $choice.Option.Paths
    }
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
      # The progress item itself may remove the progress folder; every other item keeps it. A kept
      # folder that merely contains this path does not protect it: the item naming the path itself
      # is the more specific choice (tutor models kept, translation unticked: its model, inside the
      # tutor models folder, still goes).
      $keptHere = @($keptPaths | Where-Object {
        $isProgressOfThisItem = ($_ -eq $progressPath -and $opt.Paths -contains $progressPath)
        $containsThisPath = ((Test-IsInside -Path $path -Folder $_) -and ((Get-FullPath $_) -ne (Get-FullPath $path)))
        -not $isProgressOfThisItem -and -not $containsThisPath
      })
      try {
        if (Remove-PathKeeping -Path $path -Kept $keptHere) {
          $removedAny = $true
          Write-CleanupLog -LogPath $logPath -Message "Moved to Recycle Bin: $path"
        }
      } catch {
        $failed += "$($opt.Label): $($_.Exception.Message)"
        Write-CleanupLog -LogPath $logPath -Message "Failed to remove ${path}: $($_.Exception.Message)"
      }
    }
    if ($removedAny) {
      $removed += ($opt.Label -replace '^Keep ', '')
    }
  }

  return @{ Removed = $removed; Failed = $failed }
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
      (Join-Path $assetsDir 'models\llama\Qwen3.5-0.8B-JP-Q4_K_M.gguf'),
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

$choices = @()
for ($i = 0; $i -lt $downloadOptions.Count; $i++) {
  $choices += @{ Option = $downloadOptions[$i]; Keep = $downloadsList.GetItemChecked($i) }
}
for ($i = 0; $i -lt $learningOptions.Count; $i++) {
  $choices += @{ Option = $learningOptions[$i]; Keep = $learningList.GetItemChecked($i) }
}

$outcome = Invoke-CleanupChoices -Choices $choices -ProgressPath $progressPath -LogPath $logPath
$removed = @($outcome.Removed)
$failed = @($outcome.Failed)

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
