import { StatCard } from "@/components/dashboard/stat-card";
import { SectionKicker } from "@/components/marketing/section";
import { Badge } from "@/components/ui/badge";

interface PayoutStat {
  label: string;
  value: string;
  unit?: string;
  note: string;
  color: "green" | "orange" | "blue" | "purple";
  spark: number[];
}

const payoutStats: PayoutStat[] = [
  {
    label: "TOTAL PAID",
    value: "12,480",
    unit: "IP",
    note: "illustrative sample",
    color: "green",
    spark: [4, 7, 5, 11, 9, 14],
  },
  {
    label: "PENDING",
    value: "2,140",
    unit: "IP",
    note: "illustrative sample",
    color: "orange",
    spark: [3, 5, 4, 7, 8, 6],
  },
  {
    label: "NEXT PAYOUT",
    value: "04 JUN",
    note: "illustrative sample",
    color: "blue",
    spark: [2, 4, 3, 4, 6, 8],
  },
  {
    label: "RAIL",
    value: "DUAL",
    unit: "ON-CHAIN + BANK",
    note: "status: credited",
    color: "purple",
    spark: [5, 4, 7, 5, 8, 9],
  },
];

const manifest = `filename → { labels, license_preset, price_ip, modality }
voice_014.wav → { ["speech"], "commercial-v1", 0.8, "audio" }
session_22.json → { ["dialogue"], "research-v1", 1.2, "text" }`;

export function ForSuppliers() {
  return (
    <section
      id="suppliers"
      className="border-y border-white/[0.09] bg-[#0e0e0e] px-6 py-24 lg:px-10 lg:py-32"
    >
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-12 lg:grid-cols-2">
          <div>
            <SectionKicker>04 / FOR DISTRIBUTORS & LABELS</SectionKicker>
            <h2 className="mt-5 text-4xl tracking-[-.05em] sm:text-6xl">
              Your catalog,
              <br />
              <span className="text-[#a3a3a3]">your terms.</span>
            </h2>
            <p className="mt-6 max-w-md leading-7 text-[#a3a3a3]">
              Bring a roster, upload in bulk, and let every asset carry its own
              license preset, price, and provenance.
            </p>
            <div className="mt-8 flex flex-wrap gap-2">
              <Badge variant="outline">CSV / JSON manifests</Badge>
              <Badge variant="outline">Managed by rosters</Badge>
              <Badge variant="outline">On-chain + bank payouts</Badge>
            </div>
            <pre className="mt-10 max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded-lg border border-white/10 bg-[#141414] p-5 font-mono text-xs leading-6 text-[#a3a3a3]">
              <span className="text-[#7fd4e6]">manifest.schema</span>
              {"\n"}
              {manifest}
            </pre>
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-3 min-[420px]:grid-cols-2">
            {payoutStats.map((stat) => (
              <StatCard key={stat.label} {...stat} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
