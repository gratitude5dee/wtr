import { CdrBand } from "@/components/marketing/cdr-band";
import { ForLabs } from "@/components/marketing/for-labs";
import { ForSuppliers } from "@/components/marketing/for-suppliers";
import { Hero } from "@/components/marketing/hero";
import { Metrics } from "@/components/marketing/metrics";
import { PartnerCta } from "@/components/marketing/partner-cta";
import { Pipeline } from "@/components/marketing/pipeline";
import { SiteFooter } from "@/components/marketing/site-footer";
import { Thesis } from "@/components/marketing/thesis";
import { WhoItsFor } from "@/components/marketing/who-its-for";

export default function LandingPage() {
  return (
    <main>
      <Hero />
      <Thesis />
      <WhoItsFor />
      <Pipeline />
      <ForLabs />
      <ForSuppliers />
      <CdrBand />
      <Metrics />
      <PartnerCta />
      <SiteFooter />
    </main>
  );
}
