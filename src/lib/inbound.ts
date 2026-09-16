// Inbound support email → tickets. Runs inside the Worker's email() handler (Cloudflare Email
// Routing → Worker), worker-to-runtime, no public HTTP/WAF. Parses the raw MIME message, filters
// attachments, and stores it via the tickets data layer. Never throws to the caller: a parse/DB
// failure must not bounce a customer's mail — we accept it and drop what we can't process.
import PostalMime, { type Email } from 'postal-mime';
import { createTicketFromEmail, appendInboundMessage, findTicketByToken, inboundSeen, type InAttachment } from './tickets';

const MAX_RAW = 15 * 1024 * 1024;        // 15 MB whole message — reject larger
const MAX_ATTACH = 8 * 1024 * 1024;      // 8 MB per file
const MAX_ATTACH_COUNT = 10;
const MAX_BODY = 20000;                   // chars of body text stored
// Allow-list: images + PDF only. Everything else (scripts, archives, office macros) is dropped.
const ALLOWED = /^(image\/(jpe?g|png|gif|webp|hei[cf]|bmp|tiff)|application\/pdf)$/i;

// Minimal shape of Cloudflare's ForwardableEmailMessage (avoids a hard type dep here).
export interface EmailMessage {
  readonly from: string;
  readonly to: string;
  readonly headers: Headers;
  readonly raw: ReadableStream<Uint8Array>;
  readonly rawSize: number;
  setReject(reason: string): void;
}

function stripHtml(html: string | undefined): string {
  if (!html) return '';
  return html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim();
}

function collectAttachments(email: Email): { atts: InAttachment[]; dropped: number } {
  const atts: InAttachment[] = [];
  let dropped = 0;
  for (const a of email.attachments ?? []) {
    if (a.related) continue; // embedded/inline (cid:) images — signature logos etc., not real files
    if (atts.length >= MAX_ATTACH_COUNT) { dropped++; continue; }
    const ct = (a.mimeType || 'application/octet-stream').toLowerCase();
    const bytes = a.content;
    // With attachmentEncoding:'arraybuffer' content is an ArrayBuffer/Uint8Array; guard anyway.
    if (typeof bytes === 'string') { dropped++; continue; }
    const size = (bytes as ArrayBuffer).byteLength ?? 0;
    if (!ALLOWED.test(ct) || size === 0 || size > MAX_ATTACH) { dropped++; continue; }
    atts.push({ filename: (a.filename || 'file').slice(0, 200), contentType: ct, bytes, size });
  }
  return { atts, dropped };
}

export async function ingestEmail(message: EmailMessage): Promise<void> {
  try {
    if (message.rawSize > MAX_RAW) { message.setReject('Message too large'); return; }

    const email = await PostalMime.parse(message.raw, { attachmentEncoding: 'arraybuffer' });
    const from = (email.from?.address || message.from || '').toLowerCase().trim();
    if (!from || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(from)) return; // no usable sender → drop quietly

    const subject = (email.subject || '(no subject)').replace(/\s+/g, ' ').trim().slice(0, 150) || '(no subject)';
    const msgId = (email.messageId || message.headers.get('message-id') || '').slice(0, 250) || null;
    if (msgId && (await inboundSeen(msgId))) return; // re-delivery of a message we already have

    const body = (email.text || stripHtml(email.html) || '(no text content)').slice(0, MAX_BODY);
    const { atts, dropped } = collectAttachments(email);
    const note = dropped > 0 ? `\n\n[${dropped} attachment(s) were not saved — only images and PDFs under 8 MB are kept.]` : '';

    const token = subject.match(/\[HCF-([a-f0-9]{6,12})\]/i)?.[1]?.toLowerCase() ?? null;
    const existing = token ? await findTicketByToken(token) : null;
    if (existing) {
      await appendInboundMessage(existing.id, body + note, msgId, atts);
    } else {
      await createTicketFromEmail(from, subject, body + note, msgId, atts);
    }
  } catch (e) {
    // Accept the mail regardless — do not bounce a customer. Log for observability.
    console.error('inbound email ingest failed', (e as Error)?.message);
  }
}
