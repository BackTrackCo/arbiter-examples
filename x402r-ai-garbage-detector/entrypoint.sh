#!/bin/sh
set -e

# Start Ollama in background if using local inference
if [ "$INFERENCE_PROVIDER" = "ollama" ]; then
  echo "[entrypoint] Starting Ollama..."
  ollama serve &
  # Wait for Ollama to be ready
  for i in $(seq 1 30); do
    if curl -sf http://localhost:11434/api/tags >/dev/null 2>&1; then
      echo "[entrypoint] Ollama ready"
      break
    fi
    sleep 1
  done
fi

exec node dist/arbiter.js
