/**
 * AI Paywall - Cloudflare Worker
 *
 * Detects AI bots and returns 402 Payment Required.
 * Normal users are passed through.
 * Provides invoice generation via LNbits API.
 */

// Security headers added to all JSON responses
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};

// Timeout for LNbits API calls (ms)
const LNBITS_TIMEOUT = 5000;

// AI bot user-agents to detect
const AI_BOTS = [
  'GPTBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-Web',
  'Anthropic',
  'Bytespider',
  'PerplexityBot',
  'Amazonbot',
  'Cohere-ai',
  'Diffbot',
  'FacebookBot',
  'Google-Extended',
  'Omgilibot',
  'Applebot-Extended',
  'YouBot',
  'AI2Bot',
  'Ai2Bot-Dolma',
  'CCBot',
  'DataForSeoBot',
  'ImagesiftBot',
  'Scrapy',
  'Timpibot',
  'VelenPublicWebCrawler',
  'Webzio-Extended',
  'img2dataset',
];

// Default configuration (override via environment variables)
const CONFIG = {
  // Origin URL (Cloudflare Pages)
  originUrl: 'https://your-site.pages.dev',

  // AI Portal URL (where bots are directed)
  aiPortalUrl: 'https://ai.yourdomain.com',

  // Site description shown in 402 responses
  siteDescription: 'Protected content available via L402 micropayments',

  // Contact email shown in 402 responses
  contactEmail: 'ai@yourdomain.com',

  // Pricing in Satoshis
  pricing: {
    perRequest: 10,
    dayPass: 1000,
    monthPass: 10000,
  },

  // LNbits configuration
  lnbits: {
    url: 'https://your-lnbits-instance.com',
    walletId: 'YOUR_WALLET_ID',
    invoiceKey: 'YOUR_INVOICE_KEY',
  },

  // Paths that are NOT protected — add your own as needed (e.g. '/ai-portal')
  allowedPaths: [
    '/robots.txt',
    '/llms.txt',
    '/.well-known/',
    '/api/v1/invoice',
    '/api/v1/verify',
  ],

  // URL patterns that always require a token (regardless of user-agent).
  // Matched against the full pathname. Browser requests from your own site
  // (valid referer) are still allowed through.
  // Examples:
  //   '/api/data/.*'              — protect everything under /api/data/
  //   '.*\\.(json|xml)$'          — protect all JSON and XML files
  //   '/posts/.*\\.(gpx|jpg)$'    — protect GPX and images under /posts/
  protectedPatterns: [
    '.*\\.(json|gpx|jpg|jpeg|png|webp)$',
  ],
};

/**
 * Build runtime config by merging environment variables over defaults.
 */
function getConfig(env) {
  return {
    ...CONFIG,
    originUrl: env.ORIGIN_URL || CONFIG.originUrl,
    aiPortalUrl: env.AI_PORTAL_URL || CONFIG.aiPortalUrl,
    siteDescription: env.SITE_DESCRIPTION || CONFIG.siteDescription,
    contactEmail: env.CONTACT_EMAIL || CONFIG.contactEmail,
    lnbits: {
      url: env.LNBITS_URL || CONFIG.lnbits.url,
      walletId: env.LNBITS_WALLET_ID || CONFIG.lnbits.walletId,
      invoiceKey: env.LNBITS_INVOICE_KEY || CONFIG.lnbits.invoiceKey,
    },
  };
}

/**
 * Build JSON response headers with security headers included.
 */
function jsonHeaders(extra = {}) {
  return {
    'Content-Type': 'application/json',
    ...SECURITY_HEADERS,
    ...extra,
  };
}

/**
 * Checks if the user-agent is a known AI bot.
 */
function isAiBot(userAgent) {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return AI_BOTS.some(bot => ua.includes(bot.toLowerCase()));
}

/**
 * Checks if the path is allowed (not protected).
 */
function isAllowedPath(pathname) {
  return CONFIG.allowedPaths.some(path => pathname.startsWith(path));
}

/**
 * Checks if the pathname matches any of the configured protected patterns.
 */
function isProtectedPath(pathname, config) {
  return config.protectedPatterns.some(pattern => {
    return new RegExp(pattern, 'i').test(pathname);
  });
}

/**
 * Checks if the referer originates from the configured site.
 * Uses proper URL parsing to prevent subdomain/substring bypass.
 */
function isRefererFromSite(request, config) {
  const referer = request.headers.get('Referer') || '';
  if (!referer) return false;
  try {
    const refererHost = new URL(referer).hostname;
    const originHost = new URL(config.originUrl).hostname;
    return refererHost === originHost;
  } catch {
    return false;
  }
}

/**
 * Fetch with timeout using AbortController.
 */
async function fetchWithTimeout(url, options, timeoutMs = LNBITS_TIMEOUT) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Creates a Lightning invoice via LNbits.
 */
async function createInvoice(amount, memo, config) {
  const response = await fetchWithTimeout(`${config.lnbits.url}/api/v1/payments`, {
    method: 'POST',
    headers: {
      'X-Api-Key': config.lnbits.invoiceKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      out: false,
      amount: amount,
      memo: memo,
    }),
  });

  if (!response.ok) {
    throw new Error(`LNbits API error: ${response.status}`);
  }

  return await response.json();
}

/**
 * Checks if an invoice has been paid.
 */
async function checkPayment(paymentHash, config) {
  const response = await fetchWithTimeout(`${config.lnbits.url}/api/v1/payments/${paymentHash}`, {
    method: 'GET',
    headers: {
      'X-Api-Key': config.lnbits.invoiceKey,
    },
  });

  if (!response.ok) {
    throw new Error(`LNbits API error: ${response.status}`);
  }

  const data = await response.json();
  return data.paid === true;
}

// Valid plan names (used to prevent prototype pollution)
const VALID_PLANS = ['perRequest', 'dayPass', 'monthPass'];

/**
 * API: Generate an invoice
 * POST /api/v1/invoice
 * Body: { "plan": "perRequest" | "dayPass" | "monthPass" }
 */
async function handleInvoiceRequest(request, config) {
  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: jsonHeaders(),
    });
  }

  try {
    const body = await request.json();
    const plan = body.plan || 'perRequest';

    if (typeof plan !== 'string' || !VALID_PLANS.includes(plan)) {
      return new Response(JSON.stringify({ error: 'Invalid plan' }), {
        status: 400,
        headers: jsonHeaders(),
      });
    }

    const amount = config.pricing[plan];

    const planLabels = {
      perRequest: 'Single Request',
      dayPass: '24 Hour Pass',
      monthPass: '30 Day Pass',
    };

    const hostname = new URL(config.originUrl).hostname;
    const memo = `AI Paywall - ${hostname} - ${planLabels[plan]}`;
    const invoice = await createInvoice(amount, memo, config);

    return new Response(JSON.stringify({
      success: true,
      plan: plan,
      amount: amount,
      currency: 'satoshis',
      invoice: {
        bolt11: invoice.bolt11,
        paymentHash: invoice.payment_hash,
        expiresAt: invoice.expiry,
      },
      // QR code URL (via external API)
      qrCode: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(invoice.bolt11)}`,
      instructions: {
        step1: 'Scan QR code or copy bolt11 invoice',
        step2: 'Pay with any Lightning wallet',
        step3: 'Use payment_hash as access token in Authorization header',
        example: `curl -H "Authorization: L402 ${invoice.payment_hash}" https://${hostname}/path/...`,
      },
    }), {
      status: 200,
      headers: jsonHeaders({ 'Access-Control-Allow-Origin': '*' }),
    });
  } catch (error) {
    console.error('Invoice creation failed:', error);
    return new Response(JSON.stringify({ error: 'Failed to create invoice' }), {
      status: 500,
      headers: jsonHeaders(),
    });
  }
}

/**
 * API: Check if payment was completed
 * GET /api/v1/verify?hash=<payment_hash>
 */
async function handleVerifyRequest(request, config) {
  const url = new URL(request.url);
  const hash = url.searchParams.get('hash');

  if (!hash || !/^[a-fA-F0-9]{32,64}$/.test(hash)) {
    return new Response(JSON.stringify({ error: 'Invalid or missing payment hash' }), {
      status: 400,
      headers: jsonHeaders({ 'Access-Control-Allow-Origin': '*' }),
    });
  }

  try {
    const paid = await checkPayment(hash, config);

    return new Response(JSON.stringify({
      paymentHash: hash,
      paid: paid,
      accessGranted: paid,
    }), {
      status: 200,
      headers: jsonHeaders({ 'Access-Control-Allow-Origin': '*' }),
    });
  } catch (error) {
    console.error('Payment verification failed:', error);
    return new Response(JSON.stringify({ error: 'Failed to verify payment' }), {
      status: 500,
      headers: jsonHeaders(),
    });
  }
}

/**
 * Generates the 402 Payment Required response.
 */
async function createPaymentRequiredResponse(request, config) {
  const url = new URL(request.url);

  // Generate an invoice for the request
  let invoice = null;
  try {
    const memo = `AI Paywall - ${url.hostname} - ${url.pathname}`;
    invoice = await createInvoice(config.pricing.perRequest, memo, config);
  } catch (e) {
    console.error('Invoice creation failed:', e);
  }

  const responseBody = {
    status: 402,
    error: 'Payment Required',
    message: 'AI access to this content requires payment.',

    // Content info
    content: {
      domain: url.hostname,
      requestedUrl: url.pathname,
      description: config.siteDescription,
      languages: ['en'],
    },

    // Pricing info
    pricing: {
      currency: 'satoshis',
      perRequest: config.pricing.perRequest,
      dayPass: config.pricing.dayPass,
      monthPass: config.pricing.monthPass,
      usdEquivalent: {
        perRequest: '~$0.007',
        dayPass: '~$0.66',
        monthPass: '~$6.62',
      },
    },

    // Direct payment option (if invoice generation succeeded)
    ...(invoice && {
      payNow: {
        amount: config.pricing.perRequest,
        bolt11: invoice.bolt11,
        paymentHash: invoice.payment_hash,
        expiresAt: invoice.expiry,
        qrCode: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(invoice.bolt11)}`,
      },
    }),

    // Payment instructions
    payment: {
      method: 'Lightning Network',
      portalUrl: config.aiPortalUrl,
      apiEndpoint: `https://${url.hostname}/api/v1/invoice`,
      verifyEndpoint: `https://${url.hostname}/api/v1/verify`,
      protocol: 'L402',
    },

    // Human fallback
    humanAccess: {
      url: request.url,
      hint: 'Share this URL with your user - humans can access freely via browser.',
    },

    // Machine-readable links
    links: {
      llmsTxt: `https://${url.hostname}/llms.txt`,
      robots: `https://${url.hostname}/robots.txt`,
      sitemap: `https://${url.hostname}/sitemap.xml`,
      contact: config.contactEmail,
    },
  };

  return new Response(JSON.stringify(responseBody, null, 2), {
    status: 402,
    headers: jsonHeaders({
      'X-AI-Paywall': 'active',
      'X-Payment-Required': 'Lightning',
      'Access-Control-Allow-Origin': '*',
      // L402 header with invoice
      ...(invoice && {
        'WWW-Authenticate': `L402 invoice="${invoice.bolt11}", macaroon="pending"`,
      }),
    }),
  });
}

/**
 * Checks if a valid access token is present.
 */
async function hasValidToken(request, config) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return false;

  // Format: "L402 <payment_hash>" or "Bearer <payment_hash>"
  const match = authHeader.match(/^(L402|Bearer)\s+([a-fA-F0-9]+)$/i);
  if (!match) return false;

  const token = match[2];

  try {
    return await checkPayment(token, config);
  } catch (e) {
    console.error('Token validation failed:', e);
    return false;
  }
}

/**
 * Logging for analytics (optional: send to KV or external service)
 */
async function logRequest(request, isBot, blocked, hasPaid) {
  console.log({
    timestamp: new Date().toISOString(),
    path: new URL(request.url).pathname,
    userAgent: request.headers.get('User-Agent'),
    isBot,
    blocked,
    hasPaid,
    country: request.headers.get('CF-IPCountry'),
  });
}

/**
 * Checks a protected resource: requires valid token if not from the site.
 * Returns a Response if blocked, or null if the request should pass through.
 */
async function checkProtectedResource(request, ctx, config) {
  if (isRefererFromSite(request, config)) {
    return null; // Browser request from own site — allow
  }

  const hasPaid = await hasValidToken(request, config);
  ctx.waitUntil(
    logRequest(request, true, !hasPaid, hasPaid).catch(() => {})
  );

  if (hasPaid) {
    return fetchFromOrigin(request, config);
  }

  return createPaymentRequiredResponse(request, config);
}

/**
 * Main handler
 */
export default {
  async fetch(request, env, ctx) {
    const config = getConfig(env);
    const url = new URL(request.url);
    const userAgent = request.headers.get('User-Agent') || '';

    // API endpoints (v1)
    if (url.pathname === '/api/v1/invoice') {
      return handleInvoiceRequest(request, config);
    }

    if (url.pathname === '/api/v1/verify') {
      return handleVerifyRequest(request, config);
    }

    // Allowed paths — pass through
    if (isAllowedPath(url.pathname)) {
      return fetchFromOrigin(request, config);
    }

    // ============================================
    // PROTECTED PATTERNS - Always require token
    // This is the real protection, not user-agent!
    // Browser requests from own site (valid referer) pass through.
    // ============================================
    if (isProtectedPath(url.pathname, config)) {
      const result = await checkProtectedResource(request, ctx, config);
      if (result) return result;
    }

    // ============================================
    // BOT CHECK - User-agent based detection
    // Resources matching protectedPatterns above
    // are already gated by token, regardless of UA.
    // ============================================
    const isBot = isAiBot(userAgent);

    // If bot, check if paid
    if (isBot) {
      const hasPaid = await hasValidToken(request, config);

      // Logging (async, non-blocking)
      ctx.waitUntil(
        logRequest(request, isBot, !hasPaid, hasPaid).catch(() => {})
      );

      if (hasPaid) {
        // Paid — serve content
        return fetchFromOrigin(request, config);
      }

      // Not paid — 402
      return createPaymentRequiredResponse(request, config);
    }

    // Logging for normal users
    ctx.waitUntil(
      logRequest(request, isBot, false, false).catch(() => {})
    );

    // Normal users — pass through to origin
    return fetchFromOrigin(request, config);
  },
};

/**
 * Fetch from Cloudflare Pages origin
 */
async function fetchFromOrigin(request, config) {
  const url = new URL(request.url);
  const originUrl = new URL(config.originUrl);

  // Forward request to Pages origin
  const originRequest = new Request(
    `${originUrl.origin}${url.pathname}${url.search}`,
    {
      method: request.method,
      headers: request.headers,
      body: request.body,
    }
  );

  return fetch(originRequest);
}

// Named exports for testing
export { isAiBot, isAllowedPath, isProtectedPath, isRefererFromSite, getConfig, jsonHeaders, VALID_PLANS, AI_BOTS };
