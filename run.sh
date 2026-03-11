#!/bin/bash
# Crab Note - Run Script

# 1. Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# 2. Start the application
echo "Starting Crab Note..."
npm start
