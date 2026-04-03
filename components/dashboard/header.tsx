// Re-export shim — the canonical file lives at components/nav/top-bar.tsx.
// This file exists so cached Turbopack chunks that still reference
// @/components/dashboard/header resolve without a module-not-found error.
export { DashboardHeader } from "@/components/nav/top-bar"
