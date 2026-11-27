$ErrorActionPreference = 'Stop'
$docxPath = (Resolve-Path -LiteralPath 'output/chuyen-de-cosine-tim-kiem-anh.docx').Path
$qaPath = Join-Path (Resolve-Path -LiteralPath 'output').Path '.cosine-docx-qa'
New-Item -ItemType Directory -Force -Path $qaPath | Out-Null
$pdfPath = Join-Path $qaPath 'chuyen-de-cosine-tim-kiem-anh.pdf'
Write-Output 'Starting Word'
$word = New-Object -ComObject Word.Application
Write-Output 'Word started'
$word.Visible = $false
$word.DisplayAlerts = 0
try {
  $document = $word.Documents.OpenNoRepairDialog($docxPath, $false, $true)
  Write-Output 'Document opened'
  try { $document.SaveAs2($pdfPath, 17); Write-Output 'PDF exported' }
  finally { $document.Close($false) }
}
finally { $word.Quit() }
Write-Output $pdfPath
