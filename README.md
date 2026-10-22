# cf-email-service

ashesborn.cloud 的事务性邮件发送服务，运行于 Cloudflare Workers，使用 **Cloudflare Email Service（Email Sending）**。

## 架构

可信脚本/后端通过带共享密钥的 `POST /send` 调用 Worker；优先使用
`send_email` binding 的 `env.EMAIL.send()`，也可配置
`POST /accounts/{id}/email/sending/send` REST 兜底。Cloudflare 签署 DKIM 并投递，
退信回流到 `cf-bounce.ashesborn.cloud`。公开浏览器表单应通过自己的可信后端代理。

## 前置条件与 DNS

1. 域名使用 Cloudflare DNS；`ashesborn.cloud` 使用 Cloudflare NS。
2. 账号开通 Workers Paid，域名 onboard 到 Email Service → Email Sending。
3. 计划费用和发送额度以供应商当前说明为准；免费计划只允许向已验证目的地址发送。

Dashboard：**Compute → Email Service → Email Sending → Onboard Domain → 选择域名**。
API 等价操作如下，`CF_ZONE_ID` 和 `CF_API_TOKEN` 从受保护运行环境提供，
令牌仅授予所需资源的最小权限（此操作需要 `Email Sending: Edit`）：

```bash
curl -X POST "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/email/sending/subdomains" \
  --oauth2-bearer "$CF_API_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"name":"ashesborn.cloud","enabled":true}'
```

onboard 后检查公开 DNS 记录：

| 类型 | 名称 | 值 |
| --- | --- | --- |
| MX ×3 | `cf-bounce` | `route1/2/3.mx.cloudflare.net` |
| TXT | `cf-bounce` | `v=spf1 include:_spf.mx.cloudflare.net ~all` |
| TXT | `cf-bounce._domainkey` | Cloudflare 生成的 DKIM 公钥 |
| TXT | `_dmarc` | `v=DMARC1; p=none;`（先观察报告再收紧） |

发信 envelope-from 为 `cf-bounce.ashesborn.cloud`，DKIM 使用 `cf-bounce` selector。
Email Sending 本身不要求改根域 SPF；如果同时使用 Email Routing 收信转发，
根域只保留一条合并后的 SPF：

```text
v=spf1 include:spf.protection.outlook.com include:_spf.mx.cloudflare.net -all
```

## 部署与本地配置

```bash
npm install

# 每个环境使用独立随机密钥；通过密码管理流程保存调用方所需副本
openssl rand -hex 32 | npx wrangler secret put SEND_API_KEY
npm run deploy

# SERVICE_URL 从私有部署配置提供
curl "${SERVICE_URL}/health"
# {"ok":true}
```

本地开发：复制 `.dev.vars.example` 为不受版本控制的 `.dev.vars`，
用 `openssl rand -hex 32` 生成独立密钥后填入 `SEND_API_KEY`。
需要 REST 兜底时填写 `CF_ACCOUNT_ID` 和 `CF_API_TOKEN`，生产使用 Worker secrets。
真实凭证不要进入仓库、终端共享记录或 CI 日志。

`SEND_API_KEY` 至少 32 字符，去除首尾空白后的值必须与原配置完全一致。
拒绝已知占位标记（`example`、`change[-_]?me`、`replace[-_]?me`、`your[-_]`、
`placeholder`、`<`、`>`）以及单一字符重复的值；不要通过填充示例值凑长度。
`Authorization` 的 `Bearer` 认证方案不区分大小写，密钥本身必须精确匹配。

**CORS 不是身份认证**：`ALLOWED_ORIGINS` 不能保护共享密钥，绝不能将其嵌入公开浏览器包。
公开表单应由可信后端代理，并实施用户鉴权、限流等控制。
`/health` 只返回 `{"ok":true}`，不暴露传输配置或发件人，也不证明邮件已成功投递。

可在 `wrangler.jsonc` 配置自定义域名：

```jsonc
"routes": [{ "pattern": "mail-api.ashesborn.cloud", "custom_domain": true }]
```

## 调用示例

### Worker

从受保护的运行环境提供 `SERVICE_URL` 和 `SEND_API_KEY`：

```bash
curl -X POST "${SERVICE_URL}/send" \
  --oauth2-bearer "$SEND_API_KEY" \
  -H 'content-type: application/json' \
  -d '{
    "to": "customer@example.com",
    "from": "hello@ashesborn.cloud",
    "subject": "Your weekly digest",
    "html": "<h1>Digest</h1>",
    "text": "Digest",
    "replyTo": "support@ashesborn.cloud",
    "headers": { "List-Unsubscribe": "<https://ashesborn.cloud/unsubscribe>" }
  }'
# {"success":true,"via":"binding"}
```

成功响应仅包含 `success: true` 和 `via`（`binding` 或 `rest`），不转发供应商成功载荷或消息标识，
日志也不记录这些内容；失败时可参考 `error.hint`。

### REST API（可信后端）

```bash
# 从受保护环境提供 CF_ACCOUNT_ID、CF_API_TOKEN；必须显式设置 TO
TO=recipient@example.com node scripts/send-rest.mjs
```

### SMTP（老项目 / 邮件客户端）

```text
Host: smtp.mx.cloudflare.net
Port: 465（隐式 TLS）
User: api_token
Pass: 从密码管理器提供的 Cloudflare API token
```

```bash
# 从受保护环境提供 CF_API_TOKEN；必须显式设置 TO
TO=recipient@example.com node scripts/send-smtp.mjs
```

两个 CLI 都不默认发往个人邮箱，成功时只输出 `{"success":true}`，失败时只输出通用错误，不回显收件人、
供应商响应或消息标识。详细问题通过受控的供应商后台排查。

## 错误码对照

| HTTP | binding `error.code` | REST `errors[].code` | 处理 |
| --- | --- | --- | --- |
| 400 | `E_VALIDATION_ERROR` / `E_FIELD_MISSING` | 10001 | 检查请求体 |
| 400 | `E_TOO_MANY_RECIPIENTS` | — | to+cc+bcc ≤ 50 |
| 403 | `E_SENDER_DOMAIN_NOT_AVAILABLE` | 10105 / 10203 | 检查域名 onboard / Workers Paid |
| 403 | `E_SENDER_NOT_VERIFIED` | — | 检查 DKIM/SPF，等待 DNS 生效 |
| 403 | `E_RECIPIENT_NOT_ALLOWED` | — | 检查计划、收件人验证和 Email Routing/SPF |
| 403 | `E_RECIPIENT_SUPPRESSED` | — | 收件人在抑制名单（曾硬退信/投诉） |
| 413 | `E_CONTENT_TOO_LARGE` | 10200 | 整封（含附件）≤ 5 MiB |
| 429 | `E_RATE_LIMIT_EXCEEDED` / `E_DAILY_LIMIT_EXCEEDED` | 10004 | 退避重试 |
| 502 | `E_DELIVERY_FAILED` | — | 从受控 activity log 排查 |
| 503 | `no_transport`（本服务自定义） | — | binding 和 REST 都没配置 |

## 故障排查

- **`10203 email_sending_disabled`**：检查域名 onboard 和 Workers Paid；鉴权失败还应检查令牌权限及资源范围。
- **SPF 冲突**：一个域只能有一条 `v=spf1`；合并 Outlook 与 Cloudflare include，注意 DNS lookup 上限。
- **`E_EMAIL_SENDING_NOT_READY`**：开通可能有短暂等待窗口，稍后重试并确认供应商状态。
- **DMARC**：先用 `p=none` 观察聚合报告，确认 SPF/DKIM 通过再评估 `p=quarantine`。
- **`550 5.7.1 Sender denied`（SMTP）**：检查 `MAIL FROM` 域名是否属于令牌账号的 Email Sending。
- **垃圾箱投递**：新域名/IP 需要预热，先发送事务性邮件，避免突然群发营销内容。

## 文件结构

```text
wrangler.jsonc        Worker 配置与 send_email binding
src/index.ts          路由、鉴权、CORS、binding/REST 双通道
src/types.ts          Env / 请求响应类型
src/lib/validate.ts   请求校验与体积估算
src/lib/errors.ts     binding 与 REST 错误 → HTTP 映射
scripts/send-rest.mjs REST CLI
scripts/send-smtp.mjs SMTP CLI
.dev.vars.example    无凭证的本地配置模板
STATUS.md             配置记录与未执行的历史清理规程
```

## 本地验证与防泄露

`npm run typecheck`、`npm test` 检查类型和模拟传输回归；测试不会发送邮件。
`npm run dry` 只构建，不部署。CI 使用校验 SHA-256 的固定 Gitleaks 版本、完整历史 checkout、
只读权限及脱敏输出，覆盖跟踪文件、所有已获取引用的历史、提交消息和元数据；
锁文件另经 stdin 扫描，避免默认路径排除。扫描范围、限制和历史清理步骤见 STATUS。
