@echo off
REM Pokrece lagani browser bridge i frontend; ne pokrece lokalni AI model (Windows).

setlocal

if not exist "%~dp0..\backend\node_modules" (
  echo Instaliraj zavisnosti prvo: cd backend ^&^& npm ci
  exit /b 1
)
if not exist "%~dp0..\frontend\node_modules" (
  echo Instaliraj zavisnosti prvo: cd frontend ^&^& npm ci
  exit /b 1
)

echo Pokrecem backend (port 3001)...
start "MedScribe Backend" cmd /k "cd /d %~dp0..\backend && npm run start"

echo Pokrecem frontend (port 5173)...
start "MedScribe Frontend" cmd /k "cd /d %~dp0..\frontend && npm run dev"

echo.
echo Backend i frontend su pokrenuti u odvojenim prozorima.
echo Zatvori te prozore da zaustavis servere.

endlocal
