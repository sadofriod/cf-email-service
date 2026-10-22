# cf-email-service

ashesborn.cloud 的事务性邮件发送服务，跑在 Cloudflare Workers 上，底层用 **Cloudflare Email Service（Email Sending）**。

一条命令发信：`curl -X POST https://cf-email-service.<你的workers子域>.workers.dev/send`

## 架构

```
调用方（脚本 / 后端 / 表单）
        │  POST /send   Authorization: Bearer <SEND_API_KEY>
        ▼
   Cloudflare Worker  cf-email-service
        │
        ├─(1) send_email binding  env.EMAIL.send()   ← 首选，无网络跳转
        └─(2) REST API  POST /accounts/{id}/email/sending/send  ← 兜底
                        │
                        ▼
        Cloudflare Email Sending  →  DKIM 签名  →  收件方 MTA
                        │
                        └─ 退信回流到 cf-bounce.ashesborn.cloud
```

## 当前账号状态（2026-10-22 实测）

| 项目 | 状态 |
| --- | --- |
| Zone `ashesborn.cloud` | active，NS 已指向 Cloudflare（`fattouche/ziggy.ns.cloudflare.com`） |
| Workers 计划 | **Workers Paid 已开通**（$5/月，Subscription `2301082f9fc8401d9f30ab89caa7988d`） |
| Email Sending | **已 onboard**：sending subdomain `ashesborn.cloud`（tag `a66f0ce9467f4330b1170244a81a8c1b`），return-path `cf-bounce.ashesborn.cloud`，DKIM selector `cf-bounce`，email preview 已开 |
| 已落地的 DNS | `cf-bounce` MX ×3、`cf-bounce` SPF `v=spf1 include:_spf.mx.cloudflare.net ~all`、`cf-bounce._domainkey` DKIM、`_dmarc` `v=DMARC1; p=none;` |
| 根域 SPF | 已合并：`v=spf1 include:spf.protection.outlook.com include:_spf.mx.cloudflare.net -all`（不加 Cloudflare include 会让 Email Routing 停在 `misconfigured`，连带 send_email binding 白名单失效） |
| 实测投递 | 已验证目的地址 + 任意收件人均成功（Workers Paid 生效前发任意地址会报 `E_RECIPIENT_NOT_ALLOWED`，升级后有一小段 `E_EMAIL_SENDING_NOT_READY` 的开通窗口，约 3–5 分钟后可用） |

## 前置条件

1. 域名使用 Cloudflare DNS（已满足）。
2. 账号为 **Workers Paid**（$5/月起，含每月 3,000 封，超出 $0.35/1,000 封）。
3. 域名已 onboard 到 Email Service > Email Sending。

## 开通 Email Sending（一次性）

Dashboard：**Compute → Email Service → Email Sending → Onboard Domain → 选 ashesborn.cloud → Done**

API 等价操作（token 需 `Email Sending: Edit`）：

```bash
curl -X POST "https://api.cloudflare.com/client/v4/zones/48595d0a5d22e38c102bb07f345a9a2f/email/sending/subdomains" \
  -H "Authorization: Bearer $CF_API_TOKEN" -H 'content-type: application/json' \
  -d '{"name":"ashesborn.cloud","enabled":true}'
```

onboard 后 Cloudflare 自动写入以下记录（全部在 `cf-bounce` 子域，与 Email Routing 的记录互不影响）：

| 类型 | 名称 | 值 |
| --- | --- | --- |
| MX ×3 | `cf-bounce` | `route1/2/3.mx.cloudflare.net` |
| TXT | `cf-bounce` | `v=spf1 include:_spf.mx.cloudflare.net ~all` |
| TXT | `cf-bounce._domainkey` | `v=DKIM1; h=sha256; k=rsa; p=...`（Cloudflare 生成的 DKIM 公钥） |
| TXT | `_dmarc` | 已存在 `v=DMARC1; p=none;`，保持不变（新域名建议先 `p=none` 观察） |

**发信 DKIM 落在 `cf-bounce._domainkey`，根域 SPF 不需要改**（发信 envelope-from 用的是 `cf-bounce.ashesborn.cloud`）。
但如果你要用 Email Routing 转发来件，根域 SPF 必须合并 Cloudflare 的 include，否则转发件过不了 SPF：

```
v=spf1 include:spf.protection.outlook.com include:_spf.mx.cloudflare.net -all
```

（合并后 DNS lookup 计数约 2 个 include + 各自展开，远低于 10 次上限。）

## 部署

```bash
npm install

# 1. 设置调用密钥（Worker 用它鉴权，随机生成一个长字符串）
openssl rand -hex 32 | npx wrangler secret put SEND_API_KEY

# 2. 部署
npm run deploy
# → https://cf-email-service.<workers 子域>.workers.dev

# 3. 健康检查
curl https://cf-email-service.<子域>.workers.dev/health
# {"ok":true,"binding":"available","rest_fallback":false,"from":"hello@ashesborn.cloud"}
```

如果要绑定自定义域名（推荐 `mail-api.ashesborn.cloud`），在 `wrangler.jsonc` 里加：

```jsonc
"routes": [{ "pattern": "mail-api.ashesborn.cloud", "custom_domain": true }]
```

## 调用示例

### 1. Worker

```bash
curl -X POST https://cf-email-service.<子域>.workers.dev/send \
  -H "Authorization: Bearer $SEND_API_KEY" \
  -H 'content-type: application/json' \
  -d '{
    "to": "customer@example.com",
    "from": "hello@ashesborn.cloud",
    "subject": "Your weekly digest",
    "html": "<h1>Digest</h1>",
    "text": "Digest",
    "replyTo": "support@ashesborn.cloud",
    "headers": { "List-Unsubscribe": "<https://ashesborn.cloud/unsubscribe?id=abc>" }
  }'
# {"success":true,"via":"binding","messageId":"..."}
```

响应里的 `via` 告诉你走的是 binding 还是 REST 兜底；失败时 `error.hint` 会直接指向修复动作。

## 邮件模板

模板接口同样使用 `Bearer SEND_API_KEY`：`GET /templates` 列出模板，`POST /templates/:id/preview` 仅渲染不发送，`POST /send` 传入 `template` 和 `data` 会渲染后走同一发送校验链路。完整字段、主题规则和禁忌见 [docs/EMAIL-TEMPLATES.md](docs/EMAIL-TEMPLATES.md)。

- `cold-outreach`：带触发事件、页码和两页样例的首封冷邮件。
- `followup-new-fact`：第 3 天补充新事实的跟进。
- `followup-close`：第 10 天明确结束的收尾邮件。
- `sample-delivery`：对方索取后交付两页样例。
- `report-delivery`：完整报告和证据文件包交付。
- `kickoff-scope`：付款后的范围和问题确认。
- `directory-application`：MCP 目录或注册表收录申请。
- `ops-digest`：内部巡检任务与阻塞摘要。

### 2. REST API（任何后端）

```bash
CF_ACCOUNT_ID=055d272c9a28dec6a903340e312864f6 CF_API_TOKEN=xxxx \
TO=you@example.com node scripts/send-rest.mjs
```

### 3. SMTP（老项目 / 邮件客户端）

```
Host: smtp.mx.cloudflare.net   Port: 465 (隐式 TLS)
User: api_token                Pass: <Cloudflare API token>
```

```bash
CF_API_TOKEN=xxxx TO=you@example.com node scripts/send-smtp.mjs
```

## 错误码对照

| HTTP | binding `error.code` | REST `errors[].code` | 处理 |
| --- | --- | --- | --- |
| 400 | `E_VALIDATION_ERROR` / `E_FIELD_MISSING` | 10001 | 检查请求体 |
| 400 | `E_TOO_MANY_RECIPIENTS` | — | to+cc+bcc ≤ 50 |
| 403 | `E_SENDER_DOMAIN_NOT_AVAILABLE` | 10105 / 10203 | 域名未 onboard / 未升级 Workers Paid |
| 403 | `E_SENDER_NOT_VERIFIED` | — | DKIM/SPF 未生效，等 5–15 分钟 |
| 403 | `E_RECIPIENT_NOT_ALLOWED` | — | 免费计划只能发到已验证目的地址 |
| 403 | `E_RECIPIENT_SUPPRESSED` | — | 收件人在抑制名单（曾硬退信/投诉） |
| 413 | `E_CONTENT_TOO_LARGE` | 10200 | 整封（含附件）≤ 5 MiB |
| 429 | `E_RATE_LIMIT_EXCEEDED` / `E_DAILY_LIMIT_EXCEEDED` | 10004 | 退避重试 |
| 502 | `E_DELIVERY_FAILED` | — | 上游投递失败，看 activity log |
| 503 | `no_transport`（本服务自定义） | — | binding 和 REST 都没配 |

## 成本

- Workers Paid $5/月，含 3,000 封/月，超出 $0.35/1,000 封。
- 发往**本账号已验证目的地址**的邮件免费，且不占额度。
- Email Routing（收信）免费不限量。

## 故障排查

- **`10203 email_sending_disabled`**：域名没 onboard，或账号不是 Workers Paid。用上面那条 `POST /zones/{zone}/email/sending/subdomains` 检查，返回 `2036 Unauthorized` 就是计划问题。
- **SPF 冲突**：一个域只能有一条 `v=spf1` 记录。现有 `spf.protection.outlook.com` 必须先合并再加 Cloudflare 的 include，否则两个服务互相打架。
- **DMARC**：现在根域是 `p=none`，先跑两周看聚合报告（`_dmarc` 可加 `rua=mailto:dmarc@ashesborn.cloud`），确认 SPF/DKIM 全通过再收紧到 `p=quarantine`。
- **`550 5.7.1 Sender denied`（SMTP）**：`MAIL FROM` 的域名不在该 token 所属账号的 Email Sending 里。
- **短信箱投递差**：新域名/新 IP 需要预热。先只发事务性邮件（注册验证、订单确认），避免一上来群发营销内容。

## 文件结构

```
cf-email-service/
├── wrangler.jsonc          # Worker 配置 + send_email binding
├── src/
│   ├── index.ts            # 路由、鉴权、CORS、binding/REST 双通道
│   ├── types.ts            # Env / 请求响应类型
│   └── lib/
│       ├── validate.ts     # 纯函数校验 + 体积估算
│       └── errors.ts       # binding E_* 与 REST 数字码 → HTTP 映射
├── scripts/
│   ├── send-rest.mjs       # REST API 发信 CLI
│   └── send-smtp.mjs       # SMTP（nodemailer）发信 CLI
├── .dev.vars.example
└── README.md
```
