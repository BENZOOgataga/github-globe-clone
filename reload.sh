#!/bin/bash
# filepath: reload.sh

# Exit on error
set -e

echo "🔄 Reloading GitHub Globe Clone application..."

# Navigate to the project directory (update if different in production)
PROJECT_DIR=$(dirname "$0")
cd "$PROJECT_DIR"

echo "📂 Current directory: $(pwd)"

# Pull the latest changes
echo "⬇️ Pulling latest changes from git..."
git pull

# Install dependencies
echo "📦 Installing dependencies..."
npm ci

# Build for production
echo "🔨 Building for production..."
NODE_OPTIONS=--openssl-legacy-provider npm run build

# Optional: Restart the service if you're using PM2 or similar
if command -v pm2 &> /dev/null; then
    echo "🔄 Restarting PM2 service..."
    # Assuming you've set up a PM2 process named 'github-globe'
    pm2 reload github-globe
elif [ -f "./node_modules/.bin/serve" ]; then
    echo "🚀 Starting serve for static files..."
    # Kill any existing serve processes
    pkill -f "serve ./dist" || true
    # Start serve in the background
    ./node_modules/.bin/serve ./dist -l 3000 > ./logs/serve.log 2>&1 &
    echo "✅ Server started on port 3000"
else
    echo "⚠️ No process manager detected. Please set up a way to serve the application."
    echo "   You can install serve globally: npm install -g serve"
    echo "   Then run: serve ./dist"
fi

echo "✅ Deployment completed successfully!"