#!/bin/bash
# Crab Note - Linux Backend Build Script

# Ensure we are in the project root
cd "$(dirname "$0")/.."

# Build for Linux (current architecture)
ARCH=$(uname -m)
GOARCH="amd64"
if [ "$ARCH" == "aarch64" ]; then
    GOARCH="arm64"
fi

BIN_DIR="bin/linux-$GOARCH"
mkdir -p "$BIN_DIR"

echo "Building for Linux ($GOARCH)..."
cd backend
GOOS=linux GOARCH=$GOARCH go build -o "../$BIN_DIR/crabnote-backend" main.go

if [ $? -eq 0 ]; then
    echo "Done. Binary located in $BIN_DIR"
else
    echo "Build failed!"
    exit 1
fi
