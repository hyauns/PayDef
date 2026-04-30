const logos = ["PAYPAL", "STRIPE", "AUTHORIZE.NET", "SHOPIFY", "WOOCOMMERCE", "BIGCOMMERCE", "NEXT.JS"];

export default function Logos() {
  return (
    <section className="flex flex-col items-center w-full bg-[#0F0F0F] py-[48px] px-6 md:px-[120px] gap-[32px]">
      <span className="font-ibm-mono text-[11px] text-[#444444] tracking-[3px]">
        TRUSTED BY PAYMENT TEAMS USING
      </span>
      <div className="flex flex-wrap items-center justify-center gap-8 md:gap-[64px] w-full">
        {logos.map((logo) => (
          <span
            key={logo}
            className="font-grotesk text-[13px] md:text-[14px] font-bold text-[#555555] hover:text-[#F5F5F0] transition-colors tracking-[2px] cursor-default"
          >
            {logo}
          </span>
        ))}
      </div>
    </section>
  );
}
