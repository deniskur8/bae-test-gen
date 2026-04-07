#!/bin/bash
# BAE Test Gen - Full Setup Script
# This script installs Ollama, pulls the required model, and creates the custom model.

set -e

echo "=== BAE Test Gen Setup ==="
echo ""

# 1. Install Ollama
if command -v ollama &> /dev/null; then
    echo "[OK] Ollama is already installed: $(ollama --version)"
else
    echo "[*] Installing Ollama..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo "    Download from: https://ollama.com/download/mac"
        echo "    Or run: brew install ollama"
        read -p "    Press Enter after installing Ollama..."
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        curl -fsSL https://ollama.com/install.sh | sh
    else
        echo "    Download from: https://ollama.com/download"
        read -p "    Press Enter after installing Ollama..."
    fi
fi

# 2. Check Ollama is running
if ! ollama list &> /dev/null; then
    echo "[*] Starting Ollama..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        open -a Ollama
        sleep 3
    else
        ollama serve &
        sleep 3
    fi
fi

# 3. Pull the base model
echo ""
echo "[*] Pulling base model: qwen3.5:9b (this may take a while ~6.6GB)..."
ollama pull qwen3.5:9b

# 4. Create the custom model from Modelfile
echo ""
echo "[*] Creating custom model 'bae-test-gen' from Modelfile-nothink..."
ollama create bae-test-gen -f Modelfile-nothink

# 5. Install Node.js dependencies for the web UI
if command -v npm &> /dev/null; then
    echo ""
    echo "[*] Installing web UI dependencies..."
    cd web && npm install && cd ..
else
    echo ""
    echo "[!] npm not found - skipping web UI dependency install."
    echo "    Install Node.js to use the web UI: https://nodejs.org/"
fi

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Available models:"
ollama list
echo ""
echo "Quick test:"
echo "  ollama run bae-test-gen 'Hello, are you working?'"
echo ""
echo "To start the web UI:"
echo "  cd web && npm run dev"
