# PowerShell скрипт для создания PNG иконок из SVG
# Требует: Windows 10+ с установленным .NET

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

$svgContent = @'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="16" fill="#2563eb"/>
  <path d="M32 40 L64 32 L96 40 L96 80 L64 96 L32 80 Z" fill="none" stroke="#fff" stroke-width="4" stroke-linejoin="round"/>
  <circle cx="64" cy="48" r="6" fill="#fff"/>
  <circle cx="48" cy="64" r="6" fill="#fff"/>
  <circle cx="80" cy="64" r="6" fill="#fff"/>
  <circle cx="64" cy="80" r="6" fill="#fff"/>
  <line x1="64" y1="48" x2="48" y2="64" stroke="#fff" stroke-width="3"/>
  <line x1="64" y1="48" x2="80" y2="64" stroke="#fff" stroke-width="3"/>
  <line x1="48" y1="64" x2="64" y2="80" stroke="#fff" stroke-width="3"/>
  <line x1="80" y1="64" x2="64" y2="80" stroke="#fff" stroke-width="3"/>
  <text x="64" y="115" font-family="Arial, sans-serif" font-size="16" font-weight="bold" text-anchor="middle" fill="#fff">API</text>
</svg>
'@

$sizes = @(16, 32, 48, 128)
$folders = @("chrome\icons", "firefox\icons", "icons")

Write-Host "Creating PNG icons for API Sniffer..." -ForegroundColor Cyan
Write-Host ""

function Create-SimpleIcon {
    param([int]$Size, [string]$OutputPath)
    
    # Создаем bitmap
    $bitmap = New-Object System.Drawing.Bitmap($Size, $Size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    
    # Заливка фона (синий)
    $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(37, 99, 235))
    $rect = New-Object System.Drawing.Rectangle(0, 0, $Size, $Size)
    $graphics.FillRectangle($brush, $rect)
    
    # Белый текст "API"
    $fontFamily = "Arial"
    $fontSize = [Math]::Max(8, $Size / 8)
    $font = New-Object System.Drawing.Font($fontFamily, $fontSize, [System.Drawing.FontStyle]::Bold)
    $textBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $text = "API"
    $textSize = $graphics.MeasureString($text, $font)
    $textX = ($Size - $textSize.Width) / 2
    $textY = ($Size - $textSize.Height) / 2
    $graphics.DrawString($text, $font, $textBrush, $textX, $textY)
    
    # Белая рамка
    $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, [Math]::Max(1, $Size / 32))
    $margin = $Size / 8
    $graphics.DrawRectangle($pen, $margin, $margin, $Size - 2*$margin, $Size - 2*$margin)
    
    # Сохраняем
    $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    
    # Освобождаем ресурсы
    $graphics.Dispose()
    $bitmap.Dispose()
    $brush.Dispose()
    $textBrush.Dispose()
    $pen.Dispose()
    $font.Dispose()
    
    $fileInfo = Get-Item $OutputPath
    Write-Host "  OK $($fileInfo.Name) - $($fileInfo.Length) bytes" -ForegroundColor Green
}

# Создаем иконки для всех папок
foreach ($folder in $folders) {
    if (-not (Test-Path $folder)) {
        New-Item -ItemType Directory -Path $folder -Force | Out-Null
    }
    
    Write-Host "Folder: $folder" -ForegroundColor Yellow
    
    foreach ($size in $sizes) {
        $outputPath = Join-Path $folder "$size.png"
        Create-SimpleIcon -Size $size -OutputPath $outputPath
    }
    
    Write-Host ""
}

Write-Host "Done! All PNG icons created." -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Reload extension in browser" -ForegroundColor White
Write-Host "  2. Icons should display correctly" -ForegroundColor White
Write-Host ""
