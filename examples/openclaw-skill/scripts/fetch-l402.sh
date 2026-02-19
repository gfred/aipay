#!/bin/bash
# Fetch URL with automatic L402 payment handling

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/../config.json"
TOKENS_FILE="$SCRIPT_DIR/../tokens.json"

URL="$1"

if [ -z "$URL" ]; then
  echo '{"error": "No URL provided"}'
  exit 1
fi

# Extract domain for token lookup
DOMAIN=$(echo "$URL" | sed -E 's|https?://([^/]+).*|\1|')

# Check for cached token
if [ -f "$TOKENS_FILE" ]; then
  CACHED_TOKEN=$(jq -r --arg domain "$DOMAIN" '.[$domain].token // ""' "$TOKENS_FILE")
  CACHED_EXPIRY=$(jq -r --arg domain "$DOMAIN" '.[$domain].expiry // 0' "$TOKENS_FILE")
  NOW=$(date +%s)
  
  if [ -n "$CACHED_TOKEN" ] && [ "$CACHED_TOKEN" != "null" ] && [ "$CACHED_EXPIRY" -gt "$NOW" ]; then
    # Try with cached token
    RESPONSE=$(curl -s -w "\n%{http_code}" "$URL" \
      -H "Authorization: L402 $CACHED_TOKEN")
    
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')
    
    if [ "$HTTP_CODE" = "200" ]; then
      echo "$BODY"
      exit 0
    fi
  fi
fi

# First request (no token)
RESPONSE=$(curl -s -w "\n%{http_code}" "$URL")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

# Check if 402
if [ "$HTTP_CODE" != "402" ]; then
  echo "$BODY"
  exit 0
fi

# Extract invoice from 402 response
INVOICE=$(echo "$BODY" | jq -r '.payNow.bolt11 // .invoice // .bolt11 // ""')

if [ -z "$INVOICE" ] || [ "$INVOICE" = "null" ]; then
  echo '{"error": "Could not extract invoice from 402 response", "response": '"$BODY"'}'
  exit 1
fi

# Pay invoice
PAY_RESULT=$("$SCRIPT_DIR/pay-invoice.sh" "$INVOICE")
PAY_SUCCESS=$(echo "$PAY_RESULT" | jq -r '.success // false')

if [ "$PAY_SUCCESS" != "true" ]; then
  echo "$PAY_RESULT"
  exit 1
fi

PAYMENT_HASH=$(echo "$PAY_RESULT" | jq -r '.payment_hash')

# Cache token (24h expiry)
EXPIRY=$(($(date +%s) + 86400))
if [ -f "$TOKENS_FILE" ]; then
  TOKENS=$(cat "$TOKENS_FILE")
else
  TOKENS="{}"
fi
TOKENS=$(echo "$TOKENS" | jq --arg domain "$DOMAIN" --arg token "$PAYMENT_HASH" --argjson expiry "$EXPIRY" \
  '.[$domain] = {"token": $token, "expiry": $expiry}')
echo "$TOKENS" > "$TOKENS_FILE"

# Retry with token
FINAL_RESPONSE=$(curl -s "$URL" -H "Authorization: L402 $PAYMENT_HASH")
echo "$FINAL_RESPONSE"
