import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    // ── 2. Create Razorpay order ───────────────────────────────
    const rzpKeyId     = Deno.env.get('RAZORPAY_KEY_ID')!
    const rzpKeySecret = Deno.env.get('RAZORPAY_KEY_SECRET')!
    const credentials  = btoa(`${rzpKeyId}:${rzpKeySecret}`)

    const orderRes = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: 29900,          // ₹299 in paise
        currency: 'INR',
        receipt: `rcpt_${user.id.slice(0, 8)}_${Date.now()}`,
        notes: {
          user_id: user.id,
          email:   user.email,
          plan:    'premium_monthly',
        },
      }),
    })

    if (!orderRes.ok) {
      const err = await orderRes.json()
      throw new Error(err.error?.description || 'Razorpay order creation failed')
    }

    const order = await orderRes.json()

    // ── 3. Return order details to frontend ───────────────────
    return new Response(
      JSON.stringify({
        order_id: order.id,
        amount:   order.amount,
        currency: order.currency,
        key_id:   rzpKeyId,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('create-order error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
