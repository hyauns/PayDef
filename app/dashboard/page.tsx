// Cache invalidation: 2026-04-04
"use client"

import { DashboardShell } from "@/components/dashboard/DashboardShell"
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader"
import { GlobalMetrics } from "@/components/dashboard/global-metrics"
import { MerchantAccounts } from "@/components/dashboard/merchant-accounts"
import { ConnectedStores } from "@/components/dashboard/connected-stores"
import { TransactionFeed } from "@/components/dashboard/transaction-feed"
import { ShieldDomains } from "@/components/dashboard/shield-domains"
import { RotationLogic } from "@/components/dashboard/rotation-logic"
import { useLanguage } from "@/components/i18n/LanguageProvider"
import { dashboardCopy } from "@/lib/i18n/dashboard"

export default function DashboardPage() {
    const { language } = useLanguage()
    const t = dashboardCopy[language]

    return (
        <DashboardShell>
            <div data-ui-version="dashboard-i18n-vi-phase1" className="w-full px-6 md:px-8 py-8 space-y-6">
                <DashboardPageHeader 
                    eyebrow={t.overview}
                    title={t.title}
                    description={t.description}
                />
                <GlobalMetrics />
                <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-6">
                    <RotationLogic />
                    <div className="xl:row-span-2">
                        <TransactionFeed />
                    </div>
                </div>
                <MerchantAccounts />
                <ConnectedStores />
                <ShieldDomains />
            </div>
        </DashboardShell>
    )
}
