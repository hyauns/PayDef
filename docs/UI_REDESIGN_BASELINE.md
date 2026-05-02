# UI Redesign Baseline Document

## 1. Project Technology Stack & Style System
* **Framework:** Next.js (Version 16.2.0) with **App Router** (`app/` directory).
* **Styling:** Tailwind CSS (Version 4.2.0) with PostCSS.
* **Component Library:** Custom components heavily utilizing `shadcn/ui` primitives (Radix UI).
* **Theming:** Configured for `dark` mode by default, utilizing CSS variables in global stylesheets.

## 2. Directory & Component Architecture
* **Global CSS Files:**
  * `app/globals.css`
  * `styles/globals.css`
* **Current Layouts:**
  * `app/layout.tsx` (Root layout wrapping `<SessionProvider>`, global `<Toaster>`, and `<Analytics>`).
* **Current Component Folders:**
  * `components/ui/` (shadcn primitives: Buttons, Cards, Inputs, Dialogs, etc.)
  * `components/auth/`
  * `components/dashboard/`
  * `components/domains/`
  * `components/nav/`
  * `components/shield-storefront/`

## 3. Routing Map
### 3.1. Public & Landing Routes
* `/login`
* `/privacy`
* `/terms`
* `/request-access`
* `/shield-storefront` (and sub-routes like `/shield-storefront/about`, `/shield-storefront/contact`, etc.)

### 3.2. Dashboard & App Routes
* `/dashboard`
* `/accounts`
* `/analytics`
* `/domains`
* `/logs`
* `/order/cancel`, `/order/success`
* `/settings`
* `/stores`
* `/transactions`

### 3.3. Admin & Super Admin Routes
* `/admin`
* `/super-admin`
* `/super-admin/domains`
* `/super-admin/tenants`

### 3.4. Checkout / Gateway Routes
* `/checkout/popup`

## 4. Security & Compliance Context
### 4.1. Auth-Protected Pages
The following functional areas require valid sessions/tokens to access:
* `/dashboard`
* `/accounts`
* `/analytics`
* `/domains`
* `/logs`
* `/settings`
* `/stores`
* `/transactions`
* `/admin` & `/super-admin` routes

### 4.2. HIGH-RISK Backend Files (DO NOT TOUCH)
These files represent critical payment logic, webhook handling, and database schemas. They must **NOT** be modified during UI redesign:
* `app/api/gateway/**/*` (including `app/api/gateway/checkout/route.ts`)
* `app/api/webhook/**/*` (including PayPal, Telegram webhooks)
* `app/api/merchant/transactions/**/*`
* `app/api/cron/**/*`
* Database logic and Prisma schemas (`prisma/**/*`)

## 5. UI Migration Strategy

### 5.1. Recommended Branch Strategy
* **Main UI Redesign Branch:** `ui-redesign-phase-1` (Currently active).
* Develop incrementally. If further phases are required, use branching like `ui-redesign-phase-2`, `ui-redesign-phase-3` checking out from `main` or sequentially tracking from `ui-redesign-phase-1`.
* Merge isolated, non-breaking UI components back to `ui-redesign-phase-1` before releasing to `main`.

### 5.2. Phase-by-Phase UI Migration Plan
* **Phase 1: Foundation & Theming**
  * Update `app/globals.css` color palettes, font configurations, and base utilities.
  * Adjust global layouts (`app/layout.tsx`) and navigation elements (`components/nav/*`).
* **Phase 2: Core Primitives Refactoring**
  * Redesign basic `shadcn/ui` components (`components/ui/*`) to match the new aesthetic (e.g., buttons, form fields, cards, tables).
* **Phase 3: High-Visibility Views Refactoring**
  * Update the main dashboard layout, metric widgets, and data grids (`/dashboard`, `/analytics`, `/transactions`).
* **Phase 4: Functional Views Refactoring**
  * Redesign settings panels, forms, and account management views (`/settings`, `/stores`, `/accounts`).
* **Phase 5: Public Pages & Final Polish**
  * Revamp the authentication screens (`/login`).
  * Ensure responsive behavior and cross-browser consistency. 
  * Validate UI interactions, animations, and toast notifications.

## 6. Build Baseline Verification
* Initial build verification was successful.
* Modified `tsconfig.json` to explicitly exclude `_reference_templates` from TypeScript checks to ensure a clean build pipeline independent of legacy standalone UI mockups.
* `npm run build` completes with 0 errors.
