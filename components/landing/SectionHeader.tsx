"use client";

import GlitchText from "./GlitchText";

interface SectionHeaderProps {
  label: string;
  title: string;
  subtitle?: string;
  titleWidth?: string;
  subtitleWidth?: string;
}

export default function SectionHeader({
  label,
  title,
  subtitle,
  titleWidth = "w-full max-w-[700px]",
  subtitleWidth = "w-full max-w-[600px]",
}: SectionHeaderProps) {
  return (
    <div className="flex flex-col gap-[16px] w-full">
      <span className="font-ibm-mono text-[10px] md:text-[12px] font-bold text-[#FFD600] tracking-[1.5px] md:tracking-[3px] uppercase">
        <GlitchText text={label} speed={30} />
      </span>
      <h2
        className={`font-grotesk text-[clamp(32px,6vw,56px)] font-bold text-[#F5F5F0] tracking-[-1px] leading-[1.05] whitespace-pre-line uppercase ${titleWidth}`}
      >
        <GlitchText text={title} speed={40} delay={150} />
      </h2>
      {subtitle && (
        <p
          className={`font-ibm-mono text-[10px] md:text-[13px] text-[#888888] tracking-[0.5px] md:tracking-[1px] leading-[1.6] text-pretty uppercase ${subtitleWidth}`}
        >
          <GlitchText text={subtitle} speed={20} delay={350} />
        </p>
      )}
    </div>
  );
}
