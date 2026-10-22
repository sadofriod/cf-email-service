import { renderEmail, value } from './layout';
import type { Locale, TemplateDefinition } from './types';

const subjects = [
  'Which Chinese supplier actually makes your anode?',
  '45X PFE file: one step deep, with page numbers',
  '2-page sample: Chinese cell chain, every claim cited',
];

export const coldOutreach: TemplateDefinition = {
  id: 'cold-outreach', description: '针对近期触发事件发送首封证据样例邮件。', locales: ['en', 'zh'],
  requiredFields: ['name', 'triggerMonth', 'triggerTopic', 'entity', 'finding', 'sourceType', 'page', 'sampleUrl', 'senderName', 'senderLine'],
  optionalFields: ['locale', 'subjectVariant'],
  sample: { name: 'Jordan Lee', triggerMonth: 'September', triggerTopic: 'battery tariffs', entity: 'Example Cell Co.', finding: 'a permit lists a second graphitization phase', sourceType: 'environmental permit', page: '1', sampleUrl: 'https://example.com/sample-2p.pdf', senderName: 'Sample Sender', senderLine: 'Supply-chain research · example.com' },
  render(data) {
    const locale: Locale = data.locale === 'zh' ? 'zh' : 'en';
    const d = (field: string) => value(data, field);
    if (locale === 'zh') {
      const text = `${d('name')}，\n\n你 ${d('triggerMonth')} 那条关于 ${d('triggerTopic')} 的帖子，是我写这封邮件的原因。\n\n过去两周我把 ${d('entity')} 及其上游的公开文件过了一遍。有一处和主流说法对不上：${d('finding')}。出处：${d('sourceType')}，第 ${d('page')} 页。\n\n我做的每份简报，每条结论都带页码引用，最后一节固定写“本次分析未覆盖什么”。\n\n2 页样例在这里，不用注册：${d('sampleUrl')}\n\n有用的话我把完整版发你；没用的话，样例留着。`;
      return renderEmail('45X/PFE 底稿：追一层，带页码', text, [d('senderName'), d('senderLine')]);
    }
    const variant = value(data, 'subjectVariant');
    const index = variant === 'S1' ? 0 : variant === 'S3' ? 2 : 1;
    const text = `${d('name')},\n\nYour ${d('triggerMonth')} post on ${d('triggerTopic')} is the reason I'm writing.\n\nI spent the last two weeks pulling every public filing I could find on ${d('entity')} and its upstream. One thing that didn't match the consensus: ${d('finding')}. Source: ${d('sourceType')}, p.${d('page')}.\n\nEvery claim in my briefs carries a page-level citation, and every brief ends with a section on what the analysis did NOT cover.\n\nHere's the 2-page sample, no signup: ${d('sampleUrl')}\n\nIf it's useful, I'll send the full one. If not, keep the sample.`;
    return renderEmail(subjects[index] ?? subjects[1] ?? '', text, [d('senderName'), d('senderLine')]);
  },
};
