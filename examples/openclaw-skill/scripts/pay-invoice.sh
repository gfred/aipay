#!/bin/bash
# Pay a Lightning invoice

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/../config.json"
SPENDING_FILE="$SCRIPT_DIR/../spending.json"

INVOICE="$1"

if [ -z "$INVOICE" ]; then
  echo '{"error": "No invoice provided"}'
  exit 1
fi

LNBITS_URL=$(jq -r '.lnbits_url' "$CONFIG_FILE")
ADMIN_KEY=$(jq -r '.admin_key' "$CONFIG_FILE")
DAILY_BUDGET=$(jq -r '.daily_budget_sats' "$CONFIG_FILE")

# Check/init spending tracker
TODAY=$(date +%Y-%m-%d)
if [ -f "$SPENDING_FILE" ]; then
  SPENDING_DATE=$(jq -r '.date // ""' "$SPENDING_FILE")
  if [ "$SPENDING_DATE" = "$TODAY" ]; then
    SPENT_TODAY=$(jq -r '.spent_sats // 0' "$SPENDING_FILE")
  else
    SPENT_TODAY=0
  fi
else
  SPENT_TODAY=0
fi

# Decode invoice to get amount
DECODE_RESPONSE=$(curl -s -X POST "$LNBITS_URL/api/v1/payments/decode" \
  -H "X-Api-Key: $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"data\": \"$INVOICE\"}")

AMOUNT_MSATS=$(echo "$DECODE_RESPONSE" | jq -r '.amount_msat // 0')
AMOUNT_SATS=$((AMOUNT_MSATS / 1000))

# Check budget
NEW_TOTAL=$((SPENT_TODAY + AMOUNT_SATS))
if [ "$NEW_TOTAL" -gt "$DAILY_BUDGET" ]; then
  echo "{\"error\": \"Budget exceeded\", \"spent_today\": $SPENT_TODAY, \"amount\": $AMOUNT_SATS, \"budget\": $DAILY_BUDGET}"
  exit 1
fi

# Pay invoice
PAY_RESPONSE=$(curl -s -X POST "$LNBITS_URL/api/v1/payments" \
  -H "X-Api-Key: $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"out\": true, \"bolt11\": \"$INVOICE\"}")

PAYMENT_HASH=$(echo "$PAY_RESPONSE" | jq -r '.payment_hash // ""')

if [ -z "$PAYMENT_HASH" ] || [ "$PAYMENT_HASH" = "null" ]; then
  echo "{\"error\": \"Payment failed\", \"response\": $PAY_RESPONSE}"
  exit 1
fi

# Update spending tracker
echo "{\"date\": \"$TODAY\", \"spent_sats\": $NEW_TOTAL}" > "$SPENDING_FILE"

echo "{\"success\": true, \"payment_hash\": \"$PAYMENT_HASH\", \"amount_sats\": $AMOUNT_SATS, \"spent_today\": $NEW_TOTAL}"
