import { renderEmail, value } from './layout';
import { DEFAULT_DOMAIN, getDomain } from './domains';
import type { Locale, TemplateDefinition } from './types';

export const coldOutreach: TemplateDefinition = {
  id: 'cold-outreach', description: '针对近期触发事件发送首封证据样例邮件。', locales: ['en', 'zh'],
  requiredFields: ['name', 'triggerMonth', 'triggerTopic', 'entity', 'finding', 'sourceType', 'page', 'sampleUrl', 'senderName', 'senderLine'],
  optionalFields: ['locale', 'subjectVariant', 'domain'], domains: ['energy-storage', 'semiconductor-controls', 'web3-security', 'clinical-pharma', 'agent-infra'],
  sample: { name: 'Jordan Lee', triggerMonth: 'September', triggerTopic: 'battery tariffs', entity: 'Example Cell Co.', finding: 'a permit lists a second graphitization phase', sourceType: 'environmental permit', page: '1', sampleUrl: 'https://example.com/sample-2p.pdf', senderName: 'Sample Sender', senderLine: 'Supply-chain research · example.com' },
  render(data) {
    const locale: Locale = data.locale === 'zh' ? 'zh' : 'en';
    const d = (field: string) => value(data, field);
    const domain = getDomain(d('domain') || DEFAULT_DOMAIN);
    if (!domain) throw new Error('domain must be validated before rendering');
    const copy = domain.copy[locale];
    const cite = copy.cite[locale]
      .replace('{source}', d('sourceType'))
      .replace('{page}', d('page'));
    const variant = value(data, 'subjectVariant');
    const index = variant === 'S1' ? 0 : variant === 'S3' ? 2 : 1;
    if (locale === 'zh') {
      const text = `${d('name')}，\n\n你 ${d('triggerMonth')} 那条关于 ${d('triggerTopic')} 的帖子，是我写这封邮件的原因。\n\n${copy.researchLine.replace('{entity}', d('entity'))}有一处和主流说法对不上：${d('finding')}。${cite}。\n\n${copy.evidenceLine}\n\n2 页样例在这里，不用注册：${d('sampleUrl')}\n\n有用的话我把完整版发你；没用的话，样例留着。`;
      return renderEmail(copy.subjectHints[index] ?? copy.subjectHints[1], text, [d('senderName'), d('senderLine')], locale);
    }
    const text = `${d('name')},\n\nYour ${d('triggerMonth')} post on ${d('triggerTopic')} is the reason I'm writing.\n\n${copy.researchLine.replace('{entity}', d('entity'))} One thing that didn't match the consensus: ${d('finding')}. ${cite}.\n\n${copy.evidenceLine}\n\nHere's the 2-page sample, no signup: ${d('sampleUrl')}\n\nIf it's useful, I'll send the full one. If not, keep the sample.`;
    return renderEmail(copy.subjectHints[index] ?? copy.subjectHints[1], text, [d('senderName'), d('senderLine')], locale);
  },
};
