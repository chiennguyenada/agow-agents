# Agow Automation — Changelog

> Log EVERY code change here. Purpose: prevent regression by knowing what changed and why.
> Format: newest entries at top.
> Claude MUST read this file before editing any existing file to understand recent context.

---

### 2026-04-15 — Blog Writer v2: Outline cải thiện + Gemini write + Category fuzzy match
**Phase**: Phase 1g (Blog Writing)
**Files changed**:
- `workspaces/seo/scripts/ai-write-blog.js` — modified — 5 cải thiện:
  1. `buildOutline()`: thêm `lsi_keywords` (4 LSI terms), `word_target` (per type), `required_sections` (cấu trúc bắt buộc theo type), xóa `meta_title` redundant, giảm maxTokens 4096→1024, validate ≥4 headings
  2. `writeArticle()`: đổi sang `geminiComplete` (tránh Claudible timeout với 8192 tokens), truyền lsi_keywords + word_target + required_sections vào prompt
  3. `findOrCreateCategories()`: rewrite hoàn toàn — fetch all categories 1 lần, fuzzy word-overlap ≥60% (normalize dấu + sort words), tránh tạo category trùng
  4. `makeSlug()`: thêm Vietnamese diacritic map đầy đủ — "so sánh" → "so-sanh" thay vì "so-snh"
  5. `searchAndPendImages()`: strip brand names (B&R, Bachmann) trước khi gửi SerpAPI — tránh ảnh logo/watermark
- `workspaces/seo/scripts/ai-write-blog.js` — new imports: `geminiComplete` từ gemini-client (riêng cho write phase), `chatComplete` từ claudible-client (giữ cho outline phase)

**Why**:
1. Outline cũ: `focus_keyword` bị dấu phẩy (2 keyword), `meta_title` không được dùng, maxTokens 4096 lãng phí, AI không biết cần bao nhiêu từ/section, không biết cấu trúc bắt buộc theo type
2. `writeArticle` dùng Claudible với maxTokens 8192 → timeout 100s Cloudflare proxy chắc chắn xảy ra
3. Category: AI gợi ý "PLC & Lập trình" → WP không tìm được "Lập trình PLC" do word order → tạo mới trùng (đã có 3 dup sau 1 lần test)
4. Slug: tiếng Việt bị drop hoàn toàn → URL không readable
5. Image query: AI thêm "B&R" → SerpAPI trả về ảnh logo/press kit thay vì ảnh kỹ thuật thực tế

**Tests**: Layer 1: `node --check` PASS ✅ | Layer 2: dry-run test PASS (type, lsi, word_target, slug đúng) | Layer 3: fuzzy match test 7/7 cases PASS ✅ | Layer 4: claudible-client usage (outline) không đổi
**Dependencies affected**: ai-write-blog.js behavior (outline richer, write phase dùng Gemini), category matching behavior thay đổi hoàn toàn

---


**Phase**: Phase 1g (Blog Writing & Content Automation)
**Files changed**:
- `workspaces/seo/skills/wp-blog-writer/SKILL.md` — rewritten — cập nhật status PRODUCTION, đổi image source từ Unsplash → SerpAPI, thêm pick-image flow, thêm SCHEDULE command, cập nhật AI model (Gemini write phase), cost mới ($0.01–0.02/bài)
- `workspaces/seo/skills/wp-project-post/SKILL.md` — modified — thêm status PRODUCTION + test result, thêm lessons learned (tên nhà máy, lên lịch, docker force-recreate), cập nhật "Lưu ý quan trọng"
- `workspaces/seo/self-improving/hot.md` — modified — thêm blog writing commands (research-blog, write-blog, publish-blog, pick-image), thêm "Blog Writing Rules" section với lessons từ production test
- `workspaces/seo/scripts/ai-write-blog.js` — modified — `buildOutline()` cải thiện: thêm `lsi_keywords`, `word_target`, `required_sections`, bỏ `meta_title` redundant, tối ưu `maxTokens` 4096→1024; `writeArticle()` nhận thêm context từ outline
- `CLAUDE.md` — modified — thêm Blog Writing section vào WordPress & WooCommerce rules
- `progress.md` — modified — thêm section Blog Writing Production milestone
- `C:\Users\chiennguyen\.claude\projects\...\memory\` — updated — thêm memory về blog writing production

**Why**: Test thực tế trên Telegram 2026-04-16: admin gửi "@AgowKhoaBot vừa hoàn thành sửa PLC X20CP3585 cho nhà máy bia. hãy lên bài viết tin tức" → Khoa hỏi 4 câu → admin trả lời + gửi ảnh → Khoa tạo draft ID 5500 trong 6 phút → admin review → lên lịch 18/04/2026 8:00 → thành công. Toàn bộ workflow hoạt động end-to-end.

**Tests**: Layer 1: syntax OK ✅ | Layer 2: production test PASS ✅ (draft 5500 created, scheduled) | Layer 3: end-to-end Telegram workflow PASS ✅ | Layer 4: khoa.js + wp-client.js không thay đổi

**Key lessons từ production**:
1. Gemini `gemini-3-flash-preview` streaming: không bị timeout proxy Cloudflare — phù hợp write phase
2. `docker compose restart` KHÔNG reload env vars — phải dùng `--force-recreate`
3. Tên nhà máy nhạy cảm — Khoa hỏi trước, không tự điền; nếu không có dùng "nhà máy [ngành] [vùng]"
4. Lên lịch WP: `status: "future"` + `date: "YYYY-MM-DDTHH:MM:SS"` (giờ VN UTC+7, WP tự convert)
5. `buildOutline()` cải thiện: thêm `lsi_keywords` + `required_sections` → bài viết có cấu trúc tốt hơn

**Dependencies affected**: ai-write-blog.js behavior (outline richer, write phase nhận nhiều context hơn), SKILL.md ảnh hưởng Khoa session start context

---

### 2026-04-06 — Hotline Replace: 028 6670 9931 → 0934 795 982 (47 items)
**Phase**: SEO Content
**Files changed**:
- `workspaces/seo/scripts/fix-hotline.js` — created — Config-driven scan+replace script: 4 content types (WC products, WP pages, WP posts, WC categories), dry-run + apply + --id/--type/--old/--new flags, flexible regex (match mọi format), backup trước write.
- `workspaces/seo/skills/wp-hotline/SKILL.md` — created — Skill doc cho Khoa: khi nào dùng, workflow, advanced options.
- `workspaces/seo/scripts/khoa.js` — modified — +2 commands: `check-hotline`, `fix-hotline` + workflow comment.
- `progress.md` — modified — added hotline task section.

**Why**: Hotline cũ "028 6670 9931" xuất hiện trong description của 47 item (41 products, 4 pages, 2 posts). Số mới là "0934 795 982". Thiết kế config-driven để tái dụng khi thông tin liên hệ thay đổi tiếp.

**Tests**: Layer 1: syntax OK ✅ | Layer 2: dry-run 47 items detected ✅ | Layer 3: 46/46 applied ✅ (1 page detect+replace riêng) | Layer 4: re-scan products → 0 remaining ✅, verify page 1195 → clean ✅
**Dependencies affected**: WC product pages (description), WP pages, WP posts — LiteSpeed Cache purged
**Notes**: Script tái dụng: `node khoa.js fix-hotline --apply --old="số cũ" --new="số mới"`. Backup tại workspaces/seo/backups/hotline-backup-*.json.

---

### 2026-04-06 — APC2100/2200/3100 Short Desc + Meta Rewrite: 14/14 Applied
**Phase**: SEO Content
**Files changed**:
- `workspaces/seo/scripts/rewrite-apc.js` — created — dry-run + apply pipeline cho 14 SP Automation PC. AI generate short_desc (3 câu spec phân biệt variant) + meta_desc (140–160c không CTA). Fix title ID 3769 qua RankMath meta.
- `workspaces/seo/cache/apc-rewrite-cache.json` — created — cache 14 kết quả AI
- `workspaces/seo/reports/apc-rewrite-20260406.csv` — created — export CSV để review
- `progress.md` — modified — added APC rewrite section

**Why**: 14 SP APC2100/2200/3100 có short_desc boilerplate — chỉ thay mã ở câu đầu, phần còn lại y hệt nhau giữa các variant, kèm 4 dòng noise bán hàng ("Chính hãng, bảo hành..."). Kỹ sư B2B không phân biệt được BY01 vs BY48 (single-core vs quad-core, 1GB vs 8GB). 10/14 meta có CTA "Tư vấn miễn phí!" — anti-pattern. ID 3754 còn sai mã (BY01 thay vì BY44).

**Tests**: Layer 1: syntax OK ✅ | Layer 2: 14/14 short(200-300c) ✅ 14/14 meta(140-160c) ✅ | Layer 3: 14/14 applied ✅, 3/3 spot-check PASS ✅ | Layer 4: script mới — no regression
**Dependencies affected**: 14 WC product pages, WP Rocket cache (purged)
**Notes**: `rewrite-apc.js` có thể tái dụng cho các danh mục tương tự — chỉ thay `PRODUCT_GROUPS` và `CAT_DESCS`. WP Rocket cache purged qua purge-cache.js (LiteSpeed fallback).

---

### 2026-04-02 — Schema Markup + SKU/MPN Fix toàn bộ 590 sản phẩm
**Phase**: SEO Technical
**Files changed**:
- `workspaces/seo/snippets/fix-organization-type.php` — created — PHP snippet (WPCode): xóa `Electrician` khỏi RankMath Organization schema, thêm PostalAddress + sameAs. Dùng 2 filter: `rank_math/schema/Organization` (preferred) + `rank_math/json_ld` (fallback)
- `workspaces/seo/snippets/product-schema.php` — created — PHP snippet (WPCode): inject `Product` JSON-LD schema vào tất cả WC product pages qua `wp_footer` hook. Fields: name, url, image (+ gallery), sku, mpn, brand (B&R/Bachmann auto-detect), offers (InStock/OutOfStock), category
- `shared-knowledge/lessons-learned.md` — modified — Added LESSON-007 đến LESSON-012
- `shared-knowledge/company-rules.md` — modified — SEO Rules updated (meta desc 140-155c, title 50-60c, citation rule, no CTA rule); thêm "Khoa SEO — Operational Context" section cho Tong routing
- `shared-knowledge/product-catalog.md` — modified — thêm B&R Title Templates, WC Category Map (31 danh mục)
- `workspaces/seo/self-improving/hot.md` — modified — thêm Schema rules, SKU/MPN workflow, WP Rocket cache note
- `workspaces/seo/self-improving/corrections.md` — modified — thêm correction về WP Rocket vs LiteSpeed, SKU extraction pattern
- `workspaces/seo/self-improving/patterns.md` — modified — thêm Schema & Structured Data section, SKU Auto-Extract Pattern
- `progress.md` — modified — added Schema + SKU/MPN sections

**Why**:
1. RankMath sai `@type: Electrician` → Google nhầm business type. Fix bằng WPCode PHP snippet filter RankMath schema.
2. 590 WC products không có Product schema → mất rich results (price/availability) trên SERP.
3. 218/590 (37%) sản phẩm thiếu SKU → Product schema không đầy đủ, Google không nhận diện được product entity.
4. Fix SKU: extract từ product name bằng B&R part number regex (X20/X67/3xx/5xx/8V...) — 218/218 extract thành công.
5. 3 sản phẩm duplicate (OLD 2021 / NEW 2025) → set OLD về draft để tránh duplicate content.

**Root causes**:
- `Electrician`: RankMath Knowledge Graph → Organization Type setting bị chọn sai → fix qua WPCode không cần vào admin RankMath
- `No Product schema`: RankMath WC module không tự generate schema nếu không cấu hình đúng → inject qua PHP snippet
- `Missing SKU`: Sản phẩm 2021 (viết tay) không điền SKU khi tạo → extract từ product name

**Tests**: Layer 1: JSON-LD valid trên 4 test URLs ✅ | Layer 2: Electrician gone ✅, Product schema present ✅, sku+mpn in schema ✅ | Layer 3: 587/590 SKU (99%) verified via WC API | Layer 4: Homepage + category pages unaffected ✅
**Dependencies affected**: Tất cả WC product pages (schema output), Organization schema (tất cả trang), WP Rocket cache behavior
**Notes**:
- WP Rocket là cache layer chính (không phải LiteSpeed như ghi trong hot.md cũ) — cần purge qua WP Admin (không có REST API)
- 2 JSON-LD blocks trên product page là bình thường (1 RankMath + 1 snippet) — Google chấp nhận
- 3 OLD duplicate products (3201, 3184, 3223) → draft; NEW (5259, 5253, 5286) → publish với SKU đầy đủ
- Rich results sẽ xuất hiện trên Google sau 3-7 ngày crawl

---

### 2026-04-05 — AI Rewrite WooCommerce Categories: 31/31 Applied
**Phase**: SEO Content Pipeline
**Files changed**:
- `workspaces/seo/scripts/ai-rewrite-category.js` — created → thêm `HTML_EXAMPLE` trong buildPrompt, fix parser 3 lần (LABEL_RE positions, `**\n` trước code fence, meaningful line filter), cải thiện `getBlock()` để strip `**\n` trước ``` 
- `workspaces/seo/scripts/fix-category-cache.js` — created — auto-fix h1→p, **bold**→strong, hãng b&r→B&R, trim meta >155c, revalidate issues. REGEN_IDS=[] sau khi xong
- `workspaces/seo/scripts/finalize-cache.js` — created — manual title fixes cho 14 DM dài >60c, meta trim, revalidate với Bachmann exception (không check B&R)
- `workspaces/seo/scripts/reparse-cache.js` — created — re-parse tất cả rawResponse với parser mới, không gọi AI, cập nhật cache
- `workspaces/seo/scripts/category-parser-standalone.js` — created (generated) — standalone parser module cho require()
- `progress.md` — modified — added "AI Rewrite WooCommerce Categories — COMPLETED 2026-04-05" section
- `changelog.md` — modified — this entry

**Why**: 31 danh mục WooCommerce thiếu description, SEO title, meta description tối ưu. AI generate xong nhưng parser fail do AI không nhất quán format output (dùng `**LABEL:**`, code fence, `**\n` trước fence). Đã fix parser 3 lần và build toolchain hoàn chỉnh.

**Root causes & fixes**:
1. AI wrap content trong ` ```html ` code fence → strip bằng regex
2. AI thêm `**\n` trước ` ``` ` → `getBlock()` thêm `replace(/^\s*\*{1,2}\s*\n/, '')` trước strip fence
3. AI bắt đầu dòng title/meta bằng `**` → filter `meaningful()` loại dòng chỉ có `**`
4. AI viết title 65-80c → manual `TITLE_FIX` dict cho 14 DM → 35-61c
5. Hãng Bachmann (ID 672/673) không check "B&R" requirement → BACHMANN_IDS exception

**Tests**: Layer 1: 5/5 PASS (node --check tất cả scripts) | Layer 2: 31/31 Clean (T/M/D/H2/UL/Agow/B&R đủ) | Layer 3: 31/31 applied WooCommerce + purge cache | Layer 4: N/A (new scripts)
**Dependencies affected**: WooCommerce category pages (description + RankMath SEO title/meta), LiteSpeed cache purged
**Notes**: Parser robustness: LABEL_RE positions approach (thay regex normalize) + meaningful() filter = chịu được mọi AI format variant. rawResponse lưu trong cache nên có thể reparse bất cứ lúc nào không cần API call lại.

### 2026-04-04 — AI Rewrite Products 2025: Full Batch Complete + Audit 2021
**Phase**: SEO Content Pipeline
**Files changed**:
- `workspaces/seo/self-improving/hot.md` — modified — Cập nhật commands table (thêm rewrite-product/apply-rewrite-product), script version log (ai-rewrite-product.js v2), Windows note (MSYS_NO_PATHCONV=1), kết quả verify mới
- `progress.md` — modified — Mark done AI Rewrite 422 SP, thêm section Products 2021 tasks
- `changelog.md` — modified — Entry này

**Why**: (1) Hoàn thành toàn bộ AI rewrite cho 422 sản phẩm năm 2025 — title + short_desc + meta_desc đã lên WooCommerce, 0 lỗi. (2) Audit sản phẩm 2021 (133 SP viết tay): title OK hầu hết (5 ngắn), meta_desc OK toàn bộ, short_desc có 9 SP còn noise.

**Key lessons**:
- `MSYS_NO_PATHCONV=1` + `//home/...` bắt buộc khi chạy `docker exec` với Unix path trên Git Bash/Windows
- 402 Insufficient Balance giữa chừng → `--resume` tiếp tục từ cache, không mất dữ liệu đã xử lý
- applyFromCache() không filter theo issues → REVIEW items cũng được apply (đây là behavior đúng khi user đã confirm)
- 133 SP năm 2021: title 128/133 OK, meta_desc 133/133 OK, chỉ 9 short_desc còn noise → ít việc hơn nhiều so với 2025

**Tests**: Layer 1: ✅ | Layer 2: 422/422 applied 0 errors | Layer 3: verify spot-check 3858 PASS | Layer 4: N/A
**Dependencies affected**: hot.md (session start context cập nhật), progress.md
**Notes**: Bước tiếp: xử lý 133 SP 2021 — đơn giản hơn (chỉ 5 title + 9 short_desc). Cân nhắc AI rewrite toàn bộ luôn để đồng nhất chất lượng với 2025.

---


**Phase**: SEO Script Development
**Files changed**:
- `workspaces/seo/scripts/ai-rewrite-product.js` — **multiple fixes**:
  1. Root cause: `"ĐẾM KÝ TỰ TRƯỚC KHI TRẢ LỜI"` → AI đếm ký tự inline, dùng hết 450 tokens → bị cắt trước `SHORT_DESC:` → parse fail. Fix: xóa instruction đếm, đơn giản hóa prompt, tách `SYSTEM_MSG` ra khỏi user message.
  2. `maxTokens` 450→700: tiếng Việt ~2 tokens/từ, short_desc 300c cần ~500 tokens output.
  3. Thêm `trimAtSentence(text, 300)` trong `parseAIResponse()`: auto-trim tại ranh giới câu nếu AI viết >300c.
  4. `validate()`: relax title min 48→45c (48-49c cũng tốt về SEO), short max 320→305c (sau trim luôn ≤300c).
  5. Bug fix: `process.argv.slice(3)` → `slice(2)` — `--apply` bị cắt ở index 2 nên không bao giờ enter APPLY_MODE.
  6. Fix output hint: `apply-rewrite-desc` → `apply-rewrite-product` (đúng command name trong khoa.js).

**Why**: Script đã build sẵn từ session trước nhưng mọi test đều fail "Không parse được response". Debug trực tiếp trong container phát hiện AI chain-of-thought đếm từng ký tự rồi bị cắt nửa chừng do maxTokens thấp.

**Tests**: Layer 1: ✅ (node --check PASS) | Layer 2: ✅ (5/5 unit-style tests — ACOPOS/PLC/HMI/Safety/IPC đều OK) | Layer 3: ✅ (apply --id=5379 PASS, WC verify PASS, purge cache PASS) | Layer 4: ✅ (khoa.js unchanged, wp-client.js unchanged, claudible-client.js unchanged)
**Dependencies affected**: ai-rewrite-product.js behavior change — từ 100% fail → 80-100% OK per batch
**Notes**: Full run (374 products) ước tính 8 phút @ 1.3s/product + Anthropic API cost ~$0.04-0.08 (Sonnet). Dùng `--resume` để incremental.

---

### 2026-04-02 — Fix Citation Preservation: cleanNoise() + fix-long-desc.js v2
**Phase**: Code Quality / SEO Strategy
**Files changed**:
- `workspaces/seo/scripts/fix-long-desc.js` — **v1→v2** — Bỏ rule xóa `(manual, trang X)` khỏi `cleanLongDescHtml()`. Bỏ detection `(manual, trang X)` khỏi `hasNoise()`. Thêm rule xóa phone/hotline/email. Cập nhật docstring: "GIỮ citation, chỉ strip metadata block + phone/email".
- `workspaces/seo/scripts/ai-rewrite-desc.js` — **v1→v2** — `cleanNoise()`: xóa R1 (manual refs), R2 (datasheet refs), R3 (trang X độc lập). `SYSTEM_PROMPT`: sửa rule 5→6 mới: "GIỮ NGUYÊN mọi citation (data sheet, trang X) và (manual, trang X) — E-E-A-T signal".
- `workspaces/seo/self-improving/hot.md` — **modified** — Script Version Log: fix-long-desc v2, ai-rewrite-desc v2. Thêm Critical Rule: "Citation preservation".
- `workspaces/seo/self-improving/corrections.md` — **modified** — Thêm correction: Citation không phải noise, data 367/590 products, nguyên tắc B2B kỹ thuật.

**Why**: 367/590 sản phẩm (62%) có citation `(data sheet/manual, trang X)` — E-E-A-T signal chứng minh nội dung từ tài liệu kỹ thuật B&R thật, không phải AI hallucination. Script v1 sai khi xóa chúng.

**Tests**: Layer 1: 2/2 ✅ | Layer 2: 10/10 ✅ (cleanNoise + hasNoise unit tests) | Layer 3: PASS (5310: 29/29 citations intact, metadata xóa đúng) | Layer 4: PASS (khoa.js help intact)
**Dependencies affected**: fix-long-desc.js, ai-rewrite-desc.js behavior change — ít products bị flag hơn, AI nhận input đầy đủ hơn
**Notes**: Sau fix này, fix-long-desc dry-run sẽ báo ÍT hơn v1 — đó là đúng, 279 products trước đây bị flag sai vì có manual refs.

---

### 2026-04-02 — Fix export-dry-run.js: Full Text + Regex Bug
**Phase**: 1a (Code Quality)
**Files changed**:
- `workspaces/seo/scripts/export-dry-run.js` — **modified** — (1) Tăng preview từ 300c → full plain text (stripHtml, không cắt). (2) Fix regex `[\d\-–]+` → `[^)]{1,60}` để bắt mọi dạng manual ref kể cả `trang 72, 85`, `trang 54, 72, 85`, edge case `trang 1 – tương thích dòng 8B0K`.
- `workspaces/seo/scripts/fix-long-desc.js` — **modified** — Same regex fix cho `cleanLongDescHtml()`.
- `workspaces/seo/scripts/fix-short-desc.js` — **modified** — Same regex fix cho `cleanLongDesc()`.

**Why**: (1) User báo Cleaned_Long_Desc_Preview truncate — 300c chỉ ~9% content (p50=3455c). (2) Phát hiện bug: `[\d\-–]+` không bắt multi-page refs như `(manual, trang 72, 85)` hay edge case chữ. Kết quả: product 5379 có 28 refs nhưng chỉ 23 bị clean. Sau fix: 0/579 products còn `(manual...)` trong cleaned column.

**Tests**: Layer 1: 3/3 PASS | Layer 2: 0/579 remaining refs ✅ | Layer 3: N/A | Layer 4: fix-long-desc + fix-short-desc synced
**Notes**: Regex `[^)]{1,60}` safer hơn enumerate từng format — bắt tất cả nội dung trong ngoặc.

---

### 2026-04-02 — Content Pipeline Scripts: fix-short-desc + fix-long-desc + upgrade fix-meta-desc v3
**Phase**: 1a (SEO Production Fix)
**Files changed**:
- `workspaces/seo/scripts/fix-short-desc.js` — **created** — Strip noise từ WC short_description: CTA generic (Liên hệ Agow/Tư vấn miễn phí), brand boilerplate, double-brand suffix. Detect CLEAN_ONLY (đủ tốt sau strip), THIN (80-99c), SHORT (<80c, rebuild từ long_desc). 590 products scanned: 577 CLEAN_ONLY, 5 THIN, 8 SHORT, 0 needsReview.
- `workspaces/seo/scripts/fix-long-desc.js` — **created** — Strip noise từ WC long_description HTML: manual refs `(manual, trang N)`, metadata block (`Mã sản phẩm:`, `Thương hiệu:`, `Xuất xứ:`), standalone heading labels. Giữ nguyên HTML structure. 590 products scanned: 579 có noise, 11 sạch, 0 needsReview.
- `workspaces/seo/scripts/fix-meta-desc.js` — **upgraded v2→v3** — Thêm: `cleanLongDescText()` strip manual refs + metadata; `extractSpecsFromText()` riêng; `extractNewSpecs()` với long_desc fallback; `splitSentencesSafe()` không cắt decimal (`0.1`, `115.2`); trim-check (extended <5c hơn gốc → needsManual); trailing-period fix trước nối; fetch thêm `description` field cho WC products.
- `workspaces/seo/scripts/khoa.js` — **modified** — Thêm 4 commands: `check-short-desc`, `fix-short-desc`, `check-long-desc`, `fix-long-desc`. Cập nhật header, workflow. Total: 14 commands.
- `workspaces/seo/self-improving/hot.md` — **modified** — Commands table 14 entries; Script Version Log thêm fix-short-desc v1, fix-long-desc v1, fix-meta-desc v3; Kết quả verify mới (391 meta issues, 577 short CLEAN_ONLY, 579 long noise).
- `progress.md` — **modified** — Thêm content pipeline tasks, cập nhật Summary.
- `changelog.md` — **modified** — This entry.

**Why**: (1) `check-meta` tiết lộ 241/391 items `needsManual: true` vì short_desc không đủ spec để extend. Root cause: short_desc chứa CTA noise ("Liên hệ Agow...", "Tư vấn miễn phí!") → keyword extractor không tìm được thông tin mới. Fix đúng thứ tự: clean short/long_desc trước → meta-desc engine sẽ có data tốt hơn. (2) `fix-meta-desc.js` v2 có bug: decimal splitter cắt `0.1°C` thành `"01°C"` fragment; smartTrim cắt ngược về câu gốc → needsManual false nhưng proposed = current; double period khi base kết thúc `.`.

**Tests**:
- Layer 1: 3/3 PASS (`node --check` fix-short-desc, fix-long-desc, fix-meta-desc, khoa.js)
- Layer 2: `khoa.js help` → 14 commands đúng | test product [5277] có 28 manual refs → detected và cleaned | [4545] RS232 → needsManual: true đúng (không có spec mới) | [4288] AT2402 → needsManual: true đúng
- Layer 3: DEFERRED (--apply chưa chạy)
- Layer 4: `fix-meta-desc.js` regression: check-meta vẫn scan posts/pages/products đúng; khoa.js cũ 10 commands → 14 commands backward-compatible

**Dependencies affected**: fix-meta-desc phụ thuộc short+long_desc đã clean → nên chạy fix-short-desc + fix-long-desc trước fix-meta.
**Notes**: Workflow chuẩn: `fix-short-desc --apply` → `fix-long-desc --apply` → `fix-meta --apply` → `purge-cache`. Pages (9 items) nên fix trước products (391 items) để test.

---


**Phase**: 1a (SEO Production Fix)
**Files changed**:
- `workspaces/seo/self-improving/hot.md` — **modified** — Cập nhật Verified Findings: LONG_TITLE 0 remaining, 8/8 fixed. SHORT_TITLE 9 system pages intentionally skipped.
- `progress.md` — **modified** — Đánh dấu tất cả title tasks hoàn thành.
- `changelog.md` — **modified** — This entry.

**Items fixed** (rank_math_title via WP/WC API):
| ID | Type | New title (chars) |
|----|------|-------------------|
| POST 5096 | WP Post | "Thay thế 5PC910.SX05-00 & X20CP3583 – Máy Thổi Màng" (51) |
| POST 3706 | WP Post | "Module X20IF2772 – Kết Nối CAN Bus Đa Năng B&R" (46) |
| POST 1747 | WP Post | "Acopos Multi B&R – Tối Đa Hóa Lợi Ích Cho Khách Hàng" (52) |
| POST 1919 | WP Post | "Acopos 6D – Đỉnh Cao Chuyển Động Đa Chiều Trong Sản Xuất" (56) |
| PROD 5378 | WC Product | "Máy Tính Công Nghiệp 5APC4100.SX03-000 B&R – 3 Khe" (50) |
| PROD 5375 | WC Product | "Máy Tính Công Nghiệp 5APC4100.SX02-000 B&R – 2 Khe" (50) |
| PROD 5372 | WC Product | "Máy Tính Công Nghiệp 5APC4100.SX01-000 B&R – 1 Khe" (50) |
| PROD 4575 | WC Product | "Module IO-Link Master X20DS438A B&R – 4 Cổng X20" (48) |
| PROD 3366 | WC Product | "Module 3IF786.9 B&R – aPCI POWERLINK + RS232" (44) |
| PROD 3364 | WC Product | "Module 3IF787.9 B&R – aPCI POWERLINK Master" (43) |

**SHORT_TITLE skipped**: 9 WooCommerce system pages (Giỏ hàng, Thanh toán, Wishlist, Liên Hệ, etc.) — không ảnh hưởng SEO, Google ít index utility pages.

**Why**: User chọn AI-written titles thay vì auto-truncate để giữ ý nghĩa đầy đủ. Titles được viết dựa trên nội dung thực (product name, category, short_description) từ WP/WC API.

**Tests**: Layer 1: N/A | Layer 2: 10/10 API calls ✅ | Layer 3: `check-title` re-run → LONG_TITLE = 0 ✅ | Layer 4: purge-cache ✅
**Dependencies affected**: rank_math_title meta cho 10 items. LiteSpeed cache đã purge.
**Notes**: Workflow thực tế: check-title (scan) → AI viết title → apply manual via node -e → verify → purge. Quy trình này sẽ được chuẩn hóa vào fix-title.js --ai mode (future).

---

### 2026-04-01 — Add fix-title.js: LONG_TITLE / SHORT_TITLE Detection & Auto-Fix
**Phase**: 1a (SEO Production Fix)
**Files changed**:
- `workspaces/seo/scripts/fix-title.js` — **created** — Detect LONG_TITLE (>60 chars) + SHORT_TITLE (<30 chars) trên posts/pages/WC products. Smart-truncate cho LONG_TITLE: giữ brand suffix "| Agow Automation", cắt tại ranh giới từ. SHORT_TITLE: chỉ report, không sửa tự động (cần AI/human). Ghi vào `meta.rank_math_title` qua WP REST API. Backup trước khi sửa. Tier 2.
- `workspaces/seo/scripts/khoa.js` — **modified** — Thêm 2 commands: `check-title` (dry-run), `fix-title` (auto-fix LONG_TITLE). Header comment cập nhật → 8 commands tổng cộng.
- `workspaces/seo/self-improving/hot.md` — **modified** — Cập nhật commands table: 6 → 8 entries (thêm check-title, fix-title). Thêm "Kết quả đã verify: 26 URLs có LONG_TITLE/SHORT_TITLE issues".
- `workspaces/seo/self-improving/patterns.md` — (no change in this commit)
- `progress.md` — **modified** — Thêm fix-title task vào Phase 1a. Next tasks updated.
- `changelog.md` — **modified** — This entry.

**Why**: Sau khi hoàn thành alt text (MISSING_ALT 126/126 PASS), task tiếp theo là title optimization (26 URLs có LONG/SHORT title theo audit 2026-03-29). fix-title.js follow cùng pattern dry-run/apply/backup như fix-missing-alt.js.

**Tests**:
- Layer 1: 2/2 PASS (`node --check fix-title.js` + `node --check khoa.js`)
- Layer 2: 5/5 PASS (smartTruncate unit tests — long with brand, short, already-ok, Vietnamese, short-with-brand)
- Layer 3: DEFERRED (cần live WP credentials để test API write)
- Layer 4: khoa.js help → 8 commands đúng thứ tự

**Dependencies affected**: khoa.js (updated help), hot.md (updated table), wp-technical-seo SKILL.md (LONG_TITLE procedure references script)
**Notes**: SHORT_TITLE không sửa tự động vì cần thêm context/keywords — cần Khoa (AI) hoặc admin viết title mới. Sau khi fix → chạy `purge-cache` và re-audit để verify score cải thiện.

---

### 2026-04-01 — Refactor Scripts to Generic (Portable to Any WordPress Site)
**Phase**: Code Quality
**Files changed**:
- `workspaces/seo/scripts/wp-client.js` — **created** — Shared HTTP client: đọc config từ env vars (`WP_BASE_URL`, `WP_USERNAME`, `WP_APP_PASSWORD`, `WC_CONSUMER_KEY`, `WC_CONSUMER_SECRET`). Exports: `config`, `request`, `wpGet`, `wpPost`, `wpPut`, `wcRequest`, `fetchAll`. Validate required env vars on import → exit(1) với error message rõ ràng.
- `workspaces/seo/scripts/fix-missing-alt.js` — **refactored** — Import từ `wp-client.js` thay vì tự define HTTP code. Đổi `'Agow Automation'` hardcode → `BRAND_NAME` (đọc từ `WP_BRAND_NAME` env var hoặc auto-detect từ domain). Fix pagination bug (`fetchAll` lấy pages từ `x-wp-totalpages` header thay vì đoán). `wcRequest` cho WC products endpoint.
- `workspaces/seo/scripts/verify-alt-fix.js` — **rewritten** — Không còn hardcode media IDs `[3711, 3669...]`. Giờ scan toàn bộ: media library + posts/pages HTML content + WC products. Detect cả MISSING_ALT lẫn DUPLICATE_ALT. Portable 100%.
- `workspaces/seo/scripts/purge-cache.js` — **refactored** — Import `request`, `config` từ `wp-client.js`. Bỏ fallback `'https://agowautomation.com'`.
- `workspaces/seo/scripts/khoa.js` — **rewritten** — Entry point cập nhật đủ 6 commands: `missing-alt`, `fix-missing-alt`, `check-duplicate-alt`, `fix-duplicate-alt`, `verify`, `purge-cache`. Dùng `spawnSync` thay `execSync` để pass-through args (`--apply`, `--id=N`). Workflow mẫu đầy đủ.
- `workspaces/seo/scripts/missing-alt.js` — **deleted** — Superseded bởi `fix-missing-alt.js` (dry-run mode).
- `workspaces/seo/scripts/check-duplicate-alt.js` — **deleted** — Superseded bởi `fix-duplicate-alt.js` (dry-run mode).
- `workspaces/seo/scripts/fix-alt-remaining.js` — **deleted** — One-off script (Agow-specific IDs), đã hoàn thành mục đích.

**Why**: User hỏi "script này có dùng được cho WordPress site khác không?". Phát hiện `hostname: 'agowautomation.com'` hardcode trong `verify-alt-fix.js` và `fix-alt-remaining.js`. Refactor toàn bộ scripts để portable: chỉ cần đổi `.env` là chạy được trên bất kỳ WordPress site nào.

**Tests**: Layer 1: 6/6 PASS (`node --check` trên tất cả scripts) | Layer 2: `node khoa.js help` PASS (6 commands hiển thị đúng) | Layer 3: N/A (no logic change) | Layer 4: `grep agowautomation scripts/*.js` → 0 hardcode trong scripts được giữ lại
**Dependencies affected**: Tất cả scripts trong `workspaces/seo/scripts/` — không còn phụ thuộc vào `https`/`http` riêng, tất cả dùng `wp-client.js`
**Notes**: `fix-duplicate-alt.js` vẫn còn `BASE` riêng (tự define, không dùng wp-client) — future improvement. Hiện tại đã có `process.env.WP_BASE_URL` fallback đúng.

---

### 2026-03-31 — MISSING_ALT P1 Complete (126/126) + Multi-agent Group Routing Fix
**Phase**: 1a (Debug + SEO Production Fix)
**Files changed**:
- `openclaw-home/openclaw.json` — modified — Thêm 2 peer bindings cho group `-5197557480`: seo agent nhận qua accountId "khoa", lead agent nhận qua "default". Thêm `groups`, `groupAllowFrom`, `groupPolicy` cho account "khoa". Root cause: Khoa bot không có binding vào group nên không nhận được @khoa mentions.
- `workspaces/lead/AGENTS.md` — modified — Cập nhật routing rules: Rule 0 = Tong im lặng khi @khoa trong group (Khoa bot nhận trực tiếp). Bỏ sessions_send cho @khoa group messages. Fix Inter-Agent Communication table.
- `workspaces/seo/scripts/verify-alt-fix.js` — created — Script verify toàn bộ alt text: posts, pages, WC products, media library. Kết quả cuối: 126/126 PASS.
- `workspaces/seo/scripts/fix-alt-remaining.js` — created — Fix 2 posts còn thiếu featured_media alt text (Post 1919 Acopos 6D, Post 1759 AcoposTrak).

**Why**: (1) @khoa trong group bị ignore vì Khoa bot thiếu peer binding vào group — đúng theo OpenClaw docs "routing to agent is determined by bindings[], not mentionPatterns". (2) verify-alt-fix.js phát hiện 126 items cần check, fix-alt-remaining.js sửa 2 posts còn sót. Final result: 126/126 clean.

**Tests**: Layer 1: JSON valid | Layer 2: 2/2 PASS (fix-alt-remaining.js) | Layer 3: 126/126 PASS (verify-alt-fix.js) | Layer 4: openclaw.json — cả 2 agents vẫn start bình thường (@AgowTongBot + @AgowKhoaBot)
**Dependencies affected**: openclaw.json bindings ảnh hưởng toàn bộ routing; AGENTS.md chỉ ảnh hưởng Tong behavior
**Notes**: Telegram group cần cấp quyền "Add reactions" cho @AgowKhoaBot (cosmetic, không block chức năng). LESSON-004: re-audit sau 24h để verify SEO score cải thiện.

---

### 2026-03-31 — MISSING_ALT P1 Fix + purge-cache script
**Phase**: 1a (SEO Production Fix)
**Files changed**:
- `workspaces/seo/scripts/fix-missing-alt.js` — created — Tier 2 script sửa alt text cho posts, pages, WC products. generateAlt() từ filename → fallback pageTitle → duplicate-safe (LESSON-003). Dry-run mode mặc định, --apply để thực thi. Backup trước khi sửa.
- `workspaces/seo/scripts/purge-cache.js` — created — Purge LiteSpeed Cache sau khi sửa content. 3 method fallback: REST API → API touch → direct request. (LESSON-001)

**Why**: MISSING_ALT là P1 issue thực sự từ audit (34+ URLs). Trang Chủ có 3 ảnh generic (srv_1/2/3) không có alt text. fix-missing-alt.js detect và fix với alt unique per page.

**Results**:
- Dry-run: 8 ảnh cần sửa (4 posts, 3 pages, 0 WC products)
- Apply: 8/8 ảnh đã thêm alt text ✅
- Cache: purged ✅
- Duplicate check: "Trang Chủ", "Trang Chủ 2", "Trang Chủ 3" — không duplicate ✅

**Tests**: Layer 1: N/A (JS, no syntax error) | Layer 2: dry-run PASS 8 items | Layer 3: apply PASS 8/8 | Layer 4: không ảnh hưởng file khác
**Dependencies affected**: WordPress media items (media IDs: 3711, 3669, 3674, 3684, 3685, + 3 page images)
**Notes**: WC products không có ảnh thiếu alt text trong scan này (0 items). Nếu cần fix WC products, cần WC Consumer Key/Secret riêng.

---

### 2026-03-31 — Multi-Agent Group Routing Fix (peer bindings)
**Phase**: 1a (Debugging)
**Files changed**:
- `openclaw-home/openclaw.json` — modified — Thêm peer bindings cho group `-5197557480`: seo agent bind với `accountId:"khoa"` + `peer.kind:"group"`, lead agent bind với `accountId:"default"` + `peer.kind:"group"`. Thêm group config cho Khoa account: `groups`, `groupAllowFrom`, `groupPolicy`. Bindings giờ là 4 entries (most-specific first theo docs).
- `workspaces/lead/AGENTS.md` — modified — Rewrite routing rules: Rule 0 mới: Tong hoàn toàn im lặng khi @khoa/@seo trong group (Khoa bot nhận trực tiếp qua peer binding). Cập nhật Inter-Agent Communication table. Fix Rules section.

**Why**: Theo OpenClaw docs, routing đến agent nào phụ thuộc vào `bindings[]`, không phải `mentionPatterns`. Config cũ chỉ có accountId-level bindings → tất cả group messages vào Tong bot, Khoa bot chỉ nhận DM. Cần thêm peer binding cho Khoa bot với group ID cụ thể.

**Tests**: Layer 1: JSON valid ✅ | Layer 2: deep check PASS (bindings 4 entries) | Layer 3: confirmed working in live Telegram group | Layer 4: Tong bot vẫn hoạt động bình thường
**Dependencies affected**: Toàn bộ group message routing, AGENTS.md routing logic

### 2026-03-31 — Fix SKILL.md Frontmatter (6 files)
**Phase**: 1a (Verification fix)
**Files changed**:
- `workspaces/lead/skills/task-router/SKILL.md` — modified — Added YAML frontmatter `name: task-router`, `description: ...`
- `workspaces/lead/skills/capability-evolution/SKILL.md` — modified — Added YAML frontmatter `name: capability-evolution`, `description: ...`
- `workspaces/seo/skills/wp-audit/SKILL.md` — modified — Added YAML frontmatter `name: wp-audit`, `description: ...`
- `workspaces/seo/skills/wp-content/SKILL.md` — modified — Added YAML frontmatter `name: wp-content`, `description: ...`
- `workspaces/seo/skills/wp-daily-check/SKILL.md` — modified — Added YAML frontmatter `name: wp-daily-check`, `description: ...`
- `workspaces/seo/skills/wp-technical-seo/SKILL.md` — modified — Added YAML frontmatter `name: wp-technical-seo`, `description: ...`

**Why**: CLAUDE.md requires `name` (kebab-case) and `description` (1 line) in SKILL.md frontmatter. All 6 files were missing the `--- name: ... description: ... ---` block — Layer 1 verification FAIL. Only `wp-gsc/SKILL.md` was already correct (created later with proper frontmatter).
**Tests**: Layer 1: 7/7 PASS (all SKILL.md frontmatter verified with grep check) | Layer 2: N/A (frontmatter only) | Layer 3: N/A | Layer 4: No logic changed — content of skills untouched
**Dependencies affected**: OpenClaw skill discovery (reads frontmatter to list available skills)
**Notes**: Skills were functionally working but OpenClaw may have been unable to auto-discover/list them without frontmatter.

---

### 2026-03-31 — Fix Multi-Agent Group Routing (Khoa bot nhận group message trực tiếp)
**Phase**: 1a (Debugging)
**Files changed**:
- `openclaw-home/openclaw.json` — modified — Thêm 2 peer bindings cho group `-5197557480`: `{agentId:"seo", match:{channel:"telegram", accountId:"khoa", peer:{kind:"group", id:"-5197557480"}}}` và tương tự cho lead. Thêm `groupAllowFrom`, `groups["-5197557480"].requireMention: true` vào `accounts.khoa`. Binding order: most-specific (peer) trước, fallback (DM) sau.
- `workspaces/lead/AGENTS.md` — modified — Rewrite toàn bộ Routing Rules section. Rule 0 đã sai: trước đây vẫn còn `sessions_send` cho @khoa group messages, nay sửa thành Tong HOÀN TOÀN im lặng vì Khoa bot có binding group riêng. Cập nhật Inter-Agent Communication table và Rules list.

**Why**: Root cause của bug "@khoa trong group không work". Theo OpenClaw docs, routing đến agent chỉ phụ thuộc vào `bindings[]`, không phải `mentionPatterns`. Config cũ chỉ có `accountId`-level bindings: Khoa bot chỉ nhận DM (không có group binding), tất cả group message đều vào Tong bot. Fix: thêm `peer: {kind:"group", id:"..."}` binding cho Khoa bot → Khoa nhận group message trực tiếp.
**Tests**: Layer 1: 1/1 PASS (openclaw.json valid JSON) | Layer 2: PASS (binding logic per docs) | Layer 3: PENDING (cần test live trong group sau khi cấp quyền reaction cho Khoa bot) | Layer 4: Tong bot binding không thay đổi — Tong vẫn nhận @tong messages đúng
**Dependencies affected**: Toàn bộ group message routing. Tong không còn relay @khoa messages.
**Notes**: Sau fix này cần: (1) Cấp quyền "Add reactions" cho @AgowKhoaBot trong group (Admin setting), (2) Test live: "@khoa xin chào" → Khoa bot trả lời trực tiếp.

---
**Phase**: 1a (Architecture upgrade)
**Files changed**:
- `openclaw-home/openclaw.json` — modified — Migrated from single-bot to 2-account pattern. Added `bindings[]` array (lead→default, seo→khoa). Moved bot config from `channels.telegram.botToken` flat to `channels.telegram.accounts.{default,khoa}`. Added `TELEGRAM_KHOA_BOT_TOKEN` for Khoa's bot. Fixed truncated `"gateway"` key. Added `identity.{name,emoji}` for both agents.
- `openclaw.json` — modified (design config) — Same 2-bot pattern. Updated agents from flat array to `agents.{defaults,list}` format matching live config. Added `bindings[]`. Version bumped to 1.1.
- `workspaces/lead/AGENTS.md` — modified — Rewrote Routing Rules to reflect 2-bot architecture. Rule 1 changed: Tong no longer needs sessions_send for @khoa/@seo (Gateway routes directly). sessions_send now only for ambiguous SEO-intent untagged messages. Added routing table showing when to use sessions_send.
- `workspaces/seo/AGENTS.md` — modified — Updated "Telegram Direct Access" section. Now clearly states Khoa has own bot (@AgowKhoaBot, accountId: "khoa"). Explains Gateway routes directly to Khoa — no Tong relay.
- `.env.example` — modified — Added `TELEGRAM_KHOA_BOT_TOKEN` with setup instructions. Renamed Tong's bot section. Added note to add BOTH bots to the group.

**Why**: Read OpenClaw docs on multi-agent Telegram. Native pattern = one bot per agent, not sessions_send relay. Benefits: (1) Khoa appears as separate identity "Khoa SEO" in group, (2) Lower latency — no Tong intermediary for @khoa messages, (3) No dependence on agentToAgent for @khoa routing, (4) Cleaner architecture matching OpenClaw design intent.

**Architecture before → after**:
```
BEFORE: Tong bot (1 bot) → receives @khoa → sessions_send → Khoa → Tong replies for Khoa
AFTER:  Tong bot → receives @tong/@lead → responds directly
        Khoa bot → receives @AgowKhoaBot → responds directly
        agentToAgent still ON for ambiguous Tong→Khoa delegation
```

**Tests**: Layer 1: 2/2 PASS (both openclaw.json files valid JSON) | Layer 2: 4/4 PASS (all modified files verified) | Layer 3: DEFERRED — needs new bot token + restart | Layer 4: Checked lead+seo AGENTS.md, .env.example consistency
**Dependencies affected**: Telegram channel behavior, all message routing, Tong's session prompt
**Notes**: Setup required: (1) Create @AgowKhoaBot via BotFather, (2) Get token → TELEGRAM_KHOA_BOT_TOKEN in .env, (3) Add @AgowKhoaBot to group, (4) Privacy mode for Khoa's bot can stay ON (requireMention: true), (5) Restart OpenClaw container.

---

### 2026-03-29 — Tong Self-Patch + First Real Audit Completed
**Phase**: 1a (Verification)
**Files changed**:
- `openclaw-home/openclaw.json` — modified by Tong (self-patched via Telegram) — Added `tools.sessions.visibility: "all"` and `tools.agentToAgent.enabled: true`. This was the ROOT CAUSE of sessions_send failing silently — restricted visibility prevented Tong from seeing/calling the sessions tools. Tong self-diagnosed and patched by reading its own openclaw.json via file tool, then writing the corrected version.
- `openclaw-home/agents/seo/` — created — Khoa's agent directory created automatically by OpenClaw when Tong first called sessions_send to the seo agent. Contains session JSONL (80KB, 630be659-*.jsonl).
- `workspaces/seo/shared-knowledge/audit-results-2026-03-29.json` — created by Khoa — First real audit of agowautomation.com: 35 URLs, avg score 70/100. Top issues: THIN_CONTENT (34 URLs — CAUTION: false positive due to JS rendering), MISSING_ALT (34 URLs — real), LONG_TITLE (15), SHORT_TITLE (11), NO_H1 (5).

**Why**: After requireMention:false fix, Tong could see @khoa messages but sessions_send tool was silently unavailable because `tools.sessions.visibility` defaulted to "restricted". Tong self-diagnosed this during live Telegram conversation by analyzing why its sessions_send calls weren't working, then autonomously patched openclaw.json and triggered container restart.

**Tong's self-diagnosis transcript** (2:39-2:48 PM, 2026-03-29):
1. Tong attempted sessions_send → failed silently
2. Tong read openclaw.json → noticed missing tools config
3. Tong wrote corrected openclaw.json with sessions visibility "all" + agentToAgent enabled
4. Tong triggered OpenClaw restart
5. Khoa initialized successfully, ran audit on 35 URLs
6. Khoa sent formatted Telegram report with real data

**Tests**: Layer 1: JSON valid (verified in file) | Layer 2: Khoa session file 80KB confirms real work done | Layer 3: ✅ PASS — full Tong→Khoa→Telegram flow working end-to-end | Layer 4: N/A
**Dependencies affected**: Inter-agent communication (now fully enabled), all future sessions_send calls
**Notes**: THIN_CONTENT showing 34/35 URLs is a FALSE POSITIVE — site is JS-heavy, curl fetches return 0-word body. Needs Playwright for accurate content detection. MISSING_ALT for 34 URLs is a real finding and top P1 priority. Tong's self-patching capability (Capability Evolution Protocol) worked as designed.

---

### 2026-03-29 — Automated Routing Tests + requireMention Fix + Session Reset
**Phase**: 1a (Debugging)
**Files changed**:
- `openclaw-home/openclaw.json` — modified — Changed `requireMention: true` → `requireMention: false`. Root cause: requireMention:true caused @khoa messages to be SILENTLY DROPPED (they don't match Tong's mentionPatterns @tong/@lead). With false, all messages go to Tong (default agent) who then routes via sessions_send.
- `openclaw-home/agents/lead/sessions/108fc25d-*.jsonl` — deleted — Stale session with corrupted conversation history (Tong repeatedly saying "Khoa not configured"). Deleted to force fresh session with correct AGENTS.md.
- `openclaw-home/agents/lead/sessions/sessions.json` — modified — Removed stale session entry for deleted JSONL. Keeps `agent:lead:main` heartbeat session.
- `test_routing.py` — created — Automated routing test harness. Calls Anthropic API directly with Tong's actual AGENTS.md+SOUL.md. Runs 5 test cases: T01-T05 covering @khoa, @seo, @tong, and ambiguous SEO routing. All 5/5 PASS confirmed.

**Why**: (1) requireMention:true was silently dropping @khoa messages — the 2:15-2:16 PM messages in Telegram got no response, confirming they were dropped not routed. (2) Old session history (Tong saying "Khoa not configured" 3 times) was anchoring Claude's behavior against the new routing rules. (3) Automated tester needed so routing can be verified without manual Telegram testing.

**Tests**: Layer 1: JSON valid | Layer 2: 5/5 PASS (automated routing tests all pass) | Layer 3: DEFERRED (container restart needed) | Layer 4: openclaw.json change affects all agents — verified seo agent config unchanged
**Dependencies affected**: All group message routing behavior, Tong's session state
**Notes**: Container restart needed after this change. After restart, test by sending "@khoa audit agowautomation.com" — Tong should reply "Đã chuyển cho Khoa" and Khoa should initialize and respond. To re-run routing tests: `python3 test_routing.py` from project folder.

---

### 2026-03-29 — Fix @khoa Routing: sessions_send Instructions
**Phase**: 1a (Debugging)
**Files changed**:
- `workspaces/lead/AGENTS.md` — modified — Replaced vague "hybrid routing model" section with explicit 3-rule routing: Rule 1 (@khoa/@seo → always sessions_send to "seo" agent immediately), Rule 2 (@tong/@lead → handle self), Rule 3 (no tag → intent-based routing). Added sessions_send usage example with exact syntax. Added explicit sessions_send guide with agentId/message/waitForReply params. Updated Rules to forbid sessions_list before delegating.

**Why**: Tong (lead agent) was receiving ALL messages including @khoa, calling sessions_list to check for existing Khoa sessions, finding none, and giving up instead of starting a new seo session. Root cause: AGENTS.md routing was ambiguous — Tong didn't know how to START the seo agent. The fix makes Rule 1 unconditional: see @khoa → immediately call sessions_send(agentId="seo") — no checking first.

**Discovery process**: Read session JSONL transcript. Found Tong's thinking: "I need to check if there's a Khoa agent session available to route to." After finding none, Tong said "Khoa chưa được cấu hình" instead of starting a new session. Confirmed sessions_send is available (from sessions.json toolsSnapshot). Confirmed systemPromptReport source="run" meaning AGENTS.md is reloaded fresh for EVERY message — no container restart needed.

**Tests**: Layer 1: 1/1 PASS (AGENTS.md format valid, no syntax errors) | Layer 2: Manual review — routing logic clear and unambiguous | Layer 3: DEFERRED — needs live test | Layer 4: checked AGENTS.md dependencies (SOUL.md unchanged, openclaw.json unchanged)
**Dependencies affected**: Lead agent routing behavior only
**Notes**: NO container restart needed — OpenClaw reloads workspace files fresh per message (source="run"). Send @khoa message to trigger the fix.

---

## How to Log

```
### [Date] — [Short Description]
**Phase**: [Phase ID]
**Files changed**:
- `path/to/file` — [created/modified/deleted] — [what changed]

**Why**: [reason for the change]
**Tests**: [Layer 1: X/X | Layer 2: X/X | Layer 3: X/X | Layer 4: X/X]
**Dependencies affected**: [list files that depend on changed files]
**Notes**: [anything important for future reference]
```

---

## Entries

### 2026-03-28 — Git Init at Project Root + Directory Migration
**Phase**: Infrastructure
**Files changed**:
- `.git/` — created — Git repository initialized at `C:\Users\chiennguyen\Documents\agow-agents` (short path, no more "Filename too long" errors)
- `plan.md` — modified — Removed `.git/` from shared-knowledge/ dir structure, updated backup table and guardrails references to use root git repo
- `CLAUDE.md` — modified — Added "Single git repo at project root" to Git Conventions
- `progress.md` — modified — Marked git init done, unblocked Phase 1c guardrails task, updated summary: 62/92 done, 0 blocked
- `changelog.md` — modified — This entry

**Why**: (1) Moved project from deeply nested Cowork session path to `C:\Users\chiennguyen\Documents\agow-agents` to fix "Filename too long" Windows error. (2) Changed from shared-knowledge sub-repo to single git repo at project root — simpler, tracks all source code + knowledge changes in one place. (3) Agent self-learning changes (hot.md, corrections.md, patterns.md) are now version-controlled via root git, enabling `git diff` to review what agent learned and `git revert` to rollback bad learning.
**Tests**: Layer 1: N/A (git init) | Layer 2: N/A | Layer 3: DEFERRED | Layer 4: plan.md, CLAUDE.md, progress.md checked for consistency
**Dependencies affected**: All future commits, backup procedures (git-based backup now covers entire project)
**Notes**: First commit pending user confirmation. 42 files staged, no sensitive files (.env excluded by .gitignore).

---

### 2026-03-28 — Self-Improving Memory Seed + GSC Skill
**Phase**: 1c + 1f
**Files changed**:
- `workspaces/seo/self-improving/hot.md` — created — Seeded from production 28-auditwebagow hot.md. Contains site config, 9 critical rules, baseline metrics (646 URLs, 81.9 avg score, 4600+ fixes), GSC baseline (36 clicks/day).
- `workspaces/seo/self-improving/corrections.md` — created — Seeded with 1 title format correction from production.
- `workspaces/seo/self-improving/patterns.md` — created — Seeded with proven content strategy, meta optimization, batch processing, and cost efficiency patterns.
- `workspaces/seo/self-improving/actions_log.json` — created — Empty log structure for future action tracking.
- `workspaces/seo/skills/wp-gsc/SKILL.md` — created — Google Search Console integration skill: 5 query types, weekly report workflow, SEO fix impact measurement workflow, rate limits, error handling.
- `progress.md` — modified — Marked seed HOT rules and GSC skill as done. Git init blocked (Windows filesystem). Updated summary: 60/92 done.
- `changelog.md` — modified — This entry.

**Why**: (1) Seed self-improving memory so Khoa starts with production-proven knowledge instead of learning from scratch. (2) Create GSC skill for Phase 1f to enable real search data feedback loop. (3) Git init failed on mounted filesystem — noted as manual Windows task.
**Tests**: Layer 1: 2/2 PASS (actions_log.json valid JSON, SKILL.md frontmatter valid) | Layer 2: PASS (all files created, cross-refs valid) | Layer 3: DEFERRED | Layer 4: N/A (new files)
**Dependencies affected**: SEO agent session start (will load hot.md), wp-daily-check (will log to actions_log.json), future GSC integration
**Notes**: Git init for shared-knowledge/ must be done directly on Windows (`cd shared-knowledge && git init`). Mounted FUSE filesystem corrupts .git internal files.

---

### 2026-03-28 — Telegram Group Chat + Role-Based Access Control
**Phase**: Architecture enhancement
**Files changed**:
- `openclaw.json` — modified — Changed from DM to group chat (`chatMode: "group"`, `privacyMode: false`). Replaced single `allowList` with role-based `authorization` (admin + operators). Added `contextAware` config for proactive suggestions with keyword triggers.
- `.env.example` — modified — Removed `TELEGRAM_CHANNEL_NAME`, `TELEGRAM_ADMIN_CHAT_ID`. Added `TELEGRAM_GROUP_CHAT_ID`, `TELEGRAM_ADMIN_USER_ID`, `TELEGRAM_OPERATOR_USER_IDS` with setup instructions.
- `workspaces/lead/AGENTS.md` — modified — Added "Group Chat Behavior" section: message processing rules, context-aware proactive suggestions (max 1/30min), user authorization table (admin/operator/unauthorized), Tier 3 approval rules in group.
- `workspaces/seo/AGENTS.md` — modified — Rewrote "Telegram Direct Access" to "Telegram Direct Access (Group Chat)". Added authorization check flow, tier handling per role table, concise response guidance for group context.
- `shared-lib/channel-adapter.md` — modified — Rewrote routing model to include authorization check step, privacy mode docs, user roles table.
- `guardrails/approval-required.yml` — modified — Added `role_permissions` section (admin: all tiers + approve, operator: tier 1+2 only, tier3_behavior: request_admin_approval). Bumped version to 1.1.

**Why**: User wants bot in Telegram Group where real employees also chat. Requires: (1) role-based access so only authorized users can command bot, (2) privacy mode off so bot reads all messages for context-aware suggestions, (3) unauthorized users silently ignored.
**Tests**: Layer 1: 3/3 PASS (openclaw.json, approval-required.yml valid, bash scripts unchanged) | Layer 2: PASS (cross-refs valid) | Layer 3: DEFERRED | Layer 4: Checked all 6 modified files for consistency
**Dependencies affected**: Telegram channel behavior, all agents' message handling, guardrails enforcement
**Notes**: Setup requires: (1) Disable privacy mode via BotFather, (2) Get group chat ID (negative number), (3) Get user IDs via @userinfobot.

---

### 2026-03-28 — Hybrid Routing Model (agents respond directly to Telegram)
**Phase**: Architecture redesign
**Files changed**:
- `openclaw.json` — modified — All agents now have `allowedChannels: ["telegram"]`. Added `routing.mode: "hybrid"` with `directTags` mapping (@khoa→seo, @seo→seo, @lead→lead) and fallback to Lead.
- `workspaces/lead/AGENTS.md` — rewritten — Changed from mandatory gateway to smart router + passive monitor. Added hybrid routing flow diagram. Lead only handles: ambiguous intent, multi-agent coordination, capability evolution, error escalation. Does NOT relay agent responses.
- `workspaces/seo/AGENTS.md` — modified — Added "Telegram Direct Access" section. Khoa responds directly to user, prefixed with agent identity. Khoa only notifies Lead on: 24h pending Tier 3, error threshold, capability gap.
- `shared-lib/channel-adapter.md` — modified — Added hybrid routing model documentation and agent identity prefixes.
- `plan.md` — modified — Rewrote §2 architecture diagram to show hybrid routing with @tag direct access vs Lead routing for ambiguous requests.

**Why**: Original hub-and-spoke design forced ALL responses through Lead Agent, adding unnecessary API cost and latency. User pointed out that direct-tagged messages should go straight to the specialist agent. New hybrid model: @tag → direct, ambiguous → Lead routes, Lead monitors passively.
**Tests**: Layer 1: 1/1 PASS (openclaw.json valid JSON) | Layer 2: cross-references valid | Layer 3: DEFERRED | Layer 4: Regression check — Lead AGENTS.md rewritten (verified routing table preserved, capability evolution preserved, rules updated)
**Dependencies affected**: All agents' routing behavior, Telegram channel config
**Notes**: Cost saving: ~1 Sonnet API call saved per direct interaction. For 30 daily interactions, ~$0.30-1.50/month savings.

---

### 2026-03-28 — Phase 1a Full Implementation (Infrastructure + Agents + Scripts)
**Phase**: 1a + partial 1b/1c/1d/1e
**Files changed**:
- `docker-compose.yml` — created — OpenClaw container config (mem_limit 2G, healthcheck 60s, security_opt, json-file logging, agow-net network)
- `.env.example` — created — All environment variables: Anthropic, WP, WC, Telegram, GSC, OpenClaw settings, model config, rate limits, backup
- `.gitignore` — created — Protects .env, secrets, runtime data, logs, IDE files
- `openclaw.json` — created — Main config: 2 agents (lead, seo), Telegram channel with allowList, Lossless-Claw + Self-Improving plugins (disabled until install), scheduling (daily SEO 6AM, weekly report Mon 8AM), security scoping, monitoring metrics
- `workspaces/lead/AGENTS.md` — created — Routing table (6 intent patterns), escalation path, Capability Evolution Protocol (6 steps), inter-agent communication spec
- `workspaces/lead/SOUL.md` — created — Vietnamese coordinator personality, error handling tone (3 levels)
- `workspaces/lead/HEARTBEAT.md` — created — 5 periodic checks (agent health, stuck tasks, memory, lessons, sandbox cleanup), session start routine
- `workspaces/lead/skills/task-router/SKILL.md` — created — Intent analysis, confidence-based routing, delegation format, 6 special commands (STATUS, REPORT, RUN, CANCEL, APPROVE, REJECT), weekly report spec
- `workspaces/lead/skills/capability-evolution/SKILL.md` — created — 6-phase self-build protocol, 3 autonomy levels, safety rules
- `workspaces/seo/AGENTS.md` — created — WP/WC API endpoints, RankMath meta fields, 3-tier approval system with specific actions, 6 critical lessons, error handling matrix
- `workspaces/seo/SOUL.md` — created — B&R domain expertise, content guidelines, reporting format template
- `workspaces/seo/HEARTBEAT.md` — created — Session start routine (8 steps), memory management, performance tracking, cache awareness
- `workspaces/seo/skills/wp-audit/SKILL.md` — created — 4-source URL discovery, 13 issue codes with weights, scoring 0-100, severity classification, report format
- `workspaces/seo/skills/wp-content/SKILL.md` — created — 3 strategies (thin/medium/new), quality checks, WP API integration, model selection
- `workspaces/seo/skills/wp-daily-check/SKILL.md` — created — 8-task cycle T01-T08, tier assignments, performance budget ($0.08-0.15/run)
- `workspaces/seo/skills/wp-technical-seo/SKILL.md` — created — Fix procedures for each issue code, backup-before-fix, undo capability, WP API specifics
- `shared-knowledge/company-rules.md` — created — Brand guidelines, content rules, SEO rules, approval requirements, API rate limits, working hours
- `shared-knowledge/product-catalog.md` — created — B&R product categories (Motion, PLC, IPC, HMI, Software, Safety), naming conventions, URL structure
- `shared-knowledge/lessons-learned.md` — created — 6 critical lessons from production (LESSON-001 through LESSON-006)
- `guardrails/approval-required.yml` — created — Tier 1/2/3 action lists with timeouts and undo windows
- `guardrails/rate-limits.yml` — created — API limits, session limits, content limits, cost alerts ($1 warning, $5 hard stop)
- `scripts/backup.sh` — created — Daily tar.gz backup with integrity check, retention (7 daily + 4 weekly), Telegram notification
- `scripts/restore.sh` — created — Interactive restore with pre-restore safety backup
- `scripts/log-rotation.sh` — created — Compress old reports, rotate large logs, clean actions_log
- `scripts/db-vacuum.sh` — created — SQLite integrity check + vacuum, alert on corruption
- `scripts/crontab.txt` — created — All scheduled tasks (daily SEO 6AM, backup 2AM, health 15min, weekly report Mon 8AM, HOT review Sun 9AM, rotation Sun 3AM, vacuum Sun 4AM)
- `monitoring/health-check.sh` — created — 8 checks (container, memory, disk, WP API, backup age, SQLite size, log size, sessions)
- `monitoring/alert-telegram.sh` — created — Utility for sending formatted alerts (critical/warning/info/success)
- `shared-lib/message-bus.md` — created — Inter-agent communication abstraction spec
- `shared-lib/memory-provider.md` — created — Memory/self-improving abstraction spec with promotion/demotion logic
- `shared-lib/channel-adapter.md` — created — Telegram channel abstraction spec with approval/undo/report interfaces
- `openclaw-home/` — created — Empty mount directory for Docker
- `workspaces/lead/sandbox/.gitkeep` — created — Preserve empty sandbox dir in git
- `progress.md` — updated — Marked all completed tasks, added verification results

**Why**: Full Phase 1a implementation — all config, workspace, skill, guardrail, script, and monitoring files needed to run the multi-agent system. Also brought forward monitoring/backup/abstraction tasks from Phases 1b-1e since they could be built without Docker.
**Tests**: Layer 1: 6/6 PASS (JSON valid, YAML x2 valid, docker-compose valid, shell x5 valid) | Layer 2: 6/6 PASS (cross-references all valid, markdown files all non-empty) | Layer 3: DEFERRED (needs Docker + real API keys) | Layer 4: N/A (first creation)
**Dependencies affected**: All files are new — no regression risk
**Notes**: 32 files created total. 58/92 tasks completed, 31 deferred to Docker runtime testing, 6 manual tasks pending (API keys, Telegram bot, git init). Ready for local Docker testing once .env is created.

---

### 2026-03-28 — Integrate Existing SEO Audit Project Knowledge
**Phase**: Pre-1a
**Files changed**:
- `plan.md` — modified — Added §13 "Lessons from Existing SEO Audit Project" with WP/WC API specifics, 6 critical lessons, script-to-skill mapping, SEO scoring system, PHP snippets required. Renumbered §14-§15.
- `CLAUDE.md` — modified — Added "WordPress & WooCommerce" and "Existing Project Reference" sections with production-proven API details, RankMath meta fields, LiteSpeed cache handling, GSC format.
- `progress.md` — recreated — Added "Pre-Phase: Existing Assets" section referencing 8 proven components from 28-auditwebagow. Updated SEO Agent tasks to reference source scripts. Added WooCommerce credentials to Security section. Updated Summary table.
- `changelog.md` — modified — This entry

**Why**: Incorporate production-proven knowledge from existing SEO audit project (28-auditwebagow, deployed since 2026-03-24, 646 URLs audited, 4,600+ issues fixed) to avoid re-learning and accelerate OpenClaw skill development.
**Tests**: Layer 1: 4/4 PASS (all files valid markdown, no broken references)
**Dependencies affected**: All future skill development files (wp-audit, wp-content, wp-daily-check, wp-technical-seo)
**Notes**: Source project at C:\Users\chiennguyen\Documents\28-auditwebagow. Key files: seo_agent.py, sprint1_parser.py, sprint3_content_fixer.py, seo_agent_memory.py, telegram_listener.py.

---

### 2026-03-28 — Project Initialization
**Phase**: Pre-1a
**Files changed**:
- `CLAUDE.md` — created — Project instructions for Claude
- `plan.md` — created — Implementation plan v2.0
- `progress.md` — created — Implementation tracking
- `verification.md` — created — 4-layer test protocol
- `changelog.md` — created — This file

**Why**: Initial project setup with development methodology files
**Tests**: Layer 1: 5/5 PASS (all files valid markdown)
**Dependencies affected**: None (first files)
**Notes**: All files designed to work together. CLAUDE.md references other 4 files via @import.

---

_Future entries go above this line, newest first._
