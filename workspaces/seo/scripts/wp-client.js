/**
 * wp-client.js
 * Shared HTTP client cho tất cả WordPress/WooCommerce scripts.
 * Đọc config hoàn toàn từ environment variables — không hardcode hostname.
 *
 * Required env vars:
 *   WP_BASE_URL          e.g. https://example.com
 *   WP_USERNAME          e.g. admin
 *   WP_APP_PASSWORD      e.g. xxxx xxxx xxxx xxxx xxxx xxxx
 *
 * Optional env vars (WooCommerce):
 *   WC_CONSUMER_KEY      e.g. ck_xxxx
 *   WC_CONSUMER_SECRET   e.g. cs_xxxx
 */

'use strict';

const https = require('https');
const http  = require('http');

// ── Validate required env vars on import ──────────────────────────────────────
function getConfig() {
  const BASE_URL = process.env.WP_BASE_URL;
  const USERNAME = process.env.WP_USERNAME;
  const PASSWORD = process.env.WP_APP_PASSWORD;

  const missing = [];
  if (!BASE_URL) missing.push('WP_BASE_URL');
  if (!USERNAME) missing.push('WP_USERNAME');
  if (!PASSWORD) missing.push('WP_APP_PASSWORD');

  if (missing.length > 0) {
    console.error('❌ Missing required environment variables: ' + missing.join(', '));
    console.error('   Set them in .env or export before running.');
    process.exit(1);
  }

  // Normalize: bỏ trailing slash
  return {
    BASE_URL: BASE_URL.replace(/\/$/, ''),
    AUTH:     Buffer.from(USERNAME + ':' + PASSWORD).toString('base64'),
    WC_KEY:   process.env.WC_CONSUMER_KEY   || null,
    WC_SECRET: process.env.WC_CONSUMER_SECRET || null,
  };
}

const config = getConfig();

// ── Core HTTP request ──────────────────────────────────────────────────────────
function request(method, url, body = null, timeoutMs = 30000) {
  return new Promise((resolve) => {
    const lib    = url.startsWith('https://') ? https : http;
    const parsed = new URL(url);
    const payload = body ? JSON.stringify(body) : null;

    const options = {
      hostname: parsed.hostname,
      port:     parsed.port || undefined,
      path:     parsed.pathname + parsed.search,
      method,
      headers: {
        'Authorization': 'Basic ' + config.AUTH,
        'Content-Type':  'application/json',
        'User-Agent':    'wp-seo-tools/1.0',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        const total  = parseInt(res.headers['x-wp-total']      || '0');
        const pages  = parseInt(res.headers['x-wp-totalpages'] || '1');
        try {
          resolve({ ok: res.statusCode < 300, status: res.statusCode, body: JSON.parse(data), total, pages });
        } catch {
          resolve({ ok: false, status: res.statusCode, body: data, total, pages });
        }
      });
    });

    req.on('error', (e) => resolve({ ok: false, status: 0, body: null, error: e.message }));
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve({ ok: false, status: 0, body: null, error: 'timeout' }); });
    if (payload) req.write(payload);
    req.end();
  });
}

// ── Convenience methods ────────────────────────────────────────────────────────
const wpGet  = (path)        => request('GET',  config.BASE_URL + path);
const wpPost = (path, body)  => request('POST', config.BASE_URL + path, body);
const wpPut  = (path, body)  => request('PUT',  config.BASE_URL + path, body);

// ── WooCommerce request (query-string auth, không dùng Basic auth) ─────────────
function wcRequest(method, path, body = null) {
  if (!config.WC_KEY || !config.WC_SECRET) {
    console.error('❌ WC_CONSUMER_KEY and WC_CONSUMER_SECRET required');
    return Promise.resolve({ ok: false, status: 0, body: null, error: 'missing-wc-creds' });
  }
  const sep = path.includes('?') ? '&' : '?';
  const fullUrl = config.BASE_URL + path + sep + `consumer_key=${config.WC_KEY}&consumer_secret=${config.WC_SECRET}`;
  return request(method, fullUrl, body);
}

// ── Fetch all pages (WP pagination) ───────────────────────────────────────────
async function fetchAll(endpoint, fields, useWC = false) {
  if (useWC && (!config.WC_KEY || !config.WC_SECRET)) {
    console.error('❌ WC_CONSUMER_KEY and WC_CONSUMER_SECRET required for WooCommerce API');
    return [];
  }

  const sep       = endpoint.includes('?') ? '&' : '?';
  const wcAuth    = useWC ? `&consumer_key=${config.WC_KEY}&consumer_secret=${config.WC_SECRET}` : '';
  const fieldsQ   = fields ? `&_fields=${fields}` : '';

  // Fetch page 1 — get total pages from headers
  const first = await request('GET', config.BASE_URL + endpoint + sep + 'per_page=100' + fieldsQ + '&page=1' + wcAuth);
  if (!first.ok || !Array.isArray(first.body)) return [];

  let all = [...first.body];
  const totalPages = first.pages || 1;

  for (let p = 2; p <= totalPages; p++) {
    const r = await request('GET', config.BASE_URL + endpoint + sep + 'per_page=100' + fieldsQ + '&page=' + p + wcAuth);
    if (!r.ok || !Array.isArray(r.body)) break;
    all = all.concat(r.body);
  }

  return all;
}

// ── Exports ────────────────────────────────────────────────────────────────────
module.exports = {
  config,
  request,
  wpGet,
  wpPost,
  wpPut,
  wcRequest,
  fetchAll,
};
