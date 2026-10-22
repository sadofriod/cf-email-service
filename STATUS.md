# 配置状态与凭证整改

## 配置记录

- 曾完成 Worker 部署、鉴权、参数校验和邮件投递验证；不再保留部署地址、版本、消息标识或个人收件人。历史记录不代表当前运行验证。
- Workers Paid 和 Email Sending 开通后可向任意合规收件人发送；开通窗口可能短暂返回 `E_EMAIL_SENDING_NOT_READY`。
- 公开 DNS：return-path `cf-bounce.ashesborn.cloud`，DKIM selector `cf-bounce`；`cf-bounce` MX 指向 Cloudflare，SPF 为 `v=spf1 include:_spf.mx.cloudflare.net ~all`。
- 根域 SPF 合并为 `v=spf1 include:spf.protection.outlook.com include:_spf.mx.cloudflare.net -all`。一个域只能有一条 SPF；Email Routing 配置异常曾伴随 binding 的 `E_RECIPIENT_NOT_ALLOWED`，应同时检查 SPF、收件人验证和计划。
- `_dmarc` 使用 `v=DMARC1; p=none;`；根据聚合报告评估收紧策略。后续可配置自定义 API 域名和抑制名单处理。

## 本次整改范围

- 文档和示例不再保存实际账号、Zone、订阅或部署标识、个人邮箱、精确本地凭证路径、令牌名称及宽泛权限清单。
- 账号、Zone 等标识不是认证凭证，但没有必要公开运营关联信息。公开 DNS 端点和 DKIM 公钥也不是秘密。
- 初步人工检查**没有确认真实生产令牌泄露**；这不是完整扫描结论或历史已清理的证明。若后续确认有效凭证暴露，由凭证所有者在供应商端撤销/轮换并检查使用记录；不要仅因标识公开就声称必须轮换生产令牌。
- `SEND_API_KEY` 必须是每环境独立的随机值，至少 32 字符（`openssl rand -hex 32` 可生成 64 字符）；禁止首尾空白、已知占位标记和单一字符重复值。具体规则、API 和错误映射见 README。
- CORS 不是鉴权；共享密钥只供可信服务端使用，不得嵌入公开浏览器包。CLI 必须显式设置 `TO`，输出仅为通用成功/失败；`/health` 只返回 `{"ok":true}`。
- Worker 成功响应仅为 `{"success":true,"via":"binding"}` 或 `{"success":true,"via":"rest"}`，响应和日志不透传供应商成功载荷或消息标识；CLI 成功时只输出 `{"success":true}`。

## 审计结果与限制

- 已解除浅克隆限制，重新列举并获取远端全部分支、标签和可见 PR head/merge 引用；扫描时可见 `master`、任务分支和本 PR 引用，没有标签。已核实初始提交没有父提交。不可访问的服务器对象、其他克隆和 fork 不在此证明范围内。
- Gitleaks 8.30.1 官方二进制经固定 SHA-256 校验，已扫描跟踪工作树（包括隐藏文件）、全部已获取引用的完整可达文件历史，以及 `git log --all --format=raw` 提交消息/作者/提交者元数据，未命中凭证。可见标签消息也已纳入检查（当前无标签）。
- 默认 Gitleaks 排除锁文件路径，因此另用 stdin 扫描当前锁文件与所有引用中的锁文件历史补丁；未命中凭证。人工检查未确认生产令牌、私钥或已部署弱口令，也未复现鉴权绕过。公开示例口令与运维信息的存在已确认，已从当前文件移除。
- 发现的是潜在披露路径，不是已证明令牌泄露：未知上游错误、供应商结果和主题日志。现仅输出固定白名单错误和安全状态；同时升级与 SMTP 凭证披露风险相关的 Nodemailer，安装后 `npm audit` 报告零告警。
- 9 项模拟传输回归、类型检查、部署 dry-run 已通过；原生 `crypto.subtle.timingSafeEqual` 经官方文档、Workers 类型及禁用出站网络的本地 Workers 运行时验证。没有生产发送、部署或供应商凭证操作。
- GitHub Secret Scanning alerts API 返回 403（集成无权限）；不能据此宣称无平台告警。扫描器的格式/熵规则可能漏报，结果也不覆盖后续推送。
- CodeQL 对 JavaScript 和 Actions 报告零告警。自动代码审查因模型配置错误未能运行，补充独立只读审查未发现重大问题。新增 GitHub 扫描工作流为 `action_required`、尚未运行任何 job，需维护者批准后核验；不能将本地扫描当作远端 CI 已通过。
- **远端历史重写：未执行。供应商凭证撤销/轮换：未执行，无供应商访问权限。** 所选运维信息仍存在于旧提交中；本 PR 合并不等于历史清理完成。维护者须按下述流程协调执行并复核。若确认真实凭证泄露，应先撤销/轮换，再处理历史。

复核命令（在已获取全部引用的隔离完整副本运行，扫描器必须为已校验的固定版本；不得打印原始命中）：

```bash
set -euo pipefail
gitleaks git . --log-opts='--all --full-history -m' --redact=100 --no-banner
git log --all --format=raw | gitleaks stdin --redact=100 --no-banner
git for-each-ref refs/tags --format='%(contents)' | gitleaks stdin --redact=100 --no-banner
git log --all --full-history -m -p --format=fuller -- package-lock.json |
  gitleaks stdin --redact=100 --no-banner
# 非 bare 工作树还需以下两项；归档只含跟踪文件，包含隐藏文件。
tree=$(mktemp -d)
trap 'rm -rf "$tree"' EXIT
git archive HEAD | tar -xf - -C "$tree"
gitleaks dir "$tree" --redact=100 --no-banner
gitleaks stdin --redact=100 --no-banner < package-lock.json
```

## 历史清理操作规程（未执行）

**本次没有执行远端历史重写。上述扫描未命中不代表旧运维信息已移除。普通 PR 只能更改当前内容，无法清除祖先提交中的数据。**
以下由仓库维护者审核并执行；不要在当前工作副本运行，也不要在这里新建克隆。

### 1. 冻结写入与受限备份

暂停所有推送、自动化写入、合并及发布，协调协作者和分支保护策略，记录维护窗口。
使用**已有的隔离完整 bare 克隆**（非浅克隆、非 partial clone、非共享对象库），确认所有者授权。
维护机须已安装审核过且支持 `--sensitive-data-removal` 的 `git-filter-repo` 和既有秘密扫描器。
以下为 Bash；关闭 shell 跟踪、终端录屏及敏感内容日志，绝不打印敏感值。
各步骤在同一受控 Bash 会话、同一个隔离 bare 副本执行，保留 `SECURE_DIR` 和 `REPO_DIR`；
若中断会话，须重新核对并恢复这两个绝对路径。每段均启用失败即停止，任何检查失败都不得跳过。

```bash
set -euo pipefail
set +x
umask 077
test "$(git rev-parse --is-bare-repository)" = true
test "$(git rev-parse --is-shallow-repository)" = false
test -z "$(git config --get extensions.partialClone || true)"
test ! -f "$(git rev-parse --git-path objects/info/alternates)"
test -z "$(git for-each-ref refs/replace)"

# 输入已有的仓库外受限目录绝对路径，不得使用公共临时目录
read -r -p '受限审计目录（仓库外）: ' SECURE_DIR
SECURE_DIR="$(realpath "$SECURE_DIR")"
REPO_DIR="$(realpath "$(git rev-parse --absolute-git-dir)")"
case "$SECURE_DIR/" in "$REPO_DIR/"*) exit 1 ;; esac
test -d "$SECURE_DIR"
# 专用空目录，避免覆盖旧证据或更改无关文件权限
test -z "$(find "$SECURE_DIR" -mindepth 1 -maxdepth 1 -print -quit)"
chmod 700 "$SECURE_DIR"

# 先确认 origin URL 不含嵌入式凭证
git remote get-url origin > "$SECURE_DIR/origin.url"
# 先备份并验证所有本地引用，防止后续强制 fetch 覆盖仅本地可达的提交
git bundle create "$SECURE_DIR/pre-fetch-local.bundle" --all \
  > "$SECURE_DIR/local-backup.log" 2>&1
git bundle verify "$SECURE_DIR/pre-fetch-local.bundle" \
  > "$SECURE_DIR/local-backup-verify.log" 2>&1
git ls-remote --refs origin > "$SECURE_DIR/remote-before.tsv"
git for-each-ref --format='%(objectname)%09%(refname)' \
  > "$SECURE_DIR/local-before-fetch.tsv"

# 获取所有远端可见引用，包括可见的 PR/notes；失败即停止核查
while IFS=$'\t' read -r oid ref; do
  git fetch --quiet --no-tags origin "+$ref:$ref" \
    >> "$SECURE_DIR/fetch.log" 2>&1
done < "$SECURE_DIR/remote-before.tsv"

git for-each-ref --format='%(objectname)%09%(refname)' \
  > "$SECURE_DIR/refs-before.tsv"
git bundle create "$SECURE_DIR/pre-rewrite.bundle" --all \
  > "$SECURE_DIR/backup.log" 2>&1
git bundle verify "$SECURE_DIR/pre-rewrite.bundle" \
  > "$SECURE_DIR/backup-verify.log" 2>&1
# 此 bundle 是获取远端引用后的完整快照；保留它和 pre-fetch-local.bundle。
chmod 600 "$SECURE_DIR"/*
```

人工核对全引用清单：heads、tags、notes、PR 和其他命名空间；查明仅本地存在或无法获取的引用。
清单与日志仅在受限环境审阅。备份包含旧敏感内容，须加密、限制访问、记录保留期限并离线验证恢复能力，
不得推送到公开备份仓库。维护期间如有新写入，停止并重新获取、审计，不覆盖他人的提交。

### 2. 审计与替换规则

审计所有引用可达文件、提交消息、标签消息及作者/提交者/标签作者元数据，不限于当前三个文件。
审计产物只存于受限目录，不在 PR、终端或 CI 日志中回显：

```bash
set -euo pipefail
set +x
umask 077
: "${SECURE_DIR:?先恢复已审核的受限目录绝对路径}" "${REPO_DIR:?先恢复已审核的隔离副本绝对路径}"
test "$(realpath "$(git rev-parse --absolute-git-dir)")" = "$REPO_DIR"
git log --all --format=raw > "$SECURE_DIR/commit-metadata-before.txt"
git for-each-ref --format='%(refname)%00%(objecttype)%00%(contents)%00%(taggername)%00%(taggeremail)' \
  > "$SECURE_DIR/ref-metadata-before.txt"
: > "$SECURE_DIR/replace-text.txt"
: > "$SECURE_DIR/replace-message.txt"
chmod 600 "$SECURE_DIR"/*
```

维护者通过受保护编辑器填写并双人审核两个规则文件；禁用编辑器交换/备份文件，或确保其也只写入受限目录。
规则采用 git-filter-repo 的 `literal:旧值==>替换文本` 格式（此处不列任何已发现值）；
文件内容与提交/标签消息分别维护规则。不要把真实值放入命令行、shell 历史、仓库或聊天。
用既有扫描器检查所有 refs 的历史文件，报告必须脱敏；扫描器漏报不能代替精确值核对。

**作者/提交者元数据是显式可选项**：默认保留身份；若审核确定姓名/邮箱也应移除，
在仓库外创建 mode 600 的 `identities.mailmap`，审核后在下面命令中增加
`--mailmap "$SECURE_DIR/identities.mailmap"`，处理作者、提交者和标签作者身份。
`--replace-message` 不会替代身份处理。检查身份与签名信息，避免误删无关贡献者归属。
重写改变提交/标签 OID，并可能移除签名；提前协调发布验证及必要的重新签名。

### 3. 重写并复核所有引用

确认隔离副本、可恢复备份和规则审核完成后执行：
`--force` 有意绕过 fresh-clone 安全检查，仅限已备份且已审核的可丢弃隔离副本；
`--no-fetch` 禁止工具隐式抓取/剪枝，确保重写的正是已审计快照，不是后续远端状态。

```bash
set -euo pipefail
set +x
umask 077
: "${SECURE_DIR:?先恢复已审核的受限目录绝对路径}" "${REPO_DIR:?先恢复已审核的隔离副本绝对路径}"
test "$(realpath "$(git rev-parse --absolute-git-dir)")" = "$REPO_DIR"
test "$(git remote get-url origin)" = "$(cat "$SECURE_DIR/origin.url")"
git ls-remote --refs origin > "$SECURE_DIR/remote-pre-rewrite.tsv"
LC_ALL=C sort "$SECURE_DIR/remote-before.tsv" > "$SECURE_DIR/expected-sorted.tsv"
LC_ALL=C sort "$SECURE_DIR/remote-pre-rewrite.tsv" > "$SECURE_DIR/current-sorted.tsv"
cmp --silent "$SECURE_DIR/expected-sorted.tsv" "$SECURE_DIR/current-sorted.tsv"
git filter-repo --force --sensitive-data-removal --no-fetch \
  --replace-text "$SECURE_DIR/replace-text.txt" \
  --replace-message "$SECURE_DIR/replace-message.txt" \
  > "$SECURE_DIR/rewrite.log" 2>&1

git for-each-ref --format='%(objectname)%09%(refname)' \
  > "$SECURE_DIR/refs-after.tsv"
git log --all --format=raw > "$SECURE_DIR/commit-metadata-after.txt"
git for-each-ref --format='%(refname)%00%(objecttype)%00%(contents)%00%(taggername)%00%(taggeremail)' \
  > "$SECURE_DIR/ref-metadata-after.txt"
chmod 600 "$SECURE_DIR"/*
```

审核 rewrite 日志、commit/ref 映射、全部消息与元数据；用既有秘密扫描器以脱敏模式扫描
**所有 refs 的历史**，并用受限规则中的精确旧值检查文件、消息和身份，不打印命中值。
检查残留备份/替换引用、悬空对象及 reflog；在受限备份验证后按组织策略清理本地旧对象。
扫描报告只保留脱敏结果；未经实际执行并审核，不得宣称通过。

### 4. 逐项审批引用，以明确旧 OID 的租约推送

只将获准重写的远端分支/标签列入 mode 600 的 `push-approved.tsv`
（两列：**原远端 OID、完整 ref 名称**），从 `remote-before.tsv` 选择，不用重写后的 OID。
notes 等其他可写命名空间须另行审批并使用同样的精确租约；GitHub PR 只读引用不能由此推送。
遗漏可写引用可能保留旧内容。先核对 refs-after 和预期删除项，不能擅自把缺失引用当成删除。

```bash
set -euo pipefail
set +x
umask 077
: "${SECURE_DIR:?先恢复已审核的受限目录绝对路径}" "${REPO_DIR:?先恢复已审核的隔离副本绝对路径}"
test "$(realpath "$(git rev-parse --absolute-git-dir)")" = "$REPO_DIR"
# 用受保护编辑器制作并审核 push-approved.tsv 后运行
chmod 600 "$SECURE_DIR/push-approved.tsv"
if ! git remote get-url origin >/dev/null 2>&1; then
  git remote add origin "$(cat "$SECURE_DIR/origin.url")"
fi
test "$(git remote get-url origin)" = "$(cat "$SECURE_DIR/origin.url")"
git ls-remote --refs origin > "$SECURE_DIR/remote-pre-push.tsv"
LC_ALL=C sort "$SECURE_DIR/remote-before.tsv" > "$SECURE_DIR/expected-sorted.tsv"
LC_ALL=C sort "$SECURE_DIR/remote-pre-push.tsv" > "$SECURE_DIR/current-sorted.tsv"
cmp --silent "$SECURE_DIR/expected-sorted.tsv" "$SECURE_DIR/current-sorted.tsv"
# 同时人工核对全引用清单；有任何并发写入就停止，租约仍必须保留。

leases=()
refspecs=()
while IFS=$'\t' read -r old ref; do
  case "$ref" in refs/heads/*|refs/tags/*) ;; *) exit 1 ;; esac
  git check-ref-format "$ref"
  grep -Fqx -- "$old"$'\t'"$ref" "$SECURE_DIR/remote-before.tsv"
  leases+=("--force-with-lease=$ref:$old")
  # 此流程不删除引用；缺失时停止，另行审核，绝不推送删除。
  git show-ref --verify --quiet "$ref"
  refspecs+=("$ref:$ref")
done < "$SECURE_DIR/push-approved.tsv"
test "${#refspecs[@]}" -gt 0
git push --atomic "${leases[@]}" origin "${refspecs[@]}" \
  > "$SECURE_DIR/push.log" 2>&1
```

不得使用 `--mirror` 或无明确旧 OID 的强推。租约失败或服务端不支持原子更新时停止并重新协调审核，
不要自动降级为非原子强推。

### 5. 远端验证、缓存及协作副本

维护者在另一个已有隔离完整验证副本重新获取远端所有可访问引用，核对预期 OID，
再次脱敏扫描全部 refs、历史文件、消息和身份元数据，并验证服务配置；保留脱敏审计结论。
仓库搜索、默认分支扫描或当前工作树扫描不等于完整历史验证。

GitHub PR 隐藏/只读引用、缓存页面及已缓存对象可能继续可达；fork 和其他人的克隆也不受推送控制。
记录受影响提交/PR 范围，按 GitHub 敏感数据移除流程联系 Support 处理 PR 引用、缓存及服务器对象清理；
与 fork 所有者协调，无法删除的副本记录为残余风险，不能宣称全网清除。

协作者应替换旧克隆并重新获取干净副本，关闭/重建受影响 PR，停用旧自动化缓存；
不得从旧分支 merge/push 恢复被移除历史。隔离审计副本、bundle、规则、日志及编辑器备份都是敏感资产，
按受限保留策略到期销毁；旧克隆同样安全清理。完成验证、必要凭证轮换和协作确认后才恢复写入。
