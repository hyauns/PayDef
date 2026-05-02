import { Metadata } from "next"
import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import { authOptions } from "@/lib/auth-config"
import { DashboardShell } from "@/components/dashboard/DashboardShell"
import { PaymentIdentitiesPageClient } from "@/components/payment-identities/PaymentIdentitiesPageClient"

export const metadata: Metadata = {
  title: "Payment Identities | PayDef",
}

export default async function PaymentIdentitiesPage() {
  const session = await getServerSession(authOptions)
  
  if (!session?.user) {
    redirect("/login")
  }

  return (
    <DashboardShell>
      <PaymentIdentitiesPageClient />
    </DashboardShell>
  )
}
