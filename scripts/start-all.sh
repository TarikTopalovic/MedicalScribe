#!/usr/bin/env bash
# Skripta koja provjerava da li Ollama radi, a zatim pokreće backend i frontend paralelno.

set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OLLAMA_URL="http://localhost:11434"

echo "Provjeravam da li Ollama server radi na $OLLAMA_URL ..."

if ! curl -s --max-time 2 "$OLLAMA_URL" > /dev/null 2>&1; then
  echo ""
  echo "❌ Ollama server nije dostupan."
  echo "Pokreni Ollama prvo: ollama serve"
  echo "(i provjeri da je model preuzet: ollama pull llama3.1:8b)"
  echo ""
  exit 1
fi

echo "✅ Ollama radi."

# Funkcija koja gasi oba servera kada se skripta prekine (Ctrl+C)
zaustavi_sve() {
  echo ""
  echo "Zaustavljam backend i frontend..."
  kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
  exit 0
}
trap zaustavi_sve INT TERM

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
