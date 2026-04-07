'use strict';
/**
 * ai-write-blog.js
 * Tự động viết bài blog SEO semantic cho agowautomation.com.
 * Automation blog writer for Khoa (SEO agent) at Agow Automation.
 *
 * Workflow: Research → Classify+Outline → Write → Images → Draft WP → Notify
 * Model: claude-sonnet-4-6 (all AI phases)
 *
 * CLI:
 *   node ai-write-blog.js                         # dry-run: research + outline (no WP write)
 *   node ai-write-blog.js --write                 # full run: write + images + create WP draft
 *   node ai-write-blog.js --topic="topic text"    # manual topic, skip GSC research
 *   node ai-write-blog.js --type=comparison       # force article type
 *   node ai-write-blog.js --id=123 --publish      # publish draft post ID 123
 *   node ai-write-blog.js --id=123 --reject       # delete draft post ID 123
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../..', '.env') });

const fs         = require('fs');
const path       = require('path');
const https      = require('https');
const crypto     = require('crypto');
const { spawnSync } = require('child_process');
const { wpGet, wpPost, wpPut, config } = require('./wp-client');
const { chatComplete }                 = require('./claudible-client');
const { findAndUpload }                = require('./unsplash-client');

// ── CLI arg parsing ──────────────────────────────────────────────────────────
const ARGV       = process.argv.slice(2);
const WRITE_MODE = ARGV.includes('--write');
const PUBLISH    = ARGV.includes('--publish');
const REJECT     = ARGV.includes('--reject');
const TOPIC_ARG  = (() => { const m = process.argv.join(' ').match(/--topic=(.+?)(?:\s--|$)/); return m ? m[1].trim().replace(/^["']|["']$/g, '') : null; })();
const TYPE_ARG   = (() => { const m = process.argv.join(' ').match(/--type=(\w+)/);  return m ? m[1] : null; })();
const POST_ID    = (() => { const m = process.argv.join(' ').match(/--id=(\d+)/);    return m ? +m[1] : null; })();

// ── Topic pool — fallback when GSC is unavailable ─────────────────────────────
// Used when GSC env vars missing or API returns no useful data.
const TOPIC_POOL = [
  'So sánh PLC B&R X20 và X20 hiệu suất cao — chọn model nào?',
  'Hướng dẫn kết nối X20 System với POWERLINK',
  'ACOPOS vs ACOPOSmulti — khác nhau gì?',
  'Ứng dụng B&R trong ngành đóng gói bao bì',
  'Lỗi thường gặp trên PLC B&R và cách khắc phục',
  'Automation Studio — hướng dẫn cài đặt và lập trình cơ bản',
  'Giải pháp tự động hóa nhà máy thực phẩm với B&R',
  'B&R X20CP3484 vs X20CP3485 — so sánh chi tiết',
  'Cách chọn servo drive ACOPOS phù hợp với ứng dụng',
  'SafeLOGIC B&R — giải pháp an toàn máy móc theo ISO 13849',
];

// ── System prompt for article writing ────────────────────────────────────────
// Comprehensive SEO semantic writing rules enforced via system prompt.
const WRITE_SYSTEM_PROMPT = `Bạn là chuyên gia nội dung SEO semantic cho Agow Automation — nhà phân phối chính thức thiết bị B&R Automation tại Việt Nam.

NHIỆM VỤ: Viết bài blog HTML hoàn chỉnh, chuẩn SEO semantic, bằng tiếng Việt.

QUY TẮC BẮT BUỘC:
1. Ngôn ngữ: tiếng Việt hoàn toàn. Thuật ngữ kỹ thuật giữ tiếng Anh (PLC, HMI, servo, I/O).
2. Độ dài:
   - comparison: 1000–1200 từ
   - how-to: 1200–1500 từ
   - use-case: 1000–1200 từ
   - product-intro: 800–1000 từ
3. Cấu trúc HTML:
   - <h1> chứa focus keyword (1 per article, bọc NGOÀI content — KHÔNG đặt trong html output)
   - <h2> cho mỗi section chính (từ outline)
   - <h3> cho subsections nếu cần
   - <p> cho paragraphs (KHÔNG dùng <br> để ngắt đoạn)
   - <ul><li> cho danh sách
   - <table> cho so sánh (bài comparison BẮT BUỘC có bảng)
4. Semantic SEO:
   - Focus keyword xuất hiện TỰ NHIÊN 3–5 lần trong toàn bài
   - LSI keywords: dùng từ đồng nghĩa, biến thể của keyword chính
   - Mỗi claim kỹ thuật CÓ context (VD: "RAM 512MB — đủ cho 10.000 I/O tags")
   - Mật độ focus keyword ≤ 1.5% (KHÔNG nhồi keyword)
   - Trả lời đầy đủ search intent — người đọc không cần Google thêm
5. Entity coverage:
   - Đề cập ≥3 entity liên quan (sản phẩm, công nghệ, ngành, chuẩn)
   - Chủ đề chính được giải thích đầy đủ trong 200 từ đầu
6. Nội dung chính xác:
   - KHÔNG bịa thông số kỹ thuật
   - Dùng tên sản phẩm B&R chính xác (ACOPOS, X20, Automation Studio)
   - Khi không chắc spec → dùng "liên hệ Agow để được tư vấn chi tiết"
7. Internal links:
   - Cuối bài: ≥2 link dạng <a href="/san-pham/[category]/">[Category]</a>
   - KHÔNG dùng href tuyệt đối (agowautomation.com) — dùng đường dẫn tương đối
8. FAQ section:
   - Bài how-to và comparison: BẮT BUỘC có section <h2>Câu hỏi thường gặp</h2> với ≥3 Q&A
   - Format: <h3>Câu hỏi?</h3><p>Trả lời...</p>
9. Kết luận:
   - Tóm tắt ≥100 từ
   - Một câu CTA nội bộ: "Tìm hiểu thêm về [category] tại Agow Automation"
   - KHÔNG CTA kiểu "Liên hệ ngay để được báo giá" trong kết luận
10. Đặt [IMAGE_1] và [IMAGE_2] ở vị trí phù hợp trong bài (sau H2 đầu tiên và giữa bài)
    — placeholder này sẽ được thay bằng thẻ <img> thực tế sau khi upload ảnh

OUTPUT FORMAT (JSON strict):
{
  "html": "<h2>...</h2><p>...",
  "excerpt": "...",
  "seo_title": "...",
  "meta_desc": "...",
  "focus_keyword": "...",
  "categories": ["tên category 1", "tên category 2"],
  "tags": ["tag1", "tag2", "tag3"]
}

Ghi chú JSON:
- "html": full article HTML, KHÔNG bao gồm <h1> (h1 sẽ được thêm bên ngoài)
- "excerpt": 150–160 ký tự, tiếng Việt
- "seo_title": ≤60 ký tự, chứa focus keyword
- "meta_desc": 140–155 ký tự, không CTA
`;

// ── GSC JWT Authentication (pure Node.js crypto, no external deps) ────────────

/**
 * Create a signed JWT for Google service account auth.
 * @param {string} clientEmail  — service account email
 * @param {string} privateKey   — PEM private key (with \n newlines)
 * @returns {string} signed JWT
 */
function createJWT(clientEmail, privateKey) {
  const header  = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const now     = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    iss:   clientEmail,
    scope: 'https://www.googleapis.com/auth/webmasters.readonly',
    aud:   'https://oauth2.googleapis.com/token',
    exp:   now + 3600,
    iat:   now,
  })).toString('base64url');

  const sigInput = `${header}.${payload}`;
  const sign     = crypto.createSign('RSA-SHA256');
  sign.update(sigInput);
  const sig = sign.sign(privateKey, 'base64url');
  return `${sigInput}.${sig}`;
}

/**
 * Exchange JWT for a Google OAuth2 access token.
 * @param {string} clientEmail
 * @param {string} privateKey
 * @returns {Promise<string>} access_token
 */
function getGSCToken(clientEmail, privateKey) {
  return new Promise((resolve, reject) => {
    const jwt  = createJWT(clientEmail, privateKey);
    const body = `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`;

    const options = {
      hostname: 'oauth2.googleapis.com',
      path:     '/token',
      method:   'POST',
      headers: {
        'Content-Type':   'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.access_token) {
            resolve(parsed.access_token);
          } else {
            reject(new Error(`GSC token error: ${data.slice(0, 200)}`));
          }
        } catch (e) {
          reject(new Error(`GSC token parse error: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('GSC token request timeout')); });
    req.write(body);
    req.end();
  });
}

/**
 * Fetch top GSC queries (last 30 days, impressions > 10).
 * Scores each query: position 11-20 → +3pts, 21-50 → +2pts, impressions>100 → +2pts.
 * Filters out queries that already have a matching page URL.
 *
 * @param {string} accessToken
 * @param {string} siteUrl  — e.g. "sc-domain:agowautomation.com"
 * @returns {Promise<Array<{query, impressions, position, score}>>} sorted by score desc
 */
function fetchGSCQueries(accessToken, siteUrl) {
  return new Promise((resolve, reject) => {
    const endDate   = new Date().toISOString().slice(0, 10);
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const bodyObj = {
      startDate,
      endDate,
      dimensions: ['query', 'page'],
      rowLimit:   100,
    };
    const bodyStr = JSON.stringify(bodyObj);

    const encodedSite = encodeURIComponent(siteUrl);
    const options     = {
      hostname: 'www.googleapis.com',
      path:     `/webmasters/v3/sites/${encodedSite}/searchAnalytics/query`,
      method:   'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type':  'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const rows   = parsed.rows || [];

          // Score and filter rows
          // Each row: { keys: [query, page], clicks, impressions, ctr, position }
          const seen    = new Set();  // dedup queries
          const results = [];

          for (const row of rows) {
            const query      = row.keys[0] || '';
            const page       = row.keys[1] || '';
            const impressions = row.impressions || 0;
            const position    = row.position    || 0;

            // Skip queries with impressions <= 10
            if (impressions <= 10) continue;

            // Skip if query already has a matching page URL (already has coverage)
            if (page && page !== siteUrl) continue;

            // Deduplicate same query appearing in multiple rows
            if (seen.has(query)) continue;
            seen.add(query);

            // Score: target position 11-50 (opportunity zone)
            let score = 0;
            if (position >= 11 && position <= 20) score += 3;
            else if (position >= 21 && position <= 50) score += 2;
            if (impressions > 100) score += 2;

            results.push({ query, impressions, position, score });
          }

          // Sort by score descending, then impressions
          results.sort((a, b) => b.score - a.score || b.impressions - a.impressions);
          resolve(results);
        } catch (e) {
          reject(new Error(`GSC response parse error: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('GSC query request timeout')); });
    req.write(bodyStr);
    req.end();
  });
}

// ── Phase 1: Research topic ───────────────────────────────────────────────────

/**
 * Determine the article topic.
 * Priority: --topic arg → GSC opportunity queries → fallback topic pool.
 *
 * @returns {Promise<{topic: string, source: string}>}
 */
async function researchTopic() {
  // Manual topic from CLI
  if (TOPIC_ARG) {
    console.log(`📌 Topic (manual): ${TOPIC_ARG}`);
    return { topic: TOPIC_ARG, source: 'manual' };
  }

  // Try GSC
  const clientEmail = process.env.GSC_CLIENT_EMAIL;
  const privateKey  = (process.env.GSC_PRIVATE_KEY || '').replace(/\n/g, '\n');
  const siteUrl     = process.env.GSC_SITE_URL;

  if (clientEmail && privateKey && siteUrl) {
    try {
      console.log('🔍 Fetching GSC top queries...');
      const token   = await getGSCToken(clientEmail, privateKey);
      const queries = await fetchGSCQueries(token, siteUrl);

      if (queries.length > 0) {
        const best = queries[0];
        console.log(`✅ GSC topic selected: "${best.query}" (position ${best.position.toFixed(1)}, ${best.impressions} impressions, score ${best.score})`);
        return { topic: best.query, source: 'gsc' };
      }
      console.warn('⚠️  GSC returned no opportunity queries — falling back to topic pool');
    } catch (e) {
      console.warn(`⚠️  GSC unavailable: ${e.message} — falling back to topic pool`);
    }
  } else {
    console.log('ℹ️  GSC not configured (missing GSC_CLIENT_EMAIL/GSC_PRIVATE_KEY/GSC_SITE_URL)');
    console.log('   → Using topic pool fallback');
  }

  // Fallback: shuffle TOPIC_POOL, pick first
  const shuffled = [...TOPIC_POOL].sort(() => Math.random() - 0.5);
  const topic    = shuffled[0];
  console.log(`📚 Topic (pool): ${topic}`);
  return { topic, source: 'pool' };
}

// ── Phase 2: Classify + Outline ───────────────────────────────────────────────

/**
 * Classify article type, generate focus keyword, title, H2 outline,
 * and an English Unsplash query — all in one Claude call.
 *
 * @param {string} topic
 * @returns {Promise<{type, focus_keyword, title, meta_title, outline, unsplash_query}>}
 */
async function buildOutline(topic) {
  // Pre-classify type from topic keywords to help Claude confirm
  let suggestedType = 'product-intro';
  if (/vs|so\s+sánh|khác\s+nhau|chọn\s+model/i.test(topic))       suggestedType = 'comparison';
  else if (/hướng\s+dẫn|cách|tutorial|cài\s+đặt/i.test(topic))    suggestedType = 'how-to';
  else if (/ứng\s+dụng|giải\s+pháp|ngành/i.test(topic))            suggestedType = 'use-case';

  // Override with CLI --type if provided
  const forcedType = TYPE_ARG || null;

  const systemMsg = `Bạn là chuyên gia SEO semantic cho Agow Automation — nhà phân phối thiết bị B&R tại Việt Nam.
Nhiệm vụ: phân loại loại bài viết và tạo outline SEO semantic.`;

  const userMsg = `Chủ đề bài viết: "${topic}"
Loại bài gợi ý: ${forcedType || suggestedType}

Hãy phân tích chủ đề và trả về JSON với format CHÍNH XÁC sau (không giải thích thêm):
{
  "type": "${forcedType || 'comparison|how-to|use-case|product-intro'}",
  "focus_keyword": "3-5 từ khóa chính (tiếng Việt)",
  "title": "tiêu đề bài ≤60 ký tự",
  "meta_title": "meta title ≤60 ký tự chứa focus keyword",
  "outline": [
    "H2 heading 1",
    "H2 heading 2",
    "H2 heading 3",
    "H2 heading 4",
    "H2 heading 5"
  ],
  "unsplash_query": "english search query for industrial automation images (3-5 words)"
}

Quy tắc:
- type phải là một trong: comparison, how-to, use-case, product-intro${forcedType ? `\n- BẮT BUỘC dùng type="${forcedType}"` : ''}
- outline: 5-7 headings, phủ đầy đủ search intent của chủ đề
- unsplash_query: tiếng Anh, mô tả ảnh công nghiệp phù hợp (không dùng tên riêng B&R)`;

  console.log('\n⚙️  Phase 2: Classify + Outline...');
  const raw = await chatComplete(
    [
      { role: 'system', content: systemMsg },
      { role: 'user',   content: userMsg },
    ],
    { maxTokens: 4096, temperature: 0.4 }
  );

  const outline = parseJSON(raw, 'outline');
  if (!outline || !outline.type || !Array.isArray(outline.outline)) {
    throw new Error(`Failed to parse outline JSON from Claude: ${raw.slice(0, 300)}`);
  }

  // Enforce forced type if CLI --type was given
  if (forcedType) outline.type = forcedType;

  console.log(`   Type: ${outline.type}`);
  console.log(`   Keyword: ${outline.focus_keyword}`);
  console.log(`   Title: ${outline.title}`);
  console.log(`   Outline: ${outline.outline.length} headings`);
  console.log(`   Unsplash query: "${outline.unsplash_query}"`);

  return outline;
}

// ── Phase 3: Write full article ───────────────────────────────────────────────

/**
 * Write the complete blog article HTML + SEO meta via Claude.
 *
 * @param {string} topic
 * @param {object} outline   — {type, focus_keyword, title, outline, unsplash_query}
 * @returns {Promise<object>} — {html, excerpt, seo_title, meta_desc, focus_keyword, categories, tags}
 */
async function writeArticle(topic, outline) {
  const userMsg = `Chủ đề: "${topic}"
Loại bài: ${outline.type}
Focus keyword: ${outline.focus_keyword}
Outline (H2 headings theo thứ tự):
${outline.outline.map((h, i) => `${i + 1}. ${h}`).join('\n')}

Viết bài hoàn chỉnh theo outline trên. Đặt [IMAGE_1] sau H2 đầu tiên, [IMAGE_2] giữa bài.
Trả về JSON theo format đã quy định trong system prompt.`;

  console.log('\n✍️  Phase 3: Writing article...');
  const raw = await chatComplete(
    [
      { role: 'system', content: WRITE_SYSTEM_PROMPT },
      { role: 'user',   content: userMsg },
    ],
    { maxTokens: 8192, temperature: 0.4 }
  );

  const article = parseJSON(raw, 'article');
  if (!article || !article.html || !article.seo_title) {
    throw new Error(`Failed to parse article JSON from Claude: ${raw.slice(0, 400)}`);
  }

  // Validate key fields and fix if possible
  if (!article.focus_keyword) article.focus_keyword = outline.focus_keyword;
  if (!article.categories || !article.categories.length) article.categories = ['B&R Automation'];
  if (!article.tags || !article.tags.length) article.tags = [outline.focus_keyword];

  // Trim meta_desc to 155 chars at word boundary if over
  if (article.meta_desc && article.meta_desc.length > 160) {
    const cut = article.meta_desc.lastIndexOf(' ', 155);
    article.meta_desc = article.meta_desc.slice(0, cut > 0 ? cut : 155).trim();
  }

  console.log(`   SEO title (${article.seo_title.length}c): ${article.seo_title}`);
  console.log(`   Meta desc (${(article.meta_desc || '').length}c): ${(article.meta_desc || '').slice(0, 80)}...`);
  console.log(`   HTML length: ${article.html.length} chars`);
  console.log(`   Categories: ${(article.categories || []).join(', ')}`);

  return article;
}

// ── Phase 4: Images via Unsplash ──────────────────────────────────────────────

/**
 * Find and upload images, then inject into article HTML.
 * Replaces [IMAGE_1] and [IMAGE_2] placeholders with <figure> tags.
 * If Unsplash fails, returns html unchanged (non-blocking).
 *
 * @param {string} html          — article HTML with [IMAGE_1] [IMAGE_2] placeholders
 * @param {string} unsplashQuery — English search query
 * @param {string} slug          — article slug for filename
 * @returns {Promise<{html: string, images: Array}>}
 */
async function injectImages(html, unsplashQuery, slug) {
  console.log(`\n🖼️  Phase 4: Images (Unsplash: "${unsplashQuery}")...`);

  let images = [];
  try {
    images = await findAndUpload(unsplashQuery, slug, 2);
    console.log(`   Uploaded: ${images.length} image(s)`);
  } catch (e) {
    console.warn(`   ⚠️  Unsplash failed (${e.message}) — continuing without images`);
    // Replace placeholders with empty string so HTML is still valid
    html = html.replace(/\[IMAGE_1\]/g, '').replace(/\[IMAGE_2\]/g, '');
    return { html, images: [] };
  }

  // Replace placeholders with <figure> tags
  for (let i = 0; i < 2; i++) {
    const placeholder = `[IMAGE_${i + 1}]`;
    const img         = images[i];
    if (img) {
      const figureHtml = `<figure><img src="${img.url}" alt="${unsplashQuery}" loading="lazy" /><figcaption>${img.caption}</figcaption></figure>`;
      html = html.replace(placeholder, figureHtml);
    } else {
      // No image available for this slot — remove placeholder
      html = html.replace(placeholder, '');
    }
  }

  return { html, images };
}

// ── Phase 5: Create WP draft ──────────────────────────────────────────────────

/**
 * Find an existing WP category by name, or create it if not found.
 * @param {string} name
 * @returns {Promise<number>} category ID
 */
async function findOrCreateCategory(name) {
  // Search for existing category
  const searchRes = await wpGet(`/wp-json/wp/v2/categories?search=${encodeURIComponent(name)}&_fields=id,name`);
  if (searchRes.ok && Array.isArray(searchRes.body) && searchRes.body.length > 0) {
    // Find exact match (case-insensitive)
    const exact = searchRes.body.find(c => c.name.toLowerCase() === name.toLowerCase());
    if (exact) return exact.id;
    // Partial match — use first result
    return searchRes.body[0].id;
  }

  // Create new category
  const createRes = await wpPost('/wp-json/wp/v2/categories', { name });
  if (createRes.ok && createRes.body && createRes.body.id) {
    console.log(`   Created category: "${name}" (ID: ${createRes.body.id})`);
    return createRes.body.id;
  }

  console.warn(`   ⚠️  Could not create category "${name}" (status: ${createRes.status})`);
  return null;
}

/**
 * Resolve all category names to WP category IDs.
 * @param {string[]} categoryNames
 * @returns {Promise<number[]>} array of valid IDs
 */
async function findOrCreateCategories(categoryNames) {
  const ids = [];
  for (const name of categoryNames) {
    const id = await findOrCreateCategory(name.trim());
    if (id) ids.push(id);
  }
  return ids;
}

/**
 * Create WordPress draft post with SEO meta.
 *
 * @param {object} article   — {html, seo_title, excerpt, meta_desc, focus_keyword, categories, tags}
 * @param {string} title     — H1 title (from outline)
 * @param {Array}  images    — [{id, url, caption}] from Unsplash upload
 * @returns {Promise<{id: number, link: string}>}
 */
async function createDraft(article, title, images) {
  console.log('\n📝 Phase 5: Creating WP draft...');

  // Resolve category IDs
  const categoryIds = await findOrCreateCategories(article.categories || []);
  console.log(`   Categories resolved: ${categoryIds.join(', ') || '(none)'}`);

  // Build post content: <h1> wraps outside the article html
  const postContent = `<h1>${title}</h1>\n${article.html}`;

  const postBody = {
    title:          article.seo_title,
    content:        postContent,
    excerpt:        article.excerpt || '',
    status:         'draft',
    categories:     categoryIds,
    meta: {
      rank_math_title:         article.seo_title,
      rank_math_description:   article.meta_desc || '',
      rank_math_focus_keyword: article.focus_keyword || '',
    },
    featured_media: images && images[0] ? images[0].id : 0,
  };

  const res = await wpPost('/wp-json/wp/v2/posts', postBody);
  if (!res.ok || !res.body || !res.body.id) {
    throw new Error(`WP post creation failed: status=${res.status} — ${JSON.stringify(res.body).slice(0, 200)}`);
  }

  console.log(`   ✅ Draft created: ID ${res.body.id}`);
  return { id: res.body.id, link: res.body.link || '' };
}

// ── Phase 6: Notify (console output for Telegram forwarding) ──────────────────

/**
 * Print formatted notification that Khoa can forward to Telegram.
 * @param {object} article   — {seo_title, focus_keyword}
 * @param {string} type      — article type
 * @param {object} draft     — {id, link}
 */
function notify(article, type, draft) {
  const previewUrl = `${config.BASE_URL}/?p=${draft.id}&preview=true`;
  console.log('\n' + '═'.repeat(60));
  console.log('✅ Bài viết mới đã tạo draft:');
  console.log(`📝 ${article.seo_title}`);
  console.log(`🔑 Keyword: ${article.focus_keyword}`);
  console.log(`📊 Loại: ${type}`);
  console.log(`🔗 Preview: ${previewUrl}`);
  console.log(`🆔 Draft ID: ${draft.id}`);
  console.log('');
  console.log('→ Gõ "OK ' + draft.id + '" để publish, "REJECT ' + draft.id + '" để xóa');
  console.log('═'.repeat(60));
}

// ── Publish / Reject handlers ─────────────────────────────────────────────────

/**
 * Publish a draft post (change status from 'draft' to 'publish').
 * Also triggers LiteSpeed cache purge after publish.
 * @param {number} postId
 */
async function publishDraft(postId) {
  console.log(`\n🚀 Publishing post ID ${postId}...`);
  const res = await wpPut(`/wp-json/wp/v2/posts/${postId}`, { status: 'publish' });

  if (!res.ok) {
    throw new Error(`Publish failed: status=${res.status} — ${JSON.stringify(res.body).slice(0, 200)}`);
  }

  const link = res.body && res.body.link ? res.body.link : '(link unavailable)';
  console.log(`✅ Published: ${link}`);

  // Purge LiteSpeed cache (LESSON-001: always purge after WP changes)
  console.log('🧹 Purging LiteSpeed cache...');
  const purgeScript = path.join(__dirname, 'purge-cache.js');
  if (fs.existsSync(purgeScript)) {
    const result = spawnSync(process.execPath, [purgeScript], {
      stdio: 'inherit',
      env:   process.env,
    });
    if (result.status !== 0) {
      console.warn('   ⚠️  Cache purge script exited with non-zero status');
    }
  } else {
    console.warn('   ⚠️  purge-cache.js not found — purge manually via WP Admin');
  }
}

/**
 * Delete (reject) a draft post permanently.
 * @param {number} postId
 */
async function rejectDraft(postId) {
  console.log(`\n🗑️  Deleting post ID ${postId}...`);
  // force=true skips trash and permanently deletes
  const res = await wpPost(`/wp-json/wp/v2/posts/${postId}?force=true`, null);

  // WP returns 200 with trashed post or 200 with deleted: true
  if (res.ok) {
    console.log(`✅ Post ${postId} deleted.`);
  } else {
    throw new Error(`Delete failed: status=${res.status} — ${JSON.stringify(res.body).slice(0, 200)}`);
  }
}

// ── JSON parsing helper ───────────────────────────────────────────────────────

/**
 * Parse JSON from Claude response.
 * Claude sometimes wraps JSON in ```json ... ``` code fences — handle that.
 * @param {string} text   — raw Claude response text
 * @param {string} label  — description for error messages (e.g. 'outline', 'article')
 * @returns {object|null}
 */
function parseJSON(text, label = 'response') {
  if (!text) return null;

  let s = text.trim();

  // Strip code fence: ```json ... ``` or ``` ... ```
  const fenceMatch = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    s = fenceMatch[1].trim();
  }

  // Try direct parse
  try {
    return JSON.parse(s);
  } catch (e1) {
    // Try extracting first {...} block
    const jsonMatch = s.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (e2) {
        console.warn(`   ⚠️  JSON parse failed for ${label}: ${e2.message}`);
      }
    }
    console.warn(`   ⚠️  Could not extract JSON for ${label}: ${e1.message}`);
    return null;
  }
}

// ── Slug generation ───────────────────────────────────────────────────────────

/**
 * Convert a Vietnamese topic string to a URL-safe ASCII slug.
 * Strips diacritics, lowercases, replaces spaces with hyphens.
 * @param {string} topic
 * @returns {string} slug (max 40 chars)
 */
function makeSlug(topic) {
  // Basic ASCII normalization — strip non-alphanumeric (preserves hyphens temporarily)
  return topic
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 40);
}

// ── DELETE helper using WP REST (force delete) ────────────────────────────────
// wp-client exposes wpPost/wpPut but not wpDelete — implement inline.
function wpDelete(postPath) {
  // Reuse wpPut with DELETE method via the underlying request function
  // Actually wp-client.js exports `request` — but we didn't import it.
  // Use wpPost with the ?force=true pattern: WP REST accepts DELETE via
  // a POST with X-HTTP-Method-Override header, but the simplest approach
  // is to use Node https directly here.
  return new Promise((resolve) => {
    const https2 = require('https');
    const http2  = require('http');
    const url    = config.BASE_URL + postPath;
    const parsed = new URL(url);
    const lib    = parsed.protocol === 'https:' ? https2 : http2;

    const opts = {
      hostname: parsed.hostname,
      port:     parsed.port || undefined,
      path:     parsed.pathname + parsed.search,
      method:   'DELETE',
      headers: {
        'Authorization': 'Basic ' + config.AUTH,
        'Content-Type':  'application/json',
        'User-Agent':    'wp-seo-tools/1.0',
      },
    };

    const req = lib.request(opts, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try {
          resolve({ ok: res.statusCode < 300, status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ ok: res.statusCode < 300, status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', (e) => resolve({ ok: false, status: 0, body: null, error: e.message }));
    req.setTimeout(30000, () => { req.destroy(); resolve({ ok: false, status: 0, body: null, error: 'timeout' }); });
    req.end();
  });
}

// ── Main orchestrator ─────────────────────────────────────────────────────────

async function main() {
  // ── Handle --publish mode ──────────────────────────────────────────────────
  if (PUBLISH && POST_ID) {
    await publishDraft(POST_ID);
    return;
  }

  // ── Handle --reject mode ───────────────────────────────────────────────────
  if (REJECT && POST_ID) {
    console.log(`\n🗑️  Deleting draft post ID ${POST_ID}...`);
    const res = await wpDelete(`/wp-json/wp/v2/posts/${POST_ID}?force=true`);
    if (res.ok) {
      console.log(`✅ Post ${POST_ID} deleted.`);
    } else {
      throw new Error(`Delete failed: status=${res.status} — ${JSON.stringify(res.body || '').slice(0, 200)}`);
    }
    return;
  }

  // ── Full blog writing workflow ─────────────────────────────────────────────
  console.log('');
  console.log('═'.repeat(60));
  console.log('  Agow Blog Writer — ai-write-blog.js');
  console.log(`  Mode: ${WRITE_MODE ? 'WRITE (full run)' : 'DRY-RUN (research + outline only)'}`);
  console.log('═'.repeat(60));
  console.log('');

  // Phase 1: Research topic
  const { topic, source } = await researchTopic();

  // Phase 2: Classify + Outline
  const outline = await buildOutline(topic);

  // Generate slug from topic
  const slug = makeSlug(topic);

  // ── Dry-run exits here ─────────────────────────────────────────────────────
  if (!WRITE_MODE) {
    console.log('\n' + '─'.repeat(60));
    console.log('DRY-RUN complete (no WP changes made).');
    console.log('');
    console.log(`Topic source  : ${source}`);
    console.log(`Topic         : ${topic}`);
    console.log(`Article type  : ${outline.type}`);
    console.log(`Focus keyword : ${outline.focus_keyword}`);
    console.log(`Title         : ${outline.title}`);
    console.log(`Slug          : ${slug}`);
    console.log('');
    console.log('H2 Outline:');
    (outline.outline || []).forEach((h, i) => console.log(`  ${i + 1}. ${h}`));
    console.log('');
    console.log('→ Run with --write to generate full article and create WP draft.');
    console.log('─'.repeat(60));
    return;
  }

  // Phase 3: Write article
  const article = await writeArticle(topic, outline);

  // Phase 4: Images
  const { html: htmlWithImages, images } = await injectImages(
    article.html,
    outline.unsplash_query || 'industrial automation control panel',
    slug
  );
  article.html = htmlWithImages;

  // Phase 5: Create WP draft
  const draft = await createDraft(article, outline.title, images);

  // Phase 6: Notify
  notify(article, outline.type, draft);
}

// ── Entry point ───────────────────────────────────────────────────────────────
main().catch(e => {
  console.error('\n❌ Fatal error:', e.message);
  if (process.env.DEBUG) console.error(e.stack);
  process.exit(1);
});
