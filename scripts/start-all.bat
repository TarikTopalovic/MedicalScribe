@echo off
REM Skripta koja provjerava da li Ollama radi, a zatim pokrece backend i frontend paralelno (Windows).

setlocal

set OLLAMA_URL=http://localhost:11434

echo Provjeravam da li Ollama server radi na %OLLAMA_URL% ...

curl -s --max-time 2 %OLLAMA_URL% >nul 2>&1
if errorlevel 1 (
  echo.
  echo Ollama server nije dostupan.
  echo Pokreni Ollama prvo: ollama serve
  echo (i provjeri da je model preuzet: ollama pull llama3.1:8b)
  echo.
  exit /b 1
)

echo Ollama radi.

echo Pokrecem backend (port 3001)...
start "MedScribe Backend" cmd /k "cd /d %~dp0..\backend && npm run start"

echo Pokrecem frontend (port 5173)...
start "MedScribe Frontend" cmd /k "cd /d %~dp0..\frontend && npm run dev"

echo.
echo Backend i frontend su pokrenuti u odvojenim prozorima.
echo Zatvori te prozore da zaustavis servere.

endlocal
