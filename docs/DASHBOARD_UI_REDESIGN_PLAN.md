# Dashboard UI Redesign Plan

## 1. Executive Summary

This document outlines the detailed plan to redesign the PayDef dashboard and admin UI. The primary objective is to visually transform the current UI using the `dashboard-html` template as a **visual reference only**, without altering any underlying business logic, database queries, API endpoints, or routing mechanisms.
- **Visual Reference:** The `dashboard-html` template will be analyzed for visual styling, spacing, and layout.
- **Implementation:** All UI will be rebuilt natively using Tailwind CSS v4 and the existing `shadcn/ui` Radix components.
- **Safety Rule:** Backend/payment logic must remain 100% untouched.
- **Phased Approach:** The migration will occur in strict phases to minimize the risk of breaking existing merchant operations or money movement flows.

## 2. New Dashboard Visual Direction

The new dashboard will adopt a premium "dark SaaS admin style" inspired by the `dashboard-html` template, unified with the public landing page's aesthetic.

- **Style:** Dark mode default, brutalist yet clean SaaS interface.
- **Sidebar:** A compact, fixed left sidebar featuring clear, hierarchical navigation links with an active state highlight (subtle background/yellow accent).
- **Topbar:** A minimal topbar containing breadcrumbs or the current page title, along with user profile/session controls.
- **Card Hierarchy:** High-contrast, glassmorphic cards with thin borders (`#2D2D2D`), minimal padding (`p-6`), and zero or very subtle border radius.
- **Table Style:** Clean data tables with uppercase monospaced headers, subtle row hover effects, and distinct action dropdowns.
- **Status Badges:** Small, highly legible status pills (e.g., green for Active/Success, red for Failed, yellow for Pending/Warn) using monospaced text.
- **Form Groups:** Vertically aligned form inputs using dark backgrounds (`#111111`), thin borders, and yellow/cyan focus rings.
- **Warning/Alert Boxes:** Distinct inline alerts for errors or important notes with solid left-border accents.
- **Modal/Slide-over Style:** Clean `shadcn` dialogs with a dark backdrop blur, ensuring focus on destructive actions or complex edits.
- **Mobile Behavior:** Sidebar collapses into a hamburger menu; cards and tables stack or scroll horizontally.

## 3. Shared Components to Build First

Before altering any page logic, we must build a library of shared dashboard UI components.

- `components/dashboard/DashboardShell.tsx`
  - **Purpose:** Main layout wrapper managing the Sidebar and Topbar structure.
  - **Props:** `children`, `userRole`.
  - **Used In:** `app/layout.tsx` or group layout.
  - **Risk:** High (impacts entire app layout).
  - **Wraps shadcn:** No.

- `components/dashboard/DashboardSidebar.tsx`
  - **Purpose:** Vertical navigation menu.
  - **Props:** `links`, `currentPath`.
  - **Used In:** `DashboardShell`.
  - **Risk:** Low.
  - **Wraps shadcn:** No.

- `components/dashboard/DashboardTopbar.tsx`
  - **Purpose:** Horizontal header with user context and mobile toggle.
  - **Props:** `user`.
  - **Used In:** `DashboardShell`.
  - **Risk:** Low.
  - **Wraps shadcn:** No.

- `components/dashboard/DashboardPageHeader.tsx`
  - **Purpose:** Standardized title block for page content.
  - **Props:** `title`, `description`, `action?`.
  - **Used In:** All pages.
  - **Risk:** Low.
  - **Wraps shadcn:** No.

- `components/dashboard/SectionCard.tsx`
  - **Purpose:** Container for forms or distinct data groups.
  - **Props:** `title`, `children`, `footer?`.
  - **Used In:** All pages.
  - **Risk:** Low.
  - **Wraps shadcn:** Yes (`Card`).

- `components/dashboard/StatCard.tsx`
  - **Purpose:** Display key metrics (volume, counts).
  - **Props:** `label`, `value`, `trend?`.
  - **Used In:** `/dashboard`, `/analytics`.
  - **Risk:** Low.
  - **Wraps shadcn:** Yes (`Card`).

- `components/dashboard/StatusBadge.tsx`
  - **Purpose:** Visual indicators for states like "Active", "Refunded", etc.
  - **Props:** `status`, `type` (success, warning, error, neutral).
  - **Used In:** `/transactions`, `/accounts`, `/domains`.
  - **Risk:** Low.
  - **Wraps shadcn:** Yes (`Badge`).

- `components/dashboard/DataTableShell.tsx`
  - **Purpose:** Standardized styling for data grids.
  - **Props:** `headers`, `children`.
  - **Used In:** `/transactions`, `/stores`, `/logs`.
  - **Risk:** Medium (requires refactoring existing complex tables).
  - **Wraps shadcn:** Yes (`Table`).

- `components/dashboard/FormSection.tsx`
  - **Purpose:** Group form inputs logically.
  - **Props:** `label`, `children`.
  - **Used In:** `/settings`, `/accounts`.
  - **Risk:** Low.
  - **Wraps shadcn:** No.

- `components/dashboard/InfoAlert.tsx` / `WarningAlert.tsx`
  - **Purpose:** Display non-blocking contextual information.
  - **Props:** `message`.
  - **Used In:** `/settings`, `/stores`.
  - **Risk:** Low.
  - **Wraps shadcn:** Yes (`Alert`).

- `components/dashboard/ConfirmActionDialog.tsx`
  - **Purpose:** Confirm destructive or high-risk actions.
  - **Props:** `title`, `description`, `onConfirm`.
  - **Used In:** `/transactions` (Refund/Void), `/stores` (Regen Keys).
  - **Risk:** High (must reliably trigger API actions).
  - **Wraps shadcn:** Yes (`AlertDialog`).

- `components/dashboard/ActionButtonGroup.tsx`
  - **Purpose:** Group multiple actions in a clean dropdown.
  - **Props:** `actions`.
  - **Used In:** `/transactions` row actions.
  - **Risk:** Medium.
  - **Wraps shadcn:** Yes (`DropdownMenu`).

- `components/dashboard/EmptyState.tsx`
  - **Purpose:** Clean UI when lists are empty.
  - **Props:** `title`, `description`, `icon?`, `action?`.
  - **Used In:** All list pages.
  - **Risk:** Low.
  - **Wraps shadcn:** No.

## 4. Route-by-route Redesign Plan

### A. `/dashboard`
- **Current File:** `app/dashboard/page.tsx`
- **Current Function:** Overview metrics, transaction feed summaries.
- **Visual Changes:** Replace standard divs with `StatCard`, `SectionCard`.
- **Must Preserve:** Metric fetching hooks.
- **Risk Level:** Low (Read-only data).
- **Phase:** Admin UI 2.
- **Test Checklist:** Verify all metrics load properly and layout does not break.

### B. `/analytics`
- **Current File:** `app/analytics/page.tsx`
- **Current Function:** Visual charts and trends.
- **Visual Changes:** Wrap existing charts in `SectionCard`.
- **Must Preserve:** `Recharts` implementation. Do NOT switch to ApexCharts.
- **Risk Level:** Low.
- **Phase:** Admin UI 2.
- **Test Checklist:** Verify charts render cleanly in dark mode.

### C. `/settings`
- **Current File:** `app/settings/page.tsx`
- **Current Function:** Complex merchant configuration.
- **Visual Changes:** Organize long forms into `FormSection` and tabs. Use new input styles.
- **Must Preserve:** Payment Display Profile mapping, global rotation rules, Telegram settings, descriptor templates, capture mode settings, checkout experience options, and validation.
- **Risk Level:** High.
- **Phase:** Admin UI 3.
- **Test Checklist:** Submit forms and verify payload structure matches existing API.

### D. `/accounts`
- **Current File:** `app/accounts/page.tsx`
- **Current Function:** Manage merchant accounts and proxy connections.
- **Visual Changes:** Improve card readability, add `StatusBadge`. Refactor edit modals using `shadcn` dialogs.
- **Must Preserve:** Add/edit logic, PayPal credentials handling, legacy masking fields, status/volume toggles, display_profile_id dropdown mapping.
- **Risk Level:** High.
- **Phase:** Admin UI 4.
- **Test Checklist:** Connect an account, edit an account safely.

### E. `/transactions`
- **Current File:** `app/transactions/page.tsx`
- **Current Function:** Live transaction ledger and operational controls.
- **Visual Changes:** Apply `DataTableShell`, convert buttons to `ActionButtonGroup`.
- **Must Preserve:** Transaction list rendering, precise status transitions, Refund/Capture/Void/Replay actions, confirmation dialogs. API endpoints must remain strictly unchanged.
- **Risk Level:** Extremely High.
- **Phase:** Admin UI 6.
- **Test Checklist:** Test Void, Capture, Refund actions against sandbox safely.

### F. `/stores`
- **Current File:** `app/stores/page.tsx`
- **Current Function:** API key and webhook management.
- **Visual Changes:** Use `SectionCard` and `DataTableShell`.
- **Must Preserve:** Create store flow, API key display/regeneration, webhook secret display/regeneration, and explicit confirmation dialogs.
- **Risk Level:** High.
- **Phase:** Admin UI 5.
- **Test Checklist:** Regenerate keys and ensure prompt appears.

### G. `/domains`
- **Current File:** `app/domains/page.tsx`
- **Current Function:** Shield domain configuration.
- **Visual Changes:** Use `SectionCard` and `StatusBadge` for DNS states.
- **Must Preserve:** Shield domain CRUD, DNS verification state fetching.
- **Risk Level:** High.
- **Phase:** Admin UI 5.
- **Test Checklist:** Create and map a new domain safely.

### H. `/logs`
- **Current File:** `app/logs/page.tsx`
- **Current Function:** System logs.
- **Visual Changes:** Implement `DataTableShell`.
- **Must Preserve:** Log table readability, search/filtering.
- **Risk Level:** Medium.
- **Phase:** Admin UI 2.
- **Test Checklist:** Search and filter logs correctly.

### I. `/super-admin/*`
- **Current File:** `app/super-admin/page.tsx` (and nested routes).
- **Current Function:** Global platform management.
- **Visual Changes:** Apply standard dashboard shell and components.
- **Must Preserve:** Role gating (`SUPER_ADMIN`), tenant lists, cache/session flushing tools.
- **Risk Level:** High.
- **Phase:** Admin UI 7.
- **Test Checklist:** Ensure non-admins cannot access this route.

## 5. Recommended Implementation Phases

**Phase Admin UI 1: Dashboard Shell only**
- *Goal:* Implement sidebar, topbar, and page wrapper.
- *Changes:* `app/layout.tsx` (or nested dashboard layout), `components/dashboard/DashboardShell.tsx`.
- *Preserve:* Do not change inner page logic.
- *Testing:* Ensure all routes still render within the new shell.
- *Rollback Strategy:* Revert layout file to previous wrapper.

**Phase Admin UI 2: Read-only pages**
- *Goal:* Restyle non-destructive data views.
- *Changes:* `/dashboard`, `/analytics`, `/logs`.
- *Preserve:* Data fetching, Recharts.
- *Testing:* Verify data loads.
- *Rollback Strategy:* Revert specific page files.

**Phase Admin UI 3: Settings page visual refactor**
- *Goal:* Overhaul form groups and layout.
- *Changes:* `/settings`.
- *Preserve:* All API POST/PUT logic and state mapping.
- *Testing:* Modify a setting and verify network payload.
- *Rollback Strategy:* Revert `/settings/page.tsx`.

**Phase Admin UI 4: Accounts page visual refactor**
- *Goal:* Refactor account listing and edit modals.
- *Changes:* `/accounts`.
- *Preserve:* CRUD actions and credential states.
- *Testing:* Add a mock account.
- *Rollback Strategy:* Revert `/accounts/page.tsx`.

**Phase Admin UI 5: Stores/Domains pages**
- *Goal:* Standardize tables and API key views.
- *Changes:* `/stores`, `/domains`.
- *Preserve:* Key regeneration endpoints and confirmations.
- *Testing:* Test domain CRUD and key regen.
- *Rollback Strategy:* Revert specific pages.

**Phase Admin UI 6: Transactions page**
- *Goal:* Enhance the most complex table in the app.
- *Changes:* `/transactions`.
- *Preserve:* All money-movement API interactions. **Do this last.**
- *Testing:* Strict manual testing of Refund/Capture/Void actions.
- *Rollback Strategy:* Revert `/transactions/page.tsx`.

**Phase Admin UI 7: Super Admin pages**
- *Goal:* Apply styles to admin utilities.
- *Changes:* `/super-admin/*`.
- *Preserve:* Role gates.
- *Testing:* Check role enforcement.
- *Rollback Strategy:* Revert super admin directory.

## 6. Do-Not-Break Checklist

Before any PR is merged during these phases, the following must be verified:
- [ ] Login/logout/session redirect flows.
- [ ] Merchant role access.
- [ ] Super admin role access.
- [ ] Dashboard navigation and active sidebar route highlighting.
- [ ] Account add/edit functionality.
- [ ] Display profile saving and validation.
- [ ] Merchant account profile mapping logic.
- [ ] Descriptor templates add/disable functions.
- [ ] Capture mode setting saves.
- [ ] Checkout experience settings save.
- [ ] Transaction refund/capture/void/replay buttons trigger exactly the same endpoints.
- [ ] Store API key regeneration requires user confirmation.
- [ ] Shield domain CRUD functions cleanly.
- [ ] Logs page loads successfully.
- [ ] Analytics charts render via Recharts.
- [ ] `npm run build` succeeds without type errors.

## 7. Explicit Do-Not-Copy List

Do **NOT** copy or import any of the following into the codebase from the reference template:
- `_reference_templates/dashboard-html/package.json`
- `_reference_templates/dashboard-html/src/assets/js/**/*`
- `_reference_templates/dashboard-html/src/assets/scss/**/*`
- `_reference_templates/dashboard-html/src/assets/vendor/**/*`
- `_reference_templates/dashboard-html/gulpfile.js`
- Bootstrap CSS imports (`bootstrap.min.css`, etc.)
- jQuery imports
- ApexCharts (use existing Recharts library instead)

## 8. Final Recommendation

**The recommended first coding phase is Admin UI Phase 1 — Dashboard Shell only.**
- **Why:** Rebuilding the global layout (Sidebar and Topbar) introduces a massive visual improvement across the entire application instantly without touching any complex page-level state or forms. It establishes the design system container, reducing risk. It is easily isolated and can be rapidly rolled back if routing issues occur.
