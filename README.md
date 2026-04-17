# Agow Automation — Multi-Agent System (OpenClaw)

Hệ thống đa tác nhân tự động hóa SEO và vận hành cho [agowautomation.com](https://agowautomation.com) — nhà phân phối thiết bị B&R Automation tại Việt Nam.

Platform: **OpenClaw** chạy trong Docker, giao tiếp qua **Telegram**.

---

## Kiến trúc

```
User (Telegram)
  │
  ├─ @khoa / @seo ──→ Khoa (SEO Agent) ──→ responds trực tiếp
  ├─ @tong / @lead ─→ Tong (Lead Agent) ──→ responds trực tiếp
  └─ ambiguous ─────→ Tong routes → Khoa
```

| Agent | ID | Vai trò |
|-------|-----|---------|
| Tong — Lead | `lead` | Routing, monitoring, Capability Evolution |
| Khoa — SEO | `seo` | SEO audit, content, WordPress automation |
| Warehouse | `warehouse` | Phase 2 |
| Accounting | `accounting` | Phase 3 |

---

## Cấu trúc thư mục

```
agow-agents/
├── docker-compose.yml          ← Chạy OpenClaw container
├── openclaw.json               ← Config chính: agents, Telegram, scheduling
├── .env                        ← API keys (KHÔNG commit)
├── .env.example                ← Template
│
├── workspaces/
│   ├── lead/                   ← Lead Agent "Tong"
│   │   ├── AGENTS.md           ← Routing rules, Capability Evolution protocol
│   │   ├── SOUL.md             ← Personality
│   │   ├── HEARTBEAT.md        ← Periodic health checks
│   │   └── skills/
│   │       ├── task-router/    ← Intent routing skill
│   │       └── capability-evolution/  ← Self-build new skills
│   │
│   └── seo/                    ← SEO Agent "Khoa"
│       ├── AGENTS.md           ← WP/WC API procedures, 3-tier approval
│       ├── SOUL.md             ← Personality, domain expertise B&R
│       ├── HEARTBEAT.md        ← Session start routine
│       ├── self-improving/     ← HOT/WARM/COLD memory (git-versioned)
│       ├── skills/             ← 6 SEO skill modules
│       └── scripts/            ← Node.js automation scripts
│
├── shared-knowledge/           ← Cross-agent knowledge (git-versioned)
│   ├── company-rules.md
│   ├── product-catalog.md
│   └── lessons-learned.md
│
├── guardrails/                 ← Approval rules, rate limits
├── monitoring/                 ← Health check scripts
├── scripts/                    ← Backup, log rotation, DB vacuum
└── shared-lib/                 ← Abstraction layer docs
```

---

## Cài đặt

### 1. Clone và cấu hình

```bash
git clone git@github.com:chiennguyenada/agow-agents.git
cd agow-agents
cp .env.example .env
# Điền API keys vào .env
```

### 2. Biến môi trường cần thiết (`.env`)

```
# WordPress
WP_BASE_URL=https://agowautomation.com
WP_USERNAME=your_wp_user
WP_APP_PASSWORD=xxxx xxxx xxxx xxxx xxxx xxxx

# WooCommerce (riêng với WP)
WC_CONSUMER_KEY=ck_...
WC_CONSUMER_SECRET=cs_...

# Claude API
ANTHROPIC_API_KEY=sk-ant-...

# Telegram
TELEGRAM_BOT_TOKEN=...
TELEGRAM_GROUP_CHAT_ID=-100...
TELEGRAM_ADMIN_USER_ID=...
```

### 3. Khởi động

```bash
docker compose up -d
docker compose logs -f
```

---

## Khoa — SEO Scripts

Toàn bộ automation SEO chạy qua entry point duy nhất: `workspaces/seo/scripts/khoa.js`

```bash
# Chạy trong Docker container
docker exec agow-openclaw node /home/node/.openclaw/workspaces/seo/scripts/khoa.js <command>

# Hoặc trực tiếp nếu có Node.js local
node workspaces/seo/scripts/khoa.js <command>
```

### Commands

| Command | Mô tả |
|---------|-------|
| `check-short-desc` | Tìm short_description có noise/quá ngắn (dry-run) |
| `fix-short-desc` | Strip noise khỏi short_desc. `--apply` để ghi |
| `check-long-desc` | Tìm long_description có noise (dry-run) |
| `fix-long-desc` | Strip noise khỏi long_desc (giữ HTML). `--apply` để ghi |
| `check-hotline` | Tìm nội dung chứa hotline cũ (dry-run) |
| `fix-hotline` | Thay hotline cũ → mới. `--apply`, `--old="..."`, `--new="..."` |
| `check-meta` | Tìm NO_META_DESC / THIN_META_DESC (dry-run) |
| `fix-meta` | Ghi meta description. `--apply`, `--type=post\|page\|product` |
| `check-title` | Tìm title quá dài/ngắn (dry-run) |
| `fix-title` | Sửa LONG_TITLE tự động. `--apply` |
| `missing-alt` | Tìm ảnh chưa có alt text (dry-run) |
| `fix-missing-alt` | Sửa alt text bị thiếu. `--apply` |
| `check-duplicate-alt` | Tìm duplicate alt text (dry-run) |
| `fix-duplicate-alt` | Sửa duplicate alt text. `--apply` |
| `rewrite-product` | AI viết lại title + short_desc. `--id=N`, `--limit=N`, `--resume` |
| `apply-rewrite-product` | Push kết quả AI lên WooCommerce |
| `verify` | Xác nhận alt text đã áp dụng đúng |
| `export-dry-run` | Export dry-run ra CSV |
| `purge-cache` | Purge LiteSpeed Cache |
| `help` | Liệt kê tất cả commands |

### Options chung

```bash
--apply          # Ghi thật lên site (không có = dry-run)
--id=N           # Chỉ xử lý 1 item (product/page/post ID)
--type=product   # Chỉ 1 loại: product | page | post | category
```

### Workflow chuẩn (mỗi đợt fix)

```bash
# 1. Kiểm tra noise
node khoa.js check-short-desc
node khoa.js check-long-desc
node khoa.js check-hotline

# 2. Fix noise
node khoa.js fix-short-desc --apply
node khoa.js fix-long-desc --apply
node khoa.js fix-hotline --apply        # 028 6670 9931 → 0934 795 982

# 3. Fix meta + title
node khoa.js check-meta
node khoa.js fix-meta --apply
node khoa.js fix-title --apply

# 4. Fix images
node khoa.js missing-alt
node khoa.js fix-missing-alt --apply
node khoa.js check-duplicate-alt
node khoa.js fix-duplicate-alt --apply

# 5. Luôn purge cache sau khi fix
node khoa.js purge-cache
```

---

## Self-Improving Memory (Khoa)

Khoa tự học qua 3 tầng memory tại `workspaces/seo/self-improving/`:

| File | Tầng | Mô tả |
|------|------|-------|
| `hot.md` | HOT | Luật áp dụng mỗi session (tối đa 50 luật) |
| `corrections.md` | WARM | Corrections đã ghi nhận, chờ promote |
| `patterns.md` | WARM | Patterns học được từ production |

Thay đổi self-improving được commit vào git — có thể `git revert` nếu học sai.

---

## Guardrails — 3 tầng phê duyệt

| Tier | Hành động | Cần approval? |
|------|-----------|---------------|
| 1 — Auto | Audit, đọc data, tạo draft, báo cáo | Không |
| 2 — Notify | Sửa meta, alt text, internal links | Không (undo trong 24h) |
| 3 — Approve | robots.txt, sitemap, publish, plugin, schema | **Có — gửi preview qua Telegram** |

---

## Tài liệu nội bộ

| File | Nội dung |
|------|---------|
| `plan.md` | Implementation plan v2.0 |
| `progress.md` | Trạng thái thực thi hiện tại |
| `changelog.md` | Lịch sử thay đổi |
| `verification.md` | Protocol kiểm thử 4 lớp |
| `CLAUDE.md` | Hướng dẫn cho Claude Code |

---

## Bảo mật

- **KHÔNG** commit `.env` — chỉ commit `.env.example`
- WordPress API key giới hạn scope: Posts + Media only
- Agents chỉ tạo DRAFT, không publish trực tiếp
- Không sửa `robots.txt`, `.htaccess`, sitemap mà không có approval flow

## Khi chạy section mới
- Copy dòng này vào cli: Đọc lại CLAUDE.md plan.md progress.md changelog.md và tiếp tục

## TK email gemini
- christ.nguyen.au@gmail.com