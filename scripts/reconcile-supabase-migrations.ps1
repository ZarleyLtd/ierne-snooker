# Reconcile Supabase migration history for ierne-snooker (Apps project).
#
# Problem: remote has MCP-applied versions (20260517120000, 20260517130000,
# 20260523120000) while git has 20260504220000 + 20260505213000 (same schema,
# different timestamps). Local also has 20260530120000 (competitions model) pending.
#
# This script:
#   1. Marks git baseline migrations as already applied on remote (no re-run).
#   2. Verifies history alignment.
#   3. Pushes pending migrations (competitions model).
#
# Prerequisites:
#   supabase link --project-ref yzyipxvlsoxfphwobfkb
#   Database password when prompted (Dashboard -> Settings -> Database).
#
# Usage (from repo root):
#   .\scripts\reconcile-supabase-migrations.ps1
#   .\scripts\reconcile-supabase-migrations.ps1 -DbPassword 'your-db-password'

param(
  [string]$DbPassword = $env:SUPABASE_DB_PASSWORD
)

$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

$passArg = @()
if ($DbPassword) {
  $passArg = @("-p", $DbPassword)
}

Write-Host "Step 1: Mark local baseline migrations as applied on remote (no SQL re-run)..." -ForegroundColor Cyan
& supabase migration repair --status applied 20260504220000 20260505213000 --linked --yes @passArg
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`nStep 2: Migration history:" -ForegroundColor Cyan
& supabase migration list --linked @passArg
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`nStep 3: Push pending migrations (20260530120000_competitions_model)..." -ForegroundColor Cyan
& supabase db push --linked --yes @passArg
exit $LASTEXITCODE
