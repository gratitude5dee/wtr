import type { ReactNode } from "react";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen w-full overflow-x-clip bg-[#0a0a0a] text-[#fafafa]">
      {children}
    </div>
  );
}
