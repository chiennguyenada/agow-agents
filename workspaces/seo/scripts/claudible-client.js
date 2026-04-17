/**
 * claudible-client.js
 * Wrapper gọi Claudible OpenAI-compatible API.
 *
 * Claudible endpoint: https://claudible.io/v1/chat/completions
 * Auth: CLAUDIBLE_API_KEY env var (Bearer token)
 * Model: PRIMARY_MODEL env var (default: claude-haiku-4-5-20251001)
 *
 * NOTE: Dùng Haiku làm default thay Sonnet vì Cloudflare proxy timeout 100s —
 * Haiku nhanh hơn 3-4x, đảm bảo xong trong 100s với bài ~600 từ.
 * Dùng Sonnet khi cần chất lượng cao hơn bằng cách set PRIMARY_MODEL=claude-sonnet-4-6.
 */

'use strict';

const https = require('https');

const CLAUDIBLE_API_KEY = process.env.CLAUDIBLE_API_KEY;
const PRIMARY_MODEL     = process.env.PRIMARY_MODEL || 'claude-haiku-4-5-20251001';
const BASE_URL          = 'claudible.io';
const API_PATH          = '/v1/chat/completions';

if (!CLAUDIBLE_API_KEY) {
  console.error('[claudible-client] ERROR: CLAUDIBLE_API_KEY env var is not set');
  process.exit(1);
}

function apiRequest(body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const options = {
      hostname: BASE_URL,
      path:     API_PATH,
      method:   'POST',
      headers: {
        'Authorization':  `Bearer ${CLAUDIBLE_API_KEY}`,
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(new Error(`JSON parse error: ${e.message}\nRaw: ${data.slice(0, 200)}`)); }
        } else {
          let errMsg = `HTTP ${res.statusCode}`;
          try {
            const b = JSON.parse(data);
            errMsg += `: ${b.error?.message || b.message || data.slice(0, 200)}`;
          } catch { errMsg += `: ${data.slice(0, 200)}`; }
          reject(new Error(errMsg));
        }
      });
    });

    req.on('error', reject);
    // 90s — dưới mức Cloudflare timeout 100s
    req.setTimeout(90000, () => { req.destroy(); reject(new Error('Request timeout (90s) — thử giảm maxTokens hoặc dùng Haiku')); });
    req.write(payload);
    req.end();
  });
}

async function chatComplete(messages, opts = {}) {
  const {
    maxTokens   = 2048,
    temperature = 0.3,
    model       = PRIMARY_MODEL,
  } = opts;

  const body = { model, messages, max_tokens: maxTokens, temperature };
  const response = await apiRequest(body);

  const content = response?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error(`Unexpected response format: ${JSON.stringify(response).slice(0, 300)}`);
  }
  return content;
}

const modelInfo = {
  model:   PRIMARY_MODEL,
  baseUrl: `https://${BASE_URL}${API_PATH}`,
};

module.exports = { chatComplete, modelInfo };
