# 部署状态（2026-10-22 实测）

## 已完成

| 事项 | 证据 |
| --- | --- |
| Worker 已部署 | `https://cf-email-service.next-blog.workers.dev`（Version `8d1a0329-ed34-4424-939f-79c2555c614f`） |
| `send_email` binding 生效 | `/health` → `{"ok":true,"binding":"available",...}` |
| 鉴权可用 | 无 Bearer → `401 unauthorized` |
| 参数校验可用 | 非法收件人 → `400 validation_error` |
| **真实投递成功** | `POST /send` → `{"success":true,"via":"binding","messageId":"<44gD1hdHDxki3HqHxWksDlKokGSaZJ6Y0PtV@ashesborn.cloud>"}` |
| 目的地址已验证 | `justlikeashes@gmail.com`（账号 owner 邮箱，自动 verified） |
| 根域 SPF 已合并 | `v=spf1 include:spf.protection.outlook.com include:_spf.mx.cloudflare.net -all` |

## 关键发现：SPF 冲突才是真正的拦路虎

第一次发送返回 `E_RECIPIENT_NOT_ALLOWED`（收件人不在允许列表），即使目的地址已 verified。
把根域 SPF 从 `include:spf.protection.outlook.com -all` 合并成
`include:spf.protection.outlook.com include:_spf.mx.cloudflare.net -all` 之后，Email Routing 从
`misconfigured/locked` 恢复，**同一请求立刻成功**。

→ 结论：Email Routing 处于 misconfigured 状态时，send_email binding 的目的地址白名单不生效，错误被误报成 `E_RECIPIENT_NOT_ALLOWED`。排错时先修 SPF，不要怀疑收件人配置。

## 当前能力边界

- **可以发**：发往本账号内已验证目的地址（免费、不限量、不占配额）。
- **不能发**：任意收件人（客户、注册用户）。`E_RECIPIENT_NOT_ALLOWED` 说明账号是 Workers Free，
  需要升级 Workers Paid（$5/月，含 3,000 封/月，超出 $0.35/1,000 封）后才能 onboard 域名做正式发送。

## 凭证位置

- Worker 调用密钥 `SEND_API_KEY`：已写入 `wrangler secret`，本地副本 `/workspace/cf-email-service/.dev.vars`（已 gitignore）。
- Cloudflare API Token（`hermes-cf-email-service`）：Dashboard → My Profile → API Tokens 可见/可撤。
  权限：Workers Scripts Write/Read、Email Sending Read/Write、Email Routing Addresses Read/Write、
  Zone Read、DNS Read/Write、Email Routing Rules Read/Write、Workers Routes Write。

## 下一步（按优先级）

1. **升级 Workers Paid** → `onboard ashesborn.cloud`（`POST /zones/{zone}/email/sending/subdomains`）→ 就能发任意收件人。
2. DMARC 收紧：目前 `p=none`，建议加 `rua=mailto:dmarc@ashesborn.cloud` 收聚合报告，两周后评估到 `p=quarantine`。
3. 绑定自定义域名 `mail-api.ashesborn.cloud`（wrangler routes custom_domain）。
4. 加抑制名单处理（硬退信自动进 suppression，binding 会抛 `E_RECIPIENT_SUPPRESSED`）。

---

## 更新（07:20 UTC，Workers Paid 已开通后）

- Workers Paid 订阅已创建（`2301082f9fc8401d9f30ab89caa7988d`，$5/月）。
- Email Sending 已 onboard：sending subdomain tag `a66f0ce9467f4330b1170244a81a8c1b`，
  return-path `cf-bounce.ashesborn.cloud`，dkim selector `cf-bounce`，preview_enabled=true。
- DNS 已落地：`cf-bounce` MX ×3、`cf-bounce` TXT `v=spf1 include:_spf.mx.cloudflare.net ~all`、
  `cf-bounce._domainkey` DKIM、`_dmarc` `v=DMARC1; p=none;`。
- 提升后有一小段 `E_EMAIL_SENDING_NOT_READY`（开通窗口），约 3–5 分钟后消失。
- **任意收件人投递成功**：`to=justlikeashes+cf-arbitrary@gmail.com`（未验证地址）→
  `{"success":true,"via":"binding","messageId":"<sHevTkkIAlfbO7NtpMLOMgzlkevDNX7FPUds@ashesborn.cloud>"}`。
