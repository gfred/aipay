#!/bin/bash
# Check LNbits wallet balance

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/../config.json"

LNBITS_URL=$(jq -r '.lnbits_url' "$CONFIG_FILE")
INVOICE_KEY=$(jq -r '.invoice_key' "$CONFIG_FILE")

RESPONSE=$(curl -s -X GET "$LNBITS_URL/api/v1/wallet" \
  -H "X-Api-Key: $INVOICE_KEY")

BALANCE=$(echo "$RESPONSE" | jq -r '.balance // 0')
BALANCE_SATS=$((BALANCE / 1000))

echo "{\"balance_msats\": $BALANCE, \"balance_sats\": $BALANCE_SATS}"
