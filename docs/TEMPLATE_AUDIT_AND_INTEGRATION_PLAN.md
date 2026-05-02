# Template Audit & Integration Plan

## A. Executive Summary
This document outlines the strategy for safely integrating design elements from two reference templates (`homepage-next` and `dashboard-html`) into the production Next.js 16 App Router application. 

The most critical finding is that the `dashboard-html` template is a jQuery/Bootstrap 5 monolith that **cannot** be directly copied into the React/Tailwind ecosystem without causing massive conflicts. It must be used purely as a visual reference. The `homepage-next` template, conversely, is a clean React/Tailwind 4 app and can be ported with minimal friction.

## B. Homepage Template Audit (`homepage-next`)
* **Architecture:** Clean Next.js 15.1 + React 19 setup.
* **Styling:** Tailwind CSS v4.0.0. No external UI library. Uses CSS variables and font utilities (`@utility font-grotesk`).
* **Useful Sections for Landing Page:** 
  `Hero`, `Features`, `HowItWorks`, `Testimonials`, `FAQ`, `Logos`, `Pricing`, `Footer`.
* **Sections to Avoid:** Components dependent on missing assets if any, though all seem self-contained.
* **Dependencies:** None that conflict. Highly compatible.

## C. Dashboard Template Audit (`dashboard-html`)
* **Architecture:** Static HTML template built with Gulp ("Boron UI Kit").
* **Styling & JS:** Bootstrap 5, jQuery, and a massive array of vanilla JS plugins (Datatables, Apexcharts, SweetAlert2, Dropzone).
* **Useful Pieces (Visual Only):** 
  Sidebar layout, Topbar structure, Card aesthetics, Form layouts (`form-elements.html`), Data table aesthetics (`tables-basic.html`).
* **Do NOT Use / Avoid:** 
  **ALL** JavaScript files in `src/assets/js/`. 
  **ALL** SCSS/CSS files (Bootstrap conflicts directly with Tailwind). 
  Any jQuery plugins (will break Next.js React lifecycle and performance).
* **Strategy:** Recreate the visual layouts using the existing `shadcn/ui` and `Tailwind v4.2` toolset.

## D. Dependency Conflict Table

| Dependency / Asset | Source Template | Current Project Has It? | Safe to Add? | Risk Level | Recommendation |
|---|---|---|---|---|---|
| Tailwind CSS v4.x | `homepage-next` | Yes (v4.2.0) | N/A | Low | Fully compatible. |
| React 19 / Next.js | `homepage-next` | Yes (v16.2.0) | N/A | Low | Fully compatible. |
| Google Fonts | `homepage-next` | No | Yes | Low | Use `next/font/google` instead of raw imports. |
| Bootstrap 5 | `dashboard-html` | No | **No** | **High** | Will destroy Tailwind styling. |
| jQuery & Plugins | `dashboard-html` | No | **No** | **High** | Breaks React virtual DOM. |
| ApexCharts | `dashboard-html` | No (has Recharts) | **No** | Low | Retain `Recharts` to avoid bloating bundle size. |

*No `package.json` replacements are necessary. No new dependencies are recommended.*

## E. CSS Integration Strategy
1. **Global Variables:** Merge `--yellow`, `--orange`, `--bg-primary` from `homepage-next/app/globals.css` into the main `app/globals.css`, but keep existing `shadcn/ui` variables (`--background`, `--primary`, `--muted`) intact.
2. **Font Handling:** Define new fonts (`Space Grotesk`, `IBM Plex Mono`) via `next/font` in `app/layout.tsx` and inject them via CSS variables.
3. **Scoping:** For `homepage-next` components, ensure class names like `font-grotesk` are strictly used on public landing pages, preventing unintended font swaps on the Dashboard.
4. **Dashboard:** Do not import any `dashboard-html` CSS. Visually replicate cards, buttons, and sidebars using native Tailwind utility classes. Maintain the `dark` class toggle already present.

## F. Asset Copy Plan
Assets will be migrated locally without modifying existing files.
* **Landing Assets:** Copy SVGs and images from `homepage-next/public` into `public/redesign/landing/`.
* **Dashboard Assets:** Copy avatars, logo placeholders from `dashboard-html/src/assets/images` to `public/redesign/dashboard/`.
* **Ignored:** Skip all `assets/js`, `assets/scss`, `assets/fonts` (if we use `next/font`), and `assets/vendor` from the dashboard template.

## G. Component Mapping Proposal

### Landing Route Mapping
| Current Route/Page | Template Section to Adapt | Migration Difficulty | Risk Level | Notes |
|---|---|---|---|---|
| `app/page.tsx` | `Hero`, `Features`, `FAQ` | Low | Low | Drop-in React components. |
| `app/login/page.tsx` | Visuals from `auth-login.html` | Low | Medium | Recreate with shadcn Form, keep `next-auth` logic untouched. |

### Dashboard Shell & Core Views Mapping
| Current Route/Component | Template Section to Adapt | Migration Difficulty | Risk Level | Notes |
|---|---|---|---|---|
| `components/dashboard/header.tsx` | `layouts-compact.html` Topbar | Medium | Low | Translate HTML structure to Tailwind. |
| Sidebar Navigation | `layouts-compact.html` Sidebar | Medium | Low | Create responsive sliding sidebar with `lucide-react` icons. |
| `app/dashboard` | `index.html` widget cards | Medium | High | Keep `GlobalMetrics` fetching; restyle the wrapper cards. |
| `app/settings` | `form-elements.html`, `ui-tabs.html` | High | High | Keep forms entirely intact. Style inputs with shadcn. |
| `app/transactions` | `tables-basic.html` | High | High | Restyle the table borders/spacing. Keep all action buttons functional. |

## H. Recommended Migration Order
The following sequence minimizes risk by tackling the least-connected elements first:

1. **Phase 3: UI Migration Mapping Plan** (Preparing components)
2. **Phase 4: Landing Page & Auth Screens** (Low risk, isolated from payment logic)
3. **Phase 5: Dashboard Shell Only** (Sidebar, Topbar, Global layouts)
4. **Phase 6A: Analytics & Dashboards** (Read-only data views)
5. **Phase 6B: Settings Page** (High risk, layout recreation)
6. **Phase 6C: Accounts Page** (High risk)
7. **Phase 6D: Stores & Domains** (High risk)
8. **Phase 6E: Transactions Page** (Highest risk, money movement)
9. **Phase 6F: Super Admin Pages**

## I. Risks and Mitigations
* **Risk:** Breaking NextAuth session logic during login page rewrite.
  * **Mitigation:** Only replace Tailwind classes; preserve the existing `onSubmit` handlers and `signIn()` calls.
* **Risk:** Dashboard styles leaking into each other.
  * **Mitigation:** Rely strictly on Tailwind utilities and Radix primitives rather than scoped CSS files.
* **Risk:** Accidentally running jQuery/Bootstrap scripts.
  * **Mitigation:** Strictly enforce the "Do Not Copy" list. 

## J. Explicit "Do Not Use/Copy" List
* `_reference_templates/dashboard-html/package.json`
* `_reference_templates/dashboard-html/src/assets/js/**/*`
* `_reference_templates/dashboard-html/src/assets/scss/**/*`
* `_reference_templates/dashboard-html/src/assets/vendor/**/*`
* `_reference_templates/dashboard-html/gulpfile.js`
* `_reference_templates/homepage-next/package.json`

## K. Final Recommendation
Proceed directly to Phase 3 and Phase 4. The `homepage-next` template is heavily compatible and can be utilized quickly for the landing page. The `dashboard-html` template must be treated solely as a Figma-like visual reference, with its components manually rebuilt using existing `shadcn/ui` components and Tailwind CSS.
