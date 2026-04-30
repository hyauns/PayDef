import SectionHeader from "./SectionHeader"
import DescriptorTransformDemo from "./DescriptorTransformDemo"

export default function PaymentDisplaySection() {
  return (
    <section id="payment-clarity" className="flex flex-col w-full bg-[#0D0D0D] py-16 px-6 md:py-[100px] md:px-[120px] gap-12 md:gap-[16px] border-t border-[#2D2D2D] scroll-mt-[60px]">
      <SectionHeader
        label="[04] // PAYMENT DISPLAY CLARITY"
        title={"TURN CONFUSING PAYMENT RECORDS\nINTO CLEARER, SAFER TRANSACTION CONTEXT."}
        subtitle="PAYDEF HELPS TEAMS STANDARDIZE BUYER-FACING PAYMENT DESCRIPTIONS WHILE KEEPING RISKY, RESTRICTED, OR BRAND-SENSITIVE ITEMS FLAGGED FOR REVIEW INSTEAD OF SILENTLY PASSING THROUGH UNCLEAR DESCRIPTORS."
      />

      <DescriptorTransformDemo />
    </section>
  )
}
