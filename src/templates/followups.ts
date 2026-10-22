import { renderEmail, value } from './layout';
import type { Locale, TemplateDefinition } from './types';

function locale(data: Record<string, unknown>): Locale { return data.locale === 'zh' ? 'zh' : 'en'; }
function signature(): string[] { return []; }

export const followupNewFact: TemplateDefinition = {
  id: 'followup-new-fact', description: '第 3 天用新发现补充首封邮件。', locales: ['en', 'zh'], requiredFields: ['name', 'newFact', 'sampleUrl'], optionalFields: ['locale', 'originalSubject'],
  sample: { name: 'Jordan Lee', newFact: 'the permit adds a second phase on p.1', sampleUrl: 'https://example.com/sample-2p.pdf', originalSubject: '45X PFE file: one step deep, with page numbers' },
  render(data) { const currentLocale = locale(data); const zh = currentLocale === 'zh'; const original = value(data, 'originalSubject'); const subject = original ? `re: ${original}` : (zh ? '补充一条出处' : 'one addition, with a page'); const text = zh ? `${value(data, 'name')}，补充一条：${value(data, 'newFact')}。样例还在这里：${value(data, 'sampleUrl')}` : `${value(data, 'name')} - one addition: ${value(data, 'newFact')}. Sample's still here: ${value(data, 'sampleUrl')}`; return renderEmail(subject, text, signature(), currentLocale); },
};

export const followupClose: TemplateDefinition = {
  id: 'followup-close', description: '第 10 天结束触达并明确给出退出选项。', locales: ['en', 'zh'], requiredFields: ['name', 'sampleUrl'], optionalFields: ['locale'],
  sample: { name: 'Jordan Lee', sampleUrl: 'https://example.com/sample-2p.pdf' },
  render(data) { const currentLocale = locale(data); const zh = currentLocale === 'zh'; const text = zh ? `${value(data, 'name')}，我就到这里。以后如果供应链引用在你这边占时间，样例展示了格式：${value(data, 'sampleUrl')}\n\n不用回复。` : `${value(data, 'name')} - I'll stop here. If supply-chain citations ever become a time sink on your side, the sample shows the format: ${value(data, 'sampleUrl')}\n\nNo reply needed.`; return renderEmail(zh ? '就到这里' : 'closing the loop', text, signature(), currentLocale); },
};
