@echo off
echo Building Medication Tracker Go Server...

:: Install dependencies if needed
go mod tidy

:: Build the executable
go build -o medication_tracker.exe server.go

if %ERRORLEVEL% NEQ 0 (
    echo Build failed!
    pause
    exit /b %ERRORLEVEL%
)

echo Build successful! Running server...
echo.
echo Press Ctrl+C to stop the server
echo.

:: Run the server
medication_tracker.exe 