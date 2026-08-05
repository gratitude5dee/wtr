import Link from "next/link";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import Ferrofluid from "@/components/marketing/ferrofluid";
import { SectionKicker, Signal } from "@/components/marketing/section";
import { Button } from "@/components/ui/button";

export function Hero() {
  return (
    <section className="relative flex min-h-[100svh] items-end overflow-hidden border-b border-white/[0.09]">
      <div className="absolute inset-0">
        <Ferrofluid
          colors={["#0b3a53", "#1f7a8c", "#7fd4e6"]}
          flowDirection="down"
          speed={0.4}
          scale={1.4}
          turbulence={1.1}
          fluidity={0.12}
          rimWidth={0.34}
          sharpness={1.8}
          glow={3.2}
        />
      </div>
      <div className="absolute inset-0 bg-[#0a0a0a]/40 [background:radial-gradient(circle_at_75%_25%,rgba(31,122,140,.3),transparent_42%),linear-gradient(180deg,rgba(10,10,10,.12),#0a0a0a)]" />
      <header className="absolute inset-x-0 top-0 z-10 mx-auto flex max-w-7xl items-center justify-between px-6 py-6 lg:px-10">
        <Link
          href="/landing"
          className="font-mono text-lg font-semibold tracking-[0.26em]"
        >
          WTR<span className="text-[#7fd4e6]">.</span>
        </Link>
        <nav className="hidden items-center gap-7 text-sm text-white/70 sm:flex">
          <a href="#labs" className="hover:text-white">
            For labs
          </a>
          <a href="#suppliers" className="hover:text-white">
            For suppliers
          </a>
          <a href="#contact" className="hover:text-white">
            Partner
          </a>
        </nav>
        <Button
          asChild
          variant="outline"
          size="sm"
          className="border-white/20 bg-black/20 text-white hover:bg-white hover:text-black"
        >
          <a href="#contact">
            Talk to WTR <ArrowUpRight />
          </a>
        </Button>
      </header>
      <div className="relative z-10 mx-auto w-full max-w-7xl px-6 pb-14 pt-32 lg:px-10 lg:pb-24">
        <div className="max-w-4xl">
          <SectionKicker className="mb-7 flex items-center gap-2 text-[#b9e9f2]">
            <Signal />
            THE EXCHANGE FOR LICENSED HUMAN DATA
          </SectionKicker>
          <h1 className="max-w-4xl text-[clamp(3.25rem,9vw,8rem)] font-medium leading-[.9] tracking-[-.07em] text-white">
            The exchange for
            <br />
            <span className="text-[#b9e9f2]">licensed human data.</span>
          </h1>
          <p className="mt-8 max-w-2xl text-base leading-7 text-white/80 sm:text-lg">
            WTR connects the labs training frontier models with the distributors
            and creators who own the data — licensed, consented, and confidential
            by construction.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Button
              asChild
              size="lg"
              className="h-12 bg-white px-6 text-black hover:bg-[#b9e9f2]"
            >
              <a href="#labs">
                Partner as a lab <ArrowDownRight />
              </a>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-12 border-white/25 bg-black/20 px-6 text-white hover:bg-white hover:text-black"
            >
              <a href="#suppliers">
                List your catalog <ArrowDownRight />
              </a>
            </Button>
          </div>
        </div>
        <div className="mt-20 flex items-center gap-3 text-xs text-white/55">
          <span className="h-10 w-px bg-white/40" />
          Scroll to see the rail
        </div>
      </div>
    </section>
  );
}
