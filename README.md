# zangli-reminder

Cloudflare Worker：每天北京时间 08:00 检查**明天**是否为藏历初十（莲师荟供日）或廿五（空行母荟供日），是则推送到 Mattermost。

藏历数据与换算算法来自 [stonelf/zangli](https://github.com/stonelf/zangli)（MIT，见 `THIRD_PARTY_LICENSE_zangli.md`），覆盖 1951-01-08 ~ 2051-02-11，离线计算、零运行时依赖。

## 重日 / 缺日

| 情况 | 配置 | 默认 |
|---|---|---|
| 重日：同一藏历日出现两天 | `LEAP_DAY_MODE` = `first` / `second` | `first`（与上游一致，上游只在第一天标注节日） |
| 缺日：初十或廿五不存在 | `MISSING_DAY_MODE` = `prev` / `next` / `none` | `prev`（在初九 / 廿四提醒） |

遇到这两种情况时，消息末尾会附注，例如“（本月初十缺日，按初九）”。

## 开发

```bash
npm install
npm test                  # 单元测试（全 100 年范围校验）
cp .dev.vars.example .dev.vars   # 填入 WEBHOOK_URL、TEST_TOKEN
npm run dev               # http://localhost:8787
```

- `GET /`：预览明天的判定结果 + 未来 90 天荟供日（只读）
- `GET /?date=2027-06-13`：把指定日期当作“明天”预览
- `POST /test` + `Authorization: Bearer <TEST_TOKEN>`：发送一条测试消息
- `GET /__scheduled?cron=0+0+*+*+*`（仅本地 dev）：模拟定时触发

## 部署

```bash
npx wrangler login
npx wrangler secret put WEBHOOK_URL
npx wrangler secret put TEST_TOKEN
npm run deploy
```

注意：`BOT_USERNAME` 要生效，Mattermost 需要在系统控制台开启 “Enable integrations to override usernames”。
