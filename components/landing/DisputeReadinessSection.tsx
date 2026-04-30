import SectionHeader from "./SectionHeader"
import PaymentEvidenceTimeline from "./PaymentEvidenceTimeline"

export default function DisputeReadinessSection() {
  return (
    <section id="trace" className="flex flex-col w-full bg-[#111111] py-16 px-6 md:py-[100px] md:px-[120px] gap-12 md:gap-[64px] border-t border-[#2D2D2D] scroll-mt-[60px]">
      <SectionHeader
        label="[03] // AUDIT TRAIL"
        title={"BETTER RECORDS WHEN\nDISPUTES HAPPEN."}
        subtitle="PAYDEF HELPS ORGANIZE THE PAYMENT EVIDENCE YOUR TEAM NEEDS: TRANSACTION ID, CHECKOUT STATUS, CAPTURE STATUS, WEBHOOK DELIVERY, AND PAYMENT LIFECYCLE."
      />

      <PaymentEvidenceTimeline />
    </section>
  )
}
