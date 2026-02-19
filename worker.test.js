import { describe, it, expect } from 'vitest';
import { isAiBot, isAllowedPath, isProtectedPath, isRefererFromSite, getConfig, jsonHeaders, VALID_PLANS } from './worker.js';

// ============================================
// isAiBot
// ============================================
describe('isAiBot', () => {
  it('detects known AI bots', () => {
    expect(isAiBot('Mozilla/5.0 (compatible; GPTBot/1.0)')).toBe(true);
    expect(isAiBot('ClaudeBot/1.0')).toBe(true);
    expect(isAiBot('Mozilla/5.0 Bytespider')).toBe(true);
    expect(isAiBot('PerplexityBot/1.0')).toBe(true);
    expect(isAiBot('Amazonbot/0.1')).toBe(true);
    expect(isAiBot('CCBot/2.0')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isAiBot('gptbot')).toBe(true);
    expect(isAiBot('GPTBOT')).toBe(true);
    expect(isAiBot('CLAUDEBOT')).toBe(true);
  });

  it('rejects normal browsers', () => {
    expect(isAiBot('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe(false);
    expect(isAiBot('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')).toBe(false);
    expect(isAiBot('curl/7.68.0')).toBe(false);
  });

  it('rejects search engine bots', () => {
    expect(isAiBot('Googlebot/2.1')).toBe(false);
    expect(isAiBot('Bingbot/2.0')).toBe(false);
    expect(isAiBot('DuckDuckBot/1.0')).toBe(false);
  });

  it('returns false for null/undefined/empty', () => {
    expect(isAiBot(null)).toBe(false);
    expect(isAiBot(undefined)).toBe(false);
    expect(isAiBot('')).toBe(false);
  });
});

// ============================================
// isAllowedPath
// ============================================
describe('isAllowedPath', () => {
  it('allows API endpoints', () => {
    expect(isAllowedPath('/api/v1/invoice')).toBe(true);
    expect(isAllowedPath('/api/v1/verify')).toBe(true);
  });

  it('allows standard files', () => {
    expect(isAllowedPath('/robots.txt')).toBe(true);
    expect(isAllowedPath('/llms.txt')).toBe(true);
    expect(isAllowedPath('/.well-known/something')).toBe(true);
  });

  it('rejects protected paths', () => {
    expect(isAllowedPath('/posts/2023/trail.json')).toBe(false);
    expect(isAllowedPath('/posts/2023/photo.jpg')).toBe(false);
    expect(isAllowedPath('/')).toBe(false);
    expect(isAllowedPath('/about')).toBe(false);
    expect(isAllowedPath('/ai-portal')).toBe(false);
  });
});

// ============================================
// isProtectedPath
// ============================================
describe('isProtectedPath', () => {
  const config = getConfig({});

  it('protects JSON files', () => {
    expect(isProtectedPath('/posts/2023/trail.json', config)).toBe(true);
    expect(isProtectedPath('/data/export.json', config)).toBe(true);
    expect(isProtectedPath('/api/response.JSON', config)).toBe(true);
  });

  it('protects image files', () => {
    expect(isProtectedPath('/photos/sunset.jpg', config)).toBe(true);
    expect(isProtectedPath('/img/hero.png', config)).toBe(true);
    expect(isProtectedPath('/assets/photo.webp', config)).toBe(true);
    expect(isProtectedPath('/gallery/pic.jpeg', config)).toBe(true);
  });

  it('protects GPX files', () => {
    expect(isProtectedPath('/tracks/route.gpx', config)).toBe(true);
  });

  it('does not protect HTML pages', () => {
    expect(isProtectedPath('/', config)).toBe(false);
    expect(isProtectedPath('/about', config)).toBe(false);
    expect(isProtectedPath('/posts/2023/my-post/', config)).toBe(false);
    expect(isProtectedPath('/index.html', config)).toBe(false);
  });

  it('does not protect CSS/JS assets', () => {
    expect(isProtectedPath('/styles/main.css', config)).toBe(false);
    expect(isProtectedPath('/scripts/app.js', config)).toBe(false);
  });

  it('works with custom patterns', () => {
    const custom = { protectedPatterns: ['^/api/data/.*', '.*\\.pdf$'] };
    expect(isProtectedPath('/api/data/users', custom)).toBe(true);
    expect(isProtectedPath('/api/data/nested/deep', custom)).toBe(true);
    expect(isProtectedPath('/docs/report.pdf', custom)).toBe(true);
    expect(isProtectedPath('/api/public/info', custom)).toBe(false);
    expect(isProtectedPath('/page.html', custom)).toBe(false);
  });

  it('works with empty patterns (nothing protected)', () => {
    const empty = { protectedPatterns: [] };
    expect(isProtectedPath('/posts/trail.json', empty)).toBe(false);
    expect(isProtectedPath('/photo.jpg', empty)).toBe(false);
  });
});

// ============================================
// isRefererFromSite
// ============================================
describe('isRefererFromSite', () => {
  const config = { originUrl: 'https://example.com' };

  function mockRequest(referer) {
    return {
      headers: {
        get: (name) => name === 'Referer' ? referer : null,
      },
    };
  }

  it('accepts referer from own domain', () => {
    expect(isRefererFromSite(mockRequest('https://example.com/page'), config)).toBe(true);
    expect(isRefererFromSite(mockRequest('https://example.com/deep/path?q=1'), config)).toBe(true);
  });

  it('rejects referer from other domains', () => {
    expect(isRefererFromSite(mockRequest('https://evil.com/page'), config)).toBe(false);
    expect(isRefererFromSite(mockRequest('https://other-site.org'), config)).toBe(false);
  });

  it('rejects subdomain spoofing attempts', () => {
    expect(isRefererFromSite(mockRequest('https://example.com.evil.com'), config)).toBe(false);
  });

  it('rejects path-based spoofing attempts', () => {
    expect(isRefererFromSite(mockRequest('https://evil.com/example.com'), config)).toBe(false);
  });

  it('rejects userinfo-based spoofing', () => {
    expect(isRefererFromSite(mockRequest('https://example.com@evil.com'), config)).toBe(false);
  });

  it('rejects empty or missing referer', () => {
    expect(isRefererFromSite(mockRequest(''), config)).toBe(false);
    expect(isRefererFromSite(mockRequest(null), config)).toBe(false);
  });

  it('rejects malformed URLs gracefully', () => {
    expect(isRefererFromSite(mockRequest('not-a-url'), config)).toBe(false);
    expect(isRefererFromSite(mockRequest('://broken'), config)).toBe(false);
  });
});

// ============================================
// getConfig
// ============================================
describe('getConfig', () => {
  it('uses defaults when no env vars set', () => {
    const config = getConfig({});
    expect(config.originUrl).toBe('https://your-site.pages.dev');
    expect(config.lnbits.url).toBe('https://your-lnbits-instance.com');
    expect(config.contactEmail).toBe('ai@yourdomain.com');
  });

  it('overrides with env vars when provided', () => {
    const config = getConfig({
      ORIGIN_URL: 'https://my-site.pages.dev',
      LNBITS_URL: 'https://my-lnbits.com',
      LNBITS_WALLET_ID: 'wallet123',
      LNBITS_INVOICE_KEY: 'key456',
      CONTACT_EMAIL: 'me@example.com',
    });
    expect(config.originUrl).toBe('https://my-site.pages.dev');
    expect(config.lnbits.url).toBe('https://my-lnbits.com');
    expect(config.lnbits.walletId).toBe('wallet123');
    expect(config.lnbits.invoiceKey).toBe('key456');
    expect(config.contactEmail).toBe('me@example.com');
  });

  it('partially overrides (some env, some defaults)', () => {
    const config = getConfig({ ORIGIN_URL: 'https://custom.dev' });
    expect(config.originUrl).toBe('https://custom.dev');
    expect(config.lnbits.url).toBe('https://your-lnbits-instance.com'); // default
  });

  it('preserves pricing from defaults', () => {
    const config = getConfig({});
    expect(config.pricing).toBeDefined();
    for (const plan of VALID_PLANS) {
      expect(typeof config.pricing[plan]).toBe('number');
      expect(config.pricing[plan]).toBeGreaterThan(0);
    }
  });
});

// ============================================
// jsonHeaders
// ============================================
describe('jsonHeaders', () => {
  it('includes Content-Type and security headers', () => {
    const headers = jsonHeaders();
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['X-Frame-Options']).toBe('DENY');
    expect(headers['Strict-Transport-Security']).toContain('max-age=');
  });

  it('merges extra headers', () => {
    const headers = jsonHeaders({ 'Access-Control-Allow-Origin': '*' });
    expect(headers['Access-Control-Allow-Origin']).toBe('*');
    expect(headers['Content-Type']).toBe('application/json');
  });
});

// ============================================
// VALID_PLANS
// ============================================
describe('VALID_PLANS', () => {
  it('contains all expected plan types', () => {
    expect(VALID_PLANS).toEqual(['perRequest', 'dayPass', 'monthPass']);
  });

  it('every plan has a corresponding price in config', () => {
    const config = getConfig({});
    for (const plan of VALID_PLANS) {
      expect(config.pricing[plan]).toBeDefined();
    }
  });
});
