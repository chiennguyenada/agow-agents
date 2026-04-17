'use strict';
/**
 * unsplash-client.js
 * Unsplash API wrapper + WP Media upload.
 *
 * Required env vars:
 *   UNSPLASH_ACCESS_KEY   Client-ID từ unsplash.com/developers (miễn phí)
 *   WP_BASE_URL, WP_USERNAME, WP_APP_PASSWORD  (từ wp-client)
 *
 * Exports:
 *   searchPhotos(query, count)         → [{id, downloadUrl, photographer, profileUrl}]
 *   downloadAndUploadToWP(photo, slug) → {id, url, caption}
 *   findAndUpload(query, slug, count)  → [{id, url, caption}]  (search + upload all-in-one)
 */

const https  = require('https');
const http   = require('http');
const path   = require('path');
const { config } = require('./wp-client');

// ── Validate Unsplash key ─────────────────────────────────────────────────────
const UNSPLASH_KEY = process.env.UNSPLASH_ACCESS_KEY;
if (!UNSPLASH_KEY) {
  console.error('❌ Missing UNSPLASH_ACCESS_KEY — set in .env');
  process.exit(1);
}

const UNSPLASH_HOST = 'api.unsplash.com';

// ── Unsplash: search photos ───────────────────────────────────────────────────
/**
 * @param {string} query     — search keyword (English works best)
 * @param {number} count     — number of results (max 10)
 * @returns {Promise<Array>} — [{id, downloadUrl, photographer, profileUrl, altDescription}]
 */
function searchPhotos(query, count = 2) {
  return new Promise((resolve) => {
    const qs   = new URLSearchParams({ query, per_page: String(count), orientation: 'landscape' });
    const opts = {
      hostname: UNSPLASH_HOST,
      path:     '/search/photos?' + qs.toString(),
      method:   'GET',
      headers: {
        'Authorization': `Client-ID ${UNSPLASH_KEY}`,
        'Accept-Version': 'v1',
      },
    };

    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const results = (parsed.results || []).map(p => ({
            id:             p.id,
            downloadUrl:    p.urls?.regular,   // 1080px wide
            thumbUrl:       p.urls?.thumb,
            photographer:   p.user?.name,
            profileUrl:     p.user?.links?.html,
            altDescription: p.alt_description || query,
          }));
          resolve(results);
        } catch {
          resolve([]);
        }
      });
    });
    req.on('error', () => resolve([]));
    req.setTimeout(15000, () => { req.destroy(); resolve([]); });
    req.end();
  });
}

// ── Download image buffer từ URL ──────────────────────────────────────────────
function downloadBuffer(url) {
  return new Promise((resolve) => {
    const lib = url.startsWith('https://') ? https : http;
    lib.get(url, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', () => resolve(null));
  });
}

// ── Upload image buffer lên WP Media (multipart/form-data) ───────────────────
/**
 * wp-client.js hardcode application/json nên cần custom multipart upload riêng.
 * @param {Buffer} buffer    — image data
 * @param {string} filename  — e.g. "plc-br-x20.jpg"
 * @param {string} caption   — short caption (Vietnamese, no attribution)
 * @param {string} altText   — alt text specific to article context
 * @returns {Promise<{id, url, caption}|null>}
 */
function uploadToWPMedia(buffer, filename, caption, altText) {
  return new Promise((resolve) => {
    const boundary = '----WPMediaBoundary' + Date.now();
    const CRLF     = '\r\n';

    // Build multipart body
    const metaPart =
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="caption"${CRLF}${CRLF}` +
      `${caption}${CRLF}` +
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="alt_text"${CRLF}${CRLF}` +
      `${altText}${CRLF}`;

    const filePart =
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="file"; filename="${filename}"${CRLF}` +
      `Content-Type: image/jpeg${CRLF}${CRLF}`;

    const closing = `${CRLF}--${boundary}--${CRLF}`;

    const bodyStart  = Buffer.from(metaPart + filePart);
    const bodyEnd    = Buffer.from(closing);
    const body       = Buffer.concat([bodyStart, buffer, bodyEnd]);

    const parsed = new URL(config.BASE_URL + '/wp-json/wp/v2/media');
    const lib    = parsed.protocol === 'https:' ? https : http;

    const opts = {
      hostname: parsed.hostname,
      port:     parsed.port || undefined,
      path:     parsed.pathname + parsed.search,
      method:   'POST',
      headers: {
        'Authorization':  'Basic ' + config.AUTH,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Type':   `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
        'User-Agent':     'wp-seo-tools/1.0',
      },
    };

    const req = lib.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const r = JSON.parse(data);
          if (res.statusCode < 300 && r.id) {
            resolve({ id: r.id, url: r.source_url, caption, altText });
          } else {
            console.error(`  ❌ WP Media upload failed: ${res.statusCode} — ${data.slice(0, 200)}`);
            resolve(null);
          }
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', e => { console.error('  ❌ Upload error:', e.message); resolve(null); });
    req.setTimeout(60000, () => { req.destroy(); resolve(null); });
    req.write(body);
    req.end();
  });
}

// ── All-in-one: search → download → upload ───────────────────────────────────
/**
 * @param {string} query   — topic keyword để search Unsplash
 * @param {string} slug    — dùng làm filename prefix (e.g. "plc-br-x20")
 * @param {number} count   — số ảnh cần (default 2: 1 featured + 1 inline)
 * @param {Function} [altTextFn]  — optional fn(photo, index) → string, để caller tự đặt alt text theo context bài viết
 * @param {Function} [captionFn] — optional fn(photo, index) → string, để caller tự đặt caption
 * @returns {Promise<Array<{id, url, caption}>>}
 */
async function findAndUpload(query, slug, count = 2, altTextFn = null, captionFn = null) {
  // Unsplash search tốt hơn với tiếng Anh
  const englishQuery = query; // caller nên truyền English keyword
  const photos = await searchPhotos(englishQuery, count);

  if (!photos.length) {
    console.warn(`  ⚠️  Unsplash: không tìm thấy ảnh cho "${englishQuery}"`);
    return [];
  }

  const results = [];
  for (let i = 0; i < photos.length; i++) {
    const photo    = photos[i];
    const filename = `${slug}-${i + 1}.jpg`;
    // No Unsplash attribution — Unsplash license permits commercial use without credit
    const caption  = captionFn ? captionFn(photo, i) : '';
    const altText  = altTextFn ? altTextFn(photo, i) : (photo.altDescription || query);

    process.stderr.write(`  📷 Downloading: ${photo.downloadUrl?.slice(0, 60)}...\n`);
    const buffer = await downloadBuffer(photo.downloadUrl);
    if (!buffer) {
      console.warn(`  ⚠️  Download failed for photo ${photo.id}`);
      continue;
    }

    process.stderr.write(`  ⬆️  Uploading to WP Media: ${filename}\n`);
    const media = await uploadToWPMedia(buffer, filename, caption, altText);
    if (media) {
      results.push(media);
      process.stderr.write(`  ✅ Uploaded: ID ${media.id} — ${media.url}\n`);
    }
  }

  return results;
}

module.exports = { searchPhotos, downloadAndUploadToWP: uploadToWPMedia, findAndUpload };
