# macOS 客户端集成

这个服务可以从 macOS 的三种入口发信。已实测的服务事实如下：

- SMTP 提交已验证可用：`smtps://smtp.mx.cloudflare.net:465`，用户名固定为 `api_token`，密码是 Cloudflare API token；容器实测返回 `250`。
- Worker 地址为 `https://cf-email-service.next-blog.workers.dev`。`POST /send` 使用 `Authorization: Bearer <SEND_API_KEY>`，支持裸字段 `{to,from,subject,html,text}` 和模板字段 `{template,data,to,domain,locale}`；`GET /health` 不需要鉴权。
- 发件域必须是 `@ashesborn.cloud`：Worker 会拦截，SMTP 也会返回 `550 5.7.1`。

## 路线 A：系统邮件 App（或任意客户端）直连 Cloudflare SMTP

**适合谁：** 已有一个 `@ashesborn.cloud` 邮箱账户，并想继续使用 Mail、Outlook 等传统邮件客户端的人。

**具体点哪里：**

1. 在邮件 App 打开 **设置 → 账户 → 选中账户**。
2. 在「外发邮件服务器 (SMTP)」下拉菜单选择「编辑 SMTP 服务器列表」；打开「高级」，添加服务器。
3. 填入并把它设为默认服务器：服务器 `smtp.mx.cloudflare.net`；端口 `465`；勾选「使用 TLS/SSL」；认证选「密码」；用户名 `api_token`；密码填具备 `Email Sending: Edit` 权限的 Cloudflare API token。

**坑：**

- Mail 不允许只建立一个外发服务器，必须先有带收件服务器的账户。因此 Cloudflare SMTP 在 Mail 里只能「挂在已有账户上」。
- Mail 的 From 和账户地址绑定。账户地址若不是 `@ashesborn.cloud`，`MAIL FROM` 会变成该账户地址，Cloudflare 返回 `550 5.7.1 Sender denied`。所以路线 A 只适合已有 `@ashesborn.cloud` 账户的人；收件仍可使用 Outlook 或 Cloudflare Routing。否则使用路线 B 或 C。
- SMTP 只支持 `465` 的隐式 TLS，不支持 `587` 或 STARTTLS。

## 路线 B：快捷指令一键发送

**适合谁：** 日常手动发信、希望从菜单栏或选中文本快速触发的人。这是推荐路线。

1. 打开「快捷指令」，新建快捷指令。添加「获取剪贴板」或「要求输入」，将结果作为正文。
2. 添加「获取 URL 内容」：URL 填 `https://cf-email-service.next-blog.workers.dev/send`，方法选 `POST`；在 Headers 逐条添加 `Authorization` = `Bearer <SEND_API_KEY>`，以及 `Content-Type` = `application/json`。
3. 请求体类型选 `JSON`，逐字段添加如下内容；再添加「显示结果」。可将快捷指令固定到菜单栏，或在详情中设为「选中文本 → 快速操作」。

裸字段发信的 JSON 字段：

| 键 | 类型 | 示例值 |
| --- | --- | --- |
| `to` | 文本 | `a@b.com` |
| `from` | 文本 | `hello@ashesborn.cloud` |
| `subject` | 文本 | `你好` |
| `text` | 文本 | 选择「获取剪贴板」的魔法变量 |

模板发信的 JSON 字段示例：

| 键 | 类型 | 示例值 |
| --- | --- | --- |
| `template` | 文本 | `cold-outreach` |
| `to` | 文本 | `a@b.com` |
| `domain` | 文本 | `energy-storage` |
| `locale` | 文本 | `zh` |
| `data` | 字典 | 添加模板需要的字段 |

对应的可复制 JSON 为：

```json
{
  "template": "cold-outreach",
  "to": "a@b.com",
  "domain": "energy-storage",
  "locale": "zh",
  "data": {}
}
```

若想先在终端验证相同请求，可直接运行（仅将 `<SEND_API_KEY>` 替换为自己的值）：

```bash
curl --request POST 'https://cf-email-service.next-blog.workers.dev/send' \
  --header 'Authorization: Bearer <SEND_API_KEY>' \
  --header 'Content-Type: application/json' \
  --data '{"template":"cold-outreach","to":"a@b.com","domain":"energy-storage","locale":"zh","data":{}}'
```

**坑：** 不要在「文本」请求体中手写带引号的 JSON 再嵌入变量，容易造成 JSON 引号转义错误。应在「获取 URL 内容」里把请求体类型设为 `JSON`，使用上表逐个添加键和值；剪贴板正文用魔法变量填在 `text` 的值中。`from` 必须是 `@ashesborn.cloud`。

## 路线 C：命令行 / Automator 快速操作

**适合谁：** 终端、Alfred、Automator 工作流，或希望把发送能力接到脚本的人。

1. 在项目根目录执行安装器，按提示保存 Worker 配置和默认发件人：

```bash
bash mac/install.sh
cloudmail -t a@b.com -s "hi" -m "body"
```

也可以把剪贴板或任意标准输入作为正文：

```bash
pbpaste | cloudmail -t a@b.com -s "quote"
printf 'hello from a heredoc\n' | cloudmail -t a@b.com -s "hi"
```

模板命令示例：

```bash
cloudmail -t a@b.com -T cold-outreach -D energy-storage -L zh --data '{}'
```

2. 要创建 Automator 快速操作：打开 Automator，新建「快速操作」，把「工作流程收到当前」设为「文本」，添加「运行 AppleScript」，将 [`quick-action.applescript`](quick-action.applescript) 全部粘入并保存为 `CloudMail`。它会使用选中文本；没有选中文本时读取剪贴板，并弹窗询问收件人和主题。
3. 在「系统设置 → 键盘 → 快捷键 → 服务」给 `CloudMail` 绑定快捷键。需要短命令时，可在 `~/.zshrc` 加 `alias mail='cloudmail'`。

**坑：** 安装器不会自动改动 shell 配置；如果终端找不到 `cloudmail`，按其提示把 `export PATH="$HOME/bin:$PATH"` 加到 `~/.zshrc` 后重开终端。Automator 依赖 `~/bin/cloudmail`，先运行安装器。

## 三条路线怎么选

| 路线 | 可选 From | 可用模板 | 需要点击 | 适合场景 |
| --- | --- | --- | --- | --- |
| A：系统邮件 App + SMTP | 受账户地址绑定限制 | 否 | 写信时操作 | 已有 `@ashesborn.cloud` 收件账户的传统邮件工作流 |
| B：快捷指令 + Worker | 可以，必须是 `@ashesborn.cloud` | 可以 | 一次触发 | 日常手动发送、菜单栏和文本快速操作 |
| C：CLI / Automator + Worker | 可以，必须是 `@ashesborn.cloud` | 可以 | 终端零次，Automator 两次输入 | 脚本、Alfred、Automator 和可重复工作流 |
