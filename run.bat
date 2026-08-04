@echo off
setlocal
cd /d "%~dp0"

echo ============================================
echo   YT Transcript - one-command session
echo ============================================
echo.

if not exist "backend\node_modules" (
    echo [1/4] Installing backend dependencies...
    call npm install --prefix backend
) else (
    echo [1/4] Backend dependencies already installed.
)

if not exist "frontend\node_modules" (
    echo [2/4] Installing frontend dependencies...
    call npm install --prefix frontend
) else (
    echo [2/4] Frontend dependencies already installed.
)

echo [3/4] Starting backend  (http://localhost:3001)...
start "YT Backend" cmd /k "npm --prefix backend run dev"

echo [4/4] Starting frontend (http://localhost:5173)...
start "YT Frontend" cmd /k "npm --prefix frontend run dev -- --open"

echo.
echo Done. The app opens in your browser as soon as Vite is ready.
echo To stop the servers, close the two "YT Backend" / "YT Frontend" windows.
endlocal
