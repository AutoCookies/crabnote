#!/bin/bash
# Crab Note - Build All Platforms (Linux/Shell Version)

# Ensure we are in the project root
cd "$(dirname "$0")"

# 1. Build Backend for all major platforms
echo "Compiling Go backend for all platforms..."

# Windows
mkdir -p bin/win32-x64
cd backend
GOOS=windows GOARCH=amd64 go build -o ../bin/win32-x64/crabnote-backend.exe main.go

# Linux
mkdir -p ../bin/linux-x64
GOOS=linux GOARCH=amd64 go build -o ../bin/linux-x64/crabnote-backend main.go

# macOS
mkdir -p ../bin/darwin-x64
GOOS=darwin GOARCH=amd64 go build -o ../bin/darwin-x64/crabnote-backend main.go

cd ..

# 2. Package with Electron Builder
echo "Packaging Electron App..."
npm run dist
