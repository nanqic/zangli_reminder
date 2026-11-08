// 殊胜日判定与提醒文案（纯函数，不涉及网络，便于测试）
//
// 守持规则：缺日则提前一天（如某月没有三十，则在廿九守持）；重日只守第一天。
import { getZangli, dayNumber, fromDayNumber, DAY_NAMES } from "./zangli.js";

const MONTH_NAMES = ["正", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二"];
const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

/** 每月殊胜日：藏历日 → 名称、功德倍数（来自 stonelf/zangli） */
export const MONTHLY = {
  1: { name: "禅定胜王佛节日", merit: "作何善恶成百倍" },
  8: { name: "药师佛节日", merit: "作何善恶成千倍" },
  10: { name: "莲师荟供日", merit: "作何善恶成十万倍" },
  15: { name: "阿弥陀佛节日", merit: "作何善恶成百万倍" },
  18: { name: "观音菩萨节日", merit: "作何善恶成千万倍" },
  21: { name: "地藏王菩萨节日", merit: "作何善恶成亿倍" },
  25: { name: "空行母荟供日", merit: "" },
  30: { name: "释迦牟尼佛节日", merit: "作何善恶成九亿倍" },
};

/** 年度殊胜日："藏历月-日" → 名称；replaces 为 true 时替代当天的每月殊胜日（与上游一致） */
export const ANNUAL = {
  "1-1": { name: "神变节（藏历新年）", replaces: true },
  "4-7": { name: "释迦牟尼佛诞辰" },
  "4-15": { name: "释迦牟尼佛成道日、涅槃日（萨嘎达瓦）", replaces: true, merit: "作何善恶成百万倍" },
  "6-4": { name: "释迦牟尼佛初转法轮日" },
  "6-15": { name: "释迦牟尼佛入胎日", replaces: true, merit: "作何善恶成百万倍" },
  "9-22": { name: "释迦牟尼佛天降日" },
};

export const HUIGONG_DAYS = [10, 25];

/**
 * 公历某天（天序号）要守持哪些藏历日。
 * 返回 [{ dayNum, monthIdx, monthLeap, note }]；通常 0 或 1 项，缺日的前一天会多出一项。
 */
export function observedDays(n) {
  const z = getZangli(n);
  if (!z) return [];
  const next = getZangli(n + 1);
  const list = [];
  const base = { monthIdx: z.monthIdx, monthLeap: z.monthLeap, monthSeq: z.monthSeq };

  // 当天本身：重日只守第一天
  if (!z.dayLeap) {
    const firstOfPair = next && next.dayLeap && next.dayNum === z.dayNum;
    list.push({ ...base, dayNum: z.dayNum, note: firstOfPair ? `本月${DAY_NAMES[z.dayNum - 1]}重日，守第一天` : "" });
  }

  // 缺日提前一天：明天跳过了一个藏历日，则今天守持被跳过的那天
  // （若缺的是初一，今天是上月最后一天，月份按明天算）
  if (next && next.dayMiss) {
    list.push({ monthIdx: next.monthIdx, monthLeap: next.monthLeap, monthSeq: next.monthSeq, dayNum: next.dayNum - 1, note: `本月${DAY_NAMES[next.dayNum - 2]}缺日，提前一天在${z.day}守持` });
  }
  // 三十缺日（上游数据不会标记 dayMiss）：今天廿九、明天已是下月初一
  if (next && next.monthSeq !== z.monthSeq && z.dayNum === 29) {
    list.push({ ...base, dayNum: 30, note: `本月三十缺日，提前一天在${z.day}守持` });
  }
  return list;
}

/** 某天的殊胜日事件：[{ dayNum, monthIdx, name, merit, note }] */
export function eventsOn(n, { onlyDays } = {}) {
  const events = [];
  for (const d of observedDays(n)) {
    if (onlyDays && !onlyDays.includes(d.dayNum)) continue;
    const annual = !d.monthLeap ? ANNUAL[`${d.monthIdx + 1}-${d.dayNum}`] : null;
    const monthly = MONTHLY[d.dayNum];
    const items = [];
    if (annual) items.push(annual);
    if (monthly && !(annual && annual.replaces)) items.push(monthly);
    for (const it of items) events.push({ dayNum: d.dayNum, monthIdx: d.monthIdx, name: it.name, merit: it.merit || "", note: d.note });
  }
  return events;
}

/** 北京时间（UTC+8）"今天"的天序号 */
export function beijingToday(now = new Date()) {
  return Math.floor((now.getTime() + 8 * 3600000) / 86400000);
}

export function dateLabel(n) {
  const { month, day } = fromDayNumber(n);
  return `${month}月${day}日（${WEEKDAYS[new Date(n * 86400000).getUTCDay()]}）`;
}

const tDayLabel = (e) => `${MONTH_NAMES[e.monthIdx]}月${DAY_NAMES[e.dayNum - 1]}`;
const noteOf = (events) => [...new Set(events.map((e) => e.note).filter(Boolean))].map((s) => `（${s}）`).join("");

/** 荟供提醒文案（初十 / 廿五） */
export function huigongMessage(n) {
  const events = eventsOn(n, { onlyDays: HUIGONG_DAYS }).filter((e) => MONTHLY[e.dayNum].name === e.name);
  if (!events.length) return null;
  const e = events[0];
  return `${dateLabel(n)}是藏历${DAY_NAMES[e.dayNum - 1]}（${e.name}），请大家注意荟供时间。${noteOf(events)}`;
}

/** 殊胜日提醒文案（全部殊胜日） */
export function auspiciousMessage(n) {
  const events = eventsOn(n);
  if (!events.length) return null;
  const lines = events.map((e) => `· 藏历${tDayLabel(e)}：${e.name}${e.merit ? `，${e.merit}` : ""}`);
  return `今天 ${dateLabel(n)} 是殊胜日：\n${lines.join("\n")}${noteOf(events) ? "\n" + noteOf(events) : ""}`;
}

export function isoDate(n) {
  const { year, month, day } = fromDayNumber(n);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseIsoDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
  return m ? dayNumber(+m[1], +m[2], +m[3]) : null;
}

/** 列出从 startN 起 count 天内的提醒 */
export function upcoming(startN, count, fn) {
  const list = [];
  for (let n = startN; n < startN + count; n++) {
    const message = fn(n);
    if (message) list.push({ date: isoDate(n), zangli: getZangli(n).value, message });
  }
  return list;
}
