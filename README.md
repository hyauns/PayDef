# PayLaz

**Payment operations platform for e-commerce merchants who run multiple stores and multiple payment accounts.**

🌐 [paylaz.nl](https://www.paylaz.nl)

---

## Overview

Online merchants rarely sell through a single store with a single payment account. A typical seller operates several storefronts across WooCommerce, Shopify, and custom platforms, each with its own PayPal and Stripe accounts, credentials, webhooks, and reconciliation work. Managing this by hand means logging into many dashboards, missing failed webhooks, and losing track of which order was paid through which account.

**PayLaz is one control center for all of it.** Merchants connect their stores and payment provider accounts once, and PayLaz handles checkout, payment state, captures, refunds, and monitoring from a single dashboard and a single API.

## Who it is for

- **Multi-store merchants** who run several brands or niche storefronts
- **Sellers with multiple payment accounts** across PayPal and Stripe who need one place to manage them
- **Operations teams** who need clear visibility into payment status, failures, and disputes across every store

## Key capabilities

### Unified multi-provider gateway
- One integration for **PayPal**, **Stripe Checkout**, and **Shopify**. Stores talk to PayLaz, and PayLaz talks to the providers.
- Per-store provider configuration, so each store can use the providers and accounts that fit its business.
- Embeddable **PayPal Smart Buttons** for checkout, cart, and product pages.

### Multi-account management
- Manage many merchant accounts per provider from one dashboard.
- Account routing that respects per-account volume limits you configure, with automatic daily volume resets.
- Credentials are **encrypted at rest** and never exposed to storefronts.

### Full payment lifecycle
- Authorization, capture, re-authorization, and refund flows, including capture-on-shipment.
- Automatic expiry handling for authorizations that are never captured.
- A complete transaction history per store and per account.

### Reliable webhooks and recovery
- Provider webhooks are verified, recorded, and turned into signed store notifications.
- Failed deliveries are retried, and a scheduled recovery job reconciles any order whose status drifted from the provider.

### Monitoring and alerts
- Real-time **Telegram alerts** for payments and failures, sent per store.
- Health checks on checkout infrastructure, with alerts when something goes down.
- Structured logs and an analytics dashboard for revenue and volume per store and account.

### Built for teams and multiple tenants
- Multi-tenant architecture with super-admin, tenant, and store-level access.
- API keys per store, rate limiting, and audit-friendly logs.
- Bilingual interface (English / Vietnamese).

## Integrations

| Channel | How it connects |
|---|---|
| **WooCommerce** | Official PayLaz plugin: payment method, native refunds, webhooks, and Smart Buttons on checkout, cart, and product pages |
| **Custom storefronts** | REST API (`/api/gateway/checkout`, merchant transaction endpoints) plus signed webhooks |
| **Shopify** | Shopify provider with order sync and refunds |

The API reference is available in the dashboard at `/docs/api`.

## Architecture

```
 Storefronts (WooCommerce · Shopify · custom)
                │  REST API + signed webhooks
                ▼
        ┌───────────────────┐
        │      PayLaz       │  Next.js app: dashboard + gateway API
        │  routing · state  │  PostgreSQL: stores, accounts, transactions
        │  webhooks · alerts│  Cron: recovery, volume reset, health checks
        └───────────────────┘
                │
                ▼
     PayPal  ·  Stripe  ·  Shopify
```

## Tech stack

- **Framework:** Next.js 16 (App Router), React 19, TypeScript
- **Database:** PostgreSQL (Neon serverless driver)
- **Auth:** NextAuth with role-based access control
- **Payments:** PayPal Orders & Payments APIs, Stripe Checkout, Shopify Admin API
- **UI:** Tailwind CSS 4, shadcn/ui, Radix UI
- **Infrastructure:** self-hosted on Coolify with scheduled jobs; Telegram Bot API for alerts

## Getting started (development)

```bash
npx pnpm@10.33.0 install
cp .env.example .env.local   # fill in database URL, auth secret, encryption key
npx pnpm@10.33.0 dev
```

Open [http://localhost:3000](http://localhost:3000).

Verification suites:

```bash
npm run verify:smart-buttons
npm run verify:shield-health
npm run verify:brand
```

## Status

PayLaz is in production and processes live payments for merchant stores across multiple providers. Upcoming work includes additional payment providers, deeper analytics, and self-service merchant onboarding.

## License

Proprietary. All rights reserved.
