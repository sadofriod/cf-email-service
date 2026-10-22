# 领域包

领域只决定语义和证据形态，不改变三条原则：先给东西再谈钱、每条结论带出处、收尾给退出选项。

## `energy-storage`：储能与锂电供应链

谁会买：储能开发商/IPP 的供应链与政策岗、45X 顾问与律所、卖方分析师。

证据长什么样：年报分部附注与客户集中度；环境影响评价批复；海关进出口数据；招标与中标公告。

触发事件怎么找：关税或 45X 政策发帖；会议 panel 议题；供应链合规岗招聘；被媒体引用的表态。

用哪个模板：`cold-outreach`、`sample-delivery`、`report-delivery`。

示例结论：

1. the anode supplier named in the 10-K is not the one doing graphitization — that work sits one layer down（annual report，第 41 页）。
2. one permit lists a second phase (20kt to 40kt) that predates the announced expansion（environmental permit，第 1 页）。
3. the US customer concentration moved from 31% to 22% while total capacity grew（annual report，第 47 页）。

## `semiconductor-controls`：半导体出口管制

谁会买：出口管制/贸易合规律师、半导体设备与材料分析师、跨国采购合规岗。

证据长什么样：联邦公报条文与生效日；实体清单条目与脚注；年报客户集中度披露；设备出口报关记录。

触发事件怎么找：新规则解读文章；合规岗招聘；行业会议发言；公司公告与 8-K。

用哪个模板：`cold-outreach`、`sample-delivery`、`report-delivery`。

示例结论：

1. two subsidiaries appear in the Entity List footnote but not in the group structure chart（Federal Register 91 FR 14820，第 7 页）。
2. the largest disclosed customer runs no capacity for the node whose tools it is buying（annual report，第 62 页）。
3. the licence exception cited in the 8-K was narrowed by a later rule change the filing does not mention（BIS rule 15 CFR 744.21，第 12 页）。

## `web3-security`：Web3 协议安全

谁会买：协议方安全负责人、审计公司合伙人与商务、基金风控。

证据长什么样：链上交易与合约地址；审计报告章节号；治理提案编号与投票记录；事件复盘 post-mortem。

触发事件怎么找：审计报告披露；漏洞复盘帖；治理提案进入投票；招聘 security engineer。

用哪个模板：`cold-outreach`、`sample-delivery`、`report-delivery`。

示例结论：

1. the pause function cited in the audit is guarded by a 2-of-3 multisig whose signers overlap with the deployer（audit report，第 4.3 节）。
2. two of the three “independent” oracles share the same upstream feed for the collateral asset（governance proposal #42，tx 0x7f3a…c21e）。
3. the exploit path matches a finding the previous audit rated informational（audit v2，第 6.1 节）。

## `clinical-pharma`：创新药临床与注册

谁会买：BD/licensing 团队、医药分析师、注册事务顾问。

证据长什么样：临床试验登记（NCT）条目；说明书与审批文件章节；年报研发管线页；会议摘要与壁报。

触发事件怎么找：ASCO/ESMO 摘要发布；license-in/out 公告；注册岗招聘；竞品读出数据。

用哪个模板：`cold-outreach`、`sample-delivery`、`report-delivery`。

示例结论：

1. the Phase 3 registry lists a primary endpoint the conference abstract does not report（NCT05821472 outcome measures，第 1 页）。
2. the licensed asset patent expiry precedes the stated exclusivity date by four years（annual report，第 88 页）。
3. the comparator arm dose differs from the approved label dose（prescribing information，第 3 页）。

## `agent-infra`：Agent 与 MCP 工具链

谁会买：平台/DevRel 团队、开源项目维护者、企业 AI 基建选型负责人。

证据长什么样：commit 与 PR 编号；release notes 版本差异；文档页与配置项；benchmark 原文与口径。

触发事件怎么找：项目发布帖；HN/Reddit 技术讨论；招聘 AI infra 岗；被引用的横向对比文章。

用哪个模板：`cold-outreach`、`sample-delivery`、`report-delivery`。

示例结论：

1. the README benchmark was measured before the retrieval rewrite in v0.9（release notes v0.9，benchmark.md）。
2. two of the four “supported” vector stores appear only in the test fixture, not in the adapter code（PR #214，src/adapters）。
3. the token-cost claim omits the embedding pass（docs/pricing.md，第 3 页）。
