#!/usr/bin/env node
/**
 * khoa.js — Khoa's single entry point for all SEO scripts
 *
 * Usage:
 *   node khoa.js <command> [options]
 *
 * Commands:
 *   check-title                 Tìm title bị LONG/SHORT (dry-run, không sửa)
 *   fix-title                   Sửa LONG_TITLE tự động. Thêm --apply để ghi thật, --id=N để fix 1 item
 *   missing-alt                 Tìm ảnh chưa có alt text (dry-run, không sửa)
 *   fix-missing-alt             Sửa alt text bị thiếu. Thêm --apply để ghi thật, --id=N để fix 1 item
 *   check-duplicate-alt         Tìm duplicate alt text trên cùng 1 trang (dry-run, không sửa)
 *   fix-duplicate-alt           Sửa duplicate alt text. Thêm --apply để ghi thật, --id=N để fix 1 item
 *   verify                      Xác nhận tất cả alt text đã được áp dụng đúng
 *   purge-cache                 Purge LiteSpeed Cache sau khi fix xong
 *   help                        Liệt kê tất cả commands
 *
 * Ví dụ workflow:
 *   node khoa.js check-title               # 1. Kiểm tra title issues
 *   node khoa.js fix-title --apply         # 2. Sửa LONG_TITLE
 *   node khoa.js missing-alt               # 3. Kiểm tra alt text
 *   node khoa.js fix-missing-alt --apply   # 4. Sửa alt text
 *   node khoa.js verify                    # 5. Xác nhận
 *   node khoa.js purge-cache               # 6. Purge cache
 */

const { spawnSync } = require('child_process');
const path = require('path');

const SCRIPTS_DIR = path.dirname(process.argv[1]);
const command = process.argv[2];
const extraArgs = process.argv.slice(3); // pass-through: --apply, --dry-run, --id=N, etc.

const COMMANDS = {
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
};

if (!command || command === 'help') {
  console.log('Khoa SEO Scripts — available commands:\n');
  Object.entries(COMMANDS).forEach(([cmd, info]) => {
    console.log(`  node khoa.js ${cmd.padEnd(25)} ${info.desc}`);
  });
  console.log('\nWorkflow mẫu:');
  console.log('  node khoa.js check-title           # Kiểm tra title');
  console.log('  node khoa.js fix-title --apply      # Sửa LONG_TITLE');
  console.log('  node khoa.js missing-alt            # Kiểm tra alt text');
  console.log('  node khoa.js fix-missing-alt --apply # Sửa alt text');
  console.log('  node khoa.js verify                  # Xác nhận kết quả');
  console.log('  node khoa.js purge-cache             # Purge cache');
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
