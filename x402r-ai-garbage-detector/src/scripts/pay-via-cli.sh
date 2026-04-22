#!/usr/bin/env bash
#
# pay-via-cli.sh — copy-paste companion for the `paymentScheme.cli` hint
# advertised at POST /attest/identity. Proves the CLI path works end-to-end
# against the running merchant without installing the SDK.
#
# Prereq: merchant is up (`pnpm run merchant`) and the account holds USDC
# on the target chain.
#
# Usage:
#   PRIVATE_KEY=0x... ./src/scripts/pay-via-cli.sh
#   PRIVATE_KEY=0x... MERCHANT_URL=http://localhost:4021 ./src/scripts/pay-via-cli.sh
#
set -euo pipefail

: "${PRIVATE_KEY:?PRIVATE_KEY env required (raw 0x-prefixed hex)}"
MERCHANT_URL="${MERCHANT_URL:-http://localhost:4021}"
ROUTE="${1:-/weather}"

PRIVATE_KEY="$PRIVATE_KEY" npx --yes @x402r/cli@~0.2 pay "${MERCHANT_URL}${ROUTE}" --json
