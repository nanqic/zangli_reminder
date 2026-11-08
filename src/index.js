// Cloudflare Worker：每天北京时间 08:00 检查"明天"是否为藏历初十 / 廿五，是则推送到 Mattermost。
import { observanceOn, beijingToday, formatMessage, isoDate, parseIsoDate, upcoming } from "./reminder.js";
import { getZangli, fromDayNumber } from "./zangli.js";

function options(env) {
  return {
    leapMode: env.LEAP_DAY_MODE || "first",
    missMode: env.MISSING_DAY_MODE || "prev",
    template: env.MESSAGE_TEMPLATE || undefined,
  };
}

async function postMattermost(env, text) {
  if (!env.WEBHOOK_URL) throw new Error("未配置 WEBHOOK_URL（wrangler secret put WEBHOOK_URL）");
  const payload = { text };
  if (env.BOT_USERNAME) payload.username = env.BOT_USERNAME;
  if (env.BOT_ICON_URL) payload.icon_url = env.BOT_ICON_URL;
  if (env.CHANNEL) payload.channel = env.CHANNEL;
  const resp = await fetch(env.WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) throw new Error(`Mattermost 推送失败: ${resp.status} ${await resp.text()}`);
}

/** 计算"明天"的提醒；不发送 */
function checkTomorrow(env, now = new Date()) {
  const tomorrow = beijingToday(now) + 1;
  const opts = options(env);
  const obs = observanceOn(tomorrow, opts);
  return {
    tomorrow: isoDate(tomorrow),
    zangli: getZangli(tomorrow)?.value ?? null,
    message: obs ? formatMessage(tomorrow, obs, opts.template) : null,
  };
}

function period(h) {
  return h < 5 ? "凌晨" : h < 12 ? "早上" : h < 13 ? "中午" : h < 18 ? "下午" : "晚上";
}

/** 消息附加的活动信息；温哥华时间按当天时区规则（含夏令时）自动换算 */
function eventInfo(env, n) {
  const [hh, mm] = (env.EVENT_TIME_BJ || "20:15").split(":").map(Number);
  const utc = new Date(n * 86400000 + (hh - 8) * 3600000 + mm * 60000);
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Vancouver", hour: "numeric", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(utc).map((p) => [p.type, p.value]));
  const vh = Number(parts.hour);
  const lines = [
    `北京时间：${period(hh)}${hh}:${String(mm).padStart(2, "0")}`,
    `温哥华时间：${period(vh)}${vh}:${parts.minute}`,
  ];
  if (env.ZOOM_ID) lines.push(`zoom房间：${env.ZOOM_ID}`);
  if (env.ZOOM_PASSWORD) lines.push(`Password: ${env.ZOOM_PASSWORD}`);
  if (env.OFFERING_NOTE) lines.push("", env.OFFERING_NOTE);
  return lines.join("\n");
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export default {
  async scheduled(event, env, ctx) {
    const result = checkTomorrow(env, new Date(event.scheduledTime));
    console.log(JSON.stringify(result));
    if (result.message) {
      const tomorrow = beijingToday(new Date(event.scheduledTime)) + 1;
      await postMattermost(env, result.message + "\n\n" + eventInfo(env, tomorrow));
    }
  },

  async fetch(request, env) {
    const url = new URL(request.url);

    // GET /            预览明天的判定结果 + 未来 90 天的荟供日（只读，不发送）
    // GET /?date=YYYY-MM-DD  以指定日期为"明天"预览
    if (request.method === "GET" && url.pathname === "/") {
      const opts = options(env);
      const date = parseIsoDate(url.searchParams.get("date"));
      const base = date ?? beijingToday() + 1;
      const obs = observanceOn(base, opts);
      return json({
        tomorrow: isoDate(base),
        zangli: getZangli(base)?.value ?? null,
        message: obs ? formatMessage(base, obs, opts.template) : null,
        upcoming: upcoming(base, 90, opts),
      });
    }

    // POST /test       发送一条测试消息，需要 Authorization: Bearer <TEST_TOKEN>
    if (request.method === "POST" && url.pathname === "/test") {
      if (!env.TEST_TOKEN || request.headers.get("Authorization") !== `Bearer ${env.TEST_TOKEN}`) {
        return json({ error: "unauthorized" }, 401);
      }
      const today = beijingToday();
      const tz = getZangli(today);
      const { month, day } = fromDayNumber(today);
      const weekday = "日一二三四五六"[new Date(today * 86400000).getUTCDay()];
      const r = checkTomorrow(env);
      const text = `【测试通知】今天是${month}月${day}日（周${weekday}），` +
        `藏历${tz.year}年${tz.month}月（${tz.tMonth}月）${tz.day}。` +
        (r.message ? `明天的提醒：${r.message}` : "明天不是荟供日。") +
        "\n\n" + eventInfo(env, today);
      await postMattermost(env, text);
      return json({ sent: text });
    }

    return json({ error: "not found" }, 404);
  },
};
