# 邮件模板

## 风格三原则

1. 先给东西再谈钱：首封先给具体发现、页码和两页样例，不先报价。
2. 每条结论带页码：引用必须能回到原文页，未覆盖范围也要明说。
3. 收尾给退出选项：两封跟进后停止，最后一封明确“不用回复”。

所有模板禁止形容词堆砌、emoji、追踪像素和附件；链接替代附件。纯文本版与 HTML 内容等价。

## `cold-outreach`

用途：SOUL.md 的证据型冷触达主线，针对对方近期动作发送首封样例。

| 必填字段 | 说明 |
| --- | --- |
| `name`, `triggerMonth`, `triggerTopic` | 收件人与近期触发事件 |
| `entity`, `finding`, `sourceType`, `page` | 可核验发现及出处 |
| `sampleUrl`, `senderName`, `senderLine` | 样例与三行内签名 |

主题：英文用 `subjectVariant` 选 S1/S2/S3，默认 S2；中文固定“45X/PFE 底稿：追一层，带页码”。上限英文 120 词、中文 200 字。

## `followup-new-fact`

用途：SOUL.md 的第 3 天跟进主线，只发送首封后出现的新事实。

| 必填字段 | 说明 |
| --- | --- |
| `name`, `newFact`, `sampleUrl` | 收件人、新发现、原样例 |

主题优先 `re: {originalSubject}`，没有则用短主题。上限 70 词；禁止只写 follow up。

## `followup-close`

用途：SOUL.md 的第 10 天收尾主线，结束而非继续追发。

| 必填字段 | 说明 |
| --- | --- |
| `name`, `sampleUrl` | 收件人和样例 |

主题英文固定 `closing the loop`，中文固定“就到这里”。上限 45 词，必须含 “No reply needed.” 或“不用回复。”

## `sample-delivery`

用途：SOUL.md 的索取样例后交付主线。

| 必填字段 | 说明 |
| --- | --- |
| `name`, `sampleUrl`, `oneFinding` | 收件人、样例、一个结论 |
| `sourceType`, `page` | 其中一个可核验锚点 |
| `senderName`, `senderLine` | 签名 |

主题为 `2-page sample`，上限 90 词；说明一条结论、三个锚点和一张图，不附文件。

## `report-delivery`

用途：SOUL.md 的 $750 完整报告交付主线。

| 必填字段 | 说明 |
| --- | --- |
| `clientName`, `target`, `corpusPeriod` | 客户、标的、语料范围 |
| `docCount`, `anchorCount`, `reportUrl`, `sampleUrl` | 覆盖、锚点与链接 |
| `versionDate`, `senderName`, `senderLine` | 版本与签名 |

主题为 `Report delivery: {target}`。包含 30 秒自检、五个文件用途、公开信息声明和版本/语料截止日；禁止夸张描述。

## `kickoff-scope`

用途：SOUL.md 的收款后 24 小时开工确认主线。

| 必填字段 | 说明 |
| --- | --- |
| `clientName`, `target`, `corpusPeriod`, `deliverBy` | 范围和交付日期 |
| `threeQuestions` | 恰好三个待确认问题 |
| `senderName`, `senderLine` | 签名 |

主题为 `Kickoff: {target}`，上限 110 词；明确不回复也不影响开工。

## `directory-application`

用途：SOUL.md 的 MCP 目录收录主线。

| 必填字段 | 说明 |
| --- | --- |
| `maintainerName`, `directoryName`, `repoUrl`, `hostExample` | 维护者、目录和项目地址 |
| `oneFact`, `limitation`, `senderName` | 自测事实、限制与署名 |

主题为 `MCP directory application`，上限 110 词。先写 TypeScript、5 个工具和自托管事实，再写“12 问/10 strict hits”为项目自测而非横向比较，最后只问 hosted remote 是否可免 Dockerfile。

## `ops-digest`

用途：SOUL.md 的内部 30 分钟巡检邮件主线。

| 必填字段 | 说明 |
| --- | --- |
| `state`, `summary` | `ACTIVE` 或 `BLOCKED` 及摘要 |
| `lines` | 每项含 `name`、`evidence`（文件路径 + HH:MM）和 `blocker` |
| `needsDecision` | 最终阻塞或待决事项 |

主题为 `巡检：{state}`。禁表格与 emoji；`BLOCKED` 最多 6 行，且不重复阻塞表。
