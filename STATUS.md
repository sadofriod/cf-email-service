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

---

## 邮件模板层（2026-10-22 追加）

- 8 个模板，11 个渲染组合（cold/followup×3 支持 en+zh，其余 en，ops-digest zh），风格对齐 `graphrag-promo/mvp/OUTREACH.md`（先给证据再谈钱、每条结论带页码、收尾给退出选项）与 `REPORT-TEMPLATE.md`（≤40 字结论、禁止形容词、固定免责声明）。
- 新路由：`GET /templates`、`POST /templates/:id/preview`（都需 Bearer）；`POST /send` 支持 `{template, data, to}`，复用原校验/体积/binding 链路；缺字段 → 400 `template_field_missing`，未知模板 → 404 `template_not_found`。
- 模板→任务映射：cold-outreach / followup-new-fact / followup-close → SOUL 主线1 冷触达；sample-delivery / report-delivery / kickoff-scope → 主线1 Concierge MVP 交付；directory-application → 主线3 MCP 目录收录；ops-digest → 内部巡检邮件版。
- 预览：`node scripts/preview-templates.mjs` → `preview/*.html|.txt`（11 组，黑名单词命中 0，text 版本全部非空）。
- 实测：`POST /send` + `template=cold-outreach` → `{"success":true,"via":"binding","messageId":"<KKtS8OTwoJ0rLNhDjKLaaKhZDF2BIKKFOJ63@ashesborn.cloud>"}`。
- 环境坑：OpenCode 跑在宿主机（macOS），它执行 `npm install` 会把 `node_modules` 换成 darwin 二进制，容器里再跑 wrangler 会报 `workerd ... another platform`。修法：容器内 `rm -rf node_modules && npm install` 重装。派活给 OpenCode 时明确叫它**不要**跑 `npm install` / `wrangler`。

### 模板层收尾修复（同日）
- HTML 段内换行丢失 → `paragraph()` 现在先转义再 `\n → <br>` 再链接化，行式内容（ops-digest 的任务条、report-delivery 的交付清单）恢复正常分行。
- 中文模板 `lang="zh-CN"` + 字体栈加入 PingFang SC / Hiragino Sans GB / Microsoft YaHei / Noto Sans CJK SC，避免拉丁字体渲染中文。
- 链接样式统一 `color:#111;text-decoration:underline`（不再用默认蓝色）。
- 最终版本：`975a9465-a21a-4dbe-82f2-af729dcba722`。

## 领域包（2026-10-22 追加）

- 5 个领域包：`energy-storage`（储能/锂电）、`semiconductor-controls`（半导体出口管制）、`web3-security`（协议安全）、`clinical-pharma`（临床与注册）、`agent-infra`（Agent/MCP 工具链）。
- 每个包提供：`label`、`buyerPersona`（谁付费）、`evidenceTypes`（该领域"可回溯证据"是什么）、`triggerTypes`（什么算触发事件）、3 条 `sampleFindings`、以及中英文 `copy`：`researchLine`（我做的功课，用该领域证据载体词汇）、`evidenceLine`（每条结论带出处的说法）、`coverageLine`（未覆盖什么）、`cite`（出处句式：页/条文§/章节/登记号/文件路径）、`subjectHints`（3 个主题行）、`deliveryLine`（sample-delivery 用）。
- 模板接入：`cold-outreach` / `sample-delivery` / `report-delivery` 支持 `domain`（默认 `energy-storage`）；未知领域 → `400 unknown_domain`。
- 新端点：`GET /templates/domains`（只出元数据，不出 copy）。
- 预览：`node scripts/preview-templates.mjs` → 27 组（冷邮件 5 领域 × 2 语言 + 其余模板），`preview/index.html` 按领域分组。
- 实测发送（非默认领域）：web3 en `<6NgdWn47H0MYxI2kCD4dZHf5rmjg5zgWyBT0@ashesborn.cloud>`、agent-infra zh `<cJdAtC854op2o36Bk90diTAXmRfRAN1ABaV1@ashesborn.cloud>`。
- 最终版本：`18f72d71-d955-4215-9fb9-9cae6a2887f9`，包体 51.20 KiB / gzip 15.09 KiB。
