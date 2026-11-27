#!/bin/bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then echo "Node.js is not installed yet. Install the LTS version from nodejs.org, then open Connect Claude again."; open https://nodejs.org; read -p "Press Enter to close"; exit 1; fi
node scripts/connect-ai.js
read -p "Press Enter to close"
