/** 统一邮件外壳与模板数据的小型安全访问器。 */
import type { RenderedEmail } from './types';

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function value(data: Record<string, unknown>, field: string): string {
  const raw = data[field];
  return typeof raw === 'string' || typeof raw === 'number' ? String(raw).trim() : '';
}

export function values(data: Record<string, unknown>, field: string): string[] {
  const raw = data[field];
  return Array.isArray(raw) ? raw.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
}

export function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);
}

function paragraph(text: string): string {
  const linked = escapeHtml(text).replace(/\n/g, '<br>').replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#111111;text-decoration:underline;">$1</a>');
  return `<p style="margin:0 0 18px;line-height:1.65;">${linked}</p>`;
}

/** 以纯文本内容为单一事实来源生成 HTML，避免两种版本语义漂移。 */
export function renderEmail(subject: string, text: string, signature: string[], locale: 'en' | 'zh' = 'en'): RenderedEmail {
  const fullText = signature.length ? `${text}\n\n${signature.join('\n')}` : text;
  const preheader = fullText.replace(/\s+/g, ' ').slice(0, 140);
  const body = text.split(/\n{2,}/).map((section) => paragraph(section)).join('');
  const footer = signature.map((line) => `<div style="line-height:1.45;">${escapeHtml(line)}</div>`).join('');
  const html = `<!doctype html><html lang="${locale === 'zh' ? 'zh-CN' : 'en'}" style="color-scheme:light;"><head><meta charset="utf-8"><meta name="color-scheme" content="light"></head><body style="margin:0;background:#ffffff;color:#111111;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'PingFang SC','Hiragino Sans GB','Microsoft YaHei','Noto Sans CJK SC',Arial,sans-serif;font-size:16px;"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div><main style="max-width:600px;margin:0 auto;padding:32px 24px;">${body}<footer style="margin-top:28px;font-size:14px;color:#111111;">${footer}</footer></main></body></html>`;
  return { subject, html, text: fullText };
}
