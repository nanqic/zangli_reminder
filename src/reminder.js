// 荟供日判定与提醒文案（纯函数，不涉及网络，便于测试）
import { getZangli, dayNumber, fromDayNumber, DAY_NAMES } from "./zangli.js";

export const TARGETS = {
  10: { name: "莲师荟供日" },
  25: { name: "空行母荟供日" },
};

export const DEFAULT_TEMPLATE =
  "{DATE}（{WEEKDAY}）是藏历{TDAY}（{NAME}），请大家注意荟供时间。{NOTE}";

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

/**
 * 判断公历某天（天序号）是否为荟供日。
 * leapMode：重日（同一藏历日出现两天）时在哪天提醒，"first" | "second"
 * missMode：缺日（该藏历日不存在）时在哪天提醒，"prev"（前一天）| "next"（后一天）| "none"
 * 返回 { target, note, zangli } 或 null
 */
export function observanceOn(n, { leapMode = "first", missMode = "prev" } = {}) {
  const z = getZangli(n);
  if (!z) return null;

  // 正常或重日
  if (TARGETS[z.dayNum]) {
    const next = getZangli(n + 1);
    const prev = getZangli(n - 1);
    if (!z.dayLeap) {
      const isFirstOfPair = next && next.dayLeap && next.dayNum === z.dayNum;
      if (!isFirstOfPair || leapMode === "first") {
        return { target: z.dayNum, note: isFirstOfPair ? `（本月${DAY_NAMES[z.dayNum - 1]}重日，按第一天）` : "", zangli: z };
      }
    } else if (leapMode === "second" && prev && prev.dayNum === z.dayNum) {
      return { target: z.dayNum, note: `（本月${DAY_NAMES[z.dayNum - 1]}重日，按第二天）`, zangli: z };
    }
  }

  // 缺日：dayMiss 当天的前一个藏历日不存在
  if (missMode === "next" && z.dayMiss && TARGETS[z.dayNum - 1]) {
    return { target: z.dayNum - 1, note: `（本月${DAY_NAMES[z.dayNum - 2]}缺日，按${DAY_NAMES[z.dayNum - 1]}）`, zangli: z };
  }
  if (missMode === "prev") {
    const next = getZangli(n + 1);
    if (next && next.dayMiss && TARGETS[next.dayNum - 1]) {
      return { target: next.dayNum - 1, note: `（本月${DAY_NAMES[next.dayNum - 2]}缺日，按${z.day}）`, zangli: z };
    }
  }
  return null;
}

/** 北京时间（UTC+8）"今天"的天序号 */
export function beijingToday(now = new Date()) {
  return Math.floor((now.getTime() + 8 * 3600000) / 86400000);
}

export function formatMessage(n, obs, template = DEFAULT_TEMPLATE) {
  const { year, month, day } = fromDayNumber(n);
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return template
    .replaceAll("{DATE}", `${month}月${day}日`)
    .replaceAll("{WEEKDAY}", weekday)
    .replaceAll("{TDAY}", DAY_NAMES[obs.target - 1])
    .replaceAll("{NAME}", TARGETS[obs.target].name)
    .replaceAll("{ZANGLI}", obs.zangli.value)
    .replaceAll("{NOTE}", obs.note)
    .trim();
}

export function isoDate(n) {
  const { year, month, day } = fromDayNumber(n);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseIsoDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
  return m ? dayNumber(+m[1], +m[2], +m[3]) : null;
}

/** 列出从 startN 起 count 天内所有荟供日 */
export function upcoming(startN, count, opts) {
  const list = [];
  for (let n = startN; n < startN + count; n++) {
    const obs = observanceOn(n, opts);
    if (obs) list.push({ date: isoDate(n), zangli: obs.zangli.value, message: formatMessage(n, obs, opts?.template) });
  }
  return list;
}
