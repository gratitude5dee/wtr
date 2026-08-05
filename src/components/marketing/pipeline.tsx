import { ChevronRight } from "lucide-react";
import { SectionKicker } from "@/components/marketing/section";

interface PipelineStep {
  name: string;
  detail: string;
}

const steps: PipelineStep[] = [
  { name: "IN_TRAY", detail: "A file arrives with its owner and terms attached." },
  { name: "LABELED", detail: "Shape, modality, and consent metadata are reviewed." },
  { name: "REGISTERED", detail: "IP is registered on Story with a PIL preset." },
  { name: "LISTED", detail: "A catalog entry is discoverable with a clear price." },
  {
    name: "SOLD / SETTLED",
    detail: "Licensed access and dual-rail payout complete the loop.",
  },
];

export function Pipeline() {
  return (
    <section className="border-y border-white/[0.09] bg-[#0e0e0e] px-6 py-20 lg:px-10 lg:py-28">
      <div className="mx-auto max-w-7xl">
        <SectionKicker>02 / THE PIPELINE</SectionKicker>
        <div className="mt-12 grid gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 lg:grid-cols-5">
          {steps.map((step, index) => (
            <div
              key={step.name}
              className="relative bg-[#141414] p-6 lg:min-h-48"
            >
              <div className="mb-12 flex items-center justify-between">
                <span className="font-mono text-xs text-[#7fd4e6]">
                  0{index + 1}
                </span>
                {index < steps.length - 1 && (
                  <ChevronRight className="hidden size-4 text-white/30 lg:block" />
                )}
              </div>
              <h3 className="font-mono text-sm tracking-[.12em]">
                {step.name}
              </h3>
              <p className="mt-3 text-sm leading-6 text-[#a3a3a3]">
                {step.detail}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
