/**
 * PayPal REST API v2 — Orders helper
 *
 * Uses the PayPal Sandbox by default unless PAYPAL_ENV=live is set.
 * Credentials are passed per-call (clientId / clientSecret from the
 * MerchantAccount record) so each account uses its own OAuth token.
 */

const PAYPAL_BASE =
  process.env.PAYPAL_ENV === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com"

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PayPalOrderItem {
  name:      string   // masked item name
  quantity:  string   // always "1"
  unitAmount: {
    currencyCode: string
    value:        string  // 2-decimal string, e.g. "49.99"
  }
}

export interface CreateOrderParams {
  clientId:     string
  clientSecret: string
  amount:       string        // total as 2-decimal string
  currencyCode: string        // e.g. "USD"
  items:        PayPalOrderItem[]
  returnUrl:    string        // shieldDomain success URL
  cancelUrl:    string        // shieldDomain cancel URL
  customId:     string        // our internal transactionId for webhook matching
}

export interface PayPalOrderResponse {
  id:     string
  status: string
  links:  { href: string; rel: string; method: string }[]
}

// ─── OAuth token (per-account, short-lived — not cached across requests) ─────

async function getAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/x-www-form-urlencoded",
      "Authorization": `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: "grant_type=client_credentials",
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`PayPal token error [${res.status}]: ${text}`)
  }

  const data = await res.json() as { access_token: string }
  return data.access_token
}

// ─── Create Order ─────────────────────────────────────────────────────────────

export async function createPayPalOrder(p: CreateOrderParams): Promise<PayPalOrderResponse> {
  const token = await getAccessToken(p.clientId, p.clientSecret)

  const itemTotal = p.items
    .reduce((sum, item) => sum + parseFloat(item.unitAmount.value) * parseInt(item.quantity, 10), 0)
    .toFixed(2)

  const body = {
    intent: "CAPTURE",
    purchase_units: [
      {
        custom_id:   p.customId,
        amount: {
          currency_code: p.currencyCode,
          value:         p.amount,
          breakdown: {
            item_total: {
              currency_code: p.currencyCode,
              value:         itemTotal,
            },
          },
        },
        items: p.items.map((item) => ({
          name:     item.name,
          quantity: item.quantity,
          unit_amount: {
            currency_code: item.unitAmount.currencyCode,
            value:         item.unitAmount.value,
          },
          category: "DIGITAL_GOODS",
        })),
      },
    ],
    application_context: {
      return_url:          p.returnUrl,
      cancel_url:          p.cancelUrl,
      brand_name:          "Secure Checkout",
      shipping_preference: "NO_SHIPPING",
      user_action:         "PAY_NOW",
    },
  }

  const res = await fetch(`${PAYPAL_BASE}/v2/checkout/orders`, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${token}`,
      "PayPal-Request-Id": p.customId, // idempotency key
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`PayPal create order error [${res.status}]: ${text}`)
  }

  return res.json() as Promise<PayPalOrderResponse>
}

// ─── Extract approval URL ─────────────────────────────────────────────────────

export function getApprovalUrl(order: PayPalOrderResponse): string {
  const link = order.links.find((l) => l.rel === "approve")
  if (!link) throw new Error("PayPal did not return an approval URL.")
  return link.href
}
