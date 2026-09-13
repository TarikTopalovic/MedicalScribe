#!/usr/bin/env bash
# Pokreće lagani browser bridge i frontend; ne pokreće lokalni AI model.

set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ ! -d "$REPO_ROOT/backend/node_modules" || ! -d "$REPO_ROOT/frontend/node_modules" ]]; then
  echo "Instaliraj zavisnosti prvo: (cd backend && npm ci) i (cd frontend && npm ci)" >&2
  exit 1
fi

# Funkcija koja gasi oba servera kada se skripta prekine (Ctrl+C)
zaustavi_sve() {
  echo ""
  echo "Zaustavljam backend i frontend..."
  kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
  exit 0
}
trap zaustavi_sve INT TERM

# Lokalni model za nalaz (Ollama) radi samo ako je servis pokrenut.
if command -v ollama >/dev/null 2>&1 && ! curl -sf -m 2 http://127.0.0.1:11434/api/tags >/dev/null; then
  echo "Pokrećem Ollamu (lokalni model za nalaz)..."
  ollama serve >/dev/null 2>&1 &
fi

echo "Pokrećem backend (port 3001)..."
(cd "$REPO_ROOT/backend" && npm run start) &
BACKEND_PID=$!

echo "Pokrećem frontend (port 5173)..."
(cd "$REPO_ROOT/frontend" && npm run dev) &
FRONTEND_PID=$!

echo ""
echo "Backend PID: $BACKEND_PID | Frontend PID: $FRONTEND_PID"
echo "Pritisni Ctrl+C da zaustaviš oba servera."

wait
