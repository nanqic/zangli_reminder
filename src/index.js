// Cloudflare Worker：每天北京时间 08:00 推送到两个 Mattermost 频道：
//   - 荟供频道（WEBHOOK_URL）：提前一天提醒藏历初十、廿五，附荟供时间、Zoom、供品说明
//   - 殊胜日频道（AUSPICIOUS_WEBHOOK_URL）：当天提醒全部殊胜日
import { beijingToday, huigongMessage, auspiciousMessage, dateLabel, isoDate, parseIsoDate, upcoming } from "./reminder.js";
import { getZangli } from "./zangli.js";

const CHANNELS = {
  huigong: {
    webhook: "WEBHOOK_URL",
    daysAhead: 1, // 提前一天
    username: (env) => env.BOT_USERNAME,
    message: (env, n) => {
      const msg = huigongMessage(n);
      return msg && `${msg}\n\n${eventInfo(env, n)}`;
    },
  },
  auspicious: {
    webhook: "AUSPICIOUS_WEBHOOK_URL",
    daysAhead: 0, // 当天
    username: (env) => env.AUSPICIOUS_BOT_USERNAME || env.BOT_USERNAME,
    message: (env, n) => auspiciousMessage(n),
  },
};

async function postMattermost(env, channel, text) {
  const url = env[CHANNELS[channel].webhook];
  if (!url) throw new Error(`未配置 ${CHANNELS[channel].webhook}`);
  const payload = { text };
  const username = CHANNELS[channel].username(env);
  if (username) payload.username = username;
  if (env.BOT_ICON_URL) payload.icon_url = env.BOT_ICON_URL;

  // 失败重试 3 次（间隔 2s、6s），避免偶发网络错误漏发
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 2000 * 3 ** (attempt - 1)));
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (resp.ok) return;
      lastErr = new Error(`${channel} 推送失败: ${resp.status} ${await resp.text()}`);
      if (resp.status >= 400 && resp.status < 500) break; // webhook 失效等，不重试
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

function period(h) {
  return h < 5 ? "凌晨" : h < 12 ? "早上" : h < 13 ? "中午" : h < 18 ? "下午" : "晚上";
}

/** 荟供活动信息；温哥华时间按当天时区规则自动换算 */
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
  async scheduled(event, env) {
    // 用计划触发时间而不是实际执行时间算日期，即使执行有延迟也不会算错天
    const today = beijingToday(new Date(event.scheduledTime));
    const jobs = Object.keys(CHANNELS).map(async (ch) => {
      const n = today + CHANNELS[ch].daysAhead;
      const text = CHANNELS[ch].message(env, n);
      console.log(JSON.stringify({ channel: ch, date: isoDate(n), send: !!text }));
      if (text) await postMattermost(env, ch, text);
    });
    const failed = (await Promise.allSettled(jobs)).filter((r) => r.status === "rejected");
    if (failed.length) throw new Error(failed.map((r) => r.reason?.message).join("; "));
  },

  async fetch(request, env) {
    const url = new URL(request.url);

    // GET /                  预览今天 08:00 两个频道会发的消息 + 之后 60 天的提醒（只读，不发送）
    // GET /?date=YYYY-MM-DD  把指定日期当作"今天"预览
    if (request.method === "GET" && url.pathname === "/") {
      const today = parseIsoDate(url.searchParams.get("date")) ?? beijingToday();
      const out = { today: isoDate(today), zangli: getZangli(today)?.value ?? null };
      for (const ch of Object.keys(CHANNELS)) {
        const n = today + CHANNELS[ch].daysAhead;
        out[ch] = {
          aboutDate: isoDate(n),
          message: CHANNELS[ch].message(env, n),
          upcoming: upcoming(n, 60, (d) => CHANNELS[ch].message(env, d)).map(({ date, zangli }) => ({ date, zangli })),
        };
      }
      return json(out);
    }

    // POST /test?channel=huigong|auspicious   发送测试消息，需要 Authorization: Bearer <TEST_TOKEN>
    if (request.method === "POST" && url.pathname === "/test") {
      if (!env.TEST_TOKEN || request.headers.get("Authorization") !== `Bearer ${env.TEST_TOKEN}`) {
        return json({ error: "unauthorized" }, 401);
      }
      const ch = url.searchParams.get("channel") || "huigong";
      if (!CHANNELS[ch]) return json({ error: "unknown channel" }, 400);
      const today = beijingToday();
      const tz = getZangli(today);
      const ahead = CHANNELS[ch].daysAhead;
      const next = CHANNELS[ch].message(env, today + ahead);
      const when = ahead ? "明天" : "今天";
      let text = `【测试通知】今天是${dateLabel(today)}，藏历${tz.year}年${tz.month}月（${tz.tMonth}月）${tz.day}。\n` +
        (next ? `${when}的提醒：\n${next}` : `${when}没有提醒。`);
      if (ch === "huigong" && !next) text += `\n\n${eventInfo(env, today)}`;
      await postMattermost(env, ch, text);
      return json({ sent: text });
    }

    return json({ error: "not found" }, 404);
  },
};
