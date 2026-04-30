"use client";

import { useState } from "react";
import SectionHeader from "./SectionHeader";

const faqs = [
  {
    question: "WHAT IS PAYDEF?",
    answer: "PAYDEF IS A PAYMENT GATEWAY PROTECTION AND OPERATIONS PLATFORM FOR ECOMMERCE TEAMS. IT HELPS MANAGE STORES, MERCHANT ACCOUNTS, CHECKOUT ROUTING, PAYMENT DISPLAY PROFILES, TRANSACTION VISIBILITY, AND WEBHOOK DELIVERY."
  },
  {
    question: "DOES PAYDEF REPLACE MY ECOMMERCE STORE?",
    answer: "NO. PAYDEF WORKS ALONGSIDE YOUR EXISTING STORE. YOUR STOREFRONT HANDLES PRODUCTS AND ORDERS, WHILE PAYDEF HELPS MANAGE PAYMENT ROUTING, TRANSACTION OPERATIONS, GATEWAY COMMUNICATION, AND RECOVERY WORKFLOWS."
  },
  {
    question: "CAN PAYDEF PREVENT CHARGEBACKS?",
    answer: "NO PLATFORM CAN GUARANTEE ZERO CHARGEBACKS. PAYDEF HELPS REDUCE PREVENTABLE DISPUTES BY IMPROVING TRANSACTION CLARITY, PAYMENT RECORDS, WEBHOOK RELIABILITY, AND OPERATIONAL VISIBILITY."
  },
  {
    question: "CAN PAYDEF PREVENT PAYMENT ACCOUNT LIMITATIONS?",
    answer: "PAYDEF DOES NOT GUARANTEE THAT A PAYMENT PROVIDER WILL NEVER REVIEW OR RESTRICT AN ACCOUNT. IT HELPS MERCHANTS REDUCE OPERATIONAL RISK BY KEEPING CHECKOUT ROUTING, PAYMENT DISPLAY, SUPPORT RECORDS, AND TRANSACTION LOGS MORE CONSISTENT."
  },
  {
    question: "WHY DO PAYMENT DISPLAY PROFILES MATTER?",
    answer: "CLEARER PAYMENT DESCRIPTIONS CAN REDUCE BUYER CONFUSION AND SUPPORT TICKETS. PAYDEF LETS EACH STORE USE BRAND-AWARE, INDUSTRY-SPECIFIC DESCRIPTIONS THAT BETTER MATCH THE ORDER TYPE."
  },
  {
    question: "IS PAYDEF ONLY FOR PAYPAL?",
    answer: "PAYDEF CURRENTLY FOCUSES ON PAYPAL GATEWAY OPERATIONS, WITH AN ARCHITECTURE DESIGNED TO SUPPORT ADDITIONAL PAYMENT PROVIDERS IN THE FUTURE."
  }
];

export default function FAQSection() {
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <section id="faq" className="flex flex-col w-full bg-[#060606] py-16 px-6 md:py-[100px] md:px-[120px] scroll-mt-[60px]">
      <div className="w-full max-w-[480px]">
        <SectionHeader
          label="[07] // FAQ"
          title={"GOT\nQUESTIONS?"}
          subtitle="EVERYTHING YOU NEED TO KNOW BEFORE PROTECTING YOUR FIRST PAYMENT."
          titleWidth="w-full"
          subtitleWidth="w-full"
        />
      </div>

      <div className="h-10 md:h-[64px]" />

      {/* FAQ items */}
      <div className="flex flex-col w-full">
        {faqs.map((faq, i) => {
          const isOpen = openIndex === i;
          return (
            <div key={i} className="flex flex-col w-full border-t border-t-[#1D1D1D]">
              <button
                className="flex items-center justify-between w-full py-5 md:h-[72px] text-left gap-4 transition-colors hover:bg-[#111]"
                onClick={() => setOpenIndex(isOpen ? -1 : i)}
              >
                <span className="font-grotesk text-[14px] md:text-[16px] font-bold text-[#F5F5F0] tracking-[1px] uppercase">
                  {faq.question}
                </span>
                <div
                  className="flex items-center justify-center w-[32px] h-[32px] shrink-0 transition-colors"
                  style={{ backgroundColor: isOpen ? "#FFD600" : "#1A1A1A", border: isOpen ? "none" : "1px solid #3D3D3D" }}
                >
                  <span
                    className="font-ibm-mono text-[14px] font-bold"
                    style={{ color: isOpen ? "#0A0A0A" : "#888888" }}
                  >
                    {isOpen ? "—" : "+"}
                  </span>
                </div>
              </button>
              {isOpen && faq.answer && (
                <div className="pb-8">
                  <p className="font-ibm-mono text-[12px] md:text-[13px] text-[#888888] tracking-[1px] leading-[1.6] uppercase">
                    {faq.answer}
                  </p>
                </div>
              )}
            </div>
          );
        })}
        <div className="border-t border-t-[#1D1D1D]" />
      </div>

      {/* CTA */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-[16px] pt-10 md:pt-[48px]">
        <span className="font-ibm-mono text-[13px] text-[#555555] tracking-[1px]">
          STILL HAVE QUESTIONS?
        </span>
        <a href="/request-access" className="font-ibm-mono text-[13px] font-bold text-[#FFD600] tracking-[1px] cursor-pointer hover:underline uppercase">
          CONTACT OUR TEAM &gt;
        </a>
      </div>
    </section>
  );
}
