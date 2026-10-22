export interface DomainSampleFinding { finding: string; sourceType: string; page: string; }
export interface DomainCopy {
  evidenceLine: string;
  coverageLine: string;
  /** “我为这封邮件做了什么功课”的一句，必须使用该领域的证据载体词汇。 */
  researchLine: string;
  /** “这条结论的出处”句式；{page} 按领域可表示页、条文、章节、登记号或文件路径。 */
  cite: { en: string; zh: string };
  deliveryLine?: string;
  subjectHints: [string, string, string];
}
export interface DomainPack {
  id: string;
  label: { en: string; zh: string };
  buyerPersona: string;
  evidenceTypes: string[];
  triggerTypes: string[];
  sampleFindings: DomainSampleFinding[];
  copy: { en: DomainCopy; zh: DomainCopy };
}
