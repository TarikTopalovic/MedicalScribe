# MedScribe AI — Uputstvo za pokretanje

MedScribe AI je MVP aplikacija koja doktoru omogućava da snimi (ili izdiktira) razgovor sa pacijentom,
nakon čega aplikacija:

1. Transkribuje audio u tekst pomoću Groq Whisper API-ja (model `whisper-large-v3`).
2. Strukturira transkript u elektronski karton (glavne tegobe, anamneza, objektivni nalaz i dijagnoza,
   terapija i lijekovi) pomoću lokalnog Ollama modela (`llama3.1:8b`).
3. Generiše odvojen **"AI prijedlog — provjeriti"** blok (moguće dodatne dijagnoze, upozorenja na
   interakcije/alergije, prijedlog dodatnih pretraga) koji doktor mora ručno provjeriti.

Cijela aplikacija radi lokalno — nema cloud deploymenta.

## 1. Preduslovi

- Node.js 18+ i npm
- [Ollama](https://ollama.com) instaliran lokalno
- Groq API ključ ([console.groq.com](https://console.groq.com))
- Mikrofon (za snimanje iz browsera)

## 2. Instalacija zavisnosti

```bash
# Backend
cd backend
npm install

# Frontend (u novom terminalu ili nakon backend instalacije)
cd ../frontend
npm install
```

## 3. Podešavanje .env fajla

U folderu `backend/` napravi `.env` fajl na osnovu `.env.example`:

```bash
cd backend
cp .env.example .env
```

Otvori `.env` i unesi svoj Groq API ključ:

```
GROQ_API_KEY=tvoj_groq_api_kljuc
PORT=3001
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1:8b
```

## 4. Instalacija i pokretanje Ollame

```bash
# Preuzmi model (samo prvi put)
ollama pull llama3.1:8b

# Pokreni Ollama server
ollama serve
```

Ollama server sluša na `http://localhost:11434`. Backend šalje zahtjeve na ovaj server za
strukturiranje kartona (`/api/structure`) i AI prijedloge (`/api/suggest`).

## 5. Redoslijed pokretanja

**Redoslijed je bitan** — Ollama mora raditi prije backend zahtjeva ka njoj:

1. **Ollama** — `ollama serve` (ostavi da radi u pozadini)
2. **Backend** — u `backend/` folderu: `npm run start` (sluša na portu 3001)
3. **Frontend** — u `frontend/` folderu: `npm run dev` (Vite dev server, obično port 5173)

Otvori frontend u browseru (link koji Vite ispiše, npr. `http://localhost:5173`).

### Automatsko pokretanje

Umjesto ručnog pokretanja, možeš koristiti skriptu iz `scripts/` foldera koja provjerava
da li Ollama radi i zatim pokreće backend i frontend paralelno:

```bash
# Linux / macOS
./scripts/start-all.sh

# Windows
scripts\start-all.bat
```

## 6. Korištenje aplikacije

1. Klikni **"Pokreni snimanje"**, izgovori (ili izdiktiraj) razgovor sa pacijentom.
2. Klikni **"Zaustavi snimanje"** — audio se automatski šalje na transkripciju.
3. Nakon što transkript stigne, aplikacija automatski poziva strukturiranje kartona i AI prijedlog.
4. Provjeri i po potrebi ispravi transkript i sva polja kartona (sve je editabilno).
5. Pregledaj **žuti blok "AI prijedlog — provjeriti"** — ovo NIJE potvrđena medicinska činjenica,
   već pomoćni prijedlog koji doktor mora ručno provjeriti.
6. Klikni **"Sačuvaj"** da zapis sačuvaš lokalno (u localStorage browsera — nema baze podataka u MVP verziji).

## 7. Testiranje

Test provjerava da `/api/structure` vraća validan JSON sa svim očekivanim poljima za hardkodirani
primjer transkripta na bosanskom jeziku. Zahtijeva da backend i Ollama već rade (koraci 4 i 5):

```bash
node tests/test-structure.js
```

## Napomene

- Aplikacija ne koristi bazu podataka — svi podaci se čuvaju u memoriji (React state) i localStorage-u.
- Transkripcija zahtijeva internet konekciju (Groq API u cloud-u). Strukturiranje i AI prijedlog rade
  potpuno lokalno preko Ollame.
- AI prijedlog blok je namjerno vizuelno odvojen (žuta pozadina) od zvaničnog kartona kako se ne bi
  pomiješao sa potvrđenim medicinskim podacima.
