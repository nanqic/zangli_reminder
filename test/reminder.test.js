import { test } from "node:test";
import assert from "node:assert/strict";
import { getZangli, dayNumber } from "../src/zangli.js";
import { observanceOn, beijingToday, upcoming, formatMessage } from "../src/reminder.js";

const z = (y, m, d) => getZangli(dayNumber(y, m, d));

test("上游锚点：藏历新年正月初一", () => {
  for (const [y, m, d] of [[2026, 2, 18], [2025, 2, 28], [2024, 2, 10], [2023, 2, 21], [2019, 2, 5], [1951, 2, 7]]) {
    const r = z(y, m, d);
    assert.equal(r.day, "初一", `${y}-${m}-${d} ${r.value}`);
    assert.equal(r.month, "正");
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
  for (let n = dayNumber(1951, 1, 8); n <= dayNumber(2051, 2, 11); n++) {
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

test("每个藏历月恰好提醒一次初十、一次廿五（各种模式）", () => {
  for (const leapMode of ["first", "second"]) {
    for (const missMode of ["prev", "next"]) {
      const seen = new Map();
      for (let n = dayNumber(1951, 2, 7); n < dayNumber(2051, 1, 1); n++) {
        const obs = observanceOn(n, { leapMode, missMode });
        if (!obs) continue;
        const key = `${obs.zangli.monthSeq}-${obs.target}`;
        assert.ok(!seen.has(key), `${leapMode}/${missMode} 重复: ${key}`);
        seen.set(key, n);
      }
      // 101 年左右 × 每月 2 次
      assert.ok(seen.size > 2400, `${seen.size}`);
    }
  }
});

test("北京时间换算：UTC 00:00 触发时北京已是当天 08:00", () => {
  assert.equal(beijingToday(new Date("2026-11-08T00:00:00Z")), dayNumber(2026, 11, 8));
  assert.equal(beijingToday(new Date("2026-11-07T15:59:59Z")), dayNumber(2026, 11, 7));
  assert.equal(beijingToday(new Date("2026-11-07T16:00:00Z")), dayNumber(2026, 11, 8));
});

test("文案格式", () => {
  const list = upcoming(dayNumber(2026, 11, 8), 60);
  assert.ok(list.length >= 3);
  for (const item of list) assert.match(item.message, /^\d+月\d+日（周.）是藏历(初十|廿五)（(莲师|空行母)荟供日）/);
  console.log(list);
});
