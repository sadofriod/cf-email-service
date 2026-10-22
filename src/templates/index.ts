import { coldOutreach } from './cold-outreach';
import { sampleDelivery, reportDelivery } from './delivery';
import { followupClose, followupNewFact } from './followups';
import { directoryApplication, kickoffScope, opsDigest } from './operations';
import type { TemplateDefinition } from './types';

export const templates: Record<string, TemplateDefinition> = {
  [coldOutreach.id]: coldOutreach, [followupNewFact.id]: followupNewFact, [followupClose.id]: followupClose,
  [sampleDelivery.id]: sampleDelivery, [reportDelivery.id]: reportDelivery, [kickoffScope.id]: kickoffScope,
  [directoryApplication.id]: directoryApplication, [opsDigest.id]: opsDigest,
};

export function getTemplate(id: string): TemplateDefinition | undefined { return templates[id]; }
export function listTemplates(): TemplateDefinition[] { return Object.values(templates); }
