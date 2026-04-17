'use strict';
/**
 * schedule-post.js
 * Tìm slot đăng bài tiếp theo và lên lịch WP post.
 *
 * Rule: tối đa 2 bài/ngày (publish + future).
 * Slot 1: 08:00 VN, Slot 2: 14:00 VN.
 * Nếu hôm nay đủ 2 bài → tự động sang ngày kế tiếp.
 *
 * CLI:
 *   node schedule-post.js --id=123             # tìm slot sớm nhất từ hôm nay
 *   node schedule-post.js --id=123 --from=2026-04-20  # tìm slot từ ngày chỉ định
 *   node schedule-post.js --check              # chỉ xem lịch 7 ngày tới (không schedule)
 *
 * Exit codes:
 *   0 = thành công
 *   1 = lỗi (bao gồm không tìm được slot trong MAX_LOOKAHEAD ngày)
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../..', '.env') });

const { wpGet, wpPut, config } = require('./wp-client');

// ── Config ────────────────────────────────────────────────────────────────────
const DAILY_LIMIT  = 2;
const SLOTS        = ['08:00:00', '14:00:00'];  // giờ VN (UTC+7)
const MAX_LOOKAHEAD = 14;  // tìm tối đa 14 ngày tới
const VN_OFFSET_MS  = 7 * 60 * 60 * 1000;       // UTC+7

// ── CLI args ──────────────────────────────────────────────────────────────────
const POST_ID    = (() => { const m = process.argv.join(' ').match(/--id=(\d+)/);       return m ? +m[1] : null; })();
const FROM_DATE  = (() => { const m = process.argv.join(' ').match(/--from=(\S+)/);     return m ? m[1] : null; })();
const CHECK_ONLY = process.argv.includes('--check');

// ── Helper: ngày VN hiện tại dạng "YYYY-MM-DD" ───────────────────────────────
function todayVN() {
  return new Date(Date.now() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

// ── Helper: giờ VN hiện tại dạng minutes từ 00:00 ────────────────────────────
function nowMinutesVN() {
  const d = new Date(Date.now() + VN_OFFSET_MS);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

// ── Helper: tính ngày + N days ────────────────────────────────────────────────
function addDays(dateStr, n) {
  // Parse date string safely without timezone issues
  const [y, mo, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

// ── Helper: format datetime VN human-readable ────────────────────────────────
function formatVN(dateStr, timeStr) {
  const [y, mo, d] = dateStr.split('-');
  const [h, m] = timeStr.split(':');
  return `${d}/${mo}/${y} ${h}:${m}`;
}

// ── Query WP: đếm bài publish + future trong một ngày ────────────────────────
/**
 * @param {string} dateStr  — "YYYY-MM-DD" (giờ VN)
 * @returns {Promise<{count: number, slots: string[]}>}
 *   slots: array of occupied slot times e.g. ["08:00:00", "14:00:00"]
 */
async function getScheduleForDate(dateStr) {
  // WP REST API dùng giờ local của site (VN UTC+7)
  const after  = dateStr + 'T00:00:00';
  const before = dateStr + 'T23:59:59';

  const res = await wpGet(
    `/wp-json/wp/v2/posts?after=${encodeURIComponent(after)}&before=${encodeURIComponent(before)}&status=publish,future&per_page=100&_fields=id,date,status`
  );

  if (!res.ok || !Array.isArray(res.body)) {
    // Treat error as 0 posts — don't block scheduling on API error
    console.warn(`  [WARN] Không lấy được lịch ngày ${dateStr}: status ${res.status}`);
    return { count: 0, posts: [] };
  }

  return {
    count: res.body.length,
    posts: res.body.map(p => ({ id: p.id, date: p.date, status: p.status })),
  };
}

// ── Find next available slot ──────────────────────────────────────────────────
/**
 * Tìm slot đăng bài sớm nhất có sẵn.
 * @param {string} fromDateStr  — "YYYY-MM-DD" bắt đầu tìm từ ngày này
 * @returns {Promise<{date: string, time: string, datetime: string, daysAhead: number, slotsUsed: number}|null>}
 *   datetime: "YYYY-MM-DDTHH:MM:SS" để gửi lên WP
 */
async function findNextSlot(fromDateStr) {
  const today     = todayVN();
  const nowMins   = nowMinutesVN();

  for (let d = 0; d < MAX_LOOKAHEAD; d++) {
    const dateStr   = addDays(fromDateStr, d);
    const isToday   = dateStr === today;
    const schedule  = await getScheduleForDate(dateStr);

    if (schedule.count >= DAILY_LIMIT) continue;  // ngày này đủ rồi

    // Tìm slot chưa dùng trong ngày này
    for (const slotTime of SLOTS) {
      const [h, m] = slotTime.split(':').map(Number);
      const slotMins = h * 60 + m;

      // Nếu là hôm nay: bỏ qua slot đã qua (cần ít nhất 30 phút buffer)
      if (isToday && slotMins <= nowMins + 30) continue;

      // Kiểm tra slot này chưa bị chiếm (so sánh giờ HH:00 trong ngày)
      const slotHHMM = slotTime.slice(0, 5);  // "08:00"
      const isOccupied = schedule.posts.some(p => {
        // p.date format: "2026-04-18T08:00:00" (WP local time)
        const postTime = p.date.slice(11, 16);  // "08:00"
        return postTime === slotHHMM;
      });
      if (isOccupied) continue;

      return {
        date:      dateStr,
        time:      slotTime,
        datetime:  dateStr + 'T' + slotTime,
        daysAhead: d,
        slotsUsed: schedule.count,
      };
    }
  }

  return null;  // không tìm được trong MAX_LOOKAHEAD ngày
}

// ── Schedule a post ───────────────────────────────────────────────────────────
/**
 * Đặt WP post vào trạng thái future với datetime đã chọn.
 * @param {number} postId
 * @param {string} datetime  — "YYYY-MM-DDTHH:MM:SS"
 */
async function schedulePost(postId, datetime) {
  const res = await wpPut(`/wp-json/wp/v2/posts/${postId}`, {
    status: 'future',
    date:   datetime,
  });

  if (!res.ok) {
    const body = typeof res.body === 'object' ? JSON.stringify(res.body).slice(0, 200) : String(res.body || '');
    throw new Error(`WP schedule failed: status=${res.status} — ${body}`);
  }

  return res.body;
}

// ── Check mode: hiển thị lịch 7 ngày tới ─────────────────────────────────────
async function showSchedule() {
  const today = todayVN();
  console.log('\n📅 Lịch đăng bài — 7 ngày tới:\n');
  console.log('  Ngày         Slot 1 (08:00)   Slot 2 (14:00)   Tổng');
  console.log('  ' + '─'.repeat(55));

  for (let d = 0; d < 7; d++) {
    const dateStr = addDays(today, d);
    const schedule = await getScheduleForDate(dateStr);
    const s1 = schedule.posts.find(p => p.date.slice(11, 16) === '08:00') ? '✅ đã có' : '⬜ trống';
    const s2 = schedule.posts.find(p => p.date.slice(11, 16) === '14:00') ? '✅ đã có' : '⬜ trống';
    const label = d === 0 ? ' (hôm nay)' : '';
    console.log(`  ${dateStr}${label.padEnd(12)}${s1.padEnd(17)}${s2.padEnd(17)}${schedule.count}/${DAILY_LIMIT}`);
  }

  console.log('\n→ Slot trống tiếp theo:');
  const next = await findNextSlot(today);
  if (next) {
    console.log(`  ${formatVN(next.date, next.time)} (${next.daysAhead === 0 ? 'hôm nay' : 'sau ' + next.daysAhead + ' ngày'})`);
  } else {
    console.log(`  Không có slot trống trong ${MAX_LOOKAHEAD} ngày tới`);
  }
  console.log('');
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  if (CHECK_ONLY) {
    await showSchedule();
    return;
  }

  if (!POST_ID) {
    console.error('Usage: node schedule-post.js --id=<post_id> [--from=YYYY-MM-DD]');
    console.error('       node schedule-post.js --check');
    process.exit(1);
  }

  const fromDate = FROM_DATE || todayVN();
  console.log(`\n🗓️  Tìm slot đăng bài cho post ID ${POST_ID}...`);
  console.log(`   Bắt đầu tìm từ: ${fromDate}`);

  const slot = await findNextSlot(fromDate);

  if (!slot) {
    throw new Error(`Không tìm được slot trống trong ${MAX_LOOKAHEAD} ngày tới. Kiểm tra lại lịch bằng --check.`);
  }

  // Schedule the post
  await schedulePost(POST_ID, slot.datetime);

  // ── Output (đọc được bởi cả người và Khoa agent) ──────────────────────────
  const isToday    = slot.daysAhead === 0;
  const slotLabel  = slot.time.startsWith('08') ? 'Slot 1 (sáng)' : 'Slot 2 (chiều)';
  const dayLabel   = isToday ? 'hôm nay' : (slot.daysAhead === 1 ? 'ngày mai' : `${slot.daysAhead} ngày nữa`);
  const humanDate  = formatVN(slot.date, slot.time);
  const previewUrl = `${config.BASE_URL}/?p=${POST_ID}&preview=true`;

  console.log('\n' + '═'.repeat(60));

  if (isToday) {
    console.log(`✅ Đã lên lịch đăng hôm nay lúc ${humanDate.slice(11)}`);
  } else {
    console.log(`📅 Hôm nay đã đủ ${DAILY_LIMIT} bài — đã lên lịch sang ngày ${dayLabel}`);
  }

  console.log(`📝 Bài ID     : ${POST_ID}`);
  console.log(`📅 Thời gian  : ${humanDate} (${slotLabel})`);
  console.log(`🔗 Preview    : ${previewUrl}`);
  console.log(`📊 Lịch ngày  : ${slot.slotsUsed + 1}/${DAILY_LIMIT} bài đã lên lịch`);
  console.log('═'.repeat(60) + '\n');

  // Machine-readable for agent parsing
  console.log(`SCHEDULED_DATE=${slot.date}`);
  console.log(`SCHEDULED_TIME=${slot.time.slice(0, 5)}`);
  console.log(`SCHEDULED_DATETIME=${slot.datetime}`);
  console.log(`DAYS_AHEAD=${slot.daysAhead}`);
}

main().catch(e => {
  console.error('\n❌ Fatal error:', e.message);
  if (process.env.DEBUG) console.error(e.stack);
  process.exit(1);
});
