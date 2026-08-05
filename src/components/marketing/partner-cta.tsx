import { ContactForm } from "@/components/marketing/contact-form";
import { SectionKicker } from "@/components/marketing/section";
import { Card, CardContent } from "@/components/ui/card";

export function PartnerCta() {
  return (
    <section
      id="contact"
      className="scroll-mt-8 border-t border-white/[0.09] bg-[#0e0e0e] px-6 py-24 lg:px-10 lg:py-32"
    >
      <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[.8fr_1.2fr]">
        <div>
          <SectionKicker>07 / START A CONVERSATION</SectionKicker>
          <h2 className="mt-5 text-5xl tracking-[-.06em] sm:text-7xl">
            Bring the
            <br />
            <span className="text-[#7fd4e6]">right data.</span>
          </h2>
          <p className="mt-6 max-w-md leading-7 text-[#a3a3a3]">
            Built for the kind of partner who treats consent, provenance, and
            access as product requirements.
          </p>
        </div>
        <Card className="border-white/10 bg-[#141414] p-2">
          <CardContent className="p-5 sm:p-8">
            <ContactForm />
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
