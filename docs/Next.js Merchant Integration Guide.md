# Next.js Merchant Integration Guide

This guide will walk you through the process of integrating our Payment Gateway into your Next.js storefront. We provide a seamless popup or redirect checkout flow, backed by a robust webhook architecture.

## Step 1: Procure Credentials from the Dashboard

Before writing any code, you need to acquire your gateway credentials and configure your store callbacks. 

1. Log into your **Payment Gateway Admin Dashboard**.
2. Navigate to **Stores** from the sidebar or top navigation.
3. Locate your store and click on the **... (Three dots)** icon at the end of the row, then select **Edit Details**.
4. In the side panel, look for the **Integration Summary** or raw field settings to find:
   - **Store ID**: Used to identify your store (`X-Store-ID`).
   - **API Key**: Used for backend REST API authentication (`X-API-Key`).
   - **Webhook Secret**: Used to mathematically verify that webhooks actually came from us.
5. In the same panel, you must configure:
   - **Webhook URL**: Where we will POST payment event updates (e.g., `https://your-store.com/api/webhooks/gateway`).
   - **Success Return URL**: The page buyers see after a successful `POPUP_BRIDGE` completion.
   - **Cancel Return URL**: The page buyers are sent to if they cancel out of the bridge.

> **Important**: Never expose your `API Key` or `Webhook Secret` to the client browser. Always store them securely in your `.env` file!

---

## Step 2: Establish the Checkout API Call

When a buyer clicks "Checkout", your Next.js backend (e.g., an App Router Route Handler or Server Action) needs to securely call our `/api/gateway/checkout` API.

**Example Next.js API Route (`app/api/checkout/route.ts`):**

```typescript
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  // 1. Get cart totals and user info
  const { cartTotal, userEmail, userIp } = await req.json();

  // 2. Call the Payment Gateway
  const response = await fetch('https://[GATEWAY_URL]/api/gateway/checkout', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Store-ID': process.env.GATEWAY_STORE_ID!,
      'X-API-Key': process.env.GATEWAY_API_KEY!,
    },
    body: JSON.stringify({
      amount: cartTotal,
      currency: "USD",
      itemName: "Store Order",
      intent: "CAPTURE",
      customerEmail: userEmail,
      buyerIp: userIp,
      buyerCountry: "US"
    })
  });

  const gatewayData = await response.json();
  
  if (!response.ok) {
    return NextResponse.json({ error: "Checkout failed" }, { status: 500 });
  }

  // 3. Save gatewayData.transactionId to your database here as PENDING

  // 4. Send the approval URL back to your frontend
  return NextResponse.json({ 
    url: gatewayData.flow === 'POPUP_BRIDGE' ? gatewayData.popupUrl : gatewayData.approvalUrl,
    transactionId: gatewayData.transactionId
  });
}
```

---

## Step 3: Handle the Frontend Flow

On your frontend, when the user clicks Checkout, you'll call your internal API, get the URL, and redirect the user.

```tsx
'use client';
import { useState } from 'react';

export default function CheckoutButton() {
  const [loading, setLoading] = useState(false);

  const handleCheckout = async () => {
    setLoading(true);
    const res = await fetch('/api/checkout', {
      method: 'POST',
      body: JSON.stringify({ cartTotal: 49.99, userEmail: "buyer@example.com", userIp: "127.0.0.1" })
    });
    const data = await res.json();
    
    // Redirect the user to the gateway flow (Popup Bridge or Direct Redirect)
    window.location.href = data.url;
  };

  return (
    <button onClick={handleCheckout} disabled={loading}>
      {loading ? "Processing..." : "Pay Now"}
    </button>
  );
}
```

---

## Step 4: Implement the Webhook Endpoint

> **Crucial:** Redirection is never a guarantee of payment! Users can close their browsers early. You MUST implement a webhook handler to consider an order fulfilled.

Create a route handler in your Next.js application to process incoming webhooks.

**Example Next.js Webhook Route (`app/api/webhooks/gateway/route.ts`):**
```typescript
import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from "crypto";

// Verifies the HMAC-SHA256 signature
function verifySignature(rawBody: string, timestamp: string, signature: string, secret: string) {
  const expected = "sha256=" + createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(signature);

  if (expectedBuffer.length !== receivedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, receivedBuffer);
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  
  // 1. Extract Headers
  const signature = req.headers.get("x-webhook-signature");
  const timestamp = req.headers.get("x-webhook-timestamp");
  const eventName = req.headers.get("x-webhook-event");
  const secret = process.env.GATEWAY_WEBHOOK_SECRET!;

  // 2. Validate Security
  if (!signature || !timestamp || !verifySignature(rawBody, timestamp, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // 3. Parse and Process payload
  const payload = JSON.parse(rawBody);
  const transactionId = payload.transaction_id;

  switch(eventName) {
    case 'payment.capture.completed':
      // The payment is finalized and successful! Complete the order.
      // e.g., await db.orders.update({ status: 'PAID', gatewayTxId: transactionId })
      break;
    case 'payment.checkout.canceled':
    case 'payment.session.expired':
      // Customer abandoned or explicitly backed out
      // e.g., await db.orders.update({ status: 'CANCELED' })
      break;
    case 'payment.capture.denied':
      // Payment was rejected by the gateway
      break;
    case 'payment.authorization.created':
      // Payment authorized but not yet captured 
      // Handle this if your store uses manual capture mode
      break;
  }

  return NextResponse.json({ received: true });
}
```

### Necessary Webhooks to Handle:
We highly recommend acting upon at least these 3 essential webhooks:
1. `payment.capture.completed`
2. `payment.checkout.canceled`
3. `payment.session.expired`

---

## Step 5: Returning users & Status Lookups (Optional)

If a user finishes their popup flow, the gateway sends them back to your `Success Return URL` (e.g., `https://your-store.com/checkout/success`).

You don't need to do anything complex on this page, just thank the user! If your webhook hasn't processed the result yet, and you want to instantly show the final status, you can make a secure backend call to our Status Lookup API:

```typescript
// Call from a Next.js Server Component or Route Handler
const res = await fetch(`https://[GATEWAY_URL]/api/gateway/transactions/${gatewayTransactionId}`, {
  headers: {
    'X-Store-ID': process.env.GATEWAY_STORE_ID!,
    'X-API-Key': process.env.GATEWAY_API_KEY!,
  }
});

const transactionStatus = await res.json();
// => Contains { current_status: "COMPLETED", amount: 49.99, ... }
```

You've now successfully integrated the gateway! You can track all events and their delivery status directly from your Merchant Dashboard.
