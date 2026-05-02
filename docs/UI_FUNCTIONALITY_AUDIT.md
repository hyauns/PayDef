# UI Functionality Audit

## 8. Final Summary
* **Total UI Routes Audited:** 17 routes identified across Public, Dashboard, and Super Admin namespaces.
* **Highest-Risk Pages:** `/settings`, `/transactions`, `/accounts`, `/stores`, `/super-admin`.
* **Safest Pages to Redesign First:** `/privacy`, `/terms`, `/request-access`, `/` (landing page), and `/login`.
* **Pages to Delay:** Do not touch `/settings` or `/transactions` until core dashboard components have been vetted.
* **Build Status:** Current build passes successfully without any functional disruptions.

---

## 1. Route Inventory Table

| Route Path | File Path | Audience | Main Purpose | Layout Type | Key Components | Risk Level |
|---|---|---|---|---|---|---|
| `/` | `app/page.tsx` | Public | Landing Page | Default | `TopBar`, `Footer` | Low |
| `/login` | `app/login/page.tsx` | Public | Authentication | Default | Form UI | Medium |
| `/privacy`, `/terms` | `app/privacy/page.tsx`, `app/terms/page.tsx` | Public | Legal/Static Content | Default | Typography | Low |
| `/request-access` | `app/request-access/page.tsx` | Public | Form for platform access | Default | Form UI | Low |
| `/dashboard` | `app/dashboard/page.tsx` | Merchant | Overview metrics and quick actions | Dashboard | `GlobalMetrics` | High |
| `/accounts` | `app/accounts/page.tsx` | Merchant | Manage PayPal/Stripe accounts | Dashboard | `MerchantAccounts` | High |
| `/analytics` | `app/analytics/page.tsx` | Merchant | Data visualizations | Dashboard | `Chart` (Recharts) | Low |
| `/domains` | `app/domains/page.tsx` | Merchant | Manage Shield Domains | Dashboard | `ShieldDomainsManager` | High |
| `/logs` | `app/logs/page.tsx` | Merchant | Raw API/Gateway logs | Dashboard | Table | Medium |
| `/settings` | `app/settings/page.tsx` | Merchant | Global configurations | Dashboard | Form UI, Switches | High |
| `/stores` | `app/stores/page.tsx` | Merchant | API keys, Webhooks, Stores | Dashboard | `ConnectedStores` | High |
| `/transactions` | `app/transactions/page.tsx` | Merchant | Transaction list, refunds, voids | Dashboard | `TransactionFeed` | High |
| `/super-admin` | `app/super-admin/page.tsx` | Super Admin | Gateway controls, cache flush | Dashboard | - | High |
| `/super-admin/tenants` | `app/super-admin/tenants/page.tsx` | Super Admin | Merchant management | Dashboard | Table | High |
| `/checkout/popup` | `app/checkout/popup/page.tsx` | Buyer | Hosted payment UI | None | Iframe/Payment | High |
| `/order/success`, `/cancel` | `app/order/success/page.tsx`, etc. | Buyer | Post-checkout landing | None | Text | Low |

---

## 2. Page-by-page Functionality Map

### `/settings`
* **Visible Sections:** Payment Display Profile mapping, Global Display Overrides, Store Settings, Telegram Alerts, Security.
* **Buttons/Actions:** Update Webhook, Test Telegram, Save Display Profile, Change Password, Change Email.
* **Form Fields:** Descriptor fields, URL overrides, email/password inputs.
* **API Dependencies:** 
  * `POST /api/merchant/stores/display-profile`
  * `POST /api/admin/settings/test-telegram`
  * `POST /api/merchant/stores/capture-mode`
  * `POST /api/merchant/stores/checkout-flow`
* **Must Preserve:** Strict sequential logic of mapping display profiles before enabling capture modes.

### `/accounts`
* **Visible Sections:** PayPal and Stripe connection lists.
* **Buttons/Actions:** Add Account, Map Profile, Verify Connection.
* **Modals:** "Add New Account" slideovers/dialogs.
* **API Dependencies:** `GET/POST /api/merchant/accounts`, `POST /api/merchant/test-paypal`.
* **Must Preserve:** Account credential validation and error toast rendering on bad keys.

### `/stores`
* **Visible Sections:** Connected stores table, API Key / Webhook Secret displays.
* **Buttons/Actions:** Regenerate Key, Regenerate Webhook Secret, Create Store.
* **API Dependencies:** `PUT/DELETE /api/merchant/stores`, `/api/merchant/stores/regenerate-key`.
* **Must Preserve:** Warning modals before regenerating keys, as it breaks active integrations.

### `/transactions`
* **Visible Sections:** Real-time transaction feed, filters by status/date.
* **Buttons/Actions:** Replay Webhook, Capture, Refund, Void, Mock Charge (Sandbox).
* **API Dependencies:** `POST /api/merchant/transactions/[id]/replay`, `POST /api/gateway/mock-charge`.
* **Must Preserve:** Replay webhook mechanisms and state transitions (e.g. Authorized -> Captured).

### `/super-admin` (and sub-routes)
* **Visible Sections:** System Controls, Cache stats, Tenant Lists.
* **Buttons/Actions:** Flush Cache, Clear Fraud Counters, Rotate Keys.
* **API Dependencies:** `/api/admin/gateway-controls`, `/api/admin/sessions`.
* **Must Preserve:** Role checking (ensure `session.user.role === 'SUPER_ADMIN'`).

---

## 3. API Dependency Map

| UI Page / Component | API Endpoint | Method | Role Requirement | Risk if Changed |
|---|---|---|---|---|
| `/settings` | `/api/merchant/stores/display-profile` | GET/POST | Merchant | High (Breaks GMC sync) |
| `/settings` | `/api/merchant/stores/capture-mode` | POST | Merchant | High (Breaks checkout) |
| `/accounts` | `/api/merchant/accounts` | GET/POST | Merchant | High (Prevents payment processing) |
| `/stores` | `/api/merchant/stores/regenerate-key` | POST | Merchant | High (Invalidates API requests) |
| `/transactions` | `/api/merchant/transactions/[id]/replay` | POST | Merchant | High (Breaks fulfillment) |
| `SuperAdmin` | `/api/admin/tenants` | GET/POST | SuperAdmin | High (Breaks auth/merchant provisioning) |
| `Domains` | `/api/merchant/shield-domains` | GET/POST | Merchant | High (Breaks domain cloaking) |

---

## 4. Component Dependency Map

* **`components/ui/*`**: Standard `shadcn/ui` components (Buttons, Inputs, Dialogs, Selects, Toasts). Relied upon by EVERY page. Do not mutate functional APIs (e.g., `onCheckedChange` vs `onChange`).
* **`components/dashboard/header.tsx`**: Renders the authenticated top navigation and User Avatar/Logout dropdown. Relied upon by the Dashboard layout.
* **`components/nav/top-bar.tsx`**: Renders the unauthenticated public landing navigation.
* **`components/dashboard/global-metrics.tsx`**: Calculates and fetches stats for the `/dashboard` page.
* **`components/dashboard/transaction-feed.tsx`**: Used in `/transactions` to manage real-time updates and webhook replays.

---

## 5. High-Risk UI Areas

* **`/settings`**: Contains multi-step forms directly affecting how buyers see payments (Display Profiles) and how funds are captured (Auth vs Capture). Breaking state here causes immediate merchant compliance suspensions.
* **`/transactions`**: Direct manipulation of money movement. Any UI bug in the "Refund" or "Capture" button payload could result in accidental double-refunds or failed captures.
* **`/accounts`**: API key inputs for PayPal/Stripe are sensitive. The UI must properly obscure keys and correctly format JSON payloads to the backend.
* **`/stores`**: Regenerating API keys is a destructive action. The UI flow (Warnings, Modals) must be preserved perfectly.

---

## 6. Do-Not-Break Checklist

- [ ] `useSession` and NextAuth redirects remain active for protected routes.
- [ ] Merchant accounts list loads securely without exposing raw secrets to the DOM.
- [ ] Payment Display Profiles can be created and saved to stores.
- [ ] Regenerate API Key / Webhook Secret requires a confirmation dialog.
- [ ] Transactions feed auto-refreshes or accurately paginates via SWR/fetch.
- [ ] Replay Webhook button fires the exact `/api/merchant/transactions/[id]/replay` path.
- [ ] Super Admin sections (`/super-admin/*`) correctly validate role before rendering.
- [ ] Login, Logout, and Session timeouts operate natively.
- [ ] Shield domain CRUD actions correctly format payload arrays.
- [ ] Checkout Popup UI initializes without console errors when framed.

---

## 7. Recommended UI Migration Order

Based on the functional complexities mapped above, the redesign should proceed in the following phases to isolate risk:

1. **Phase 2: Audit reference templates** - Evaluate the intended design mockups against this functional baseline.
2. **Phase 3: Mapping plan** - Align existing components to the new design tokens.
3. **Phase 4: Landing page only** (`/`, `/privacy`, `/login`) - Safest entry point.
4. **Phase 5: Dashboard shell only** - Layouts, Navbars, Sidebars (without touching inner page logic).
5. **Phase 6A: Settings page** - Redesigning the complex forms.
6. **Phase 6B: Accounts page** - Refactoring sensitive credential inputs.
7. **Phase 6C: Transactions page** - Redesigning tables and critical action buttons.
8. **Phase 6D: Stores/Domains pages** - Managing lists and modals.
9. **Phase 6E: Super admin pages** - Final specialized views.
