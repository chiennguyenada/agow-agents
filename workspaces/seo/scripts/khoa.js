#!/usr/bin/env node
/**
 * khoa.js — Khoa's single entry point for all alt-text SEO scripts
 *
 * Usage:
 *   node khoa.js <command> [options]
 *
 * Commands:
 *   missing-alt                 Tìm ảnh chưa có alt text (dry-run, không sửa)
 *   fix-missing-alt             Sửa alt text bị thiếu. Thêm --apply để ghi thật, --id=N để fix 1 item
 *   check-duplicate-alt         Tìm duplicate alt text trên cùng 1 trang (dry-run, không sửa)
 *   fix-duplicate-alt           Sửa duplicate alt text. Thêm --apply để ghi thật, --id=N để fix 1 item
 *   verify                      Xác nhận tất cả alt text đã được áp dụng đúng
 *   purge-cache                 Purge LiteSpeed Cache sau khi fix xong
 *   help                        Liệt kê tất cả commands
 *
 * Ví dụ workflow hoàn chỉnh:
 *   node khoa.js missing-alt                # 1. Kiểm tra có bao nhiêu ảnh thiếu alt
 *   node khoa.js fix-missing-alt            # 2. Dry-run: xem sẽ sửa gì
 *   node khoa.js fix-missing-alt --apply    # 3. Apply thật
 *   node khoa.js check-duplicate-alt        # 4. Kiểm tra duplicate
 *   node khoa.js fix-duplicate-alt --apply  # 5. Fix duplicate nếu có
 *   node khoa.js verify                     # 6. Xác nhận kết quả
 *   node khoa.js purge-cache                # 7. Purge cache
 */

const { spawnSync } = require('child_process');
const path = require('path');

const SCRIPTS_DIR = path.dirname(process.argv[1]);
const command = process.argv[2];
const extraArgs = process.argv.slice(3); // pass-through: --apply, --dry-run, --id=N, etc.

const COMMANDS = {
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
  console.log('  node khoa.js missing-alt            # Kiểm tra');
  console.log('  node khoa.js fix-missing-alt --apply # Fix');
  console.log('  node khoa.js verify                  # Xác nhận');
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
