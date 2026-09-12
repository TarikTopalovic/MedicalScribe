# MedScribe AI

Privacy-first medical documentation assistant. Doktor snima ili diktira razgovor sa pacijentom,
a aplikacija ga transkribuje (Groq Whisper) i strukturira u elektronski karton pomoću lokalnog
Ollama modela, uz odvojen "AI prijedlog" blok za dodatnu provjeru.

Vidi [docs/README.md](docs/README.md) za kompletno uputstvo za instalaciju i pokretanje.

## Structure

```text
medicalscribe/
├── backend/       Express backend (transkripcija, strukturiranje kartona, AI prijedlozi)
├── frontend/      React (Vite) frontend
├── docs/          Product and technical documentation
├── scripts/       Development and maintenance scripts
└── tests/         Cross-application and end-to-end tests
```

