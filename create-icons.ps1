# PowerShell скрипт для создания PNG иконок из исходного изображения
# Требует: Windows 10+ с установленным .NET

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

$sourceImage = "sniffer.png"

if (-not (Test-Path $sourceImage)) {
    Write-Host "Error: Source image '$sourceImage' not found!" -ForegroundColor Red
    exit 1
}

$sizes = @(16, 32, 48, 128)
$folders = @("chrome\icons", "firefox\icons", "icons")

Write-Host "Creating PNG icons from $sourceImage..." -ForegroundColor Cyan
Write-Host ""

function Resize-Image {
    param(
        [System.Drawing.Image]$SourceImage,
        [int]$Size,
        [string]$OutputPath
    )
    
    # Создаем новый bitmap нужного размера
    $bitmap = New-Object System.Drawing.Bitmap($Size, $Size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    
    # Настройки качества для ресайза
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    
    # Рисуем исходное изображение с новым размером
    $graphics.DrawImage($SourceImage, 0, 0, $Size, $Size)
    
    # Сохраняем
    $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    
    # Освобождаем ресурсы
    $graphics.Dispose()
    $bitmap.Dispose()
    
    $fileInfo = Get-Item $OutputPath
    Write-Host "  OK $($fileInfo.Name) - $($fileInfo.Length) bytes" -ForegroundColor Green
}

# Загружаем исходное изображение
$sourceImageObj = [System.Drawing.Image]::FromFile((Resolve-Path $sourceImage).Path)

Write-Host "Source image: $($sourceImageObj.Width)x$($sourceImageObj.Height) pixels" -ForegroundColor Yellow
Write-Host ""

# Создаем иконки для всех папок
foreach ($folder in $folders) {
    if (-not (Test-Path $folder)) {
        New-Item -ItemType Directory -Path $folder -Force | Out-Null
    }
    
    Write-Host "Folder: $folder" -ForegroundColor Yellow
    
    foreach ($size in $sizes) {
        $outputPath = Join-Path $folder "$size.png"
        Resize-Image -SourceImage $sourceImageObj -Size $size -OutputPath $outputPath
    }
    
    Write-Host ""
}

# Освобождаем исходное изображение
$sourceImageObj.Dispose()

Write-Host "Done! All PNG icons created from $sourceImage." -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Reload extension in browser" -ForegroundColor White
Write-Host "  2. Icons should display correctly" -ForegroundColor White
Write-Host ""
