'use strict';
/**
 * pick-image.js
 * Inject 2 ảnh đã được duyệt qua Telegram vào WP draft.
 *
 * Usage:
 *   node pick-image.js --id={draft_id} --img1={1-5} --img2={1-5}
 *
 * Flow:
 *   1. Đọc pending-images/{draft_id}.json (slot1 + slot2)
 *   2. Download ảnh slot1 + slot2
 *   3. Upload lên WP Media (với alt text theo context)
 *   4. Fetch content draft → replace [IMAGE_1] → [IMAGE_2] → update post
 *   5. Set featured_media = ảnh slot1
 *   6. Xóa pending file
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../..', '.env') });

const https  = require('https');
const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const { config, wpGet, wpPut } = require('./wp-client');

// ── CLI args ──────────────────────────────────────────────────────────────────
const POST_ID  = (() => { const m = process.argv.join(' ').match(/--id=(\d+)/);   return m ? +m[1] : null; })();
const IMG1_IDX = (() => { const m = process.argv.join(' ').match(/--img1=(\d+)/); return m ? +m[1] : null; })();
const IMG2_IDX = (() => { const m = process.argv.join(' ').match(/--img2=(\d+)/); return m ? +m[1] : null; })();

if (!POST_ID || !IMG1_IDX) {
  console.error('Usage: node pick-image.js --id={draft_id} --img1={1-5} [--img2={1-5}]');
  process.exit(1);
}

// ── Pending state ─────────────────────────────────────────────────────────────
const PENDING_DIR  = path.join(__dirname, '..', 'pending-images');
const PENDING_FILE = path.join(PENDING_DIR, `${POST_ID}.json`);

// ── Download ──────────────────────────────────────────────────────────────────
function downloadBuffer(url) {
  return new Promise((resolve) => {
    const lib = url.startsWith('https://') ? https : http;
    const req = lib.get(url, { timeout: 30000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        downloadBuffer(res.headers.location).then(resolve);
        return;
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

// ── Upload to WP Media ────────────────────────────────────────────────────────
function uploadToWPMedia(buffer, filename, altText) {
  return new Promise((resolve) => {
    const boundary = '----WPMediaBoundary' + Date.now();
    const CRLF     = '\r\n';
    const metaPart =
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="alt_text"${CRLF}${CRLF}` +
      `${altText}${CRLF}`;
    const filePart =
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="file"; filename="${filename}"${CRLF}` +
      `Content-Type: image/jpeg${CRLF}${CRLF}`;
    const closing  = `${CRLF}--${boundary}--${CRLF}`;
    const body     = Buffer.concat([Buffer.from(metaPart + filePart), buffer, Buffer.from(closing)]);

    const parsed = new URL(config.BASE_URL + '/wp-json/wp/v2/media');
    const lib    = parsed.protocol === 'https:' ? https : http;
    const opts   = {
      hostname: parsed.hostname,
      port:     parsed.port || undefined,
      path:     parsed.pathname,
      method:   'POST',
      headers: {
        'Authorization':       'Basic ' + config.AUTH,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Type':        `multipart/form-data; boundary=${boundary}`,
        'Content-Length':      body.length,
        'User-Agent':          'wp-seo-tools/1.0',
      },
    };
    const req = lib.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const r = JSON.parse(data);
          if (res.statusCode < 300 && r.id) resolve({ id: r.id, url: r.source_url });
          else {
            console.error(`  ❌ Upload failed ${res.statusCode}: ${data.slice(0, 200)}`);
            resolve(null);
          }
        } catch { resolve(null); }
      });
    });
    req.on('error', e => { console.error('  ❌ Upload error:', e.message); resolve(null); });
    req.setTimeout(60000, () => { req.destroy(); resolve(null); });
    req.write(body);
    req.end();
  });
}

// ── Process one image slot ────────────────────────────────────────────────────
async function processSlot(slot, slotIdx, slotImages, pending) {
  if (!slot || !slot.images || !slot.images.length) return null;

  const imgIdx = slotIdx === 1 ? IMG1_IDX : IMG2_IDX;
  if (!imgIdx) return null;  // IMG2 is optional

  if (imgIdx < 1 || imgIdx > slot.images.length) {
    throw new Error(`Slot ${slotIdx}: số ảnh phải từ 1 đến ${slot.images.length}`);
  }

  const chosen = slot.images[imgIdx - 1];
  console.log(`\n📷 Slot ${slotIdx} — ảnh #${imgIdx}: ${chosen.title.slice(0, 70)}`);
  console.log(`   URL: ${chosen.url}`);

  console.log('   ⬇️  Downloading...');
  const buffer = await downloadBuffer(chosen.url);
  if (!buffer || buffer.length < 5000) {
    console.warn(`   ⚠️  Download failed (${buffer?.length || 0} bytes) — slot ${slotIdx} skipped`);
    return null;
  }
  console.log(`   Downloaded: ${(buffer.length / 1024).toFixed(0)} KB`);

  // Alt text = section heading (slot1 → heading #1, slot2 → heading #midpoint)
  const altText = slot.section || pending.topic || 'Thiết bị tự động hóa B&R';
  const filename = `${pending.slug}-img${slotIdx}-${imgIdx}.jpg`;

  console.log(`   ⬆️  Uploading: ${filename}`);
  const media = await uploadToWPMedia(buffer, filename, altText);
  if (!media) {
    console.warn(`   ⚠️  Upload failed — slot ${slotIdx} skipped`);
    return null;
  }
  console.log(`   ✅ Media ID ${media.id}: ${media.url}`);
  return { ...media, altText };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  if (!fs.existsSync(PENDING_FILE)) {
    throw new Error(`Không tìm thấy pending file cho draft ${POST_ID}`);
  }

  const pending = JSON.parse(fs.readFileSync(PENDING_FILE, 'utf-8'));

  // Support both old format (images[]) and new format (slot1/slot2)
  const slot1 = pending.slot1 || { images: pending.images || [], section: pending.topic };
  const slot2 = pending.slot2 || null;

  // 1. Download + upload both slots in parallel
  const [media1, media2] = await Promise.all([
    processSlot(slot1, 1, slot1.images, pending),
    processSlot(slot2, 2, slot2 ? slot2.images : [], pending),
  ]);

  if (!media1) throw new Error('Ảnh 1 bắt buộc phải có — không thể tiếp tục');

  // 2. Fetch current WP post content
  console.log(`\n📝 Updating WP post ${POST_ID}...`);
  const fetchRes = await wpGet(`/wp-json/wp/v2/posts/${POST_ID}?context=edit&_fields=id,content`);
  if (!fetchRes.ok) throw new Error(`Cannot fetch post ${POST_ID}: ${fetchRes.status}`);

  let content = fetchRes.body.content.raw || fetchRes.body.content.rendered || '';

  // 3. Replace placeholders
  const fig1 = `<figure class="wp-block-image"><img src="${media1.url}" alt="${media1.altText}" loading="lazy" /></figure>`;
  content = content.includes('[IMAGE_1]')
    ? content.replace('[IMAGE_1]', fig1)
    : content.replace(/(<h2)/, fig1 + '\n$1');  // fallback: before first h2

  if (media2) {
    const fig2 = `<figure class="wp-block-image"><img src="${media2.url}" alt="${media2.altText}" loading="lazy" /></figure>`;
    content = content.includes('[IMAGE_2]')
      ? content.replace('[IMAGE_2]', fig2)
      : content;  // if no placeholder, skip (don't inject randomly)
  } else {
    // Remove unfilled placeholder
    content = content.replace(/\[IMAGE_2\]/g, '');
  }
  // Clean up any remaining placeholders
  content = content.replace(/\[IMAGE_1\]/g, '').replace(/\[IMAGE_2\]/g, '');

  // 4. Update post
  const updateRes = await wpPut(`/wp-json/wp/v2/posts/${POST_ID}`, {
    content,
    featured_media: media1.id,
  });
  if (!updateRes.ok) throw new Error(`Update post failed: ${updateRes.status}`);
  console.log('   ✅ Content + featured image updated');

  // 5. Cleanup
  fs.unlinkSync(PENDING_FILE);
  console.log('   🗑️  Pending file cleaned');

  console.log('\n' + '═'.repeat(60));
  console.log(`✅ Đã chèn ảnh vào draft ${POST_ID}`);
  console.log(`   Ảnh 1 (featured): ${media1.url}`);
  if (media2) console.log(`   Ảnh 2 (inline):   ${media2.url}`);
  console.log(`🔗 Preview: ${config.BASE_URL}/?p=${POST_ID}&preview=true`);
  console.log(`→ Publish: node khoa.js publish-blog -- --id=${POST_ID} --publish`);
  console.log('═'.repeat(60));
}

main().catch(e => {
  console.error('\n❌ Fatal:', e.message);
  if (process.env.DEBUG) console.error(e.stack);
  process.exit(1);
});
