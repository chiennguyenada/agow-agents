#!/usr/bin/env node
/**
 * khoa.js — Khoa's single entry point for all SEO tasks
 *
 * Usage:
 *   node /home/node/.openclaw/workspaces/seo/scripts/khoa.js <command> [options]
 *
 * Commands:
 *   check-duplicate-alt         Tìm duplicate alt text trên cùng 1 trang (posts + pages + products)
 *   missing-alt                 Tìm ảnh chưa có alt text
 *   help                        Liệt kê tất cả commands
 */

const { execSync } = require('child_process');
const path = require('path');

const SCRIPTS_DIR = path.dirname(process.argv[1]);
const command = process.argv[2];

const COMMANDS = {
  'check-duplicate-alt': {
    script: 'check-duplicate-alt.js',
    desc: 'Tìm duplicate alt text trên cùng 1 trang (posts + pages + all products)',
  },
  'fix-duplicate-alt': {
    script: 'fix-duplicate-alt.js',
    desc: 'Sửa duplicate alt text. Thêm --apply để ghi thật, --id=N để fix 1 item',
  },
  'missing-alt': {
    script: 'missing-alt.js',
    desc: 'Tìm ảnh chưa có alt text',
  },
};

if (!command || command === 'help') {
  console.log('Khoa SEO Scripts — available commands:\n');
  Object.entries(COMMANDS).forEach(([cmd, info]) => {
    console.log(`  node khoa.js ${cmd.padEnd(25)} ${info.desc}`);
  });
  process.exit(0);
}

const entry = COMMANDS[command];
if (!entry) {
  console.error(`Unknown command: "${command}". Run: node khoa.js help`);
  process.exit(1);
}

const scriptPath = path.join(SCRIPTS_DIR, entry.script);
try {
  execSync(`node "${scriptPath}"`, { stdio: 'inherit' });
} catch (e) {
  process.exit(e.status || 1);
}
