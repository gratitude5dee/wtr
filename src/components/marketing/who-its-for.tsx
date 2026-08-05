import { SectionKicker } from "@/components/marketing/section";

export function WhoItsFor() {
  return (
    <section className="border-y border-white/[0.09] bg-[#0e0e0e] px-6 py-14 lg:px-10">
      <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[.7fr_1.3fr] lg:items-center">
        <SectionKicker>BUILT FOR THE KIND OF PARTNER WHO...</SectionKicker>
        <div className="grid gap-8 text-sm leading-6 text-[#a3a3a3] sm:grid-cols-2">
          <p>
            Runs an AI research lab — the kind of team building frontier models
            and requiring licensed, traceable training inputs. OpenAI is an
            example of this target partner type, not a WTR customer.
          </p>
          <p>
            Represents creators at scale — the kind of distributor or label
            managing valuable rosters and rights. Create Music Group and Empire
            are examples of this target partner type, not WTR customers.
          </p>
        </div>
      </div>
    </section>
  );
}
