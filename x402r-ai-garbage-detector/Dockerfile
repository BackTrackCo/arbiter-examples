# ---------------------------------------------------------------------------
# Garbage Detection Arbiter — EigenCloud TEE Deployment
#
# Two modes (set INFERENCE_PROVIDER env var):
#   clawrouter  — pays for inference with USDC via x402 (default)
#   ollama      — local model bundled in container (full TEE attestation)
#
# Build:
#   docker build -t garbage-detector .
#   docker build --build-arg OLLAMA_MODEL=llama3.1:8b -t garbage-detector-tee .
#
# Deploy to EigenCloud:
#   ecloud compute app deploy
# ---------------------------------------------------------------------------

# --- Stage 1: Pull Ollama model (only used when INFERENCE_PROVIDER=ollama) ---
FROM ollama/ollama:latest AS ollama-model
ARG OLLAMA_MODEL=llama3.1:8b
RUN ollama serve & sleep 2 && ollama pull ${OLLAMA_MODEL} && pkill ollama

# --- Stage 2: Build arbiter ---
FROM node:22-slim AS builder

RUN npm install -g pnpm@latest

WORKDIR /app

COPY package.json ./
# Replace workspace link: deps with published npm versions for Docker
RUN node -e " \
  const p = JSON.parse(require('fs').readFileSync('package.json','utf8')); \
  for (const section of ['dependencies','devDependencies']) { \
    const deps = p[section] || {}; \
    for (const k of Object.keys(deps)) { \
      if (typeof deps[k] === 'string' && deps[k].startsWith('link:')) { \
        if (k.startsWith('@x402r/')) deps[k] = '*'; \
        else delete deps[k]; \
      } \
    } \
  } \
  delete p.pnpm; \
  require('fs').writeFileSync('package.json', JSON.stringify(p, null, 2)); \
"

RUN pnpm install

COPY tsconfig.json ./
COPY src/ src/
RUN pnpm exec tsc

# --- Stage 3: Production ---
FROM node:22-slim

RUN npm install -g pnpm@latest

# Install Ollama binary (lightweight — only used if INFERENCE_PROVIDER=ollama)
COPY --from=ollama/ollama:latest /bin/ollama /usr/local/bin/ollama

WORKDIR /app

COPY package.json ./
RUN node -e " \
  const p = JSON.parse(require('fs').readFileSync('package.json','utf8')); \
  for (const section of ['dependencies','devDependencies']) { \
    const deps = p[section] || {}; \
    for (const k of Object.keys(deps)) { \
      if (typeof deps[k] === 'string' && deps[k].startsWith('link:')) { \
        if (k.startsWith('@x402r/')) deps[k] = '*'; \
        else delete deps[k]; \
      } \
    } \
  } \
  delete p.devDependencies; \
  delete p.pnpm; \
  require('fs').writeFileSync('package.json', JSON.stringify(p, null, 2)); \
"
RUN pnpm install --prod

COPY --from=builder /app/dist ./dist
COPY --from=ollama-model /root/.ollama /root/.ollama

COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

VOLUME /app/verdicts
EXPOSE 3001

ENTRYPOINT ["./entrypoint.sh"]
