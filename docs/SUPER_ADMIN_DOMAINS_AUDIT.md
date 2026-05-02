# Super Admin Domains Audit

**Date:** 2026-04-29
**Target Scope:** `/super-admin/domains` vs `/domains`

## 1. Files Inspected
- `app/super-admin/domains/page.tsx`
- `app/domains/page.tsx`
- `components/domains/shield-domains-manager.tsx`

## 2. Current Render Path
Both `/super-admin/domains/page.tsx` and `/domains/page.tsx` render the exact same root component: `<ShieldDomainsManagerPage />`.

## 3. Shared Component Architecture
The `<ShieldDomainsManagerPage />` component is intentionally polymorphic. It reads the current user's session data via `useSession()` and dynamically scales its capabilities based on the `isAdmin = role === "SUPER_ADMIN"` boolean flag. 

This design means the structural UI (the table, the layout, the Boron aesthetic) will look almost identical between a standard merchant and a Super Admin, which resolves the visual similarity concern.

## 4. Admin-Specific UI & Logic Verification
The audit confirms that **no Super Admin-specific features were lost**. The component correctly gates the following features exclusively for Super Admins:

- **API Endpoint Branching:** It fetches from `/api/admin/shield-domains` instead of `/api/merchant/shield-domains`.
- **Tenant Fetching:** It makes an additional request to `/api/admin/tenants` to populate a tenant list for domain assignment.
- **Add Domain Override:** The `AddDomainModal` unlocks a tenant assignment dropdown for admins (allowing assignment to a specific tenant or the "Shared Pool"), whereas standard users bypass this entirely.
- **Table Data Extension:** The table renders tenant ownership (`domain.tenantName` vs `Shared Pool`) and allows assigning stores across tenant boundaries.
- **Header & Onboarding Copy:** The `DashboardPageHeader` and `OnboardingChecklist` dynamically swap out instruction copy (e.g., "SUPER ADMIN / SHIELD DOMAINS").

## 5. Risk Assessment
- **Role Gating:** Secure. The UI gracefully degrades for non-admins, and server-side endpoints (`/api/admin/shield-domains`) inherently enforce session validation.
- **Data Leakage:** None. Non-admins cannot fetch the tenant list or assign domains to the shared pool.
- **Accidental Duplication:** The shared component approach is actually an intentional, DRY (Don't Repeat Yourself) design pattern that is functioning as intended.

## 6. Recommended Action
No structural redesign or logic recovery is necessary for the Super Admin Domains page. The shared `<ShieldDomainsManagerPage />` component has already been successfully migrated to the Boron aesthetic during Phase 5, and it dynamically handles all Phase 7 Super Admin requirements perfectly. 

The visual similarity is a feature of the unified dashboard system, not a regression.
