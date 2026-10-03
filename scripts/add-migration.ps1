# Génère la migration EF Core initiale (Windows PowerShell).
# Usage : .\scripts\add-migration.ps1 [-Name InitialCreate]
param([string]$Name = "InitialCreate")
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..\backend")

dotnet ef --version *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Installation de l'outil dotnet-ef..."
    dotnet tool install --global dotnet-ef --version "8.*"
}

dotnet ef migrations add $Name `
    --project src/Transport.Infrastructure `
    --startup-project src/Transport.Api `
    --output-dir Data/Migrations

Write-Host "Migration '$Name' créée. Elle sera appliquée automatiquement au démarrage de l'API."
