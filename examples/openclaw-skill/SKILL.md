# L402 Payment Skill

Automatically pay for L402-protected content using Lightning Network micropayments.

## When to Use

- When fetching a URL returns HTTP 402 Payment Required
- When user asks to access L402/paywall-protected content
- When you see "Payment Required" in API responses

## Configuration

Store your LNbits credentials in `config.json` (this file is local, never commit):

```json
{
  "lnbits_url": "https://demo.lnbits.com",
  "wallet_id": "your-wallet-id",
  "admin_key": "your-admin-key",
  "invoice_key": "your-invoice-key",
  "daily_budget_sats": 1000
}
```

## Usage

### Check Wallet Balance
```bash
./scripts/check-balance.sh
```

### Pay an Invoice
```bash
./scripts/pay-invoice.sh "lnbc..."
```

### Fetch URL with Auto-Pay (handles 402 automatically)
```bash
./scripts/fetch-l402.sh "https://example.com/protected-content"
```

## Workflow

1. **Try to fetch URL** → If 402, extract invoice from response
2. **Check daily budget** → If exceeded, ask user for permission
3. **Pay invoice** → Get payment hash as token
4. **Retry request** → Include `Authorization: L402 <token>` header
5. **Return content** → Cache token for future requests

## Budget Limits

- Default: 1000 sats/day
- Tokens are cached in `~/.openclaw/skills/l402-payment/tokens.json`
- Daily spending tracked in `~/.openclaw/skills/l402-payment/spending.json`

## Security

- All credentials stored locally
- Never log or expose API keys
- Tokens cached locally only
