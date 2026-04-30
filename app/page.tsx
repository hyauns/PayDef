import { getServerSession } from "next-auth/next"

import LandingNavbar from "@/components/landing/LandingNavbar"
import LandingHero from "@/components/landing/LandingHero"
import PixelDivider from "@/components/landing/PixelDivider"
import Logos from "@/components/landing/Logos"
import FeatureGrid from "@/components/landing/FeatureGrid"
import PaymentDisplaySection from "@/components/landing/PaymentDisplaySection"
import DisputeReadinessSection from "@/components/landing/DisputeReadinessSection"
import TelegramAlertsSection from "@/components/landing/TelegramAlertsSection"
import HowItWorks from "@/components/landing/HowItWorks"
import SecuritySection from "@/components/landing/SecuritySection"
import FAQSection from "@/components/landing/FAQSection"
import LandingCTA from "@/components/landing/LandingCTA"
import LandingFooter from "@/components/landing/LandingFooter"
import FadeIn from "@/components/landing/FadeIn"

export const metadata = {
  title: "PayDef — Payment Gateway Protection for Ecommerce Teams",
  description: "Protect checkout continuity, manage merchant accounts, improve payment display clarity, recover failed webhooks, and strengthen dispute readiness from one secure payment operations dashboard.",
}

export default async function LandingPage() {
  const session = await getServerSession()
  const isLoggedIn = !!session?.user

  return (
    <div className="flex flex-col w-full bg-[#0A0A0A] pt-[60px] min-h-screen">
      <LandingNavbar isLoggedIn={isLoggedIn} />
      <LandingHero isLoggedIn={isLoggedIn} />
      <PixelDivider />
      <FadeIn delay={100}><Logos /></FadeIn>
      <FadeIn delay={100}><FeatureGrid /></FadeIn>
      <FadeIn delay={100}><PaymentDisplaySection /></FadeIn>
      <FadeIn delay={100}><DisputeReadinessSection /></FadeIn>
      <FadeIn delay={100}><TelegramAlertsSection /></FadeIn>
      <FadeIn delay={100}><HowItWorks /></FadeIn>
      <FadeIn delay={100}><SecuritySection /></FadeIn>
      <FadeIn delay={100}><FAQSection /></FadeIn>
      <FadeIn delay={100}><LandingCTA /></FadeIn>
      <LandingFooter />
    </div>
  )
}