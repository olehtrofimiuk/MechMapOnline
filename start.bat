@echo off
echo Starting Hex Map Online...
echo.

:: Start the server in a new window
echo Starting server...
start "Hex Map Server" cmd /k "cd server && python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload"

:: Wait a moment for the server to start
timeout /t 3 /nobreak > nul

:: Start the client
echo Starting client...
start "Hex Map Client" cmd /k "cd client && npm start"

echo.
echo Both server and client are starting...
echo Server will be available at: http://localhost:8000
echo Client will be available at: http://localhost:3000
echo.
pause 