param(
  [int[]]$Sizes = @(16,48,128)
)

Add-Type -AssemblyName System.Drawing

function New-Icon {
  param(
    [int]$Size,
    [string]$OutPath
  )

  $bmp = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)

  $leftHex = '#86d4df'
  $rightHex = '#4ab1d6'
  $fgHex = '#2f3b4a'

  function ColorFromHex([string]$hex) {
    $hex = $hex.TrimStart('#')
    $r = [Convert]::ToInt32($hex.Substring(0,2),16)
    $g2 = [Convert]::ToInt32($hex.Substring(2,2),16)
    $b = [Convert]::ToInt32($hex.Substring(4,2),16)
    return [System.Drawing.Color]::FromArgb(255,$r,$g2,$b)
  }

  $left = ColorFromHex $leftHex
  $right = ColorFromHex $rightHex
  $fg = ColorFromHex $fgHex

  $bubbleHeight = [Math]::Floor($Size * 0.82)
  $pointerHeight = [Math]::Max(2,[Math]::Round($Size * 0.18))
  $radius = [Math]::Max(2,[Math]::Round($Size * 0.18))

  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $rect = New-Object System.Drawing.Rectangle(0, 0, $Size, $bubbleHeight)

  # Rounded rectangle
  $d = $radius * 2
  if ($d -gt 0) {
    $path.AddArc(0, 0, $d, $d, 180, 90)                  # TL
    $path.AddArc($Size - $d, 0, $d, $d, 270, 90)         # TR
    $path.AddArc($Size - $d, $bubbleHeight - $d, $d, $d, 0, 90) # BR
    $path.AddArc(0, $bubbleHeight - $d, $d, $d, 90, 90)  # BL
    $path.CloseFigure()
  } else {
    $path.AddRectangle($rect)
  }

  # Pointer triangle
  $baseHalf = [Math]::Max(3, [Math]::Round($Size * 0.16))
  $baseY = $bubbleHeight - 1
  $apexY = [Math]::Min($Size - 1, $baseY + $pointerHeight)
  $cx = [Math]::Round($Size / 2)
  $triangle = New-Object System.Drawing.Drawing2D.GraphicsPath
  $triangle.AddPolygon(@(
    New-Object System.Drawing.Point([Math]::Max(0,$cx - $baseHalf), $baseY),
    New-Object System.Drawing.Point([Math]::Min($Size-1,$cx + $baseHalf), $baseY),
    New-Object System.Drawing.Point($cx, $apexY)
  ))

  $shape = New-Object System.Drawing.Drawing2D.GraphicsPath
  $shape.AddPath($path, $true)
  $shape.AddPath($triangle, $false)

  # Fill halves
  $region = New-Object System.Drawing.Region($shape)
  $leftRegion = $region.Clone()
  $leftRegion.Intersect((New-Object System.Drawing.Rectangle(0,0,[Math]::Floor($Size/2), $Size)))
  $rightRegion = $region.Clone()
  $rightRegion.Intersect((New-Object System.Drawing.Rectangle([Math]::Floor($Size/2),0,$Size,[Math]::Ceiling($Size))))

  $g.FillRegion((New-Object System.Drawing.SolidBrush($left)), $leftRegion)
  $g.FillRegion((New-Object System.Drawing.SolidBrush($right)), $rightRegion)

  # Morse dots/dashes
  $brush = New-Object System.Drawing.SolidBrush($fg)
  $dotR = [Math]::Max(1,[Math]::Round($Size * 0.08))
  $dashH = [Math]::Max(2,[Math]::Round($Size * 0.12))

  function DrawDot([int]$cx, [int]$cy) {
    $g.FillEllipse($brush, $cx - $dotR, $cy - $dotR, $dotR*2, $dotR*2)
  }
  function DrawDash([int]$cx, [int]$cy, [int]$w) {
    $x = $cx - [Math]::Round($w/2)
    $y = $cy - [Math]::Round($dashH/2)
    $g.FillRectangle($brush, $x, $y, $w, $dashH)
  }

  $rowY1 = [Math]::Round($bubbleHeight * 0.30)
  $rowY2 = [Math]::Round($bubbleHeight * 0.50)
  $rowY3 = [Math]::Round($bubbleHeight * 0.72)
  $c1 = [Math]::Round($Size * 0.28)
  $c2 = [Math]::Round($Size * 0.50)
  $c3 = [Math]::Round($Size * 0.72)

  # Row1: dot, dot, dash
  DrawDot $c1 $rowY1
  DrawDot $c2 $rowY1
  DrawDash $c3 $rowY1 ([Math]::Max(4,[Math]::Round($Size * 0.34)))

  # Row2: center dash
  DrawDash $c2 $rowY2 ([Math]::Max(5,[Math]::Round($Size * 0.52)))

  # Row3: dash, dot
  DrawDash $c1 $rowY3 ([Math]::Max(5,[Math]::Round($Size * 0.52)))
  DrawDot $c3 $rowY3

  $bmp.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
}

foreach ($s in $Sizes) {
  $path = Join-Path -Path (Get-Location) -ChildPath ("icon{0}.png" -f $s)
  New-Icon -Size $s -OutPath $path
  Write-Host "Generated $path"
}
