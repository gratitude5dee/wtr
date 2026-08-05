import { Check, LockKeyhole, ShieldCheck, WalletCards } from "lucide-react";
import { SectionKicker } from "@/components/marketing/section";

interface CdrFeature {
  title: string;
  copy: string;
  icon: typeof ShieldCheck;
}

const features: CdrFeature[] = [
  {
    title: "CLIENT-SIDE ENCRYPTION",
    copy: "The payload is encrypted before it leaves the owner’s environment.",
    icon: ShieldCheck,
  },
  {
    title: "OWNER-GATED VAULTS",
    copy: "Threshold access is granted by the people who own the data.",
    icon: LockKeyhole,
  },
  {
    title: "ON-CHAIN IP + PIL",
    copy: "Ownership and permitted use are legible, portable primitives.",
    icon: WalletCards,
  },
  {
    title: "APPEND-ONLY TRACE",
    copy: "trace-v1.0 preserves the sequence from intake through settlement.",
    icon: Check,
  },
];

export function CdrBand() {
  return (
    <section className="border-b border-white/[0.09] bg-[#111d21] px-6 py-20 lg:px-10 lg:py-24">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-10 lg:grid-cols-[.8fr_1.2fr]">
          <div>
            <SectionKicker>05 / CONFIDENTIAL DATA RAILS</SectionKicker>
            <h2 className="mt-5 text-4xl tracking-[-.05em] sm:text-5xl">
              Confidentiality
              <br />
              as infrastructure.
            </h2>
          </div>
          <div className="grid gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 sm:grid-cols-2">
            {features.map(({ title, copy, icon: Icon }) => (
              <div key={title} className="bg-[#122329] p-6">
                <Icon className="mb-10 size-5 text-[#7fd4e6]" />
                <h3 className="font-mono text-xs tracking-[.12em]">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-white/60">{copy}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
