import { redirect } from "next/navigation";

import { PageHeader } from "@/components/dashboard/page-header";
import { UploadQueue } from "@/components/dashboard/upload-queue";
import { hasCurrentConsent } from "@/lib/consent/service";
import { getActingCreator } from "@/lib/dashboard/queries";

export const dynamic = "force-dynamic";

export default async function UploadPage() {
  // goal.md P0-1: no upload surface without an active acceptance of the
  // CURRENT documents. A stale acceptance routes back through onboarding.
  const creator = await getActingCreator();
  if (!creator || !(await hasCurrentConsent(creator.id))) redirect("/onboarding");

  return (
    <div className="space-y-4">
      <PageHeader
        kicker="Creator"
        title="Upload"
        description="Hashed and encrypted on your device — originals never leave it in the clear."
      />
      <UploadQueue />
    </div>
  );
}
