/**
 * 共享类型定义。
 *
 * 这里的 SendEmail / EmailMessage 按 Cloudflare Email Service Workers API 的
 * 官方签名手写（@cloudflare/workers-types 里未必每次都更新到位），保证类型严格。
 */

/** 单个邮件地址，允许带显示名 */
export interface EmailAddress {
  email: string;
  name?: string;
}

export type AddressLike = string | EmailAddress;

export interface Attachment {
  /** base64 字符串或二进制内容 */
  content: string | ArrayBuffer | ArrayBufferView;
  filename: string;
  type: string;
  disposition: 'attachment' | 'inline';
  contentId?: string;
}

export interface EmailMessageBuilder {
  to: AddressLike | AddressLike[];
  from: AddressLike;
  subject: string;
  html?: string;
  text?: string;
  cc?: AddressLike | AddressLike[];
  bcc?: AddressLike | AddressLike[];
  replyTo?: AddressLike;
  attachments?: Attachment[];
  headers?: Record<string, string>;
}

export interface EmailSendResult {
  messageId: string;
}

/** Workers binding：env.EMAIL */
export interface SendEmail {
  send(message: EmailMessageBuilder): Promise<EmailSendResult>;
}

/** binding 抛出的错误带 code，例如 E_SENDER_NOT_VERIFIED */
export interface EmailServiceError extends Error {
  code?: string;
}

export interface Env {
  /** send_email binding，账号未开通 Email Sending 时可能不存在 */
  EMAIL?: SendEmail;
  /** 调用本 Worker 所需的共享密钥（wrangler secret put SEND_API_KEY） */
  SEND_API_KEY?: string;
  DEFAULT_FROM?: string;
  /** 逗号分隔的允许跨域来源 */
  ALLOWED_ORIGINS?: string;
  /** REST 兜底：账号 ID 与带 Email Sending: Edit 权限的 token */
  CF_ACCOUNT_ID?: string;
  CF_API_TOKEN?: string;
}

/** POST /send 的请求体 */
export interface SendRequest {
  to: AddressLike | AddressLike[];
  from?: AddressLike;
  subject: string;
  html?: string;
  text?: string;
  cc?: AddressLike | AddressLike[];
  bcc?: AddressLike | AddressLike[];
  replyTo?: AddressLike;
  attachments?: Attachment[];
  headers?: Record<string, string>;
}
