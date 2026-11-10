# Downloads the WGFD draw PDFs listed in data/wy/draw-sources.csv.
# Run on a machine that can reach wgfd.wyo.gov (the cloud workspace cannot):
#   powershell -ExecutionPolicy Bypass -File scripts\wy-download-draw-pdfs.ps1 -Out "$HOME\Downloads\wgfd"
param([string]$Out = "$HOME\Downloads\wgfd")
New-Item -ItemType Directory -Force -Path $Out | Out-Null
$csv = Import-Csv (Join-Path $PSScriptRoot "..\data\wy\draw-sources.csv")
foreach ($r in $csv) {
  $dest = Join-Path $Out $r.file
  if (Test-Path $dest) { continue }
  try {
    Invoke-WebRequest -Uri $r.url -OutFile $dest -UseBasicParsing
    Write-Host "ok   $($r.file)"
  } catch { Write-Warning "FAIL $($r.file): $($_.Exception.Message)" }
  Start-Sleep -Milliseconds 400
}
Write-Host "Done. Files in $Out"
