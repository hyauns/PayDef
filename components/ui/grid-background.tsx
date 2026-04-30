import { BGPattern } from "@/components/ui/bg-pattern";

export function GridBackground() {
  return (
    <BGPattern
      variant="grid"
      mask="fade-edges"
      size={28}
      fill="rgba(255,255,255,0.055)"
      className="opacity-70"
    />
  );
}
