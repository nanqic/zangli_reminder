// 公历 → 藏历换算。算法移植自 https://github.com/stonelf/zangli (commit c29e60f, zangli.js)，MIT License。
// 与上游的区别：
//   - 入参为天序号（纯日期，按 UTC 计算），不依赖运行环境时区
//   - 模块加载时预计算月表，查询用二分查找（Worker 免费版 CPU 限制 10ms）
//   - 额外返回 monthIdx（0 = 正月 … 11 = 十二月），上游节日判断误用了含闰月的下标
import { SPECIAL_DAYS } from "./zangli-data.js";

const MS_DAY = 86400000;
const START_DAY = Date.UTC(1951, 0, 8) / MS_DAY; // 铁虎年十二月初一
const END_DAY = Date.UTC(2051, 1, 11) / MS_DAY;

const MONTHS = ["正", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二"];
const T_MONTHS = ["神变", "苦行", "具香", "萨嘎", "作净", "明净", "具醉", "具贤", "天降", "持众", "庄严", "满意"];
export const DAY_NAMES = [
  "初一", "初二", "初三", "初四", "初五", "初六", "初七", "初八", "初九", "初十",
  "十一", "十二", "十三", "十四", "十五", "十六", "十七", "十八", "十九", "二十",
  "廿一", "廿二", "廿三", "廿四", "廿五", "廿六", "廿七", "廿八", "廿九", "三十",
];

/** 公历年月日 → 天序号（1970-01-01 = 0） */
export function dayNumber(year, month, day) {
  return Date.UTC(year, month - 1, day) / MS_DAY;
}

/** 天序号 → { year, month, day } */
export function fromDayNumber(n) {
  const d = new Date(n * MS_DAY);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

// 预计算：每个藏历月的起始偏移（相对 START_DAY）及元信息
const MONTH_TABLE = [];
{
  let offset = 0;
  for (let years = 0; years < SPECIAL_DAYS.length; years++) {
    let leapMonths = 0;
    for (let months = 0; months < SPECIAL_DAYS[years].length; months++) {
      const marks = SPECIAL_DAYS[years][months];
      let len = 30;
      for (const m of marks) {
        if (m < 0) len--;
        else if (m > 0) len++;
        else leapMonths++;
      }
      const monthIdx = (years === 0 ? 12 - SPECIAL_DAYS[0].length : months) - leapMonths;
      MONTH_TABLE.push({ start: offset, len, marks, years, months, monthIdx, monthLeap: marks.includes(0) });
      offset += len;
    }
  }
}

/**
 * 公历日期（天序号）→ 藏历信息；超出 1951-01-08 ~ 2051-02-11 时返回 null。
 * 返回字段：
 *   dayNum    藏历日（1-30）
 *   monthIdx  藏历月（0 = 正月 … 11 = 十二月）
 *   monthSeq  藏历月的唯一序号
 *   dayLeap   闰日（重日中的第二天，上游标记为"闰X"）
 *   dayMiss   当天之前缺了一个藏历日（缺的是 dayNum - 1）；注意三十缺日时不会标记
 */
export function getZangli(n) {
  if (n < START_DAY || n > END_DAY) return null;
  const days = n - START_DAY;
  let lo = 0, hi = MONTH_TABLE.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (MONTH_TABLE[mid].start <= days) lo = mid; else hi = mid - 1;
  }
  const mt = MONTH_TABLE[lo];
  let dayLeap = false, dayMiss = false;
  let t = days - mt.start;
  for (const sd of mt.marks) {
    if (sd === 0) continue;
    if (sd + 1 === -t) { dayMiss = true; t++; }
    else if (sd === t) { dayLeap = true; t--; }
    else if (sd > 0 && sd < t) t--;
    else if (sd < 0 && -sd - 1 < t) t++;
  }
  const { years, monthIdx, monthLeap } = mt;
  const year = "铁水木火土".charAt(Math.floor(years / 2) % 5) + "虎兔龙蛇马羊猴鸡狗猪鼠牛".charAt(years % 12);
  const month = (monthLeap ? "闰" : "") + MONTHS[monthIdx];
  const tMonth = (monthLeap ? "闰" : "") + T_MONTHS[monthIdx];
  const day = (dayLeap ? "闰" : "") + DAY_NAMES[t];
  return {
    year, month, tMonth, day,
    dayNum: t + 1,
    monthIdx,
    monthSeq: lo,
    dayLeap, dayMiss, monthLeap,
    value: `${year}年${month}月(${tMonth}月)${day}`,
  };
}
