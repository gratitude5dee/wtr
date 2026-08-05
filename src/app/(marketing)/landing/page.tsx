import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Check, ChevronRight, LockKeyhole, ShieldCheck, WalletCards } from "lucide-react";
import Ferrofluid from "@/components/marketing/ferrofluid";
import { ContactForm } from "@/components/marketing/contact-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkline } from "@/components/dither-kit/sparkline";

const steps = [
  ["IN_TRAY", "A file arrives with its owner and terms attached."],
  ["LABELED", "Shape, modality, and consent metadata are reviewed."],
  ["REGISTERED", "IP is registered on Story with a PIL preset."],
  ["LISTED", "A catalog entry is discoverable with a clear price."],
  ["SOLD / SETTLED", "Licensed access and dual-rail payout complete the loop."],
] as const;

const manifest = `filename → { labels, license_preset, price_ip, modality }
voice_014.wav → { ["speech"], "commercial-v1", 0.8, "audio" }
session_22.json → { ["dialogue"], "research-v1", 1.2, "text" }`;

const mono = "font-mono text-[10px] uppercase tracking-[0.16em]";

function SectionKicker({ children }: { children: React.ReactNode }) {
  return <div className={`${mono} text-[#a3a3a3]`}>{children}</div>;
}

function Signal({ color = "blue" }: { color?: "blue" | "green" | "orange" | "purple" }) {
  return <span className={`inline-block size-1.5 rounded-full bg-[rgb(var(--tint-${color}))]`} />;
}

export default function LandingPage() {
  return (
    <main>
      <section className="relative flex min-h-[100svh] items-end overflow-hidden border-b border-white/[0.09]">
        <div className="absolute inset-0"><Ferrofluid colors={["#0b3a53", "#1f7a8c", "#7fd4e6"]} flowDirection="down" speed={0.4} scale={1.4} turbulence={1.1} fluidity={0.12} glow={2} /></div>
        <div className="absolute inset-0 bg-[#0a0a0a]/55 [background:radial-gradient(circle_at_75%_25%,rgba(31,122,140,.22),transparent_42%),linear-gradient(180deg,rgba(10,10,10,.3),#0a0a0a)]" />
        <header className="absolute inset-x-0 top-0 z-10 mx-auto flex max-w-7xl items-center justify-between px-6 py-6 lg:px-10">
          <Link href="/landing" className="font-mono text-lg font-semibold tracking-[0.26em]">WTR<span className="text-[#7fd4e6]">.</span></Link>
          <nav className="hidden items-center gap-7 text-sm text-white/70 sm:flex">
            <a href="#labs" className="hover:text-white">For labs</a><a href="#suppliers" className="hover:text-white">For suppliers</a><a href="#contact" className="hover:text-white">Partner</a>
          </nav>
          <Button asChild variant="outline" size="sm" className="border-white/20 bg-black/20 text-white hover:bg-white hover:text-black"><a href="#contact">Talk to WTR <ArrowUpRight /></a></Button>
        </header>
        <div className="relative z-10 mx-auto w-full max-w-7xl px-6 pb-14 pt-32 lg:px-10 lg:pb-24">
          <div className="max-w-4xl">
            <div className={`${mono} mb-7 flex items-center gap-2 text-[#b9e9f2]`}><Signal /> THE EXCHANGE FOR LICENSED HUMAN DATA</div>
            <h1 className="max-w-4xl text-[clamp(3.25rem,9vw,8rem)] font-medium leading-[.9] tracking-[-.07em] text-white">The exchange for<br /><span className="text-[#b9e9f2]">licensed human data.</span></h1>
            <p className="mt-8 max-w-2xl text-base leading-7 text-white/70 sm:text-lg">WTR connects the labs training frontier models with the distributors and creators who own the data — licensed, consented, and confidential by construction.</p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row"><Button asChild size="lg" className="h-12 bg-white px-6 text-black hover:bg-[#b9e9f2]"><a href="#labs">Partner as a lab <ArrowDownRight /></a></Button><Button asChild size="lg" variant="outline" className="h-12 border-white/25 bg-black/20 px-6 text-white hover:bg-white hover:text-black"><a href="#suppliers">List your catalog <ArrowDownRight /></a></Button></div>
          </div>
          <div className="mt-20 flex items-center gap-3 text-xs text-white/45"><span className="h-10 w-px bg-white/30" />Scroll to see the rail</div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-24 lg:px-10 lg:py-36">
        <div className="grid gap-10 lg:grid-cols-[.7fr_1.3fr]"><SectionKicker>01 / THE THESIS</SectionKicker><h2 className="max-w-4xl text-3xl leading-tight tracking-[-.04em] sm:text-5xl">Scraping is a liability. <span className="text-[#a3a3a3]">WTR is the rail:</span> on-chain IP, PIL licenses, and Confidential Data Rails so data is licensed — never leaked.</h2></div>
      </section>

      <section className="border-y border-white/[0.09] bg-[#0e0e0e] px-6 py-20 lg:px-10 lg:py-28">
        <div className="mx-auto max-w-7xl"><SectionKicker>02 / THE PIPELINE</SectionKicker><div className="mt-12 grid gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 lg:grid-cols-5">{steps.map(([name, detail], index) => <div key={name} className="relative bg-[#141414] p-6 lg:min-h-48"><div className="mb-12 flex items-center justify-between"><span className="font-mono text-xs text-[#7fd4e6]">0{index + 1}</span>{index < steps.length - 1 && <ChevronRight className="hidden size-4 text-white/30 lg:block" />}</div><h3 className="font-mono text-sm tracking-[.12em]">{name}</h3><p className="mt-3 text-sm leading-6 text-[#a3a3a3]">{detail}</p></div>)}</div></div>
      </section>

      <section id="labs" className="mx-auto max-w-7xl scroll-mt-10 px-6 py-24 lg:px-10 lg:py-32">
        <div className="grid items-start gap-12 lg:grid-cols-[.8fr_1.2fr]"><div><SectionKicker>03 / FOR LABS</SectionKicker><h2 className="mt-5 text-4xl tracking-[-.05em] sm:text-6xl">Fund the brief.<br /><span className="text-[#a3a3a3]">Get the shape.</span></h2><p className="mt-6 max-w-md leading-7 text-[#a3a3a3]">Describe the data you need, fund a request, and receive confidential access with provenance you can trace from source to settlement.</p><ul className="mt-8 space-y-4 text-sm text-white/80">{["Funded requests with none, deposit (≥10%), or full funding", "Structured shape, modality, deadline, and access terms", "CDR-gated delivery with trace-v1.0 provenance"].map((item) => <li key={item} className="flex gap-3"><Check className="mt-0.5 size-4 text-[#7fd4e6]" />{item}</li>)}</ul></div>
          <Card className="border-white/10 bg-[#141414] shadow-2xl shadow-black/30"><CardHeader className="border-b border-white/[0.09]"><div className="flex items-center justify-between"><div><div className={mono + " text-[#a3a3a3]"}>SAMPLE REQUEST / BRIEF-024</div><CardTitle className="mt-3 text-xl">Multimodal human feedback</CardTitle></div><Badge className="border border-[rgb(var(--tint-blue))]/30 bg-[rgb(var(--tint-blue))]/10 text-[rgb(var(--tint-blue))]">FUNDED</Badge></div></CardHeader><CardContent className="space-y-7 pt-6"><div className="grid grid-cols-3 gap-4"><div><div className={mono + " text-[#a3a3a3]"}>BUDGET</div><p className="mt-2 font-mono text-lg">8,400 <span className="text-xs text-[#a3a3a3]">IP</span></p></div><div><div className={mono + " text-[#a3a3a3]"}>DEADLINE</div><p className="mt-2 font-mono text-lg">14 days</p></div><div><div className={mono + " text-[#a3a3a3]"}>FUNDING</div><p className="mt-2 font-mono text-lg text-[#7fd4e6]">Deposit 10%</p></div></div><div className="rounded-lg border border-white/10 bg-black/20 p-4 font-mono text-xs"><div className="mb-3 text-[#a3a3a3]">REQUESTED DATA SHAPE</div>{["audio / 16-bit WAV / ≥ 44.1 kHz", "text / JSONL / 3–5 turns per item", "labels / consent + demographic schema"].map((row) => <div key={row} className="flex gap-2 border-t border-white/[0.07] py-2 text-white/75"><span className="text-[#7fd4e6]">→</span>{row}</div>)}</div><div className="flex items-center gap-2 text-xs text-[#a3a3a3]"><LockKeyhole className="size-4 text-[#7fd4e6]" />Confidential access via CDR · trace-v1.0 enabled</div></CardContent></Card></div>
      </section>

      <section id="suppliers" className="border-y border-white/[0.09] bg-[#0e0e0e] px-6 py-24 lg:px-10 lg:py-32"><div className="mx-auto max-w-7xl"><div className="grid gap-12 lg:grid-cols-2"><div><SectionKicker>04 / FOR DISTRIBUTORS & LABELS</SectionKicker><h2 className="mt-5 text-4xl tracking-[-.05em] sm:text-6xl">Your catalog,<br /><span className="text-[#a3a3a3]">your terms.</span></h2><p className="mt-6 max-w-md leading-7 text-[#a3a3a3]">Bring a roster, upload in bulk, and let every asset carry its own license preset, price, and provenance.</p><div className="mt-8 flex flex-wrap gap-2"><Badge variant="outline">CSV / JSON manifests</Badge><Badge variant="outline">Managed by rosters</Badge><Badge variant="outline">On-chain + bank payouts</Badge></div><pre className="mt-10 overflow-x-auto rounded-lg border border-white/10 bg-[#141414] p-5 font-mono text-xs leading-6 text-[#a3a3a3]"><span className="text-[#7fd4e6]">manifest.schema</span>{"\n"}{manifest}</pre></div><div className="grid grid-cols-2 gap-3 self-start">{[["TOTAL PAID", "12,480", "IP", "green", [4,7,5,11,9,14]], ["PENDING", "2,140", "IP", "orange", [3,5,4,7,8,6]], ["NEXT PAYOUT", "04 JUN", "", "blue", [2,4,3,4,6,8]], ["RAIL", "DUAL", "ON-CHAIN + BANK", "purple", [5,4,7,5,8,9]]].map(([label, value, unit, color, data]) => <Card key={String(label)} className="border-white/10 bg-[#141414]"><CardContent className="space-y-3 pt-5"><div className={mono + " text-[#a3a3a3]"}>{label}</div><div className="text-2xl font-semibold">{value} <span className="font-mono text-xs font-normal text-[#a3a3a3]">{unit}</span></div><div className="h-9"><Sparkline data={data as number[]} color={color as "green" | "orange" | "blue" | "purple"} animate bloom="low" /></div><div className="text-xs text-[#a3a3a3]">{label === "RAIL" ? "status: credited" : "illustrative sample"}</div></CardContent></Card>)}</div></div></div></section>

      <section className="border-b border-white/[0.09] bg-[#111d21] px-6 py-20 lg:px-10 lg:py-24"><div className="mx-auto max-w-7xl"><div className="grid gap-10 lg:grid-cols-[.8fr_1.2fr]"><div><SectionKicker>05 / CONFIDENTIAL DATA RAILS</SectionKicker><h2 className="mt-5 text-4xl tracking-[-.05em] sm:text-5xl">Confidentiality<br />as infrastructure.</h2></div><div className="grid gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 sm:grid-cols-2">{[["CLIENT-SIDE ENCRYPTION", "The payload is encrypted before it leaves the owner’s environment.", ShieldCheck], ["OWNER-GATED VAULTS", "Threshold access is granted by the people who own the data.", LockKeyhole], ["ON-CHAIN IP + PIL", "Ownership and permitted use are legible, portable primitives.", WalletCards], ["APPEND-ONLY TRACE", "trace-v1.0 preserves the sequence from intake through settlement.", Check]].map(([title, copy, Icon]) => <div key={title as string} className="bg-[#122329] p-6"><Icon className="mb-10 size-5 text-[#7fd4e6]" /><h3 className="font-mono text-xs tracking-[.12em]">{title as string}</h3><p className="mt-3 text-sm leading-6 text-white/60">{copy as string}</p></div>)}</div></div></div></section>

      <section className="mx-auto max-w-7xl px-6 py-24 lg:px-10 lg:py-32"><div className="flex flex-wrap items-end justify-between gap-6"><div><SectionKicker>06 / PROOF OF MOTION</SectionKicker><h2 className="mt-5 text-4xl tracking-[-.05em] sm:text-5xl">The rail gets<br /><span className="text-[#a3a3a3]">more useful over time.</span></h2></div><Badge variant="outline" className="font-mono text-[10px] uppercase tracking-wider">Illustrative sample data</Badge></div><div className="mt-12 grid gap-4 lg:grid-cols-3">{[["ASSETS LISTED OVER TIME", "1,284", "green", [5,8,7,13,17,16,24,29,35]], ["EARNINGS BY MONTH", "18,420 IP", "purple", [5,11,9,18,14,22,29,27,38]], ["REQUESTS FUNDED", "64", "blue", [3,5,5,8,11,10,15,19,22]]].map(([title, value, color, data]) => <Card key={title as string} className="border-white/10 bg-[#141414]"><CardHeader><div className={mono + " text-[#a3a3a3]"}>{title as string}</div><CardTitle className="mt-3 text-3xl">{value as string}</CardTitle></CardHeader><CardContent className="h-28"><Sparkline data={data as number[]} color={color as "green" | "purple" | "blue"} animate bloom="low" /></CardContent></Card>)}</div></section>

      <section id="contact" className="scroll-mt-8 border-t border-white/[0.09] bg-[#0e0e0e] px-6 py-24 lg:px-10 lg:py-32"><div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[.8fr_1.2fr]"><div><SectionKicker>07 / START A CONVERSATION</SectionKicker><h2 className="mt-5 text-5xl tracking-[-.06em] sm:text-7xl">Bring the<br /><span className="text-[#7fd4e6]">right data.</span></h2><p className="mt-6 max-w-md leading-7 text-[#a3a3a3]">Built for the kind of partner who treats consent, provenance, and access as product requirements.</p></div><Card className="border-white/10 bg-[#141414] p-2"><CardContent className="p-5 sm:p-8"><ContactForm /></CardContent></Card></div></section>

      <footer className="mx-auto flex max-w-7xl flex-col gap-8 px-6 py-10 text-sm lg:flex-row lg:items-end lg:justify-between lg:px-10"><div><div className="font-mono text-lg font-semibold tracking-[.26em]">WTR<span className="text-[#7fd4e6]">.</span></div><p className="mt-2 text-[#a3a3a3]">A data exchange for humans.</p></div><div className="flex flex-col gap-3 text-[#a3a3a3] lg:items-end"><div className="flex gap-5"><Link href="/legal/wtr-tos-2026-08" className="hover:text-white">Terms</Link><Link href="/legal/wtr-privacy-2026-08" className="hover:text-white">Privacy</Link><a href="mailto:partnerships@wzrd.tech" className="hover:text-white">Contact</a></div><p className="font-mono text-[10px] uppercase tracking-wider">Story Aeneid testnet · chain 1315 · balances are test funds</p></div></footer>
    </main>
  );
}
