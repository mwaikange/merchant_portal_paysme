import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { vendor_code, password, action } = await req.json()
    const normalizedCode = String(vendor_code || '').trim().toUpperCase()
    if (!normalizedCode) return json({ error: 'Missing vendor code' }, 400)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const sourceIp = (req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'unknown').split(',')[0].trim()
    const rateSubject = await sha256(`${sourceIp}:${normalizedCode}`)
    const rateWindow = new Date(Date.now() - 15 * 60 * 1000).toISOString()
    const { count: recentAttempts } = await admin
      .from('vendor_public_rate_limits')
      .select('id', { count: 'exact', head: true })
      .eq('scope', 'vendor_login')
      .eq('subject_hash', rateSubject)
      .gte('attempted_at', rateWindow)
    if (Number(recentAttempts || 0) >= 10) {
      return json({ error: 'Unable to sign in. Please wait and try again.' }, 429)
    }
    await admin.from('vendor_public_rate_limits').insert({ scope: 'vendor_login', subject_hash: rateSubject })

    const { data: vendor, error: vendorError } = await admin
      .from('vendors')
      .select('vendor_id, auth_user_id, email, full_name, vendor_code, is_active, registration_status')
      .eq('vendor_code', normalizedCode)
      .maybeSingle()

    if (vendorError || !vendor) return json({ error: 'Vendor ID or password is incorrect.' }, 401)
    if (vendor.is_active === false || vendor.registration_status === 'inactive') {
      return json({ error: 'Vendor account is not active.' }, 403)
    }

    // Kept only for the trusted provisioning workflow. It never creates a login session.
    if (action === 'create_user') {
      if (vendor.auth_user_id) return json({ success: true, auth_user_id: vendor.auth_user_id })
      return json({ error: 'Vendor auth account must be provisioned by vendor-registration.' }, 409)
    }

    if (!password || !vendor.auth_user_id || !vendor.email) {
      return json({ error: 'Vendor ID or password is incorrect.' }, 401)
    }

    // Supabase Auth performs the password hash verification. Never mint a token from
    // a vendor code alone and never compare or store a plain password in `vendors`.
    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: authData, error: authError } = await authClient.auth.signInWithPassword({
      email: vendor.email,
      password: String(password),
    })

    if (authError || !authData.session || !authData.user || authData.user.id !== vendor.auth_user_id) {
      return json({ error: 'Vendor ID or password is incorrect.' }, 401)
    }

    const userType = authData.user.app_metadata?.user_type || authData.user.user_metadata?.user_type
    if (userType !== 'vendor') {
      return json({ error: 'This account is not registered as a PaySME Vendor.' }, 403)
    }

    return json({
      access_token: authData.session.access_token,
      refresh_token: authData.session.refresh_token,
      expires_at: authData.session.expires_at,
      vendor_id: vendor.vendor_id,
      user_type: 'vendor',
    })
  } catch (error) {
    console.error('vendor-token error', error)
    return json({ error: 'Unable to sign in. Please try again.' }, 400)
  }
})
