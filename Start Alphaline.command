#!/bin/bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then echo "Node.js is not installed yet. Install the LTS version from nodejs.org, then open Start Alphaline again."; open https://nodejs.org; read -p "Press Enter to close"; exit 1; fi
if [ ! -d node_modules ]; then echo "First run: setting up Alphaline. This takes about a minute..."; npm install --no-audit --no-fund || { echo "Setup failed. Copy the message above and paste it to your AI."; read -p "Press Enter to close"; exit 1; }; fi
node server.js --open
