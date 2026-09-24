<#
.SYNOPSIS
    AIDEA Report Manager - window app that pulls reports from GET /api/reports
    and saves them as CSV, Excel or PDF. Every alert/error is shown in a modal dialog.
#>
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Data
[System.Windows.Forms.Application]::EnableVisualStyles()
$ErrorActionPreference = 'Stop'

# ============================ MODAL ==========================================
function Show-Modal {
    param(
        [Parameter(Mandatory)][string]$Message,
        [string]$Title = 'Notice',
        [ValidateSet('info', 'success', 'error', 'warning')][string]$Type = 'info',
        [string]$ConfirmText,          # if set, shows [ConfirmText] [CancelText]; returns $true when confirmed
        [string]$CancelText = 'Close',
        $Owner
    )

    $accent = switch ($Type) {
        'success' { [System.Drawing.Color]::FromArgb(22, 163, 74) }
        'error'   { [System.Drawing.Color]::FromArgb(220, 38, 38) }
        'warning' { [System.Drawing.Color]::FromArgb(217, 119, 6) }
        default   { [System.Drawing.Color]::FromArgb(37, 99, 235) }
    }

    $dlg = New-Object System.Windows.Forms.Form
    $dlg.FormBorderStyle = 'FixedDialog'
    $dlg.StartPosition   = 'CenterParent'
    $dlg.MaximizeBox     = $false
    $dlg.MinimizeBox     = $false
    $dlg.ShowInTaskbar   = $false
    $dlg.BackColor       = [System.Drawing.Color]::White
    $dlg.Text            = $Title

    $bar = New-Object System.Windows.Forms.Panel
    $bar.BackColor = $accent
    $bar.Dock      = 'Top'
    $bar.Height    = 6

    $lblTitle = New-Object System.Windows.Forms.Label
    $lblTitle.Text      = $Title
    $lblTitle.Font      = New-Object System.Drawing.Font('Segoe UI', 13, [System.Drawing.FontStyle]::Bold)
    $lblTitle.ForeColor = $accent
    $lblTitle.AutoSize  = $true
    $lblTitle.Location  = New-Object System.Drawing.Point(20, 22)

    $lblMsg = New-Object System.Windows.Forms.Label
    $lblMsg.Font     = New-Object System.Drawing.Font('Segoe UI', 10)
    $lblMsg.AutoSize = $false
    $lblMsg.Text     = $Message
    $pref = $lblMsg.GetPreferredSize((New-Object System.Drawing.Size(380, 0)))
    $lblMsg.Location = New-Object System.Drawing.Point(20, 60)
    $lblMsg.Size     = New-Object System.Drawing.Size(380, ([Math]::Max($pref.Height, 20) + 6))

    $btnY = $lblMsg.Bottom + 22

    $btnClose = New-Object System.Windows.Forms.Button
    $btnClose.Size     = New-Object System.Drawing.Size(100, 32)
    $btnClose.Location = New-Object System.Drawing.Point(300, $btnY)
    $btnClose.FlatStyle = 'Flat'

    if ($ConfirmText) {
        $btnClose.Text         = $CancelText
        $btnClose.DialogResult = 'Cancel'

        $btnOk = New-Object System.Windows.Forms.Button
        $btnOk.Text         = $ConfirmText
        $btnOk.Size         = New-Object System.Drawing.Size(100, 32)
        $btnOk.Location     = New-Object System.Drawing.Point(190, $btnY)
        $btnOk.FlatStyle    = 'Flat'
        $btnOk.FlatAppearance.BorderSize = 0
        $btnOk.BackColor    = $accent
        $btnOk.ForeColor    = [System.Drawing.Color]::White
        $btnOk.DialogResult = 'OK'
        $dlg.Controls.Add($btnOk)
        $dlg.AcceptButton = $btnOk
    }
    else {
        $btnClose.Text         = 'OK'
        $btnClose.DialogResult = 'OK'
        $btnClose.FlatAppearance.BorderSize = 0
        $btnClose.BackColor    = $accent
        $btnClose.ForeColor    = [System.Drawing.Color]::White
        $dlg.AcceptButton = $btnClose
    }
    $dlg.CancelButton = $btnClose

    $dlg.Controls.Add($btnClose)
    $dlg.Controls.Add($lblMsg)
    $dlg.Controls.Add($lblTitle)
    $dlg.Controls.Add($bar)
    $dlg.ClientSize = New-Object System.Drawing.Size(420, ($btnY + 32 + 22))

    if ($Owner) { $res = $dlg.ShowDialog($Owner) } else { $res = $dlg.ShowDialog() }
    $dlg.Dispose()
    return ($res -eq [System.Windows.Forms.DialogResult]::OK)
}

function Show-Alert {
    param([string]$Message, [string]$Title = 'Notice', [string]$Type = 'info')
    [void](Show-Modal -Message $Message -Title $Title -Type $Type -Owner $script:form)
}

# ============================ API ============================================
function Get-ReportData {
    param([string]$BaseUrl, [string]$Token, [string]$Type, [datetime]$From, [datetime]$To)

    $uri = '{0}/api/reports?type={1}&from={2}&to={3}' -f $BaseUrl.TrimEnd('/'), $Type, $From.ToString('yyyy-MM-dd'), $To.ToString('yyyy-MM-dd')
    $headers = @{ Authorization = "Bearer $Token"; Accept = 'application/json' }

    try {
        $resp = Invoke-RestMethod -Uri $uri -Headers $headers -Method Get -TimeoutSec 60
    }
    catch {
        $status = $null
        if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
        $msg = $_.Exception.Message
        $raw = $null
        if ($_.ErrorDetails) { $raw = $_.ErrorDetails.Message }
        if ($raw) {
            try {
                $b = $raw | ConvertFrom-Json
                if ($b.error) { $msg = $b.error } elseif ($b.message) { $msg = $b.message }
            }
            catch { $msg = $raw }
        }
        switch ($status) {
            401     { throw 'Unauthorized: the API token is missing, wrong, or expired.' }
            403     { throw "Forbidden: $msg" }
            404     { throw "Not found: /api/reports does not exist at $BaseUrl. Check the URL and that the route is registered." }
            422     { throw "Validation failed: $msg" }
            501     { throw (New-Object System.NotSupportedException($msg)) }
            default {
                if ($status) { throw "Request failed ($status): $msg" }
                throw "Could not reach $BaseUrl - is 'php artisan serve' running?`n$msg"
            }
        }
    }
    return $resp.data
}

# ============================ HELPERS ========================================
function Format-Cell {
    param([string]$Name, $Value)
    if ($null -eq $Value) { return '' }
    if ($Name -match '^(amount|revenue)$' -and $Value -is [ValueType]) { return ('{0:N2}' -f [double]$Value) }
    return (([string]$Value) -replace '[^\x20-\x7E]', '?')
}

function Format-Fit {
    param([string]$Text, [int]$Width)
    if ($Text.Length -gt $Width) {
        if ($Width -gt 3) { $Text = $Text.Substring(0, $Width - 3) + '...' } else { $Text = $Text.Substring(0, $Width) }
    }
    return $Text.PadRight($Width)
}

function ConvertTo-PdfText {
    param([string]$Text)
    $Text = $Text -replace '[^\x20-\x7E]', '?'
    return $Text.Replace('\', '\\').Replace('(', '\(').Replace(')', '\)')
}

function ConvertTo-DataTable {
    param([object[]]$Rows)
    $dt = New-Object System.Data.DataTable
    $cols = @($Rows[0].PSObject.Properties.Name)
    foreach ($c in $cols) { [void]$dt.Columns.Add($c) }
    foreach ($r in $Rows) {
        $dr = $dt.NewRow()
        foreach ($c in $cols) {
            if ($null -ne $r.$c) { $dr[$c] = [string]$r.$c } else { $dr[$c] = '' }
        }
        [void]$dt.Rows.Add($dr)
    }
    return , $dt
}

# ============================ EXPORTERS ======================================
function Export-ReportCsv {
    param([object[]]$Rows, [string]$Path)
    $lines = $Rows | ConvertTo-Csv -NoTypeInformation
    [System.IO.File]::WriteAllLines($Path, $lines, (New-Object System.Text.UTF8Encoding($true)))   # BOM so Excel reads it right
}

function Initialize-ImportExcel {
    if (Get-Module -ListAvailable -Name ImportExcel) { return $true }
    $yes = Show-Modal -Owner $script:form -Type warning -Title 'Excel module needed' `
        -Message "Excel export needs the free 'ImportExcel' PowerShell module.`n`nInstall it now for your user account?" `
        -ConfirmText 'Install' -CancelText 'Cancel'
    if (-not $yes) { return $false }
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    Install-PackageProvider -Name NuGet -MinimumVersion 2.8.5.201 -Force -Scope CurrentUser | Out-Null
    Install-Module ImportExcel -Scope CurrentUser -Force -AllowClobber
    return [bool](Get-Module -ListAvailable -Name ImportExcel)
}

function Export-ReportExcel {
    param([object[]]$Rows, [string]$Path, [string]$Sheet)
    Import-Module ImportExcel
    if (Test-Path $Path) { Remove-Item $Path -Force }
    $Rows | Export-Excel -Path $Path -WorksheetName $Sheet -AutoSize -FreezeTopRow -BoldTopRow
}

# Dependency-free PDF: landscape A4, monospaced table, header repeated on every page.
function Export-ReportPdf {
    param([object[]]$Rows, [string]$Path, [string]$Title)

    $pageW = 842; $pageH = 595; $margin = 30; $fs = 8; $lh = 11
    $maxChars = [int][Math]::Floor(($pageW - 2 * $margin) / (0.6 * $fs))   # Courier char = 0.6 * font size

    $cols = @($Rows[0].PSObject.Properties.Name)
    $data = New-Object System.Collections.ArrayList
    foreach ($r in $Rows) {
        $line = @()
        foreach ($c in $cols) { $line += (Format-Cell $c ($r.$c)) }
        [void]$data.Add($line)
    }

    # Column widths (capped at 40, shrunk to fit the page)
    $widths = New-Object 'int[]' $cols.Count
    for ($i = 0; $i -lt $cols.Count; $i++) {
        $m = $cols[$i].Length
        foreach ($row in $data) { $len = ([string]$row[$i]).Length; if ($len -gt $m) { $m = $len } }
        $widths[$i] = [Math]::Min($m, 40)
    }
    while ((($widths | Measure-Object -Sum).Sum + 2 * ($cols.Count - 1)) -gt $maxChars) {
        $idx = 0
        for ($i = 1; $i -lt $widths.Count; $i++) { if ($widths[$i] -gt $widths[$idx]) { $idx = $i } }
        if ($widths[$idx] -le 4) { break }
        $widths[$idx]--
    }

    $headerParts = @(); for ($i = 0; $i -lt $cols.Count; $i++) { $headerParts += (Format-Fit $cols[$i] $widths[$i]) }
    $headerLine = $headerParts -join '  '
    $ruleLine   = '-' * $headerLine.Length

    $rowLines = @()
    foreach ($row in $data) {
        $parts = @(); for ($i = 0; $i -lt $cols.Count; $i++) { $parts += (Format-Fit ([string]$row[$i]) $widths[$i]) }
        $rowLines += ($parts -join '  ')
    }

    $topY = $pageH - 75
    $rowsPerPage = [int][Math]::Floor(($topY - 40) / $lh) - 2
    if ($rowsPerPage -lt 1) { $rowsPerPage = 1 }
    $pageCount = [int][Math]::Ceiling($rowLines.Count / $rowsPerPage)

    $subtitle = 'Generated ' + (Get-Date -Format 'yyyy-MM-dd HH:mm') + '  |  ' + $rowLines.Count + ' row(s)'
    $contents = @()
    for ($p = 0; $p -lt $pageCount; $p++) {
        $s = New-Object System.Text.StringBuilder
        [void]$s.Append("BT /F2 12 Tf $margin 555 Td (" + (ConvertTo-PdfText $Title) + ") Tj ET`n")
        [void]$s.Append("BT /F1 8 Tf $margin 541 Td (" + (ConvertTo-PdfText $subtitle) + ") Tj ET`n")
        $y = $topY
        [void]$s.Append("BT /F2 $fs Tf $margin $y Td (" + (ConvertTo-PdfText $headerLine) + ") Tj ET`n")
        $y -= $lh
        [void]$s.Append("BT /F1 $fs Tf $margin $y Td (" + (ConvertTo-PdfText $ruleLine) + ") Tj ET`n")
        $y -= $lh
        $start = $p * $rowsPerPage
        $end   = [Math]::Min($start + $rowsPerPage, $rowLines.Count) - 1
        for ($i = $start; $i -le $end; $i++) {
            [void]$s.Append("BT /F1 $fs Tf $margin $y Td (" + (ConvertTo-PdfText $rowLines[$i]) + ") Tj ET`n")
            $y -= $lh
        }
        [void]$s.Append("BT /F1 8 Tf $margin 20 Td (Page $($p + 1) of $pageCount) Tj ET`n")
        $contents += $s.ToString()
    }

    # Objects: 1 catalog, 2 pages, 3 Courier, 4 Courier-Bold, then (page, content) pairs
    $objs = New-Object System.Collections.ArrayList
    [void]$objs.Add('<< /Type /Catalog /Pages 2 0 R >>')
    $kids = @(); for ($p = 0; $p -lt $pageCount; $p++) { $kids += ('{0} 0 R' -f (5 + 2 * $p)) }
    [void]$objs.Add("<< /Type /Pages /Kids [$($kids -join ' ')] /Count $pageCount >>")
    [void]$objs.Add('<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>')
    [void]$objs.Add('<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>')
    for ($p = 0; $p -lt $pageCount; $p++) {
        $contObj = 6 + 2 * $p
        [void]$objs.Add("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 $pageW $pageH] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents $contObj 0 R >>")
        [void]$objs.Add("<< /Length $($contents[$p].Length) >>`nstream`n$($contents[$p])`nendstream")
    }

    $sb = New-Object System.Text.StringBuilder
    [void]$sb.Append("%PDF-1.4`n")
    $offsets = @()
    for ($i = 0; $i -lt $objs.Count; $i++) {
        $offsets += $sb.Length
        [void]$sb.Append("$($i + 1) 0 obj`n$($objs[$i])`nendobj`n")
    }
    $xrefPos = $sb.Length
    [void]$sb.Append("xref`n0 $($objs.Count + 1)`n")
    [void]$sb.Append("0000000000 65535 f `n")
    foreach ($o in $offsets) { [void]$sb.Append(("{0:D10} 00000 n `n" -f $o)) }
    [void]$sb.Append("trailer`n<< /Size $($objs.Count + 1) /Root 1 0 R >>`nstartxref`n$xrefPos`n%%EOF`n")

    $latin1 = [System.Text.Encoding]::GetEncoding('iso-8859-1')
    [System.IO.File]::WriteAllBytes($Path, $latin1.GetBytes($sb.ToString()))
}

# ============================ UI =============================================
function New-Ctl {
    param([string]$Type, [int]$X, [int]$Y, [int]$W, [int]$H, [string]$Text)
    $c = New-Object $Type
    $c.Location = New-Object System.Drawing.Point($X, $Y)
    if ($W -gt 0) { $c.Size = New-Object System.Drawing.Size($W, $H) }
    if ($Text) { $c.Text = $Text }
    return $c
}

$form = New-Ctl 'System.Windows.Forms.Form' 0 0 0 0 'AIDEA Report Manager'
$form.Font = New-Object System.Drawing.Font('Segoe UI', 9)
$form.StartPosition = 'CenterScreen'
$form.ClientSize = New-Object System.Drawing.Size(900, 560)
$form.MinimumSize = New-Object System.Drawing.Size(760, 420)

$lblUrl   = New-Ctl 'System.Windows.Forms.Label' 15 18 0 0 'API URL'
$txtUrl   = New-Ctl 'System.Windows.Forms.TextBox' 85 15 260 24 'http://localhost:8000'
$lblTok   = New-Ctl 'System.Windows.Forms.Label' 365 18 0 0 'Token'
$txtToken = New-Ctl 'System.Windows.Forms.TextBox' 415 15 300 24 ''
$txtToken.UseSystemPasswordChar = $true
if ($env:REPORT_API_TOKEN) { $txtToken.Text = $env:REPORT_API_TOKEN }

$lblType  = New-Ctl 'System.Windows.Forms.Label' 15 53 0 0 'Report'
$cmbType  = New-Ctl 'System.Windows.Forms.ComboBox' 85 50 150 24 ''
$cmbType.DropDownStyle = 'DropDownList'
foreach ($t in 'revenue', 'thesis', 'enrollment', 'service_usage', 'satisfaction') { [void]$cmbType.Items.Add($t) }
$cmbType.SelectedIndex = 0

$lblFrom  = New-Ctl 'System.Windows.Forms.Label' 255 53 0 0 'From'
$dtFrom   = New-Ctl 'System.Windows.Forms.DateTimePicker' 295 50 110 24 ''
$dtFrom.Format = 'Custom'; $dtFrom.CustomFormat = 'yyyy-MM-dd'
$dtFrom.Value = (Get-Date -Day 1).Date

$lblTo    = New-Ctl 'System.Windows.Forms.Label' 425 53 0 0 'To'
$dtTo     = New-Ctl 'System.Windows.Forms.DateTimePicker' 450 50 110 24 ''
$dtTo.Format = 'Custom'; $dtTo.CustomFormat = 'yyyy-MM-dd'
$dtTo.Value = (Get-Date).Date

$lblFmt   = New-Ctl 'System.Windows.Forms.Label' 580 53 0 0 'Format'
$cmbFormat = New-Ctl 'System.Windows.Forms.ComboBox' 630 50 85 24 ''
$cmbFormat.DropDownStyle = 'DropDownList'
foreach ($f in 'CSV', 'Excel', 'PDF') { [void]$cmbFormat.Items.Add($f) }
$cmbFormat.SelectedIndex = 0

$lblOut   = New-Ctl 'System.Windows.Forms.Label' 15 88 0 0 'Save to'
$defaultOut = Join-Path (Get-Location) 'reports'
$txtOut   = New-Ctl 'System.Windows.Forms.TextBox' 85 85 540 24 $defaultOut
$btnBrowse = New-Ctl 'System.Windows.Forms.Button' 635 84 80 26 'Browse...'

$btnGo    = New-Ctl 'System.Windows.Forms.Button' 740 15 145 95 'Generate && Save'
$btnGo.Font = New-Object System.Drawing.Font('Segoe UI', 10, [System.Drawing.FontStyle]::Bold)
$btnGo.BackColor = [System.Drawing.Color]::FromArgb(37, 99, 235)
$btnGo.ForeColor = [System.Drawing.Color]::White
$btnGo.FlatStyle = 'Flat'
$btnGo.FlatAppearance.BorderSize = 0

$grid = New-Ctl 'System.Windows.Forms.DataGridView' 15 125 870 420 ''
$grid.ReadOnly = $true
$grid.AllowUserToAddRows = $false
$grid.AutoSizeColumnsMode = 'Fill'
$grid.SelectionMode = 'FullRowSelect'
$grid.BackgroundColor = [System.Drawing.Color]::White
$grid.Anchor = 'Top,Bottom,Left,Right'

$form.Controls.AddRange(@($lblUrl, $txtUrl, $lblTok, $txtToken, $lblType, $cmbType, $lblFrom, $dtFrom,
                          $lblTo, $dtTo, $lblFmt, $cmbFormat, $lblOut, $txtOut, $btnBrowse, $btnGo, $grid))
$form.AcceptButton = $btnGo

$btnBrowse.Add_Click({
    $fb = New-Object System.Windows.Forms.FolderBrowserDialog
    $fb.Description = 'Choose where to save reports'
    if ($fb.ShowDialog() -eq 'OK') { $txtOut.Text = $fb.SelectedPath }
})

$btnGo.Add_Click({
    try {
        $from   = $dtFrom.Value.Date
        $to     = $dtTo.Value.Date
        $url    = $txtUrl.Text.Trim()
        $tok    = $txtToken.Text.Trim()
        $type   = [string]$cmbType.SelectedItem
        $fmt    = [string]$cmbFormat.SelectedItem
        $outDir = $txtOut.Text.Trim()

        if ($to -lt $from)  { Show-Alert "The 'To' date must be on or after the 'From' date." 'Check the dates' 'warning'; return }
        if (-not $url)      { Show-Alert 'Enter the API URL, e.g. http://localhost:8000' 'Missing URL' 'warning'; return }
        if (-not $tok)      { Show-Alert 'Paste an admin API token first.' 'Missing token' 'warning'; return }
        if (-not $outDir)   { Show-Alert 'Choose a folder to save the file in.' 'Missing folder' 'warning'; return }

        $btnGo.Enabled = $false
        $form.Cursor = [System.Windows.Forms.Cursors]::WaitCursor
        [System.Windows.Forms.Application]::DoEvents()

        $rows = @(Get-ReportData -BaseUrl $url -Token $tok -Type $type -From $from -To $to)

        if ($rows.Count -eq 0) {
            $grid.DataSource = $null
            Show-Alert "No records found between $($from.ToString('yyyy-MM-dd')) and $($to.ToString('yyyy-MM-dd'))." 'No data' 'info'
            return
        }

        $grid.DataSource = ConvertTo-DataTable $rows

        if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }
        $base = 'report_{0}_{1}_to_{2}' -f $type, $from.ToString('yyyy-MM-dd'), $to.ToString('yyyy-MM-dd')

        switch ($fmt) {
            'CSV' {
                $path = Join-Path $outDir "$base.csv"
                Export-ReportCsv -Rows $rows -Path $path
            }
            'Excel' {
                if (-not (Initialize-ImportExcel)) { return }
                $path = Join-Path $outDir "$base.xlsx"
                Export-ReportExcel -Rows $rows -Path $path -Sheet $type
            }
            'PDF' {
                $path = Join-Path $outDir "$base.pdf"
                Export-ReportPdf -Rows $rows -Path $path -Title "AIDEA - $type report ($($from.ToString('yyyy-MM-dd')) to $($to.ToString('yyyy-MM-dd')))"
            }
        }

        $extra = ''
        if ($type -eq 'revenue') {
            $tot = ($rows | Measure-Object -Property amount -Sum).Sum
            $extra = ("`n`nTotal revenue: {0:N2}" -f $tot)
        }

        $open = Show-Modal -Owner $form -Type success -Title 'Download ready' `
            -Message "Saved $($rows.Count) row(s) to:`n$path$extra" `
            -ConfirmText 'Open file' -CancelText 'Close'
        if ($open) { Start-Process -FilePath $path }
    }
    catch [System.NotSupportedException] {
        Show-Alert $_.Exception.Message 'Not available yet' 'info'
    }
    catch {
        Show-Alert $_.Exception.Message 'Report failed' 'error'
    }
    finally {
        $btnGo.Enabled = $true
        $form.Cursor = [System.Windows.Forms.Cursors]::Default
    }
})

[void]$form.ShowDialog()
