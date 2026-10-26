#!/usr/bin/env sh
# Copia el módulo news-social (original en Hermes) a Impacto Castex.
# Uso: scripts/sync-news-social.sh [ruta a Impacto Castex]
set -e
SRC="$(cd "$(dirname "$0")/.." && pwd)/apps/server/src/lib/news-social"
DEST="${1:-$(dirname "$(cd "$(dirname "$0")/.." && pwd)")/Sodium/Impacto Castex}/src/lib/news-social"
mkdir -p "$DEST"
rm -f "$DEST"/*.ts "$DEST"/README.md
cp "$SRC"/*.ts "$SRC"/README.md "$DEST"/
echo "news-social copiado a $DEST"
