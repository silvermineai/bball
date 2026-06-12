#!/bin/bash

# Setup script for Basketball Analytics Platform

echo "🏀 Setting up Basketball Analytics Platform..."

# Install Python dependencies
echo "📦 Installing Python dependencies..."
pip3 install -r requirements.txt

# Create and setup database
echo "🗄️ Setting up database..."
cd backend/database
python3 setup.py
cd ../..

# Create data directories
mkdir -p data/cache

echo "✅ Backend setup complete!"
echo ""
echo "To start the API server, run:"
echo "  cd backend && python3 api.py"