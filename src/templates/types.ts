/** 邮件模板的公共契约。 */
export type Locale = 'en' | 'zh';

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export interface TemplateDefinition {
  id: string;
  description: string;
  locales: Locale[];
  requiredFields: string[];
  optionalFields?: string[];
  sample: Record<string, unknown>;
  render(data: Record<string, unknown>): RenderedEmail;
}
