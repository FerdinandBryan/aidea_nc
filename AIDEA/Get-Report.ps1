<#
.SYNOPSIS
    Pulls reports from the Laravel GET /api/reports endpoint and shows/exports them.
    Type: revenue | thesis | enrollment | service_usage | satisfaction | all
    Format: Table (default) | Csv | Excel | Json   (Excel needs the ImportExcel module, else falls back to CSV)
.EXAMPLE
    .\Get-Report.ps1 -Type revenue -From 2026-09-01 -To 2026-09-30 -BaseUrl http://localhost:8000
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateSet('revenue', 'thesis', 'enrollment', 'service_usage', 'satisfaction', 'all')]
    [string]$Type,

    [Parameter(Mandatory)]
    [datetime]$From,

    [Parameter(Mandatory)]
    [datetime]$To,

    [string]$BaseUrl = 'http://localhost:8000',

    [string]$Token = $env:REPORT_API_TOKEN,

    [ValidateSet('Table', 'Csv', 'Excel', 'Json')]
    [string]$Format = 'Table',

    [string]$OutDir = (Join-Path (Get-Location) 'reports')
)

$ErrorActionPreference = 'Stop'

if ($To -lt $From) {
    throw "'To' ($($To.ToString('yyyy-MM-dd'))) must be on or after 'From' ($($From.ToString('yyyy-MM-dd')))."
}

if (-not $Token) {
    $secure = Read-Host 'Admin API token' -AsSecureString
    $bstr   = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try   { $Token = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

$headers = @{
    Authorization = "Bearer $Token"
    Accept        = 'application/json'
}

$fromStr = $From.ToString('yyyy-MM-dd')
$toStr   = $To.ToString('yyyy-MM-dd')

function Get-ReportData {
    param([string]$ReportType)

    $uri = '{0}/api/reports?type={1}&from={2}&to={3}' -f $BaseUrl.TrimEnd('/'), $ReportType, $fromStr, $toStr

    try {
        $resp = Invoke-RestMethod -Uri $uri -Headers $headers -Method Get
        return , @($resp.data)
    }
    catch {
        $status = $null
        if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }

        $msg = $_.Exception.Message
        if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
            try {
                $body = $_.ErrorDetails.Message | ConvertFrom-Json
                if ($body.error)   { $msg = $body.error }
                elseif ($body.message) { $msg = $body.message }
            } catch { $msg = $_.ErrorDetails.Message }
        }

        switch ($status) {
            401     { throw "401 Unauthorized - token missing or invalid." }
            403     { throw "403 Forbidden - $msg" }
            422     { throw "422 Validation failed - $msg" }
            501     { Write-Warning "[$ReportType] $msg"; return $null }
            default { throw "Request failed ($status): $msg" }
        }
    }
}

function Write-ReportOutput {
    param([string]$ReportType, [object[]]$Rows)

    if (-not $Rows -or $Rows.Count -eq 0 -or $null -eq $Rows[0]) {
        Write-Host "[$ReportType] No records between $fromStr and $toStr." -ForegroundColor Yellow
        return
    }

    $baseName = 'report_{0}_{1}_to_{2}' -f $ReportType, $fromStr, $toStr

    if ($Format -ne 'Table' -and -not (Test-Path $OutDir)) {
        New-Item -ItemType Directory -Path $OutDir | Out-Null
    }

    switch ($Format) {
        'Table' {
            Write-Host "`n=== $ReportType ($fromStr to $toStr) - $($Rows.Count) row(s) ===" -ForegroundColor Cyan
            $Rows | Format-Table -AutoSize | Out-Host
        }
        'Csv' {
            $path = Join-Path $OutDir "$baseName.csv"
            $Rows | Export-Csv -Path $path -NoTypeInformation -Encoding UTF8
            Write-Host "[$ReportType] Saved $($Rows.Count) row(s) -> $path" -ForegroundColor Green
        }
        'Json' {
            $path = Join-Path $OutDir "$baseName.json"
            $Rows | ConvertTo-Json -Depth 5 | Set-Content -Path $path -Encoding UTF8
            Write-Host "[$ReportType] Saved $($Rows.Count) row(s) -> $path" -ForegroundColor Green
        }
        'Excel' {
            if (Get-Module -ListAvailable -Name ImportExcel) {
                Import-Module ImportExcel
                $path = Join-Path $OutDir "$baseName.xlsx"
                if (Test-Path $path) { Remove-Item $path -Force }
                $Rows | Export-Excel -Path $path -WorksheetName $ReportType -AutoSize -FreezeTopRow -BoldTopRow
                Write-Host "[$ReportType] Saved $($Rows.Count) row(s) -> $path" -ForegroundColor Green
            }
            else {
                Write-Warning "ImportExcel module not found (Install-Module ImportExcel -Scope CurrentUser). Falling back to CSV."
                $path = Join-Path $OutDir "$baseName.csv"
                $Rows | Export-Csv -Path $path -NoTypeInformation -Encoding UTF8
                Write-Host "[$ReportType] Saved $($Rows.Count) row(s) -> $path" -ForegroundColor Green
            }
        }
    }

    if ($ReportType -eq 'revenue') {
        $total = ($Rows | Measure-Object -Property amount -Sum).Sum
        Write-Host ("[revenue] Total: {0:N2}" -f $total) -ForegroundColor Cyan
    }
    elseif ($ReportType -eq 'service_usage') {
        $total = ($Rows | Measure-Object -Property revenue -Sum).Sum
        Write-Host ("[service_usage] Total revenue across services: {0:N2}" -f $total) -ForegroundColor Cyan
    }
}

$types = if ($Type -eq 'all') { 'revenue', 'thesis', 'enrollment', 'service_usage' } else { , $Type }

foreach ($t in $types) {
    $rows = Get-ReportData -ReportType $t
    if ($null -ne $rows) {
        Write-ReportOutput -ReportType $t -Rows $rows[0]
    }
}
