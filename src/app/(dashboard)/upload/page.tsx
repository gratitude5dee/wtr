import { redirect } from "next/navigation";

import { UploadQueue } from "@/components/dashboard/upload-queue";
import { hasCurrentConsent } from "@/lib/consent/service";
import { getCurrentCreator } from "@/lib/dashboard/queries";

export const dynamic = "force-dynamic";

export default async function UploadPage() {
  // goal.md P0-1: no upload surface without an active acceptance of the
  // CURRENT documents. A stale acceptance routes back through onboarding.
  const creator = await getCurrentCreator();
  if (!creator || !(await hasCurrentConsent(creator.id))) redirect("/onboarding");

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Upload</h1>
      <UploadQueue />
    </div>
  );
}
