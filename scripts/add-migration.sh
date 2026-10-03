#!/usr/bin/env bash
# Génère la migration EF Core initiale (à exécuter une fois, puis à versionner dans Git).
# Prérequis : .NET 8 SDK et l'outil dotnet-ef.
set -euo pipefail
cd "$(dirname "$0")/../backend"

if ! dotnet ef --version >/dev/null 2>&1; then
  echo "Installation de l'outil dotnet-ef…"
  dotnet tool install --global dotnet-ef --version "8.*"
  export PATH="$PATH:$HOME/.dotnet/tools"
fi

NAME="${1:-InitialCreate}"
dotnet ef migrations add "$NAME" \
  --project src/Transport.Infrastructure \
  --startup-project src/Transport.Api \
  --output-dir Data/Migrations

echo "Migration « $NAME » créée dans backend/src/Transport.Infrastructure/Data/Migrations."
echo "Elle sera appliquée automatiquement au prochain démarrage de l'API (ou : dotnet ef database update -p src/Transport.Infrastructure -s src/Transport.Api)."
