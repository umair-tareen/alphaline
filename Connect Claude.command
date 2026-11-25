#!/bin/bash
cd "$(dirname "$0")"
node scripts/connect-ai.js
read -p "Press Enter to close"
