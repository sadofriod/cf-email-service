# 已发送邮件查看（Outbox）

Worker 会把经由 `POST /send` 发出的成功和失败请求写入 Cloudflare KV。可查时间、收件人、主题、模板、领域、发送状态、messageId、失败原因及正文。元数据保留 90 天，正文保留 30 天；正文到期后列表记录仍会显示，但详情会标记正文已过期。

不能查到直接通过 SMTP 绕过 Worker 发出的邮件、在 Cloudflare 控制台以外发生的改动，或超过保留期的记录。邮件是否最终投递、退信等结果请查看 Cloudflare Activity log。

## 使用方法

浏览器访问：

```text
https://cf-email-service.next-blog.workers.dev/outbox?token=<SEND_API_KEY>
```

命令行读取 JSON：

```bash
curl -H "Authorization: Bearer $SEND_API_KEY" \
  https://cf-email-service.next-blog.workers.dev/outbox.json
```

列表默认每页 50 条，最大 200 条，可用 `?limit=` 和 `?cursor=` 分页。

改为倒序键方案之前的少量测试记录（`m:` 前缀）不再展示。

## 安全

`?token=` 会进入浏览器历史和可能的代理日志，只应在自己的机器上临时使用。当前查看页与发信共用 `SEND_API_KEY`；建议后续配置独立的只读 token。
