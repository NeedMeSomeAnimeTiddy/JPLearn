param(
  [string]$JPLearnDir
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
  return (Join-Path $docs 'JPLearn')
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

$targetDir = Resolve-JPLearnDir -Candidate $JPLearnDir
if (-not (Test-Path -LiteralPath $targetDir)) {
  exit 0
}

$logPath = Join-Path $targetDir 'uninstall-cleanup.log'
Write-CleanupLog -LogPath $logPath -Message "Cleanup helper started for $targetDir"

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$options = @(
  @{
    Label = 'Keep VOICEVOX files (~1 GB)'
    Path = Join-Path $targetDir 'voicevox'
  },
  @{
    Label = 'Keep AI model files (GGUF)'
    Path = Join-Path $targetDir 'models'
  },
  @{
    Label = 'Keep learning database/progress'
    Path = Join-Path $targetDir 'data'
  }
)

$form = New-Object System.Windows.Forms.Form
$form.Text = 'JPLearn Uninstall Cleanup'
$form.StartPosition = 'CenterScreen'
$form.Size = New-Object System.Drawing.Size(560, 330)
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.TopMost = $true

$intro = New-Object System.Windows.Forms.Label
$intro.AutoSize = $false
$intro.Location = New-Object System.Drawing.Point(16, 12)
$intro.Size = New-Object System.Drawing.Size(520, 52)
$intro.Text = "Uninstall is removing the app binaries. Choose what to keep in Documents\JPLearn.\r\nUnchecked items will be deleted now."
$form.Controls.Add($intro)

$list = New-Object System.Windows.Forms.CheckedListBox
$list.Location = New-Object System.Drawing.Point(16, 70)
$list.Size = New-Object System.Drawing.Size(520, 124)
$list.CheckOnClick = $true

foreach ($opt in $options) {
  [void]$list.Items.Add($opt.Label, $true)
}

$form.Controls.Add($list)

$pathLabel = New-Object System.Windows.Forms.Label
$pathLabel.AutoSize = $false
$pathLabel.Location = New-Object System.Drawing.Point(16, 204)
$pathLabel.Size = New-Object System.Drawing.Size(520, 34)
$pathLabel.Text = "Data folder: $targetDir"
$form.Controls.Add($pathLabel)

$cancelBtn = New-Object System.Windows.Forms.Button
$cancelBtn.Text = 'Keep Everything'
$cancelBtn.Location = New-Object System.Drawing.Point(266, 248)
$cancelBtn.Size = New-Object System.Drawing.Size(130, 30)
$cancelBtn.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
$form.Controls.Add($cancelBtn)

$okBtn = New-Object System.Windows.Forms.Button
$okBtn.Text = 'Apply Selection'
$okBtn.Location = New-Object System.Drawing.Point(406, 248)
$okBtn.Size = New-Object System.Drawing.Size(130, 30)
$okBtn.DialogResult = [System.Windows.Forms.DialogResult]::OK
$form.Controls.Add($okBtn)

$form.AcceptButton = $okBtn
$form.CancelButton = $cancelBtn

$result = $form.ShowDialog()
if ($result -ne [System.Windows.Forms.DialogResult]::OK) {
  Write-CleanupLog -LogPath $logPath -Message 'User cancelled cleanup; keeping all files.'
  exit 0
}

$removed = @()
$failed = @()

for ($i = 0; $i -lt $options.Count; $i++) {
  $keep = $list.GetItemChecked($i)
  $opt = $options[$i]

  if ($keep) {
    Write-CleanupLog -LogPath $logPath -Message "Keeping: $($opt.Path)"
    continue
  }

  if (-not (Test-Path -LiteralPath $opt.Path)) {
    Write-CleanupLog -LogPath $logPath -Message "Nothing to remove at: $($opt.Path)"
    continue
  }

  try {
    Remove-Item -LiteralPath $opt.Path -Recurse -Force
    $removed += $opt.Label
    Write-CleanupLog -LogPath $logPath -Message "Removed: $($opt.Path)"
  } catch {
    $failed += "$($opt.Label): $($_.Exception.Message)"
    Write-CleanupLog -LogPath $logPath -Message "Failed to remove $($opt.Path): $($_.Exception.Message)"
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
