#!/bin/bash

echo "🚀 BirrForex Challenges Bot Setup"
echo "=================================="
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

echo "✅ Node.js version: $(node --version)"
echo ""

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

echo "✅ npm version: $(npm --version)"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo "✅ Dependencies installed"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "⚠️  .env file not found. Creating from .env.example..."
    cp .env.example .env
    echo "✅ .env file created"
    echo ""
    echo "⚠️  IMPORTANT: Please edit .env and fill in your values:"
    echo "   - BOT_TOKEN"
    echo "   - ADMIN_USER_ID"
    echo "   - DATABASE_URL"
    echo ""
    echo "Then run: npm run migrate"
    echo "Then run: npm run dev"
else
    echo "✅ .env file exists"
    echo ""
    
    # Check if required variables are set
    if grep -q "BOT_TOKEN=$" .env || grep -q "ADMIN_USER_ID=$" .env || grep -q "DATABASE_URL=$" .env; then
        echo "⚠️  Some required environment variables are not set in .env:"
        echo "   Please edit .env and fill in:"
        echo "   - BOT_TOKEN"
        echo "   - ADMIN_USER_ID"
        echo "   - DATABASE_URL"
        echo ""
        echo "Then run: npm run migrate"
        echo "Then run: npm run dev"
    else
        echo "✅ Environment variables appear to be set"
        echo ""
        echo "Next steps:"
        echo "1. Run: npm run migrate (to setup database)"
        echo "2. Run: npm run dev (to start bot)"
    fi
fi

echo ""
echo "=================================="
echo "Setup complete! 🎉"
echo ""
echo "Quick commands:"
echo "  npm run migrate  - Setup database"
echo "  npm run dev      - Start development server"
echo "  npm run build    - Build for production"
echo "  npm start        - Start production server"
echo ""
echo "Documentation:"
echo "  QUICKSTART.md    - Quick start guide"
echo "  DEPLOYMENT.md    - Deployment guide"
echo "  PROJECT_SUMMARY.md - Project overview"
echo ""
