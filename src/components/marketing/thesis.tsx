import { SectionKicker } from "@/components/marketing/section";

export function Thesis() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-24 lg:px-10 lg:py-36">
      <div className="grid gap-10 lg:grid-cols-[.7fr_1.3fr]">
        <SectionKicker>01 / THE THESIS</SectionKicker>
        <h2 className="max-w-4xl text-3xl leading-tight tracking-[-.04em] sm:text-5xl">
          Scraping is a liability.{" "}
          <span className="text-[#a3a3a3]">WTR is the rail:</span> on-chain IP,
          PIL licenses, and Confidential Data Rails so data is licensed — never
          leaked.
        </h2>
      </div>
    </section>
  );
}
