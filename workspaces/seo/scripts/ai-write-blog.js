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
const { chatComplete }                 = require('./claudible-client');   // outline only (small output)
const { chatComplete: geminiComplete } = require('./gemini-client');       // article writing (large output, no timeout)
const { searchImages }                 = require('./google-image-search');

// ── CLI arg parsing ──────────────────────────────────────────────────────────
const ARGV       = process.argv.slice(2);
const WRITE_MODE = ARGV.includes('--write');
const PUBLISH    = ARGV.includes('--publish');
const REJECT     = ARGV.includes('--reject');
const SCHEDULE   = ARGV.includes('--schedule');
const TOPIC_ARG  = (() => { const m = process.argv.join(' ').match(/--topic=(.+?)(?:\s--|$)/); return m ? m[1].trim().replace(/^["']|["']$/g, '') : null; })();
const TYPE_ARG   = (() => { const m = process.argv.join(' ').match(/--type=(\w+)/);  return m ? m[1] : null; })();
const POST_ID    = (() => { const m = process.argv.join(' ').match(/--id=(\d+)/);    return m ? +m[1] : null; })();
const DATE_ARG   = (() => { const m = process.argv.join(' ').match(/--date=([\d\-T:]+)/); return m ? m[1] : null; })();

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
      dimensions: ['query'],
      rowLimit:   200,
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

          // Score and filter rows — find "opportunity" queries:
          // position 4-20 (ranking but not top 3) + enough impressions to be worth writing about
          const results = [];

          for (const row of rows) {
            const query       = row.keys[0] || '';
            const impressions = row.impressions || 0;
            const position    = row.position    || 0;

            // Skip branded/generic single-word queries (not writeable as blog topics)
            if (query.split(' ').length < 2) continue;

            // Skip queries with too few impressions
            if (impressions < 5) continue;

            // Opportunity zone: position 4-30 (has impressions but not yet top 3)
            if (position < 4 || position > 30) continue;

            // Score: higher = better opportunity
            let score = 0;
            if (position >= 4  && position <= 10) score += 2;  // page 1, not top 3
            if (position >= 11 && position <= 20) score += 3;  // page 2 — highest opportunity
            if (position >= 21 && position <= 30) score += 1;  // page 3
            if (impressions >= 20)  score += 1;
            if (impressions >= 100) score += 1;

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

  // Try GSC — load credentials from JSON file (GSC_CREDENTIALS) or individual env vars
  let clientEmail, privateKey;
  const siteUrl = process.env.GSC_SITE_URL;

  const credFile = process.env.GSC_CREDENTIALS;
  if (credFile) {
    // Resolve relative to project root (3 levels up from scripts/)
    const credPath = path.isAbsolute(credFile)
      ? credFile
      : path.resolve(__dirname, '../../..', credFile);
    try {
      const cred = JSON.parse(fs.readFileSync(credPath, 'utf-8'));
      clientEmail = cred.client_email;
      privateKey  = cred.private_key;
    } catch (e) {
      console.warn(`⚠️  Cannot read GSC_CREDENTIALS file "${credPath}": ${e.message}`);
    }
  } else {
    // Fallback: individual env vars
    clientEmail = process.env.GSC_CLIENT_EMAIL;
    privateKey  = (process.env.GSC_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  }

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
    console.log('ℹ️  GSC not configured (set GSC_CREDENTIALS + GSC_SITE_URL in .env)');
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
 * and an English Google CSE image query — all in one Claude call.
 *
 * @param {string} topic
 * @returns {Promise<{type, focus_keyword, title, meta_title, outline, image_query}>}
 */
async function buildOutline(topic) {
  // Pre-classify type from topic keywords to help AI confirm
  let suggestedType = 'product-intro';
  if (/vs|so\s+sánh|khác\s+nhau|chọn\s+model/i.test(topic))       suggestedType = 'comparison';
  else if (/hướng\s+dẫn|cách|tutorial|cài\s+đặt/i.test(topic))    suggestedType = 'how-to';
  else if (/ứng\s+dụng|giải\s+pháp|ngành/i.test(topic))            suggestedType = 'use-case';

  // Override with CLI --type if provided
  const forcedType = TYPE_ARG || null;

  // Word count target per type (used downstream in writeArticle)
  const WORD_TARGETS = {
    'comparison':    { total: 1100, sections: 180 },
    'how-to':        { total: 1350, sections: 200 },
    'use-case':      { total: 1100, sections: 180 },
    'product-intro': { total:  900, sections: 150 },
  };

  // Required structural sections per type — injected into writeArticle prompt
  const REQUIRED_SECTIONS = {
    'comparison':    'BẮT BUỘC: 1 bảng <table> so sánh specs/tính năng, section "Câu hỏi thường gặp" với ≥3 Q&A',
    'how-to':        'BẮT BUỘC: các bước đánh số <ol><li>, section "Câu hỏi thường gặp" với ≥3 Q&A',
    'use-case':      'BẮT BUỘC: ≥1 ví dụ ứng dụng thực tế cụ thể, danh sách lợi ích <ul>',
    'product-intro': 'BẮT BUỘC: bảng thông số kỹ thuật chính <table> (nếu có), danh sách tính năng <ul>',
  };

  const systemMsg = `Bạn là chuyên gia SEO semantic cho Agow Automation — nhà phân phối thiết bị B&R tại Việt Nam.
Nhiệm vụ: phân loại loại bài viết, tạo outline SEO semantic, và xác định LSI keywords.`;

  const userMsg = `Chủ đề bài viết: "${topic}"
Loại bài gợi ý: ${forcedType || suggestedType}

Trả về JSON với format CHÍNH XÁC sau (không giải thích thêm):
{
  "type": "${forcedType || 'comparison|how-to|use-case|product-intro'}",
  "focus_keyword": "3-5 từ khóa chính (tiếng Việt)",
  "lsi_keywords": ["từ đồng nghĩa 1", "biến thể 2", "entity liên quan 3", "thuật ngữ kỹ thuật 4"],
  "title": "tiêu đề bài ≤60 ký tự, chứa focus keyword",
  "outline": [
    "H2 heading 1 — mô tả ngắn mục tiêu section (≤8 từ)",
    "H2 heading 2",
    "H2 heading 3",
    "H2 heading 4",
    "H2 heading 5"
  ],
  "image_query_1": "english query for IMAGE_1 (after H2 #1): MUST include exact B&R product/technology name from topic, 4-7 words",
  "image_query_2": "english query for IMAGE_2 (middle of article): MUST include exact B&R product/technology name relevant to that section, 4-7 words"
}

Quy tắc:
- type phải là một trong: comparison, how-to, use-case, product-intro${forcedType ? `\n- BẮT BUỘC dùng type="${forcedType}"` : ''}
- focus_keyword: MỘT cụm từ duy nhất (không dấu phẩy, không slash), 3-5 từ, người dùng thực sự tìm trên Google tiếng Việt
- lsi_keywords: 4 từ/cụm liên quan — entity, synonym, kỹ thuật chuyên ngành. Không lặp focus_keyword
- outline: 5-7 headings, phủ đầy đủ search intent; heading cuối phải là "Kết luận" hoặc tổng kết
- image_query_1: tiếng Anh, BẮT BUỘC chứa tên sản phẩm/công nghệ B&R cụ thể từ topic (VD: "ACOPOS servo drive", "X20 PLC module", "ACOPOSmulti axis"). KHÔNG dùng mô tả generic như "industrial automation controller"
- image_query_2: tiếng Anh, BẮT BUỘC chứa tên sản phẩm/công nghệ B&R khác hoặc khía cạnh kỹ thuật cụ thể của bài (VD: bài comparison → query slot 2 dùng tên sản phẩm thứ 2; bài how-to → dùng tên phần mềm/tool cụ thể)
- Với bài comparison (VD: "ACOPOS vs ACOPOSmulti"): image_query_1 = sản phẩm đầu tiên, image_query_2 = sản phẩm thứ hai`;

  console.log('\n⚙️  Phase 2: Classify + Outline...');
  const raw = await chatComplete(
    [
      { role: 'system', content: systemMsg },
      { role: 'user',   content: userMsg },
    ],
    { maxTokens: 1024, temperature: 0.4 }
  );

  const outline = parseJSON(raw, 'outline');
  if (!outline || !outline.type || !Array.isArray(outline.outline)) {
    throw new Error(`Failed to parse outline JSON: ${raw.slice(0, 300)}`);
  }

  // Enforce forced type
  if (forcedType) outline.type = forcedType;

  // Attach derived fields used by writeArticle
  outline.word_target      = WORD_TARGETS[outline.type]  || WORD_TARGETS['product-intro'];
  outline.required_sections = REQUIRED_SECTIONS[outline.type] || '';

  // Ensure lsi_keywords is always an array
  if (!Array.isArray(outline.lsi_keywords)) outline.lsi_keywords = [];

  // Normalise image queries (strip brand names — done later in searchAndPendImages)
  if (!outline.image_query_1) outline.image_query_1 = `${outline.focus_keyword || topic} B&R`;
  if (!outline.image_query_2) outline.image_query_2 = `${outline.focus_keyword || topic} B&R automation`;

  // Validate outline length
  if (outline.outline.length < 4) {
    throw new Error(`Outline quá ngắn (${outline.outline.length} headings) — cần ≥4`);
  }

  console.log(`   Type         : ${outline.type}`);
  console.log(`   Keyword      : ${outline.focus_keyword}`);
  console.log(`   LSI          : ${outline.lsi_keywords.join(', ')}`);
  console.log(`   Title        : ${outline.title}`);
  console.log(`   Headings     : ${outline.outline.length}`);
  console.log(`   Word target  : ${outline.word_target.total}`);
  console.log(`   Image query 1: "${outline.image_query_1}"`);
  console.log(`   Image query 2: "${outline.image_query_2}"`);

  return outline;
}

// ── Phase 3: Write full article ───────────────────────────────────────────────

// System prompt for HTML writing only (no JSON wrapper — avoids truncation)
const WRITE_HTML_PROMPT = `Bạn là chuyên gia nội dung SEO semantic cho Agow Automation — nhà phân phối chính thức thiết bị B&R Automation tại Việt Nam.

NHIỆM VỤ: Viết phần body HTML của bài blog SEO semantic, bằng tiếng Việt.

QUY TẮC HTML:
1. Ngôn ngữ: tiếng Việt hoàn toàn. Thuật ngữ kỹ thuật giữ tiếng Anh (PLC, HMI, servo, I/O).
2. KHÔNG bao gồm <h1> — sẽ được thêm bên ngoài.
3. Cấu trúc: <h2> cho mỗi section, <h3> cho subsections, <p> cho paragraphs, <ul><li> cho danh sách.
4. KHÔNG dùng <br> để ngắt đoạn — chỉ dùng <p>.
5. Focus keyword xuất hiện TỰ NHIÊN 3–5 lần. Mật độ ≤ 1.5%.
6. LSI keywords dùng tự nhiên trong bài, không lặp lại cứng nhắc.
7. Mỗi claim kỹ thuật CÓ context cụ thể.
8. Internal links cuối bài: ≥2 link — LẤY CHÍNH XÁC từ danh sách "Danh mục sản phẩm thực tế" được cung cấp trong user message. KHÔNG tự bịa URL.
9. Đặt [IMAGE_1] sau H2 đầu tiên, [IMAGE_2] ở giữa bài (nếu bài đủ dài).
10. KHÔNG có JSON, KHÔNG có markdown — chỉ HTML thuần.

OUTPUT: Chỉ trả về HTML body thuần, bắt đầu ngay bằng <h2>...`;

/**
 * Fetch top WooCommerce product categories from WP API.
 * Returns list of {name, link} for injection into the writing prompt.
 * Falls back to empty array on error (article is still written, just without real links).
 * @returns {Promise<Array<{name: string, link: string}>>}
 */
async function fetchProductCategories() {
  try {
    const res = await wpGet('/wp-json/wp/v2/product_cat?per_page=30&orderby=count&order=desc&_fields=id,name,link&hide_empty=true');
    if (!res.ok || !Array.isArray(res.body)) return [];
    return res.body
      .filter(c => c.name && c.name !== 'Uncategorized' && c.link)
      .map(c => ({
        name: c.name,
        // Convert absolute URL → relative path (strip domain)
        link: c.link.replace(/^https?:\/\/[^/]+/, ''),
      }));
  } catch {
    return [];
  }
}

/**
 * Write the complete blog article — split into 2 Gemini calls to avoid token truncation:
 *   Call A: write HTML body (large output, no JSON overhead)
 *   Call B: generate meta fields from the HTML (small output)
 *
 * @param {string} topic
 * @param {object} outline   — {type, focus_keyword, lsi_keywords, title, outline, word_target, required_sections}
 * @returns {Promise<object>} — {html, excerpt, seo_title, meta_desc, focus_keyword, categories, tags}
 */
async function writeArticle(topic, outline) {
  const lsiLine = outline.lsi_keywords && outline.lsi_keywords.length
    ? `LSI keywords (dùng tự nhiên): ${outline.lsi_keywords.join(', ')}`
    : '';

  // Fetch real category URLs to inject into prompt — prevents AI from making up links
  const cats = await fetchProductCategories();
  const catLinksLine = cats.length
    ? `Danh mục sản phẩm thực tế (dùng cho internal links cuối bài):\n` +
      cats.slice(0, 15).map(c => `  - <a href="${c.link}">${c.name}</a>`).join('\n')
    : '';

  // ── Call A: write HTML body ──────────────────────────────────────────────────
  const htmlUserMsg = `Chủ đề: "${topic}"
Loại bài: ${outline.type}
Mục tiêu: ~${outline.word_target ? outline.word_target.total : 1000} từ (~${outline.word_target ? outline.word_target.sections : 150} từ/section)
Focus keyword: ${outline.focus_keyword}
${lsiLine}
Yêu cầu cấu trúc bắt buộc: ${outline.required_sections || ''}
${catLinksLine}

Outline (H2 headings theo thứ tự):
${outline.outline.map((h, i) => `${i + 1}. ${h}`).join('\n')}

Viết bài hoàn chỉnh theo outline. Đặt [IMAGE_1] sau H2 đầu tiên, [IMAGE_2] giữa bài.
Cuối bài: chèn ≥2 internal link LẤY CHÍNH XÁC từ danh mục sản phẩm thực tế ở trên (không tự bịa link).`;

  console.log('\n✍️  Phase 3a: Writing HTML body (Gemini)...');
  const htmlRaw = await geminiComplete(
    [
      { role: 'system', content: WRITE_HTML_PROMPT },
      { role: 'user',   content: htmlUserMsg },
    ],
    { maxTokens: 8192, temperature: 0.4 }
  );

  // Strip any accidental markdown fences
  const html = htmlRaw.replace(/^```(?:html)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  if (!html.startsWith('<')) {
    throw new Error(`Gemini HTML output không hợp lệ: ${html.slice(0, 200)}`);
  }
  console.log(`   HTML length: ${html.length} chars`);

  // ── Call B: generate meta fields from HTML ───────────────────────────────────
  const metaUserMsg = `Dựa trên bài viết HTML sau, tạo các trường SEO meta.

Chủ đề: "${topic}"
Focus keyword: ${outline.focus_keyword}
Loại bài: ${outline.type}

BÀI VIẾT (đầu):
${html.slice(0, 1500)}

Trả về JSON CHÍNH XÁC (không giải thích):
{
  "seo_title": "≤60 ký tự, chứa focus keyword",
  "meta_desc": "140–155 ký tự, không CTA, tóm tắt giá trị bài",
  "excerpt": "150–160 ký tự tiếng Việt cho WP excerpt",
  "categories": ["tên category 1"],
  "tags": ["tag1", "tag2", "tag3"]
}`;

  console.log('   Phase 3b: Generating meta fields...');
  const metaRaw = await chatComplete(
    [{ role: 'user', content: metaUserMsg }],
    { maxTokens: 512, temperature: 0.3 }
  );

  const meta = parseJSON(metaRaw, 'meta');
  if (!meta || !meta.seo_title) {
    throw new Error(`Failed to parse meta JSON: ${metaRaw.slice(0, 300)}`);
  }

  // Build final article object
  const article = {
    html,
    seo_title:     meta.seo_title,
    meta_desc:     meta.meta_desc || '',
    excerpt:       meta.excerpt   || '',
    focus_keyword: outline.focus_keyword,
    categories:    meta.categories && meta.categories.length ? meta.categories : ['B&R Automation'],
    tags:          meta.tags       && meta.tags.length       ? meta.tags       : [outline.focus_keyword],
  };

  // Trim meta_desc at word boundary if over 160
  if (article.meta_desc.length > 160) {
    const cut = article.meta_desc.lastIndexOf(' ', 155);
    article.meta_desc = article.meta_desc.slice(0, cut > 0 ? cut : 155).trim();
  }

  console.log(`   SEO title (${article.seo_title.length}c): ${article.seo_title}`);
  console.log(`   Meta desc (${article.meta_desc.length}c): ${article.meta_desc.slice(0, 80)}...`);
  console.log(`   Categories: ${article.categories.join(', ')}`);

  return article;
}

// ── Phase 4: Search images via Google CSE + save pending ──────────────────────

const PENDING_DIR = path.join(__dirname, '..', 'pending-images');

// Trusted B&R CDN/official domains — images from these are high-quality and on-topic
const BR_CDN_DOMAINS = [
  'br-cws-assets.de-fra-1.linodeobjects.com',
  'br-cws-media.de-fra-1.linodeobjects.com',
  'br-automation.com',
  'discourse-cdn.com/brcommunity',
];

/**
 * Filter images: B&R CDN first (up to maxCdn), then fill from others up to total maxTotal.
 * @param {Array}  images
 * @param {number} maxCdn    — max B&R CDN images to keep
 * @param {number} maxTotal  — total candidates per slot
 */
function filterImages(images, maxCdn, maxTotal) {
  const isBrCdn = img => BR_CDN_DOMAINS.some(d => img.url.includes(d));
  const cdn   = images.filter(isBrCdn).slice(0, maxCdn);
  const other = images.filter(img => !isBrCdn(img)).slice(0, maxTotal - cdn.length);
  return [...cdn, ...other];
}

/**
 * Search Google Images for 2 image slots, save pending JSON for Telegram review.
 *
 * Pending JSON structure:
 *   { draftId, slug, topic, slot1: { query, section, images[] }, slot2: { ... } }
 *
 * @param {object} outline   — must have image_query_1, image_query_2, outline[]
 * @param {string} slug
 * @param {string} articleTitle
 * @param {number} draftId
 * @returns {Promise<{slot1: Array, slot2: Array}>}
 */
async function searchAndPendImages(outline, slug, articleTitle, draftId) {
  // Always ensure "B&R" appears in both queries for brand-relevant results.
  // If AI already included the brand name, don't duplicate it.
  const addBrand = q => /b&r|bachmann/i.test(q) ? q.trim() : q.trim() + ' B&R automation';
  const q1 = addBrand(outline.image_query_1);
  const q2 = addBrand(outline.image_query_2);

  // Section labels for display (heading context)
  const section1 = outline.outline[0] || 'Phần đầu bài';
  const midIdx   = Math.floor(outline.outline.length / 2);
  const section2 = outline.outline[midIdx] || 'Phần giữa bài';

  console.log('\n[IMG] Phase 4: Image search...');
  console.log(`   Slot 1 query: "${q1}"`);
  console.log(`   Slot 2 query: "${q2}"`);

  const [raw1, raw2] = await Promise.all([
    searchImages(q1, 20).catch(() => []),
    searchImages(q2, 20).catch(() => []),
  ]);

  // Re-index after filter so display numbers are 1-N
  const slot1 = filterImages(raw1, 3, 5).map((img, i) => ({ ...img, index: i + 1 }));
  const slot2 = filterImages(raw2, 3, 5).map((img, i) => ({ ...img, index: i + 1 }));

  console.log(`   Slot 1: ${slot1.length} candidates (${slot1.filter(i => BR_CDN_DOMAINS.some(d => i.url.includes(d))).length} B&R CDN)`);
  console.log(`   Slot 2: ${slot2.length} candidates (${slot2.filter(i => BR_CDN_DOMAINS.some(d => i.url.includes(d))).length} B&R CDN)`);

  if (!fs.existsSync(PENDING_DIR)) fs.mkdirSync(PENDING_DIR, { recursive: true });
  const pendingFile = path.join(PENDING_DIR, draftId + '.json');
  fs.writeFileSync(pendingFile, JSON.stringify({
    draftId, slug, topic: articleTitle,
    slot1: { query: q1, section: section1, images: slot1 },
    slot2: { query: q2, section: section2, images: slot2 },
    createdAt: new Date().toISOString(),
  }, null, 2), 'utf-8');
  console.log('   Pending saved -> pending-images/' + draftId + '.json');

  return { slot1, slot2 };
}

// ── Phase 5: Create WP draft ──────────────────────────────────────────────────

/**
 * Normalize a category name for fuzzy matching.
 * Strips diacritics, lowercases, removes punctuation, sorts words alphabetically.
 * "PLC & Lập trình" → "lap lap plc trinh" (sort eliminates word-order differences)
 */
function normCatName(name) {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // strip Vietnamese diacritics
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/).filter(Boolean).sort().join(' ');
}

/**
 * Fetch all existing WP blog categories (max 100).
 * @returns {Promise<Array<{id, name}>>}
 */
async function fetchAllCategories() {
  const res = await wpGet('/wp-json/wp/v2/categories?per_page=100&_fields=id,name&hide_empty=false');
  if (res.ok && Array.isArray(res.body)) return res.body;
  console.warn('   ⚠️  Could not fetch existing categories');
  return [];
}

/**
 * Resolve category names to WP IDs using fuzzy matching against existing categories.
 * Match strategy (in order):
 *   1. Exact match (case-insensitive)
 *   2. Normalized word-set overlap ≥ 60% — handles word-order differences
 *      e.g. "PLC & Lập trình" ↔ "Lập trình PLC"
 *   3. Create new category only if no match found
 *
 * @param {string[]} categoryNames — AI-suggested names
 * @returns {Promise<number[]>} resolved WP category IDs
 */
async function findOrCreateCategories(categoryNames) {
  const allCats = await fetchAllCategories();
  const ids = [];

  for (const raw of categoryNames) {
    const name = raw.trim();
    if (!name) continue;

    // 1. Exact match
    const exact = allCats.find(c => c.name.toLowerCase() === name.toLowerCase());
    if (exact) {
      console.log(`   Matched  "${name}" → "${exact.name}" (ID: ${exact.id})`);
      ids.push(exact.id);
      continue;
    }

    // 2. Fuzzy word-overlap match
    const normName  = normCatName(name);
    const nameWords = new Set(normName.split(' '));
    let bestCat = null, bestScore = 0;

    for (const cat of allCats) {
      const catWords = normCatName(cat.name).split(' ');
      const overlap  = catWords.filter(w => nameWords.has(w)).length;
      const score    = overlap / Math.max(nameWords.size, catWords.length);
      if (score > bestScore) { bestScore = score; bestCat = cat; }
    }

    if (bestScore >= 0.6) {
      console.log(`   Fuzzy   "${name}" → "${bestCat.name}" (${Math.round(bestScore * 100)}% match, ID: ${bestCat.id})`);
      ids.push(bestCat.id);
      continue;
    }

    // 3. No match — create new
    const createRes = await wpPost('/wp-json/wp/v2/categories', { name });
    if (createRes.ok && createRes.body && createRes.body.id) {
      console.log(`   Created  "${name}" (ID: ${createRes.body.id})`);
      ids.push(createRes.body.id);
    } else {
      console.warn(`   ⚠️  Could not create "${name}" (status: ${createRes.status})`);
    }
  }

  return ids;
}

/**
 * Create WordPress draft post with SEO meta.
 *
 * @param {object} article   — {html, seo_title, excerpt, meta_desc, focus_keyword, categories, tags}
 * @param {string} title     — H1 title (from outline)
 * @param {Array}  images    — [{id, url, caption}] from upload
 * @returns {Promise<{id: number, link: string}>}
 */
async function createDraft(article, title, images) {
  console.log('\n📝 Phase 5: Creating WP draft...');

  // Always include "Tin Tức" so posts appear in the news menu
  const rawCategories = Array.isArray(article.categories) ? article.categories : [];
  if (!rawCategories.some(c => c.toLowerCase().includes('tin t'))) {
    rawCategories.unshift('Tin Tức');
  }
  const categoryIds = await findOrCreateCategories(rawCategories);
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
    featured_media: 0,  // set later via pick-image after Telegram approval
  };

  const res = await wpPost('/wp-json/wp/v2/posts', postBody);
  if (!res.ok || !res.body || !res.body.id) {
    throw new Error(`WP post creation failed: status=${res.status} — ${JSON.stringify(res.body).slice(0, 200)}`);
  }

  console.log(`   ✅ Draft created: ID ${res.body.id}`);
  return { id: res.body.id, link: res.body.link || '' };
}

// ── Phase 6: Notify (console + Telegram-ready format) ────────────────────────

/**
 * Print Telegram-ready notification with 2-slot image selection.
 * Khoa forwards this block verbatim to Telegram.
 *
 * @param {object} article   — {seo_title, focus_keyword}
 * @param {string} type      — article type
 * @param {object} draft     — {id, link}
 * @param {object} images    — {slot1: Array, slot2: Array}
 */
function notify(article, type, draft, images) {
  const { slot1 = [], slot2 = [] } = images || {};
  const previewUrl = `${config.BASE_URL}/?p=${draft.id}&preview=true`;
  const isBrCdn = url => BR_CDN_DOMAINS.some(d => url.includes(d));

  const line = '═'.repeat(60);
  console.log('\n' + line);
  console.log(`✅ Draft bài viết mới — ID ${draft.id}`);
  console.log(`📝 ${article.seo_title}`);
  console.log(`🔑 ${article.focus_keyword}  |  📊 ${type}`);
  console.log(`🔗 ${previewUrl}`);
  console.log('');

  // Slot 1
  if (slot1.length) {
    console.log(`📷 [Ảnh 1] — chèn sau heading đầu tiên:`);
    slot1.forEach(img => {
      const cdn = isBrCdn(img.url) ? ' ⭐B&R CDN' : '';
      const dim = img.width ? ` (${img.width}x${img.height})` : '';
      console.log(`  ${img.index}. ${img.title.slice(0, 65)}${dim}${cdn}`);
      console.log(`     ${img.url}`);
    });
    console.log('');
  }

  // Slot 2
  if (slot2.length) {
    console.log(`📷 [Ảnh 2] — chèn giữa bài:`);
    slot2.forEach(img => {
      const cdn = isBrCdn(img.url) ? ' ⭐B&R CDN' : '';
      const dim = img.width ? ` (${img.width}x${img.height})` : '';
      console.log(`  ${img.index}. ${img.title.slice(0, 65)}${dim}${cdn}`);
      console.log(`     ${img.url}`);
    });
    console.log('');
  }

  console.log('→ Chọn ảnh và inject vào bài:');
  console.log(`  node khoa.js pick-image -- --id=${draft.id} --img1=1 --img2=1`);
  console.log('→ Publish ngay (không cần ảnh):');
  console.log(`  node khoa.js publish-blog -- --id=${draft.id} --publish`);
  console.log('→ Xóa draft:');
  console.log(`  node khoa.js publish-blog -- --id=${draft.id} --reject`);
  console.log(line);
}

// ── Publish / Reject / Schedule handlers ─────────────────────────────────────

/**
 * Remove pending-images/{postId}.json if it exists.
 * Called after publish, schedule, or reject — keeps pending-images/ clean.
 * @param {number} postId
 */
function cleanupPending(postId) {
  const pendingFile = path.join(PENDING_DIR, postId + '.json');
  if (fs.existsSync(pendingFile)) {
    fs.unlinkSync(pendingFile);
    console.log(`   🗑️  Pending file cleaned: pending-images/${postId}.json`);
  }
}

/**
 * Schedule a draft post to publish at a future date/time.
 * WordPress uses status='future' + date (site local time, ISO 8601).
 * @param {number} postId
 * @param {string} dateStr  — "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM:SS"
 */
async function scheduleDraft(postId, dateStr) {
  // If only date given, default to 08:00:00 (morning publish)
  const isoDate = dateStr.includes('T') ? dateStr : dateStr + 'T08:00:00';
  console.log(`\n📅 Scheduling post ID ${postId} → ${isoDate}...`);
  const res = await wpPut(`/wp-json/wp/v2/posts/${postId}`, {
    status: 'future',
    date:   isoDate,
  });
  if (!res.ok) {
    throw new Error(`Schedule failed: status=${res.status} — ${JSON.stringify(res.body).slice(0, 200)}`);
  }
  const link = res.body && res.body.link ? res.body.link : '';
  console.log(`✅ Scheduled: ${isoDate}`);
  if (link) console.log(`🔗 ${link}`);
  cleanupPending(postId);
}

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
  cleanupPending(postId);
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
    cleanupPending(postId);
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
  const map = {
    à:'a',á:'a',â:'a',ã:'a',ä:'a',å:'a',è:'e',é:'e',ê:'e',ë:'e',
    ì:'i',í:'i',î:'i',ï:'i',ò:'o',ó:'o',ô:'o',õ:'o',ö:'o',ù:'u',
    ú:'u',û:'u',ü:'u',ý:'y',ñ:'n',ç:'c',
    // Vietnamese
    ắ:'a',ặ:'a',ằ:'a',ẳ:'a',ẵ:'a',ấ:'a',ậ:'a',ầ:'a',ẩ:'a',ẫ:'a',ă:'a',
    ế:'e',ệ:'e',ề:'e',ể:'e',ễ:'e',
    ố:'o',ộ:'o',ồ:'o',ổ:'o',ỗ:'o',ớ:'o',ợ:'o',ờ:'o',ở:'o',ỡ:'o',ơ:'o',
    ứ:'u',ự:'u',ừ:'u',ử:'u',ữ:'u',ư:'u',
    ị:'i',ỉ:'i',ĩ:'i',
    ỳ:'y',ỵ:'y',ỷ:'y',ỹ:'y',
    đ:'d',
  };
  return topic
    .toLowerCase()
    .replace(/[^\u0000-\u007E]/g, c => map[c] || '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 50);
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

  // ── Handle --schedule mode ─────────────────────────────────────────────────
  if (SCHEDULE && POST_ID) {
    if (!DATE_ARG) throw new Error('--schedule requires --date=YYYY-MM-DD (or YYYY-MM-DDTHH:MM:SS)');
    await scheduleDraft(POST_ID, DATE_ARG);
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

  // Phase 3: Write article (HTML keeps [IMAGE_1] / [IMAGE_2] placeholders)
  const article = await writeArticle(topic, outline);

  // Phase 4: Search images (BEFORE creating draft — results go into pending JSON)
  const { slot1, slot2 } = await searchAndPendImages(
    outline, slug,
    article.seo_title || outline.title || topic,
    0  // temporary draftId=0 — will rename file after draft creation
  );

  // Phase 5: Create WP draft — keep [IMAGE_1]/[IMAGE_2] placeholders in content
  // pick-image.js will replace them after Telegram approval
  const draft = await createDraft(article, outline.title, []);

  // Rename pending file 0.json → {draft.id}.json
  const tmpFile  = path.join(PENDING_DIR, '0.json');
  const realFile = path.join(PENDING_DIR, draft.id + '.json');
  if (fs.existsSync(tmpFile)) {
    const pending = JSON.parse(fs.readFileSync(tmpFile, 'utf-8'));
    pending.draftId = draft.id;
    fs.writeFileSync(realFile, JSON.stringify(pending, null, 2), 'utf-8');
    fs.unlinkSync(tmpFile);
  }

  // Phase 6: Notify with Telegram-ready image selection message
  notify(article, outline.type, draft, { slot1, slot2 });
}

// ── Entry point ───────────────────────────────────────────────────────────────
main().catch(e => {
  console.error('\n❌ Fatal error:', e.message);
  if (process.env.DEBUG) console.error(e.stack);
  process.exit(1);
});
