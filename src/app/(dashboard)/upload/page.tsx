import { redirect } from "next/navigation";

import { hasCurrentConsent } from "@/lib/consent/service";
import { getCurrentCreator } from "@/lib/dashboard/queries";

export const dynamic = "force-dynamic";

export default async function UploadPage() {
  // goal.md P0-1: no upload surface without an active acceptance of the
  // CURRENT documents. A stale acceptance routes back through onboarding.
  const creator = await getCurrentCreator();
  if (!creator || !(await hasCurrentConsent(creator.id))) redirect("/onboarding");

  return (
    <div className="space-y-2">
      <h1 className="text-xl font-semibold">Upload</h1>
      <p className="text-sm text-muted-foreground">
        The drop zone lands with the next slice (P0-2): files are hashed in your browser
        with SHA-256 before a single byte leaves your device.
      </p>
    </div>
  );
}
