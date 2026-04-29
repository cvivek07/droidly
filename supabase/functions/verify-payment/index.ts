import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── Razorpay signature verification ─────────────────────────────────────────
// Razorpay signs: HMAC_SHA256(key_secret, order_id + "|" + payment_id)
async function verifyRazorpaySignature(
  orderId:   string,
  paymentId: string,
  signature: string,
  secret:    string,
): Promise<boolean> {
  const message = `${orderId}|${paymentId}`
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sigBytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  const expected = Array.from(new Uint8Array(sigBytes))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  return expected === signature
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // ── 1. Verify user is authenticated ───────────────────────
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── 2. Parse request body ──────────────────────────────────
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = await req.json()

    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      return new Response(JSON.stringify({ error: 'Missing payment details' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── 3. Verify Razorpay signature ───────────────────────────
    const isValid = await verifyRazorpaySignature(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      Deno.env.get('RAZORPAY_KEY_SECRET')!,
    )

    if (!isValid) {
      console.error('Invalid signature for payment:', razorpay_payment_id)
      return new Response(JSON.stringify({ error: 'Invalid payment signature' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── 4. Write subscription to DB (service role bypasses RLS) ─
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Write to subscriptions (payment audit trail)
    const { error: subError } = await supabaseAdmin
      .from('subscriptions')
      .upsert(
        {
          user_id:             user.id,
          razorpay_payment_id,
          razorpay_order_id,
          razorpay_signature,
          status:              'active',
          plan:                'premium_monthly',
          amount:              299,
          currency:            'INR',
          updated_at:          new Date().toISOString(),
        },
        { onConflict: 'razorpay_payment_id' }
      )

    if (subError) throw subError

    // Flip is_premium on profiles (fast app-wide flag)
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({
        is_premium:    true,
        premium_since: new Date().toISOString(),
      })
      .eq('id', user.id)

    if (profileError) throw profileError

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('verify-payment error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
