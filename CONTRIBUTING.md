# Contributing to AIPay

Thanks for your interest in contributing! AIPay is a simple project — one Cloudflare Worker file — so contributing should be straightforward.

## How to Report Bugs

Open a [GitHub issue](https://github.com/gfred/aipay/issues) with:
- What you expected to happen
- What actually happened
- Steps to reproduce
- Your deployment setup (Cloudflare Pages, Vercel, etc.)

## How to Suggest Features

Open a GitHub issue with the `enhancement` label. Describe the use case and why it would be useful.

## Development Setup

1. Clone the repo:
   ```bash
   git clone https://github.com/gfred/aipay.git
   cd aipay
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Install Wrangler (Cloudflare's CLI):
   ```bash
   npm install -g wrangler
   ```

4. Create an LNbits wallet at [lnbits.com](https://lnbits.com). You can use the [demo server](https://demo.lnbits.com/) for testing.

5. Set environment variables in `wrangler.toml` or Cloudflare Dashboard:
   - `LNBITS_URL`
   - `LNBITS_WALLET_ID`
   - `LNBITS_INVOICE_KEY`
   - `ORIGIN_URL`

6. Run locally:
   ```bash
   wrangler dev
   ```

7. Run tests:
   ```bash
   npm test
   ```

8. Test with curl:
   ```bash
   # Normal request
   curl http://localhost:8787

   # AI bot request (should get 402)
   curl -A "GPTBot/1.0" http://localhost:8787
   ```

## Pull Requests

1. Fork the repo and create a branch from `main`.
2. Keep changes focused — one feature or fix per PR.
3. Test your changes locally with `wrangler dev`.
4. Describe what your PR does and why.

## Code Style

- Vanilla JavaScript, no build step, no dependencies.
- Keep it simple — this is intentionally a single-file worker.
- Use clear variable names and add comments for non-obvious logic.
- English for all comments and documentation.

## Ideas for Contribution

- Dashboard for payment analytics
- Multi-site token management
- Webhook notifications on payment
- Rate limiting per token
- Token expiry enforcement
- Additional AI bot signatures
- Integration examples for other AI agent frameworks