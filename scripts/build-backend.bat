@echo off
setlocal

set APP_NAME=crabnote-backend
set OUTPUT_DIR=..\bin

cd backend

mkdir %OUTPUT_DIR%\win32-x64
mkdir %OUTPUT_DIR%\linux-x64
mkdir %OUTPUT_DIR%\darwin-x64

echo Building for Windows (x64)...
set GOOS=windows
set GOARCH=amd64
go build -o %OUTPUT_DIR%\win32-x64\%APP_NAME%.exe main.go

echo Building for Linux (x64)...
set GOOS=linux
set GOARCH=amd64
go build -o %OUTPUT_DIR%\linux-x64\%APP_NAME% main.go

echo Building for macOS (x64)...
set GOOS=darwin
set GOARCH=amd64
go build -o %OUTPUT_DIR%\darwin-x64\%APP_NAME% main.go

echo Done.
endlocal
