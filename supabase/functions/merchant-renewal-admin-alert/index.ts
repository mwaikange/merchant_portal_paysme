import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') || '';
  if (!url || !serviceKey || !token) return json({ error: 'Authentication required.' }, 401);
  const admin = createClient(url, serviceKey);
  const { data: userResult, error: userError } = await admin.auth.getUser(token);
  const user = userResult?.user;
  if (userError || !user) return json({ error: 'Authentication required.' }, 401);
  const body = await request.json().catch(() => ({}));
  const requestId = String(body.renewal_request_id ?? '');
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(requestId)) return json({ error: 'Invalid renewal request.' }, 400);
  const { data: renewal, error: lookupError } = await admin.from('merchant_renewal_requests').select('renewal_request_id,request_reference,merchant_id,subscription_id,case_id,initiated_by_type').eq('renewal_request_id', requestId).maybeSingle();
  if (lookupError || !renewal || renewal.merchant_id !== user.id || renewal.initiated_by_type !== 'merchant') return json({ error: 'Renewal request not found.' }, 404);

  let { error: claimError } = await admin.from('merchant_renewal_email_alerts').insert({ renewal_request_id: requestId, status: 'sending' });
  if (claimError?.code === '23505') {
    const retry = await admin.from('merchant_renewal_email_alerts').update({ status: 'sending', attempted_at: new Date().toISOString(), error_message: null }).eq('renewal_request_id', requestId).eq('status', 'failed').select('renewal_request_id').maybeSingle();
    if (!retry.data) return json({ ok: true, already_processed: true });
    claimError = retry.error;
  }
  if (claimError) return json({ error: 'Could not claim renewal alert.' }, 500);

  const text = `A merchant requested renewal in PaySME. Renewal ${renewal.request_reference}; onboarding case ${renewal.case_id}; subscription ${renewal.subscription_id}. Open the Admin portal to arrange the sales call and updated agreement.`;
  const html = `<p>A merchant requested renewal in PaySME.</p><p>Renewal: <strong>${renewal.request_reference}</strong><br>Onboarding case: ${renewal.case_id}<br>Subscription: ${renewal.subscription_id}</p><p>Open the Admin portal to arrange the sales call and updated agreement.</p>`;
  const { data: mail, error: mailError } = await admin.functions.invoke('admin-temp-login-email', { body: { to: 'administrator@paysme.site', subject: `PaySME renewal ${renewal.request_reference}`, text, html } });
  const sent = !mailError && Boolean(mail?.success);
  const message = sent ? null : String(mailError?.message || mail?.error || 'Email provider did not confirm delivery').slice(0, 1000);
  await admin.from('merchant_renewal_email_alerts').update({ status: sent ? 'sent' : 'failed', sent_at: sent ? new Date().toISOString() : null, provider_message_id: mail?.messageId ?? null, error_message: message }).eq('renewal_request_id', requestId);
  await admin.from('platform_audit_events').insert({ actor_type: 'merchant', actor_id: user.id, action: 'send_renewal_admin_email', entity_type: 'merchant_renewal_request', entity_id: requestId, merchant_id: user.id, case_id: renewal.case_id, reference: renewal.request_reference, result: sent ? 'success' : 'failed', source: 'merchant_portal', details: { recipient: 'administrator@paysme.site', provider_message_id: mail?.messageId ?? null, error: message } });
  if (!sent) await admin.from('admin_notices').insert({ notice_type: 'renewal_email_failed', severity: 'warning', title: 'Merchant renewal email alert failed', message: 'The renewal is open, but the email to administrator@paysme.site was not confirmed.', merchant_id: user.id, case_id: renewal.case_id, entity_type: 'merchant_renewal_request', entity_id: requestId });
  return json({ ok: true, sent, error: message });
});
