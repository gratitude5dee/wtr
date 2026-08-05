import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mx-auto flex max-w-7xl flex-col gap-8 px-6 py-10 text-sm lg:flex-row lg:items-end lg:justify-between lg:px-10">
      <div>
        <div className="font-mono text-lg font-semibold tracking-[.26em]">
          WTR<span className="text-[#7fd4e6]">.</span>
        </div>
        <p className="mt-2 text-[#a3a3a3]">A data exchange for humans.</p>
      </div>
      <div className="flex flex-col gap-3 text-[#a3a3a3] lg:items-end">
        <div className="flex gap-5">
          <Link href="/legal/wtr-tos-2026-08" className="hover:text-white">
            Terms
          </Link>
          <Link href="/legal/wtr-privacy-2026-08" className="hover:text-white">
            Privacy
          </Link>
          <a href="mailto:partnerships@wzrd.tech" className="hover:text-white">
            Contact
          </a>
        </div>
        <p className="font-mono text-[10px] uppercase tracking-wider">
          Story Aeneid testnet · chain 1315 · balances are test funds
        </p>
      </div>
    </footer>
  );
}
