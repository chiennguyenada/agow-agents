#!/usr/bin/env node
/**
 * khoa.js — Khoa's single entry point for all SEO scripts
 *
 * Usage:
 *   node khoa.js <command> [options]
 *
 * Commands:
 *   check-meta                  Tìm NO_META_DESC/THIN_META_DESC + đề xuất semantic (dry-run)
 *   fix-meta                    Ghi meta description. --apply, --id=N, --type=post|page|product
 *   check-short-desc            Tìm short_description có noise / quá ngắn (dry-run)
 *   fix-short-desc              Xoá noise + rebuild short_desc ngắn. --apply, --id=N
 *   check-hotline               Tìm nội dung chứa hotline cũ (dry-run)
 *   fix-hotline                 Thay hotline cũ → mới. --apply, --id=N, --type=product|page|post|category
 *   check-long-desc             Tìm long_description có noise (manual refs, metadata block) (dry-run)
 *   fix-long-desc               Xoá noise khỏi long_desc (giữ nguyên HTML). --apply, --id=N
 *   check-title                 Tìm title bị LONG/SHORT (dry-run, không sửa)
 *   fix-title                   Sửa LONG_TITLE tự động. --apply, --id=N
 *   missing-alt                 Tìm ảnh chưa có alt text (dry-run, không sửa)
 *   fix-missing-alt             Sửa alt text bị thiếu. --apply, --id=N
 *   check-duplicate-alt         Tìm duplicate alt text trên cùng 1 trang (dry-run, không sửa)
 *   fix-duplicate-alt           Sửa duplicate alt text. --apply, --id=N
 *   verify                      Xác nhận tất cả alt text đã được áp dụng đúng
 *   purge-cache                 Purge LiteSpeed Cache sau khi fix xong
 *   help                        Liệt kê tất cả commands
 *
 * Workflow chuẩn (mỗi đợt fix):
 *   1. check-short-desc → fix-short-desc --apply   (strip noise short_desc)
 *   2. check-long-desc  → fix-long-desc --apply    (strip noise long_desc)
 *   3. check-meta       → fix-meta --apply         (fill/extend meta desc, dùng short+long đã clean)
 *   4. purge-cache                                 (luôn purge sau fix)
 */

const { spawnSync } = require('child_process');
const path = require('path');

const SCRIPTS_DIR = path.dirname(process.argv[1]);
const command = process.argv[2];
const extraArgs = process.argv.slice(3); // pass-through: --apply, --dry-run, --id=N, etc.

const COMMANDS = {
  'export-dry-run': {
    script: 'export-dry-run.js',
    desc: 'Export kết quả dry-run ra CSV. --short/--long/--id=N',
    defaultArgs: [],
  },
  'check-meta': {
    script: 'fix-meta-desc.js',
    desc: 'Tìm NO_META_DESC/THIN_META_DESC + đề xuất semantic desc (dry-run)',
    defaultArgs: [],
  },
  'fix-meta': {
    script: 'fix-meta-desc.js',
    desc: 'Ghi meta description. Thêm --apply để ghi thật, --id=N, --type=post|page|product',
    defaultArgs: [],
  },
  'check-short-desc': {
    script: 'fix-short-desc.js',
    desc: 'Tìm short_description có noise/quá ngắn (dry-run)',
    defaultArgs: [],
  },
  'fix-short-desc': {
    script: 'fix-short-desc.js',
    desc: 'Strip noise + rebuild short_desc ngắn. Thêm --apply để ghi thật, --id=N',
    defaultArgs: [],
  },
  'check-hotline': {
    script: 'fix-hotline.js',
    desc: 'Tìm description chứa hotline cũ (dry-run). --type=product|page|post|category, --id=N',
    defaultArgs: [],
  },
  'fix-hotline': {
    script: 'fix-hotline.js',
    desc: 'Thay hotline cũ → mới. --apply để ghi, --id=N, --type=..., --old="..." --new="..."',
    defaultArgs: [],
  },
  'check-long-desc': {
    script: 'fix-long-desc.js',
    desc: 'Tìm long_description có noise (manual refs, metadata block) (dry-run)',
    defaultArgs: [],
  },
  'fix-long-desc': {
    script: 'fix-long-desc.js',
    desc: 'Strip noise khỏi long_desc (giữ HTML). Thêm --apply để ghi thật, --id=N',
    defaultArgs: [],
  },
  'rewrite-product': {
    script: 'ai-rewrite-product.js',
    desc: 'AI viết lại title + short_desc cho products 2025. --id=N test 1, --limit=N test N, --resume tiếp tục',
    defaultArgs: [],
  },
  'apply-rewrite-product': {
    script: 'ai-rewrite-product.js',
    desc: 'Push cached AI results → WooCommerce. --id=N apply 1 SP, mặc định apply tất cả',
    defaultArgs: ['--apply'],
  },
  'check-title': {
    script: 'fix-title.js',
    desc: 'Tìm title bị LONG_TITLE/SHORT_TITLE (dry-run, không sửa)',
    defaultArgs: [],
  },
  'fix-title': {
    script: 'fix-title.js',
    desc: 'Sửa LONG_TITLE tự động. Thêm --apply để ghi thật, --id=N để fix 1 item',
    defaultArgs: [],
  },
  'missing-alt': {
    script: 'fix-missing-alt.js',
    desc: 'Tìm ảnh chưa có alt text (dry-run, không sửa)',
    defaultArgs: [],
  },
  'fix-missing-alt': {
    script: 'fix-missing-alt.js',
    desc: 'Sửa alt text bị thiếu. Thêm --apply để ghi thật, --id=N để fix 1 item',
    defaultArgs: [],
  },
  'check-duplicate-alt': {
    script: 'fix-duplicate-alt.js',
    desc: 'Tìm duplicate alt text trên cùng 1 trang (dry-run, không sửa)',
    defaultArgs: [],
  },
  'fix-duplicate-alt': {
    script: 'fix-duplicate-alt.js',
    desc: 'Sửa duplicate alt text. Thêm --apply để ghi thật, --id=N để fix 1 item',
    defaultArgs: [],
  },
  'verify': {
    script: 'verify-alt-fix.js',
    desc: 'Xác nhận tất cả alt text đã được áp dụng đúng',
    defaultArgs: [],
  },
  'purge-cache': {
    script: 'purge-cache.js',
    desc: 'Purge LiteSpeed Cache sau khi fix xong',
    defaultArgs: [],
  },

  // ── Project / Case Study Posts ───────────────────────────────────────────────
  'write-project': {
    script: 'write-project-post.js',
    desc: 'Viết bài case study dự án. --info=\'{...}\' | --info-file=path.json [--img-ids=ID1,ID2] [--schedule=YYYY-MM-DD]',
    defaultArgs: [],
  },
  'research-blog': {
    script: 'ai-write-blog.js',
    desc: 'Research + outline topic hôm nay từ GSC (dry-run, không ghi WP)',
    defaultArgs: [],
  },
  'write-blog': {
    script: 'ai-write-blog.js',
    desc: 'Viết bài + upload ảnh Unsplash + tạo draft WP. --topic="..." để chỉ định chủ đề',
    defaultArgs: ['--write'],
  },
  'publish-blog': {
    script: 'ai-write-blog.js',
    desc: 'Publish hoặc xóa draft. --id=N --publish | --id=N --reject',
    defaultArgs: [],
  },
  'schedule-blog': {
    script: 'ai-write-blog.js',
    desc: 'Lên lịch đăng bài. --id=N --schedule --date=YYYY-MM-DD (mặc định 08:00 sáng)',
    defaultArgs: ['--schedule'],
  },
  'pick-image': {
    script: 'pick-image.js',
    desc: 'Chèn ảnh đã chọn vào draft. --id=N --img1=1 --img2=1',
    defaultArgs: [],
  },
  'schedule-post': {
    script: 'schedule-post.js',
    desc: 'Lên lịch đăng bài (tối đa 2 bài/ngày, slot 8:00 & 14:00). --id=N [--from=YYYY-MM-DD]',
    defaultArgs: [],
  },
  'check-schedule': {
    script: 'schedule-post.js',
    desc: 'Xem lịch đăng bài 7 ngày tới (không schedule)',
    defaultArgs: ['--check'],
  },
};

if (!command || command === 'help') {
  console.log('Khoa SEO Scripts — available commands:\n');
  Object.entries(COMMANDS).forEach(([cmd, info]) => {
    console.log(`  node khoa.js ${cmd.padEnd(25)} ${info.desc}`);
  });
  console.log('\nWorkflow chuẩn:');
  console.log('  node khoa.js check-hotline              # 1b. Kiểm tra hotline cũ trong description');
  console.log('  node khoa.js fix-hotline --apply        # 1c. Thay hotline cũ → mới');
  console.log('  node khoa.js check-short-desc           # 1. Kiểm tra short_desc noise');
  console.log('  node khoa.js fix-short-desc --apply     # 2. Strip noise short_desc');
  console.log('  node khoa.js check-long-desc            # 3. Kiểm tra long_desc noise');
  console.log('  node khoa.js fix-long-desc --apply      # 4. Strip noise long_desc');
  console.log('  node khoa.js check-meta                 # 5. Kiểm tra meta desc');
  console.log('  node khoa.js fix-meta --apply           # 6. Ghi meta desc');
  console.log('  node khoa.js rewrite-product --id=5382      # 7a. Test AI rewrite 1 SP trước');
  console.log('  node khoa.js rewrite-product --limit=5      # 7b. Test AI rewrite 5 SP');
  console.log('  node khoa.js rewrite-product --resume       # 7c. AI rewrite tất cả (incremental)');
  console.log('  node khoa.js apply-rewrite-product --id=N  # 8a. Apply 1 SP sau khi review CSV');
  console.log('  node khoa.js apply-rewrite-product         # 8b. Apply tất cả sau khi review');
  console.log('  node khoa.js check-title                # 9. Kiểm tra title');
  console.log('  node khoa.js fix-title --apply          # 10. Sửa LONG_TITLE');
  console.log('  node khoa.js missing-alt                # 11. Kiểm tra alt text');
  console.log('  node khoa.js fix-missing-alt --apply    # 12. Sửa alt text');
  console.log('  node khoa.js verify                     # 13. Xác nhận alt');
  console.log('  node khoa.js purge-cache                # 14. Purge cache (sau mọi fix)');
  console.log('\nBlog Writer:');
  console.log('  node khoa.js research-blog                           # Research topic từ GSC (dry-run)');
  console.log('  node khoa.js write-blog                              # Viết bài tự động hôm nay');
  console.log('  node khoa.js write-blog -- --topic="chủ đề"         # Viết theo chủ đề cụ thể');
  console.log('  node khoa.js publish-blog -- --id=123 --publish      # Publish draft ID 123');
  console.log('  node khoa.js publish-blog -- --id=123 --reject       # Xóa draft ID 123');
  console.log('\nLên lịch đăng bài (tối đa 2 bài/ngày):');
  console.log('  node khoa.js check-schedule                          # Xem lịch 7 ngày tới');
  console.log('  node khoa.js schedule-post -- --id=123               # Lên lịch bài 123 (tìm slot tự động)');
  console.log('  node khoa.js schedule-post -- --id=123 --from=2026-04-20  # Lên lịch từ ngày chỉ định');
  process.exit(0);
}

const entry = COMMANDS[command];
if (!entry) {
  console.error(`Unknown command: "${command}". Run: node khoa.js help`);
  process.exit(1);
}

const scriptPath = path.join(SCRIPTS_DIR, entry.script);
const allArgs = [...entry.defaultArgs, ...extraArgs];

const result = spawnSync('node', [scriptPath, ...allArgs], { stdio: 'inherit' });
process.exit(result.status || 0);
