/**
 * claudible-client.js
 * Wrapper gọi Claudible OpenAI-compatible API.
 *
 * Claudible endpoint: https://claudible.io/v1/chat/completions
 * Auth: CLAUDIBLE_API_KEY env var (Bearer token)
 * Model: PRIMARY_MODEL env var (default: claude-sonnet-4-6)
 *
 * Dùng Node.js built-in https — KHÔNG cần npm install gì thêm.
 * Cùng pattern với wp-client.js.
 *
 * Usage:
 *   const { chatComplete } = require('./claudible-client');
 *   const reply = await chatComplete([
 *     { role: 'system', content: 'You are ...' },
 *     { role: 'user',   content: 'Hello' },
 *   ]);
 */

'use strict';

const https = require('https');

// ── Validate env vars ──────────────────────────────────────────────────────────
const CLAUDIBLE_API_KEY = process.env.CLAUDIBLE_API_KEY;
const PRIMARY_MODEL     = process.env.PRIMARY_MODEL || 'claude-sonnet-4-6';
const BASE_URL          = 'claudible.io';
const API_PATH          = '/v1/chat/completions';

if (!CLAUDIBLE_API_KEY) {
  console.error('[claudible-client] ERROR: CLAUDIBLE_API_KEY env var is not set');
  process.exit(1);
}

// ── Core HTTP request ──────────────────────────────────────────────────────────
/**
 * Make a POST request to Claudible API.
 * @param {object} body - JSON body
 * @returns {Promise<object>} parsed response body
 */
function apiRequest(body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);

    const options = {
      hostname: BASE_URL,
      path:     API_PATH,
      method:   'POST',
      headers: {
        'Authorization': `Bearer ${CLAUDIBLE_API_KEY}`,
        'Content-Type':  'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`JSON parse error: ${e.message}\nRaw: ${data.slice(0, 200)}`));
          }
        } else {
          // Parse error body nếu có
          let errMsg = `HTTP ${res.statusCode}`;
          try {
            const errBody = JSON.parse(data);
            errMsg += `: ${errBody.error?.message || errBody.message || data.slice(0, 200)}`;
          } catch {
            errMsg += `: ${data.slice(0, 200)}`;
          }
          reject(new Error(errMsg));
        }
      });
    });

    req.on('error', reject);

    // Timeout 180s cho AI calls (long response — 2500-4000 chars HTML)
    req.setTimeout(180000, () => {
      req.destroy();
      reject(new Error('Request timeout (120s)'));
    });

    req.write(payload);
    req.end();
  });
}

// ── Public API ─────────────────────────────────────────────────────────────────
/**
 * Call chat completions endpoint.
 *
 * @param {Array<{role: string, content: string}>} messages
 * @param {object} opts
 * @param {number} [opts.maxTokens=4096]   - max output tokens
 * @param {number} [opts.temperature=0.3]  - lower = more consistent
 * @param {string} [opts.model]            - override model
 * @returns {Promise<string>} assistant reply content
 */
async function chatComplete(messages, opts = {}) {
  const {
    maxTokens   = 4096,
    temperature = 0.3,
    model       = PRIMARY_MODEL,
  } = opts;

  const body = {
    model,
    messages,
    max_tokens:  maxTokens,
    temperature,
  };

  const response = await apiRequest(body);

  // OpenAI-compat response format
  const content = response?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error(`Unexpected response format: ${JSON.stringify(response).slice(0, 300)}`);
  }

  return content;
}

/**
 * Expose model info for logging.
 */
const modelInfo = {
  model:   PRIMARY_MODEL,
  baseUrl: `https://${BASE_URL}${API_PATH}`,
};

module.exports = { chatComplete, modelInfo };
