import type { APIRoute } from 'astro';
import { env } from '../../../lib/env';
import { verifyResendSignature } from '../../../lib/mailauth';
import { markEmailByResendId, addSuppression } from '../../../lib/db';

// Resend delivery-event webhook. Verifies the Svix signature, updates the email log, and auto-adds
// bounces/complaints to the suppression list so we stop mailing bad addresses. Fails closed.
export const POST: APIRoute = async ({ request }) => {
  if (!env.RESEND_WEBHOOK_SECRET) return new Response('not configured', { status: 503 });
  const body = await request.text();
  if (!(await verifyResendSignature(env.RESEND_WEBHOOK_SECRET, request.headers, body))) {
    return new Response('bad signature', { status: 400 });
  }
  let event: any;
  try { event = JSON.parse(body); } catch { return new Response('bad json', { status: 400 }); }

  const type: string = event?.type ?? '';
  const data = event?.data ?? {};
  const resendId: string | undefined = data.email_id ?? data.id;
  const to: string | undefined = Array.isArray(data.to) ? data.to[0] : data.to;

  try {
    if (resendId) {
      if (type === 'email.delivered') await markEmailByResendId(resendId, 'delivered_at');
      else if (type === 'email.opened') await markEmailByResendId(resendId, 'opened_at');
      else if (type === 'email.clicked') await markEmailByResendId(resendId, 'clicked_at');
      else if (type === 'email.bounced') await markEmailByResendId(resendId, 'bounced_at');
      else if (type === 'email.complained') await markEmailByResendId(resendId, 'complained_at');
    }
    if (to && (type === 'email.bounced' || type === 'email.complained')) {
      await addSuppression(to, type === 'email.complained' ? 'complaint' : 'bounce', 'resend');
    }
  } catch (e) {
    console.error('resend webhook handling error', (e as Error)?.message);
  }
  return new Response('ok', { status: 200 });
};
