/**
 * check-duplicate-alt.js
 * Tìm ảnh có alt text trùng lặp TRÊN CÙNG MỘT TRANG (posts, pages, WC products)
 *
 * Cách dùng (trong container):
 *   node /home/node/.openclaw/workspaces/seo/scripts/check-duplicate-alt.js
 *
 * Yêu cầu env vars: WP_BASE_URL, WP_USERNAME, WP_APP_PASSWORD, WC_CONSUMER_KEY, WC_CONSUMER_SECRET
 */

const https = require('https');
const http = require('http');

const BASE_URL = process.env.WP_BASE_URL || 'https://agowautomation.com';
const AUTH = Buffer.from(
  `${process.env.WP_USERNAME}:${process.env.WP_APP_PASSWORD}`
).toString('base64');
const WC_KEY    = process.env.WC_CONSUMER_KEY;
const WC_SECRET = process.env.WC_CONSUMER_SECRET;

// ── HTTP helper ────────────────────────────────────────────────────────────────
function get(url, extraHeaders = {}) {
  return new Promise((resolve) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { headers: { 'Authorization': 'Basic ' + AUTH, ...extraHeaders } }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try {
          resolve({
            data: JSON.parse(data),
            total: parseInt(res.headers['x-wp-total'] || '0'),
            pages: parseInt(res.headers['x-wp-totalpages'] || '1'),
            status: res.statusCode
          });
        } catch (e) {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(30000, () => { req.destroy(); resolve(null); });
  });
}

// ── Extract img alts từ HTML content.rendered ─────────────────────────────────
function extractAlts(html) {
  if (!html) return [];
  const alts = [];
  const re = /<img[^>]+alt=["']([^"']*)["'][^>]*>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const alt = m[1].trim();
    if (alt) alts.push(alt);
  }
  return alts;
}

// ── Tìm duplicate trong mảng alts ─────────────────────────────────────────────
function findDupes(alts) {
  const count = {};
  alts.forEach(a => { count[a] = (count[a] || 0) + 1; });
  return Object.entries(count).filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]);
}

// ── Fetch tất cả pages (có pagination) ────────────────────────────────────────
async function fetchAll(endpoint, fields, useWC = false) {
  const sep = endpoint.includes('?') ? '&' : '?';
  const authParam = useWC ? `&consumer_key=${WC_KEY}&consumer_secret=${WC_SECRET}` : '';
  const url = `${BASE_URL}${endpoint}${sep}per_page=100&_fields=${fields}&page=1${authParam}`;
  const first = useWC ? await get(url, {}) : await get(url);
  if (!first || !first.data) return [];
  let all = [...first.data];
  for (let p = 2; p <= first.pages; p++) {
    const r = useWC
      ? await get(`${BASE_URL}${endpoint}${sep}per_page=100&_fields=${fields}&page=${p}${authParam}`, {})
      : await get(`${BASE_URL}${endpoint}${sep}per_page=100&_fields=${fields}&page=${p}`);
    if (r && r.data) all = all.concat(r.data);
  }
  return all;
}

// ── MAIN ───────────────────────────────────────────────────────────────────────
async function main() {
  const problems = [];

  // 1. POSTS
  process.stderr.write('Scanning posts...\n');
  const posts = await fetchAll('/wp-json/wp/v2/posts', 'id,title,link,content');
  posts.forEach(post => {
    const alts = extractAlts(post.content && post.content.rendered);
    const dupes = findDupes(alts);
    if (dupes.length) problems.push({ type: 'POST', id: post.id, title: post.title.rendered, url: post.link, dupes });
  });

  // 2. PAGES — PHẢI dùng content.rendered, KHÔNG dùng _links.wp:featuredmedia
  process.stderr.write('Scanning pages...\n');
  const pages = await fetchAll('/wp-json/wp/v2/pages', 'id,title,link,content');
  pages.forEach(page => {
    const alts = extractAlts(page.content && page.content.rendered);
    const dupes = findDupes(alts);
    if (dupes.length) problems.push({ type: 'PAGE', id: page.id, title: page.title.rendered, url: page.link, dupes });
  });

  // 3. WC PRODUCTS — dùng images[] từ WC API
  process.stderr.write('Scanning WC products...\n');
  const products = await fetchAll('/wp-json/wc/v3/products', 'id,name,permalink,images', true);
  products.forEach(prod => {
    if (!prod.images || prod.images.length < 2) return;
    const alts = prod.images.map(img => (img.alt || '').trim()).filter(Boolean);
    const dupes = findDupes(alts);
    if (dupes.length) problems.push({ type: 'PRODUCT', id: prod.id, title: prod.name, url: prod.permalink, dupes });
  });

  // ── OUTPUT ──────────────────────────────────────────────────────────────────
  const counts = { POST: 0, PAGE: 0, PRODUCT: 0 };
  problems.forEach(p => counts[p.type]++);

  console.log('=== DUPLICATE ALT TEXT (SAME PAGE) ===');
  console.log(`Posts    scanned: ${posts.length}    → ${counts.POST} trang có lỗi`);
  console.log(`Pages    scanned: ${pages.length}    → ${counts.PAGE} trang có lỗi`);
  console.log(`Products scanned: ${products.length} → ${counts.PRODUCT} sản phẩm có lỗi`);
  console.log(`Tổng trang có lỗi: ${problems.length}`);
  console.log('');

  if (problems.length === 0) {
    console.log('✅ Không tìm thấy duplicate alt text trên cùng 1 trang.');
    return;
  }

  problems.forEach(p => {
    console.log(`[${p.type} ID:${p.id}] ${p.title}`);
    console.log(`  URL: ${p.url}`);
    p.dupes.forEach(([alt, count]) => {
      console.log(`  x${count} "${alt}"`);
    });
    console.log('');
  });
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
