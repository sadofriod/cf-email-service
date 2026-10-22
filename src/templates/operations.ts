import { renderEmail, value, values } from './layout';
import type { TemplateDefinition } from './types';

export const kickoffScope: TemplateDefinition = {
  id: 'kickoff-scope', description: '收款后确认范围、交付日期和客户确认事项。', locales: ['en'], requiredFields: ['clientName', 'target', 'corpusPeriod', 'deliverBy', 'threeQuestions', 'senderName', 'senderLine'],
  sample: { clientName: 'Example Client', target: 'Example Cell Co.', corpusPeriod: '2025-01 to 2026-06', deliverBy: '2026-10-29', threeQuestions: ['Which entity is the decision target?', 'Should subsidiaries be included?', 'Which jurisdiction matters most?'], senderName: 'Sample Sender', senderLine: 'Supply-chain research · example.com' },
  render(data) { const questions = values(data, 'threeQuestions'); const text = `${value(data, 'clientName')},\n\nScope: public filings and regulatory documents on ${value(data, 'target')} for ${value(data, 'corpusPeriod')}. Delivery is ${value(data, 'deliverBy')}.\n\nPlease confirm:\n1. ${questions[0] ?? ''}\n2. ${questions[1] ?? ''}\n3. ${questions[2] ?? ''}\n\nNo reply to the above will not delay kickoff.`; return renderEmail('Kickoff: ' + value(data, 'target'), text, [value(data, 'senderName'), value(data, 'senderLine')], 'en'); },
};

export const directoryApplication: TemplateDefinition = {
  id: 'directory-application', description: '向 MCP 目录维护者说明项目事实、限制并询问收录条件。', locales: ['en'], requiredFields: ['maintainerName', 'directoryName', 'repoUrl', 'hostExample', 'oneFact', 'limitation', 'senderName'],
  sample: { maintainerName: 'Jordan', directoryName: 'Example MCP Directory', repoUrl: 'https://example.com/repo', hostExample: 'https://example.com/host', oneFact: 'one host returned 10 strict hits', limitation: '12 questions / 10 strict hits is project self-testing, not a cross-project comparison', senderName: 'Sample Sender' },
  render(data) { const d = (f: string) => value(data, f); const text = `${d('maintainerName')},\n\nI'd like to submit a TypeScript MCP server to ${d('directoryName')}: ${d('repoUrl')}. It exposes 5 MCP tools and self-hosts with docker compose up -d. Host example: ${d('hostExample')}.\n\nFact: ${d('oneFact')}. Limitation: ${d('limitation')}.\n\nOne question: can a hosted remote entry be listed without a Dockerfile?`; return renderEmail('MCP directory application', text, [d('senderName')], 'en'); },
};

export const opsDigest: TemplateDefinition = {
  id: 'ops-digest', description: '内部巡检的任务证据与阻塞项摘要。', locales: ['zh'], requiredFields: ['state', 'summary', 'lines', 'needsDecision'],
  sample: { state: 'ACTIVE', summary: '3 项任务推进中', lines: [{ name: '模板路由', evidence: 'src/index.ts 14:30', blocker: '无' }, { name: '文档', evidence: 'docs/EMAIL-TEMPLATES.md 14:35', blocker: '无' }, { name: '模板预览', evidence: 'preview/*.html 14:41', blocker: '无' }], needsDecision: '无' },
  render(data) { const rawLines = Array.isArray(data.lines) ? data.lines : []; const rows = rawLines.map((item) => { const row = item && typeof item === 'object' ? item as Record<string, unknown> : {}; return `${value(row, 'name')}：${value(row, 'evidence')}；阻塞：${value(row, 'blocker')}`; }); const blocked = value(data, 'state') === 'BLOCKED'; const text = [`状态：${value(data, 'state')}。${value(data, 'summary')}`, ...rows, `需决策/阻塞：${value(data, 'needsDecision')}`].slice(0, blocked ? 6 : undefined).join('\n'); return renderEmail(`巡检：${value(data, 'state')}`, text, [], 'zh'); },
};
