import { test } from "node:test";
import assert from "node:assert/strict";
import { getZangli, dayNumber } from "../src/zangli.js";
import { observedDays, beijingToday, upcoming, huigongMessage, auspiciousMessage, eventsOn } from "../src/reminder.js";

const z = (y, m, d) => getZangli(dayNumber(y, m, d));
const FIRST = dayNumber(1951, 1, 8);
const LAST = dayNumber(2051, 2, 11);

test("上游锚点：藏历新年正月初一", () => {
  for (const [y, m, d] of [[2026, 2, 18], [2025, 2, 28], [2024, 2, 10], [2023, 2, 21], [2019, 2, 5], [1951, 2, 7]]) {
    const r = z(y, m, d);
    assert.equal(r.day, "初一", `${y}-${m}-${d} ${r.value}`);
    assert.equal(r.month, "正");
    assert.equal(r.monthIdx, 0);
  }
  assert.equal(z(2026, 2, 18).value, "火马年正月(神变月)初一");
});

test("上游锚点：闰月 / 闰日 / 缺日", () => {
  assert.equal(z(1951, 6, 5).month, "闰四");
  assert.equal(z(1951, 1, 24).day, "闰十六");
  assert.equal(z(1951, 1, 26).dayLeap, false);
  assert.deepEqual([z(1970, 4, 7).day, z(1970, 4, 8).day, z(1970, 4, 8).dayMiss, z(1970, 4, 9).day], ["初一", "初三", true, "初四"]);
  assert.equal(z(1970, 4, 12).day, "闰初六");
});

test("上游 TZ=UTC 实测值", () => {
  assert.equal(z(2026, 11, 8).value, "火马年九月(天降月)廿九");
  assert.equal(z(2026, 11, 9).value, "火马年九月(天降月)三十");
  assert.equal(z(2026, 11, 10).value, "火马年十月(持众月)初一");
});

test("范围边界", () => {
  assert.equal(z(1951, 1, 7), null);
  assert.ok(z(1951, 1, 8));
  assert.ok(z(2051, 2, 11));
  assert.equal(z(2051, 2, 12), null);
});

test("全范围连续性：每天藏历日要么 +1、要么重日、要么跨月/缺日", () => {
  let prev = null;
  for (let n = FIRST; n <= LAST; n++) {
    const r = getZangli(n);
    assert.ok(r && r.dayNum >= 1 && r.dayNum <= 30, `${n}`);
    if (prev) {
      const step = r.dayNum - prev.dayNum;
      const ok = (r.dayLeap && step === 0) || (!r.dayLeap && !r.dayMiss && step === 1) ||
        (r.dayMiss && step === 2) || (r.dayNum <= 2 && step < 0);
      assert.ok(ok, `${n} ${prev.value} -> ${r.value}`);
    }
    prev = r;
  }
});

test("每个藏历月的 1~30 日都恰好守持一次（缺日提前、重日守第一天）", () => {
  const seen = new Map();
  for (let n = FIRST; n < LAST; n++) {
    for (const d of observedDays(n)) {
      const key = `${d.monthSeq}-${d.dayNum}`;
      assert.ok(!seen.has(key), `重复: ${key}`);
      seen.set(key, n);
    }
  }
  const months = new Set();
  for (let n = FIRST; n <= LAST; n++) months.add(getZangli(n).monthSeq);
  // 首尾两个月不完整，不计
  const full = [...months].slice(1, -1);
  for (const m of full) for (let d = 1; d <= 30; d++) assert.ok(seen.has(`${m}-${d}`), `缺少: 月${m} 日${d}`);
});

test("缺日、重日实例", () => {
  // 2027-06-13 初九，次日十一（初十缺日）→ 当天提醒初十
  assert.match(huigongMessage(dayNumber(2027, 6, 13)), /^6月13日（周日）是藏历初十（莲师荟供日）.*初十缺日，提前一天在初九守持/);
  assert.equal(huigongMessage(dayNumber(2027, 6, 14)), null);
  // 2028-05-18/19 两个廿五 → 只在第一天
  assert.match(huigongMessage(dayNumber(2028, 5, 18)), /廿五重日，守第一天/);
  assert.equal(huigongMessage(dayNumber(2028, 5, 19)), null);
});

test("三十缺日：在廿九守持释迦牟尼佛节日", () => {
  let found = 0;
  for (let n = FIRST; n < LAST; n++) {
    const a = getZangli(n), b = getZangli(n + 1);
    if (a.dayNum === 29 && b.monthSeq !== a.monthSeq) {
      const msg = auspiciousMessage(n);
      assert.match(msg, /三十：释迦牟尼佛节日/);
      assert.match(msg, /三十缺日，提前一天在廿九守持/);
      found++;
    }
  }
  assert.ok(found > 10, `${found}`);
});

test("年度节日：藏历新年替代禅定胜王佛节日", () => {
  const n = dayNumber(2026, 2, 18);
  const names = eventsOn(n).map((e) => e.name);
  assert.ok(names.includes("神变节（藏历新年）"));
  assert.ok(!names.includes("禅定胜王佛节日"));
});

test("北京时间换算：UTC 00:00 触发时北京已是当天 08:00", () => {
  assert.equal(beijingToday(new Date("2026-11-08T00:00:00Z")), dayNumber(2026, 11, 8));
  assert.equal(beijingToday(new Date("2026-11-07T15:59:59Z")), dayNumber(2026, 11, 7));
  assert.equal(beijingToday(new Date("2026-11-07T16:00:00Z")), dayNumber(2026, 11, 8));
});

test("文案预览", () => {
  const h = upcoming(dayNumber(2026, 11, 8), 40, huigongMessage);
  for (const item of h) assert.match(item.message, /^\d+月\d+日（周.）是藏历(初十|廿五)（(莲师|空行母)荟供日）/);
  console.log(h.map((x) => x.message));
  console.log(upcoming(dayNumber(2026, 11, 8), 20, auspiciousMessage).map((x) => x.message));
});
