# UI Migration Mapping Plan

## 1. Executive Summary
This document provides a precise, phased migration map to transition the existing Next.js App Router UI to a new template-inspired design. 
* **Strategy:** Incremental UI replacement. We will migrate isolated, low-risk public pages first, followed by the dashboard shell, and finally high-risk authenticated functional views.
* **First to Migrate:** The public landing page (`/`) and authentication screens (`/login`), utilizing the compatible `homepage-next` template.
* **To be Delayed:** High-risk functional dashboard views (`/settings`, `/transactions`, `/accounts`) must be delayed until the core Dashboard Shell (Phase 5) is stable.
* **Main Risk Areas:** Breaking React state, API payload structures, or NextAuth flows while applying new Tailwind styling.
* **Dashboard Template Constraint:** The `dashboard-html` template is strictly a **visual reference only**. No Bootstrap, jQuery, vendor JS, or HTML CSS files will be copied into the production environment.

---

## 2. Global Design Direction
* **Landing Page Style:** Direct adoption of the `homepage-next` aesthetic (dark mode by default, high-contrast yellow/orange accents, monospace and grotesk typography).
* **Dashboard Style:** Visually inspired by `dashboard-html` (sidebar navigation, structured cards, clean data tables) but rebuilt entirely using `Tailwind v4.2` and existing `shadcn/ui` primitives.
* **Dark Mode:** Full dark mode compatibility using existing CSS variables.
* **Typography:** `next/font` integration for `Space Grotesk` (sans-serif) and `IBM Plex Mono` (monospace) scoped correctly.
* **Icon Strategy:** Continue using `lucide-react` for all icons across the application.
* **Strict Constraint:** No Bootstrap. No jQuery. No external dashboard vendor JS.

---

## 3. Route-by-route Migration Map

| Current Route | Current File/Component | Risk Level | Template Inspiration Source | New Component(s) to Create | Must Preserve Logic | Phase | Test Checklist |
|---|---|---|---|---|---|---|---|
| `/` | `app/page.tsx` | Low | `homepage-next` | `LandingHero`, `FeatureGrid`, `LandingFooter` | SEO metadata, public links | 4 | Renders correctly, links work |
| `/login` | `app/login/page.tsx` | Medium | `dashboard-html` (auth-login) | Auth Form wrapper | `signIn()` NextAuth logic | 4 | Successful login, error toasts |
| `/request-access` | `app/request-access/page.tsx` | Low | `dashboard-html` (auth-register) | Form wrapper | Form submit action | 4 | Form submission succeeds |
| `/privacy`, `/terms` | `app/privacy/page.tsx` | Low | `homepage-next` (FAQ/Text) | Prose/Text wrapper | Static content | 4 | Renders correctly |
| `/dashboard` | `app/dashboard/page.tsx` | High | `dashboard-html` (index) | `DataCard`, `GlobalMetrics` | `fetch` metrics | 6A | Metrics load, layout responsive |
| `/analytics` | `app/analytics/page.tsx` | Medium | `dashboard-html` (charts) | `Recharts` wrapper | Chart data hooks | 6A | Charts render |
| `/settings` | `app/settings/page.tsx` | High | `dashboard-html` (form-elements) | `SettingsSection`, `FormRow` | Form posts, validation | 6B | Display profiles save correctly |
| `/accounts` | `app/accounts/page.tsx` | High | `dashboard-html` (cards/tables) | `AccountCard`, `StatusBadge` | API keys securely handled | 6C | Account connects/maps |
| `/transactions` | `app/transactions/page.tsx` | High | `dashboard-html` (tables-basic) | `DataTableWrapper` | Refund/Capture/Void actions | 6E | Actions hit correct endpoints |
| `/stores` | `app/stores/page.tsx` | High | `dashboard-html` (tables-basic) | `DataTableWrapper` | Regenerate keys logic | 6D | Webhook keys regenerate |
| `/domains` | `app/domains/page.tsx` | High | `dashboard-html` (tables-basic) | `DataTableWrapper` | Shield Domain CRUD | 6D | Domains map properly |
| `/logs` | `app/logs/page.tsx` | Medium | `dashboard-html` (tables-basic) | `DataTableWrapper` | Log fetching/parsing | 6A | Logs display correctly |
| `/super-admin/*` | `app/super-admin/page.tsx` | High | `dashboard-html` (cards) | Admin wrappers | Role validation (`SUPER_ADMIN`) | 6F | Caches flush, tenant list |
| `/checkout/popup` | `app/checkout/popup/page.tsx` | High | None (keep minimal) | Payment Form | PCI/Stripe/PayPal Elements | Delay | Payments complete |

---

## 4. Landing Page Migration Plan
Map `homepage-next` sections to replace the current landing page.

**Sections to Include & Components to Create:**
* `components/landing/LandingHero.tsx` (Hero section)
* `components/landing/FeatureGrid.tsx` (Feature cards)
* `components/landing/HowItWorks.tsx` (Process flow)
* `components/landing/SecuritySection.tsx` (Security/Compliance focus)
* `components/landing/PaymentDisplaySection.tsx` (Payment Display Profiles intro)
* `components/landing/FAQSection.tsx` (FAQ)
* `components/landing/LandingFooter.tsx` (Footer)

**Must Preserve:**
* Functional "Login" and "Request Access" links.
* SEO Metadata (`metadata` export in `page.tsx`).
* Responsive mobile behavior.
* No backend routing changes.

---

## 5. Auth Page Migration Plan (`/login`)
* **Visual Style:** Mimic the clean card-based layout of the template.
* **Must Preserve:** Existing NextAuth `signIn("credentials", { ... })` logic, redirection behavior, error handling states (e.g., "Invalid credentials").
* **Do Not Change:** NextAuth provider configuration, session token issuance.
* **Test Checklist:**
  * [ ] Correct login yields redirection to `/dashboard`.
  * [ ] Invalid login renders native error toast/message.
  * [ ] Logout still functions accurately.

---

## 6. Dashboard Shell Migration Plan
Design a universal shell wrapping all authenticated routes.

**Proposed Components:**
* `components/dashboard/DashboardShell.tsx` (Main layout wrapper)
* `components/dashboard/DashboardSidebar.tsx` (Sidebar nav)
* `components/dashboard/DashboardTopbar.tsx` (Header nav)
* `components/dashboard/DashboardPageHeader.tsx` (Page title/breadcrumbs)
* `components/dashboard/StatusBadge.tsx` (Pill badges for status)
* `components/dashboard/DataCard.tsx` (Standardized metric card)
* `components/dashboard/EmptyState.tsx` (Fallback UI)

**Must Preserve:**
* Current routes (`/dashboard`, `/settings`, etc.).
* Server-side session and role checks (`getServerSession`).
* Visibility scoping (Merchant vs. Super Admin navigation links).
* Active navigation state (highlight current route).

**Use `dashboard-html` ONLY For:** Sidebar layout reference, topbar spacing, card padding, table header aesthetics.
**Do NOT Copy:** Bootstrap classes, jQuery scripts, vendor plugins, global CSS files.

---

## 7. Page-specific Migration Plans

### A. `/settings`
* **Must Preserve:** Payment Display Profile mapping, store ownership logic, capture mode, checkout experience flow, Telegram settings, Super Admin global configs.
* **Plan:** Group complex form fields logically. Use `shadcn/ui` tabs or accordions to hide density. Keep existing `fetch()` POST logic entirely intact.

### B. `/accounts`
* **Must Preserve:** Add/edit merchant account modals, PayPal credentials handling, legacy masking toggles, proxy fields, validation behavior.
* **Plan:** Improve account overview cards. Add clear visual `StatusBadge` indicators for healthy vs. failing API connections. Implement a cleaner slide-over layout for editing.

### C. `/transactions`
* **Must Preserve:** Transaction feed list loading, filters, detailed JSON views, `Refund`/`Capture`/`Void`/`Replay Webhook` action triggers, and API endpoint contracts.
* **Plan:** Enhance table readability using `DataTableWrapper`. Group actions into cohesive `ActionButtonGroup` dropdowns. Ensure confirmation modals are preserved for destructive actions.

### D. `/stores`
* **Must Preserve:** API key and webhook secret displays, regeneration endpoints, confirmation dialogs.

### E. `/domains`
* **Must Preserve:** Shield domain CRUD operations and DNS verification states.

### F. `/super-admin/*`
* **Must Preserve:** Strict `SUPER_ADMIN` role gating, cache flushing functionality, global tenant lists.

---

## 8. Shared Component Plan
These components should be built during Phase 5 (Dashboard Shell) before tackling specific pages:

| Component | Purpose | Where Used | Wrapping `shadcn`? | Risk |
|---|---|---|---|---|
| `DashboardShell` | Main layout wrapper | `app/layout.tsx` (or group layout) | No | High |
| `PageHeader` | Standardized page title | Top of all dashboard pages | No | Low |
| `SectionCard` | White/Dark box for forms/data | Forms, Settings, Analytics | Yes (`Card`) | Low |
| `StatusBadge` | Colored pills (Active/Failed) | Tables, Accounts | Yes (`Badge`) | Low |
| `DataTableWrapper` | Standardized table styling | Transactions, Stores, Logs | Yes (`Table`) | Medium |
| `ConfirmActionDialog` | Prevent accidental destructive acts | Refunds, Key Regen | Yes (`AlertDialog`) | High |

---

## 9. CSS and Asset Plan
* **CSS Strategy:** Do NOT import `dashboard-html` CSS. Use standard Tailwind utility classes to mimic the look. Ensure existing `shadcn` CSS variables are preserved. Any global CSS overrides (like adding the template's accent yellow) should be minimal.
* **Assets:** 
  * Landing SVGs/images -> `public/redesign/landing/`
  * Dashboard avatars/placeholders -> `public/redesign/dashboard/`
  * Do NOT copy vendor JS/CSS from templates.

---

## 10. Detailed Implementation Phases

* **Phase 4: Landing page + public pages only**
  * *Files Changed:* `app/page.tsx`, `app/login/page.tsx`, public routes.
  * *Preserve:* Auth login actions.
* **Phase 5: Dashboard shell only**
  * *Files Changed:* Layout files, new dashboard wrapper components.
  * *Preserve:* Routing, Session logic.
* **Phase 6A: Analytics/dashboard read-only views**
  * *Files Changed:* `/dashboard`, `/analytics`, `/logs`.
* **Phase 6B: Settings page**
  * *Files Changed:* `/settings`.
  * *Preserve:* Complex nested forms and `fetch` PUT/POST logic.
* **Phase 6C: Accounts page**
  * *Files Changed:* `/accounts`.
  * *Preserve:* Credential storage logic.
* **Phase 6D: Stores/domains pages**
  * *Files Changed:* `/stores`, `/domains`.
  * *Preserve:* API key regeneration flows.
* **Phase 6E: Transactions page**
  * *Files Changed:* `/transactions`.
  * *Preserve:* Refund, Capture, Void, Replay webhook endpoints.
* **Phase 6F: Super Admin pages**
  * *Files Changed:* `/super-admin/*`.
  * *Preserve:* Role validation.

---

## 11. Do-Not-Break Master Checklist
- [ ] Login/logout/session redirects remain functional.
- [ ] Merchant role access restrictions hold.
- [ ] Super Admin role access restrictions hold.
- [ ] Store settings (webhooks, flows) save correctly.
- [ ] Payment Display Profile map saves and validates.
- [ ] Account profile mapping connects correctly.
- [ ] Descriptor templates add/disable functions.
- [ ] Merchant account add/edit modal succeeds without payload errors.
- [ ] Transaction list loads properly.
- [ ] Refund/Capture/Void/Replay buttons trigger correct endpoints.
- [ ] Store API key regeneration requires confirmation and works.
- [ ] Shield domain CRUD functions correctly.
- [ ] Analytics and dashboard charts render.
- [ ] `npm run build` succeeds without type errors.

---

## 12. Final Recommendation
The immediate next step is **Phase 4: Landing page only**. 
This phase is the lowest risk as it is entirely decoupled from the payment backend, authenticated sessions (mostly), and transaction routing. It allows us to establish the baseline aesthetic, setup fonts, and test component extraction from `homepage-next` before touching any critical merchant workflows.
