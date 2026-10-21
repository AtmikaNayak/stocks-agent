/**
 * Security headers.
 *
 * The previous configuration answered every path with
 * `Access-Control-Allow-Origin: *`, which let any origin read unauthenticated
 * JSON from the API. That is removed: this application is same-origin only.
 *
 * CSP notes and honest limitations:
 *  - `script-src` still needs `'unsafe-inline'` because the Next.js App Router
 *    runtime emits inline bootstrap scripts and this build does not implement
 *    nonce propagation. A nonce-based CSP is the correct next step and is
 *    tracked as outstanding work in the README, not claimed here.
 *  - `'unsafe-eval'` is added only in development, where the dev server requires
 *    it; production does not allow eval.
 *  - `frame-ancestors 'none'` plus X-Frame-Options blocks clickjacking. The
 *    preview environment may need framing; set
 *    INVESTPILOT_ALLOW_FRAMING=1 to relax it for a preview deployment only.
 */

const isDev = process.env.NODE_ENV !== 'production';
const allowFraming = process.env.INVESTPILOT_ALLOW_FRAMING === '1';

function contentSecurityPolicy() {
  const scriptSrc = ["'self'", "'unsafe-inline'"];
  if (isDev) scriptSrc.push("'unsafe-eval'");

  return [
    "default-src 'self'",
    `script-src ${scriptSrc.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    allowFraming ? "frame-ancestors 'self'" : "frame-ancestors 'none'"
  ].join('; ');
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    const headers = [
      { key: 'Content-Security-Policy', value: contentSecurityPolicy() },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
      { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
      { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' }
    ];

    if (!allowFraming) {
      headers.push({ key: 'X-Frame-Options', value: 'DENY' });
    }

    if (!isDev) {
      // Only meaningful over HTTPS; production must be served over TLS because
      // the session cookie is Secure.
      headers.push({
        key: 'Strict-Transport-Security',
        value: 'max-age=31536000; includeSubDomains'
      });
    }

    return [{ source: '/:path*', headers }];
  }
};

export default nextConfig;
