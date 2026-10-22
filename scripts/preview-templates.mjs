import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const baseUrl = process.env.BASE_URL ?? 'https://cf-email-service.next-blog.workers.dev';
const apiKey = process.env.SEND_API_KEY;
if (!apiKey) throw new Error('SEND_API_KEY is required');

const headers = { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' };
const output = join(process.cwd(), 'preview');
await mkdir(output, { recursive: true });

const samples = {
  'cold-outreach': { name: 'Jordan Lee', triggerMonth: 'September', triggerTopic: 'battery tariffs and 45X exposure', entity: 'Example Cell Co.', sampleUrl: 'https://example.com/sample-2p.pdf', senderName: 'Sample Sender', senderLine: 'Supply-chain research · example.com' },
  'followup-new-fact': { name: 'Jordan Lee', newFact: 'the permit adds a second phase on p.1', sampleUrl: 'https://example.com/sample-2p.pdf', originalSubject: '45X PFE file: one step deep, with page numbers' },
  'followup-close': { name: 'Jordan Lee', sampleUrl: 'https://example.com/sample-2p.pdf' },
  'sample-delivery': { name: 'Jordan Lee', sampleUrl: 'https://example.com/sample-2p.pdf', senderName: 'Sample Sender', senderLine: 'Supply-chain research · example.com' },
  'report-delivery': { clientName: 'Example Client', target: 'Example Cell Co.', corpusPeriod: '2025-01 to 2026-06', docCount: '24', anchorCount: '31', reportUrl: 'https://example.com/report.html', sampleUrl: 'https://example.com/sample-2p.pdf', versionDate: '2026-10-22', senderName: 'Sample Sender', senderLine: 'Supply-chain research · example.com' },
  'kickoff-scope': { clientName: 'Example Client', target: 'Example Cell Co.', corpusPeriod: '2025-01 to 2026-06', deliverBy: '2026-10-29', threeQuestions: ['Which entity is the decision target?', 'Should subsidiaries be included?', 'Which jurisdiction matters most?'], senderName: 'Sample Sender', senderLine: 'Supply-chain research · example.com' },
  'directory-application': { maintainerName: 'Jordan', directoryName: 'Example MCP Directory', repoUrl: 'https://example.com/repo', hostExample: 'https://example.com/host', oneFact: 'one host returned 10 strict hits', limitation: '12 questions / 10 strict hits is project self-testing, not a cross-project comparison', senderName: 'Sample Sender' },
  'ops-digest': { state: 'ACTIVE', summary: '3 项任务推进中', lines: [{ name: '模板路由', evidence: 'src/index.ts 14:30', blocker: '无' }, { name: '文档', evidence: 'docs/EMAIL-TEMPLATES.md 14:35', blocker: '无' }, { name: '模板预览', evidence: 'preview/*.html 14:41', blocker: '无' }], needsDecision: '无' },
};

const domainContext = {
  'energy-storage': { entity: 'Aurora Cell Systems', triggerTopic: 'battery tariffs and 45X exposure', triggerMonth: 'September' },
  'semiconductor-controls': { entity: 'Northline Equipment', triggerTopic: 'the October interim final rule', triggerMonth: 'October' },
  'web3-security': { entity: 'Meridian Vault', triggerTopic: 'the post-mortem on the sequencer incident', triggerMonth: 'August' },
  'clinical-pharma': { entity: 'Helix Bio', triggerTopic: 'the Phase 3 readout at ESMO', triggerMonth: 'September' },
  'agent-infra': { entity: 'graphrag-ts', triggerTopic: 'the MCP server launch post', triggerMonth: 'July' },
};

const listResponse = await fetch(`${baseUrl}/templates`, { headers });
if (!listResponse.ok) throw new Error(`GET /templates failed: ${listResponse.status}`);
const { templates } = await listResponse.json();
const domainResponse = await fetch(`${baseUrl}/templates/domains`, { headers });
if (!domainResponse.ok) throw new Error(`GET /templates/domains failed: ${domainResponse.status}`);
const { domains } = await domainResponse.json();
const linksByDomain = new Map(domains.map((domain) => [domain.id, []]));
const generalLinks = [];

for (const template of templates) {
  const templateDomains = template.domains ?? [null];
  for (const domain of templateDomains) {
    const domainDetails = domain ? domains.find((item) => item.id === domain) : null;
    if (domain && !domainDetails) throw new Error(`unknown domain ${domain} on ${template.id}`);
    for (const locale of template.locales) {
      const sample = samples[template.id];
      if (!sample) throw new Error(`no local sample for ${template.id}`);
      const finding = domainDetails?.sampleFindings[0];
      const data = { ...sample, ...(finding ? { finding: finding.finding, oneFinding: finding.finding, sourceType: finding.sourceType, page: finding.page } : {}), locale };
      if (domain) Object.assign(data, domainContext[domain] ?? {});
      const response = await fetch(`${baseUrl}/templates/${encodeURIComponent(template.id)}/preview`, {
        method: 'POST', headers, body: JSON.stringify({ data, ...(domain ? { domain } : {}) }),
      });
      if (!response.ok) throw new Error(`POST /templates/${template.id}/preview failed: ${response.status}`);
      const rendered = await response.json();
      const stem = domain ? `${template.id}.${domain}.${locale}` : `${template.id}.${locale}`;
      await writeFile(join(output, `${stem}.html`), rendered.html);
      await writeFile(join(output, `${stem}.txt`), rendered.text);
      const link = `<li><strong>${template.id}</strong> (${locale}) - required: ${template.requiredFields.join(', ')} - <a href="${stem}.html">HTML</a> <a href="${stem}.txt">text</a></li>`;
      if (domain) linksByDomain.get(domain).push(link); else generalLinks.push(link);
    }
  }
}

const sections = domains.map((domain) => `<section><h2>${domain.label.en} / ${domain.label.zh}</h2><p>${domain.buyerPersona}</p><p>Evidence: ${domain.evidenceTypes.join('；')}</p><ul>${linksByDomain.get(domain.id).join('')}</ul></section>`);
sections.push(`<section><h2>general</h2><ul>${generalLinks.join('')}</ul></section>`);
await writeFile(join(output, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Email templates</title><h1>Email templates</h1>${sections.join('')}`);
console.log(`Wrote ${[...linksByDomain.values(), generalLinks].reduce((total, links) => total + links.length, 0)} previews to ${output}`);
console.log('Preview only: no email was sent.');
