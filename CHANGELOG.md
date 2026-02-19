# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.0.0] - 2026-02-19

### Added
- Cloudflare Worker paywall with L402 protocol support
- AI bot detection (25 known crawlers)
- Lightning Network invoice generation via LNbits
- Payment verification API
- Multi-layer protection (robots.txt, llms.txt, user-agent, referer, L402 token)
- Interactive AI Portal page (index.html) with live demo
- OpenClaw skill example with auto-payment, budget tracking, and token caching
- robots.txt and llms.txt templates
- Environment variable support (LNBITS_URL, ORIGIN_URL, etc.)
- Security headers on all responses
- Input validation for payment hashes and plan parameters
- Fetch timeouts for LNbits API calls
