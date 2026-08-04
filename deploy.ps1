<#
.SYNOPSIS
  Builds, pushes and releases Acadu to App Runner.

.DESCRIPTION
  Replaces the old static-export deploy. The app has API routes and a database,
  so it ships as a container image rather than HTML files in S3. The previous
  version of this script is preserved in git history if the static bundle ever
  needs to be rebuilt.

  The container migrates and seeds itself on boot (scripts/start.ts), so there
  is no separate migration step to forget.

.EXAMPLE
  ./deploy.ps1
  ./deploy.ps1 -SkipBuild        # re-release the image already in ECR
#>
[CmdletBinding()]
param(
  [switch]$SkipBuild,
  [string]$Region = "ap-southeast-2",
  [string]$Account = "606196119385"
)

$ErrorActionPreference = "Stop"
$repo = "$Account.dkr.ecr.$Region.amazonaws.com/acadu"
# A moving 'latest' plus an immutable tag, so a rollback has something to point at.
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"

if (-not $SkipBuild) {
  Write-Host "==> building (linux/amd64 - App Runner will not run arm64)" -ForegroundColor Cyan
  docker build --platform linux/amd64 -t acadu:latest .
  if ($LASTEXITCODE -ne 0) { throw "docker build failed" }

  Write-Host "==> pushing $stamp" -ForegroundColor Cyan
  aws ecr get-login-password --region $Region |
    docker login --username AWS --password-stdin "$Account.dkr.ecr.$Region.amazonaws.com"

  docker tag acadu:latest "${repo}:latest"
  docker tag acadu:latest "${repo}:$stamp"
  docker push "${repo}:latest"
  if ($LASTEXITCODE -ne 0) { throw "docker push failed" }
  docker push "${repo}:$stamp"
}

$arn = aws apprunner list-services --region $Region `
  --query "ServiceSummaryList[?ServiceName=='acadu'].ServiceArn" --output text
if (-not $arn) { throw "App Runner service 'acadu' not found in $Region" }

Write-Host "==> releasing" -ForegroundColor Cyan
aws apprunner start-deployment --region $Region --service-arn $arn | Out-Null

# Poll rather than fire-and-forget: a deploy that fails its health checks should
# be visible here, not discovered by a user hitting a 502.
do {
  Start-Sleep -Seconds 15
  $status = aws apprunner describe-service --region $Region --service-arn $arn `
    --query "Service.Status" --output text
  Write-Host "    $status"
} while ($status -eq "OPERATION_IN_PROGRESS")

if ($status -ne "RUNNING") { throw "deploy finished in state $status" }

$url = aws apprunner describe-service --region $Region --service-arn $arn `
  --query "Service.ServiceUrl" --output text
Write-Host "==> live: https://learnai.data-corner.com.au  (origin $url)" -ForegroundColor Green

# CloudFront caches only /_next/static/*, whose filenames carry a content hash,
# so a deploy needs no invalidation.
