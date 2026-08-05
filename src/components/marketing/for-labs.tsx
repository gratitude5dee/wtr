import { Check, LockKeyhole } from "lucide-react";
import { SectionKicker, monoLabel } from "@/components/marketing/section";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const benefits = [
  "Funded requests with none, deposit (≥10%), or full funding",
  "Structured shape, modality, deadline, and access terms",
  "CDR-gated delivery with trace-v1.0 provenance",
];

const shapeRows = [
  "audio / 16-bit WAV / ≥ 44.1 kHz",
  "text / JSONL / 3–5 turns per item",
  "labels / consent + demographic schema",
];

export function ForLabs() {
  return (
    <section
      id="labs"
      className="mx-auto max-w-7xl scroll-mt-10 px-6 py-24 lg:px-10 lg:py-32"
    >
      <div className="grid items-start gap-12 lg:grid-cols-[.8fr_1.2fr]">
        <div>
          <SectionKicker>03 / FOR LABS</SectionKicker>
          <h2 className="mt-5 text-4xl tracking-[-.05em] sm:text-6xl">
            Fund the brief.
            <br />
            <span className="text-[#a3a3a3]">Get the shape.</span>
          </h2>
          <p className="mt-6 max-w-md leading-7 text-[#a3a3a3]">
            Describe the data you need, fund a request, and receive confidential
            access with provenance you can trace from source to settlement.
          </p>
          <ul className="mt-8 space-y-4 text-sm text-white/80">
            {benefits.map((benefit) => (
              <li key={benefit} className="flex gap-3">
                <Check className="mt-0.5 size-4 text-[#7fd4e6]" />
                {benefit}
              </li>
            ))}
          </ul>
        </div>
        <Card className="border-white/10 bg-[#141414] shadow-2xl shadow-black/30">
          <CardHeader className="border-b border-white/[0.09]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className={cn(monoLabel, "text-[#a3a3a3]")}>
                  SAMPLE REQUEST / BRIEF-024
                </div>
                <CardTitle className="mt-3 text-xl">
                  Multimodal human feedback
                </CardTitle>
              </div>
              <Badge className="border border-[rgb(var(--tint-blue))]/30 bg-[rgb(var(--tint-blue))]/10 text-[rgb(var(--tint-blue))]">
                FUNDED
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-7 pt-6">
            <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-3">
              <Metric label="BUDGET" value="8,400" unit="IP" />
              <Metric label="DEADLINE" value="14 days" />
              <Metric label="FUNDING" value="Deposit 10%" accent />
            </div>
            <div className="rounded-lg border border-white/10 bg-black/20 p-4 font-mono text-xs">
              <div className="mb-3 text-[#a3a3a3]">REQUESTED DATA SHAPE</div>
              {shapeRows.map((row) => (
                <div
                  key={row}
                  className="flex gap-2 border-t border-white/[0.07] py-2 text-white/75"
                >
                  <span className="text-[#7fd4e6]">→</span>
                  {row}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 text-xs text-[#a3a3a3]">
              <LockKeyhole className="size-4 text-[#7fd4e6]" />
              Confidential access via CDR · trace-v1.0 enabled
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  unit,
  accent = false,
}: {
  label: string;
  value: string;
  unit?: string;
  accent?: boolean;
}) {
  return (
    <div>
      <div className={cn(monoLabel, "text-[#a3a3a3]")}>{label}</div>
      <p className={cn("mt-2 font-mono text-lg", accent && "text-[#7fd4e6]")}>
        {value}{" "}
        {unit && <span className="text-xs text-[#a3a3a3]">{unit}</span>}
      </p>
    </div>
  );
}
