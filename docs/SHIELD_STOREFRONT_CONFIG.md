# Shield Storefront Configuration

This document explains how to add and configure new mini-storefronts for shield domains.

## Overview

The shield storefront is a completely data-driven React application. Instead of hitting a database, it relies on static configuration files mapped to hostnames. This allows us to rapidly deploy lightweight, compliant, and professional storefront facades for any shield domain without database overhead.

## How it works

1. When a user navigates to `https://shielddomain.com/`, the Next.js `middleware.ts` detects the host.
2. If it is a registered shield domain, the middleware rewrites the request to `/shield-storefront`.
3. The pages inside `app/shield-storefront` use `headers().get("x-forwarded-host")` to fetch the configuration.
4. The resolver (`config/shield-sites/index.ts`) matches the hostname and returns the appropriate `ShieldSiteConfig`.

## How to add a new shield domain

1. Create a new file in `config/shield-sites/`, for example `myshielddomain.ts`.
2. Export a typed config object:

```ts
import type { ShieldSiteConfig } from "./types"

export const myShieldDomain: ShieldSiteConfig = {
  domain: "myshielddomain.com",
  brandName: "My Shield Domain",
  tagline: "Quality goods delivered securely.",
  industry: "Retail",
  heroTitle: "Welcome to My Shield Domain",
  heroSubtitle: "Shop our latest collections with secure, encrypted checkout.",
  heroEyebrow: "Official Store",
  products: [
    {
      title: "Signature Widget",
      slug: "signature-widget",
      category: "Featured",
      price: "$29.00",
      description: "Our best-selling product.",
    }
  ],
  supportEmail: "support@myshielddomain.com",
  footerText: "Thank you for shopping securely. Orders are processed daily.",
  seoTitle: "My Shield Domain | Shop Online",
  seoDescription: "Shop our exclusive collection.",
}
```

3. Import and add it to the `allShieldSites` array inside `config/shield-sites/index.ts`:

```ts
import { myShieldDomain } from "./myshielddomain"

export const allShieldSites: ShieldSiteConfig[] = [
  rainbowPrintHouse,
  myShieldDomain,
]
```

## Host Matching Rules

- The resolver strictly normalizes hosts by removing protocols (`https://`), trailing ports (`:3000`), and `www.` prefixes.
- Both `www.domain.com` and `domain.com` will match the same config if the `domain` property is set to `domain.com`.
- Fuzzy matching is intentionally avoided to prevent cross-brand leakage.
- If a host does not match any config, it falls back to a generic, safe retail template instead of failing.

## ⚠️ Warning: Do not modify payment routes

Do not attempt to modify the layout or behavior of payment-critical routes to accommodate storefront content.

The following routes are explicitly excluded from shield storefront routing by `middleware.ts`:
- `/checkout/popup`
- `/order/success`
- `/order/cancel`
- `/api/gateway/*`

These routes must remain exactly as they are to ensure the PayPal bridge, Webhook delivery, and Payment Identity Bundle processing remain uninterrupted.
