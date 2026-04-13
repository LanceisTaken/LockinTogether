# LockinTogether — Deploy Monitoring Dashboard & Alert Policy
# Run this script from the Backend_Ameer/monitoring/ directory.
#
# Prerequisites:
#   gcloud CLI installed and authenticated
#   gcloud config set project lockintogether-9c05f

$PROJECT_ID = "lockintogether-9c05f"
$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host ""
Write-Host "=== LockinTogether Monitoring Setup ===" -ForegroundColor Cyan
Write-Host "Project: $PROJECT_ID"
Write-Host ""

# Verify gcloud is available
if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: gcloud CLI not found. Install from https://cloud.google.com/sdk/install" -ForegroundColor Red
    exit 1
}

# Set the active project
Write-Host "[1/3] Setting active project to $PROJECT_ID ..." -ForegroundColor Yellow
gcloud config set project $PROJECT_ID

# Deploy the Cloud Monitoring dashboard
Write-Host ""
Write-Host "[2/3] Deploying monitoring dashboard ..." -ForegroundColor Yellow
$dashboardFile = Join-Path $SCRIPT_DIR "dashboard.json"
gcloud monitoring dashboards create --config-from-file="$dashboardFile"

if ($LASTEXITCODE -eq 0) {
    Write-Host "  Dashboard created successfully." -ForegroundColor Green
    Write-Host "  View at: https://console.cloud.google.com/monitoring/dashboards?project=$PROJECT_ID"
} else {
    Write-Host "  Dashboard creation failed. Check that the Monitoring API is enabled." -ForegroundColor Red
    Write-Host "  Enable it: https://console.cloud.google.com/apis/library/monitoring.googleapis.com?project=$PROJECT_ID"
}

# Deploy the alert policy
Write-Host ""
Write-Host "[3/3] Deploying alert policy (high error rate) ..." -ForegroundColor Yellow
$alertFile = Join-Path $SCRIPT_DIR "alert-policy.json"
gcloud alpha monitoring policies create --policy-from-file="$alertFile"

if ($LASTEXITCODE -eq 0) {
    Write-Host "  Alert policy created successfully." -ForegroundColor Green
    Write-Host "  View at: https://console.cloud.google.com/monitoring/alerting?project=$PROJECT_ID"
} else {
    Write-Host "  Alert policy creation failed. You may need to add a notification channel first:" -ForegroundColor Yellow
    Write-Host "  https://console.cloud.google.com/monitoring/alerting/notifications?project=$PROJECT_ID"
}

Write-Host ""
Write-Host "=== Done ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "  1. Open the dashboard link above to verify all panels load data."
Write-Host "  2. Add an email/SMS notification channel to the alert policy in the GCP Console."
Write-Host "  3. Deploy updated Cloud Functions (with scaling config) from Backend_Ameer/:"
Write-Host "     firebase deploy --only functions"
Write-Host ""
