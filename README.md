# zangli-reminder

Cloudflare Worker：每天北京时间 08:00 推送藏历提醒到 Mattermost 荟供频道：

- **荟供频道**（`WEBHOOK_URL`）：提前一天提醒藏历初十（莲师荟供日）、廿五（空行母荟供日），附荟供时间（温哥华时间自动换算）、Zoom、供品说明

藏历数据与换算算法来自 [stonelf/zangli](https://github.com/stonelf/zangli)（MIT，见 `THIRD_PARTY_LICENSE_zangli.md`），覆盖 1951-01-08 ~ 2051-02-11，离线计算、零运行时依赖。

## 守持规则

缺日则提前一天（如某月没有三十，则在廿九守持）；重日只守第一天。遇到时消息末尾会附注。

## 开发

```bash
npm install
npm test                  # 单元测试（全 100 年范围校验）
cp .dev.vars.example .dev.vars   # 填入 WEBHOOK_URL、TEST_TOKEN
npm run dev               # http://localhost:8787
```

- `GET /`：预览今天 08:00 会发的消息 + 之后 60 天的提醒（只读）
- `GET /?date=2027-06-13`：把指定日期当作“今天”预览
- `POST /test?channel=huigong` + `Authorization: Bearer <TEST_TOKEN>`：发送测试消息
- `GET /__scheduled?cron=0+0+*+*+*`（仅本地 dev）：模拟定时触发

## 部署

```bash
npx wrangler login
npx wrangler secret put WEBHOOK_URL
npx wrangler secret put ZOOM_ID
npx wrangler secret put ZOOM_PASSWORD
npx wrangler secret put TEST_TOKEN
npm run deploy
```

注意：`BOT_USERNAME` 要生效，Mattermost 需要在系统控制台开启 “Enable integrations to override usernames”。
