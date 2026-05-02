"use client"

import { CheckCircle2, ChevronRight, Globe, Package, ShieldCheck, PlayCircle } from "lucide-react"
import Link from "next/link"
import { useLanguage } from "@/components/i18n/LanguageProvider"
import { paymentIdentitiesCopy } from "@/lib/i18n/payment-identities"

export function PaymentIdentitySetupGuide() {
  const { language } = useLanguage()
  const t = paymentIdentitiesCopy[language]
  const steps = [
    {
      title: t.step1Title,
      description: t.step1Desc,
      href: "/domains",
      icon: Globe,
    },
    {
      title: t.step2Title,
      description: t.step2Desc,
      href: "/payment-identities",
      icon: ShieldCheck,
    },
    {
      title: t.step3Title,
      description: t.step3Desc,
      href: "/payment-identities",
      icon: Package,
    },
    {
      title: t.step4Title,
      description: t.step4Desc,
      href: "/accounts",
      icon: CheckCircle2,
    },
    {
      title: t.step5Title,
      description: t.step5Desc,
      href: "/transactions", // Adjust to wherever testing happens, maybe just transactions or dashboard
      icon: PlayCircle,
    },
  ]

  return (
    <div className="bg-[#151821] border border-[#343947] rounded-lg p-6 mb-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-[#e7edf8]">{t.setupGuideTitle}</h2>
          <p className="text-sm text-[#97a3b6] mt-1">{t.setupGuideDesc}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {steps.map((step, index) => {
          const Icon = step.icon
          return (
            <Link 
              key={index}
              href={step.href}
              className="group relative bg-[#1f222c] border border-[#343947] rounded-lg p-4 hover:border-[#FFD600]/40 transition-colors block"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-8 h-8 rounded bg-[#2a2d39] flex items-center justify-center group-hover:bg-[#FFD600]/10 transition-colors">
                  <Icon className="w-4 h-4 text-[#97a3b6] group-hover:text-[#FFD600] transition-colors" />
                </div>
                <div className="flex items-center justify-center w-5 h-5 rounded-full bg-[#151821] border border-[#343947] text-[10px] font-mono text-[#97a3b6]">
                  {index + 1}
                </div>
              </div>
              <h3 className="text-sm font-semibold text-[#e7edf8] mb-1 group-hover:text-[#FFD600] transition-colors">{step.title}</h3>
              <p className="text-[11px] text-[#97a3b6] leading-relaxed">{step.description}</p>
              
              {index < steps.length - 1 && (
                <div className="hidden md:block absolute -right-3 top-1/2 -translate-y-1/2 z-10">
                  <ChevronRight className="w-4 h-4 text-[#343947]" />
                </div>
              )}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
