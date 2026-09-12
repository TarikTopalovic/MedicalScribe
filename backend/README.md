# MedScribe AI Backend

Node.js + Express backend. Vidi [docs/README.md](../docs/README.md) za instalaciju i pokretanje.

- `POST /api/transcribe` — transkripcija audio zapisa (Groq Whisper `whisper-large-v3`)
- `POST /api/structure` — strukturiranje transkripta u elektronski karton (Ollama, `llama3.1:8b`)
- `POST /api/suggest` — generisanje odvojenog AI prijedloga za provjeru (Ollama, `llama3.1:8b`)

