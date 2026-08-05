"use client";

import { useActionState } from "react";
import { submitPartnerInquiry, type ContactState } from "@/app/(marketing)/landing/actions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const initialState: ContactState = { ok: false, message: "" };

export function ContactForm() {
  const [state, action, pending] = useActionState(submitPartnerInquiry, initialState);
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-2 text-sm">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#a3a3a3]">Name</span>
          <input name="name" required className="h-11 w-full rounded-md border border-white/10 bg-white/[0.04] px-3 outline-none focus:border-white/30" />
        </label>
        <label className="space-y-2 text-sm">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#a3a3a3]">Organization</span>
          <input name="organization" required className="h-11 w-full rounded-md border border-white/10 bg-white/[0.04] px-3 outline-none focus:border-white/30" />
        </label>
      </div>
      <label className="block space-y-2 text-sm">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#a3a3a3]">Partner type</span>
        <select name="type" defaultValue="" required className="h-11 w-full rounded-md border border-white/10 bg-[#141414] px-3 outline-none focus:border-white/30">
          <option value="" disabled>Select one</option>
          <option value="lab">Lab</option>
          <option value="distributor">Distributor / label</option>
        </select>
      </label>
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending}>{pending ? "Sending…" : "Request a conversation"} <span aria-hidden>↗</span></Button>
        <a href="mailto:gratitude@5-dee.com" className="text-sm text-[#a3a3a3] underline-offset-4 hover:text-white hover:underline">or email gratitude@5-dee.com</a>
      </div>
      {state.message && (
        <p
          role="status"
          className={cn(
            "text-sm",
            state.ok
              ? "text-[rgb(var(--tint-green))]"
              : "text-[rgb(var(--tint-orange))]",
          )}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
